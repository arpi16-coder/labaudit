import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BarChart2, ArrowRight, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import type { Client, Analysis } from "@shared/schema";

function statusIcon(status: string) {
  if (status === "complete") return <CheckCircle className="w-4 h-4 text-green-500" />;
  if (status === "running") return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
  if (status === "error") return <AlertCircle className="w-4 h-4 text-destructive" />;
  return <Clock className="w-4 h-4 text-muted-foreground" />;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-sm font-semibold ${
        score >= 80 ? "text-green-600 dark:text-green-400" :
        score >= 60 ? "text-yellow-600 dark:text-yellow-400" :
        "text-red-600 dark:text-red-400"
      }`}>{Math.round(score)}%</span>
    </div>
  );
}

export default function AnalysesPage() {
  const { user } = useAuth();
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: user?.role === "admin",
  });
  const { data: myClient } = useQuery<Client>({
    queryKey: ["/api/clients/user", user?.id],
    queryFn: () => fetch(`/api/clients/user/${user?.id}`).then(r => r.json()),
    enabled: user?.role === "client" && !!user?.id,
  });

  const effectiveClientId = user?.role === "admin"
    ? (selectedClientId || clients?.[0]?.id?.toString())
    : myClient?.id?.toString();

  const { data: analyses, isLoading } = useQuery<Analysis[]>({
    queryKey: ["/api/clients", effectiveClientId, "analyses"],
    queryFn: () => fetch(`/api/clients/${effectiveClientId}/analyses`).then(r => r.json()),
    enabled: !!effectiveClientId,
    refetchInterval: (data) =>
      data?.some?.((a: Analysis) => a.status === "running") ? 3000 : false,
  });

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Gap Analyses</h1>
        <p className="text-sm text-muted-foreground mt-0.5">AI-generated compliance audit reports</p>
      </div>

      {user?.role === "admin" && clients && clients.length > 0 && (
        <div className="flex items-center gap-3">
          <Label className="text-sm shrink-0">Client:</Label>
          <Select value={selectedClientId || clients[0]?.id?.toString()} onValueChange={setSelectedClientId}>
            <SelectTrigger className="w-56" data-testid="select-analysis-client">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.labName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : !analyses?.length ? (
        <div className="text-center py-14 border-2 border-dashed border-border rounded-xl">
          <BarChart2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium">No analyses yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Upload documents and run a gap analysis to see results here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...analyses].reverse().map(a => (
            <Card key={a.id} className="border-card-border hover:shadow-sm transition-shadow"
              data-testid={`card-analysis-${a.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 shrink-0">{statusIcon(a.status)}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(a.createdAt).toLocaleDateString("en-US", {
                          year: "numeric", month: "short", day: "numeric"
                        })}
                        {a.status === "complete" && ` · ${JSON.parse(a.findings || "[]").length} findings`}
                      </p>
                      {a.status === "complete" && a.summary && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{a.summary}</p>
                      )}
                      {a.status === "running" && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">AI is analyzing…</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {a.status === "complete" && <ScoreBar score={a.overallScore} />}
                    {a.status === "complete" && (
                      <Link href={`/analyses/${a.id}`}>
                        <button className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                          data-testid={`button-view-analysis-${a.id}`}>
                          View <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
