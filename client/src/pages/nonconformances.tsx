import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, AlertTriangle, Trash2, CheckCircle2, Clock } from "lucide-react";
import type { Nonconformance } from "@shared/schema";
import type { Client } from "@shared/schema";

const AREAS = ["Sample Preparation", "QC Testing", "Storage", "Equipment Calibration", "Documentation", "Personnel", "Environment", "Other"];
const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  major: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  minor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};
const STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />,
  under_investigation: <Clock className="w-3.5 h-3.5 text-blue-500" />,
  resolved: <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />,
  closed: <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />,
};

export default function NonconformancesPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({
    clientId: "", title: "", description: "", detectedBy: "",
    detectedDate: "", area: "", severity: "minor", immediateAction: "",
  });

  const { data: ncs, isLoading } = useQuery<Nonconformance[]>({ queryKey: ["/api/nonconformances"] });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/nonconformances", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nonconformances"] });
      setOpen(false);
      setForm({ clientId: "", title: "", description: "", detectedBy: "", detectedDate: "", area: "", severity: "minor", immediateAction: "" });
      toast({ title: "Non-conformance logged" });
    },
    onError: () => toast({ title: "Error", description: "Failed to log NC.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Nonconformance> }) => {
      const res = await apiRequest("PATCH", `/api/nonconformances/${id}`, data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nonconformances"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/nonconformances/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nonconformances"] });
      toast({ title: "NC deleted" });
    },
  });

  const filtered = (ncs ?? []).filter(nc => filter === "all" || nc.status === filter);

  const statusCounts = (ncs ?? []).reduce((acc, nc) => {
    acc[nc.status] = (acc[nc.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const nextStatus: Record<string, string> = {
    open: "under_investigation",
    under_investigation: "resolved",
    resolved: "closed",
    closed: "closed",
  };

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Non-conformance Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track deviations and non-conformances per ISO 15189 Clause 4.9</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Log NC
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open", key: "open", color: "text-yellow-600 dark:text-yellow-400" },
          { label: "Under Investigation", key: "under_investigation", color: "text-blue-600 dark:text-blue-400" },
          { label: "Resolved", key: "resolved", color: "text-green-500 dark:text-green-400" },
          { label: "Closed", key: "closed", color: "text-green-700 dark:text-green-300" },
        ].map(({ label, key, color }) => (
          <Card key={key} className="border-card-border cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => setFilter(filter === key ? "all" : key)}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{statusCounts[key] || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["all","open","under_investigation","resolved","closed"].map(f => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm"
            className="capitalize text-xs h-7" onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f.replace("_", " ")}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>
      ) : !filtered.length ? (
        <div className="text-center py-16">
          <AlertTriangle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No non-conformances recorded.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(nc => {
            const client = clients?.find(c => c.id === nc.clientId);
            return (
              <Card key={nc.id} className="border-card-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-mono text-muted-foreground">{nc.refNumber}</span>
                        <div className="flex items-center gap-1">{STATUS_ICONS[nc.status]}<span className="text-xs text-muted-foreground capitalize">{nc.status.replace("_"," ")}</span></div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SEVERITY_COLORS[nc.severity]}`}>{nc.severity}</span>
                        {nc.area && <Badge variant="outline" className="text-xs">{nc.area}</Badge>}
                        {client && <span className="text-xs text-muted-foreground">{client.labName}</span>}
                      </div>
                      <p className="text-sm font-medium">{nc.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{nc.description}</p>
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        {nc.detectedBy && <p className="text-xs text-muted-foreground">Detected by: {nc.detectedBy}</p>}
                        <p className="text-xs text-muted-foreground">Date: {new Date(nc.detectedDate).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {nc.status !== "closed" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                          onClick={() => updateMutation.mutate({ id: nc.id, data: { status: nextStatus[nc.status] as any } })}>
                          Advance
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(nc.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Log Non-conformance</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Client Lab</Label>
                <Select value={form.clientId} onValueChange={v => setForm(f => ({ ...f, clientId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>{clients?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.labName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["critical","major","minor"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input placeholder="Brief description of the non-conformance" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Full Description</Label>
              <Textarea rows={2} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Detected By</Label>
                <Input placeholder="Name or role" value={form.detectedBy}
                  onChange={e => setForm(f => ({ ...f, detectedBy: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Detection Date</Label>
                <Input type="date" value={form.detectedDate}
                  onChange={e => setForm(f => ({ ...f, detectedDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Area</Label>
                <Select value={form.area} onValueChange={v => setForm(f => ({ ...f, area: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger>
                  <SelectContent>{AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Immediate Action</Label>
                <Input placeholder="Action taken immediately" value={form.immediateAction}
                  onChange={e => setForm(f => ({ ...f, immediateAction: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.title || !form.clientId || !form.detectedDate}>
              {createMutation.isPending ? "Logging…" : "Log NC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
