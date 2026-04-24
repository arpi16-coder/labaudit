import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Download, Search, CheckCircle, XCircle } from "lucide-react";

interface AuditLog {
  id: number;
  userId: number | null;
  userEmail: string;
  action: string;
  resource: string | null;
  details: string | null;
  ipAddress: string | null;
  success: number;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  login: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  login_failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  logout: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  beta_access: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  document_upload: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  document_delete: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  analysis_start: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  analysis_complete: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  analysis_error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  client_create: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  client_delete: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  settings_update: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  sop_draft_download: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

function formatAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const { data, isLoading } = useQuery<{ total: number; logs: AuditLog[] }>({
    queryKey: ["/api/audit-logs"],
    refetchInterval: 30000,
  });

  const logs = data?.logs ?? [];

  const filtered = logs.filter(log => {
    const matchSearch =
      !search ||
      log.userEmail.toLowerCase().includes(search.toLowerCase()) ||
      log.action.includes(search.toLowerCase()) ||
      (log.resource || "").toLowerCase().includes(search.toLowerCase()) ||
      (log.ipAddress || "").includes(search);
    const matchAction = actionFilter === "all" || log.action === actionFilter;
    return matchSearch && matchAction;
  });

  const exportCSV = () => {
    const headers = ["ID", "Timestamp", "User", "Action", "Resource", "IP Address", "Success", "Details"];
    const rows = filtered.map(l => [
      l.id, l.createdAt, l.userEmail, l.action,
      l.resource || "", l.ipAddress || "",
      l.success ? "Yes" : "No", l.details || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `labaudit-audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uniqueActions = [...new Set(logs.map(l => l.action))];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" /> Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete tamper-evident record of all platform activity.
            {data && <span className="ml-1 font-medium">{data.total} total events.</span>}
          </p>
        </div>
        <Button data-testid="button-export-audit" variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
          <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            data-testid="input-audit-search"
            placeholder="Search by user, action, resource, IP..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger data-testid="select-audit-filter" className="w-44 h-8 text-sm">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {uniqueActions.map(a => (
              <SelectItem key={a} value={a}>{formatAction(a)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Log table */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading audit logs...</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-16 text-center text-muted-foreground text-sm">
          No audit events found.
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="space-y-1.5">
            {filtered.map(log => (
              <div
                key={log.id}
                data-testid={`audit-row-${log.id}`}
                className="flex items-start gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-sm"
              >
                {/* Success indicator */}
                <div className="mt-0.5 shrink-0">
                  {log.success ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] || "bg-muted text-muted-foreground"}`}>
                      {formatAction(log.action)}
                    </span>
                    {log.resource && (
                      <span className="text-xs text-muted-foreground font-mono">{log.resource}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="font-medium text-foreground">{log.userEmail}</span>
                    {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                    {log.details && (
                      <span className="truncate max-w-xs font-mono">{log.details}</span>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <div className="text-xs text-muted-foreground shrink-0 text-right">
                  {formatDate(log.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
