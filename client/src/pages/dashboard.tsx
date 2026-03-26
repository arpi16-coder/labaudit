import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Users, FileText, BarChart2, AlertTriangle, TrendingUp,
  CheckCircle, Clock, ArrowRight, Plus
} from "lucide-react";
import { Link } from "wouter";
import type { Client, Analysis } from "@shared/schema";

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge variant="secondary">Not scored</Badge>;
  const color = score >= 80 ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
    : score >= 60 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {score}%
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalClients: number; activeClients: number; averageScore: number; criticalClients: number;
  }>({ queryKey: ["/api/stats"], enabled: isAdmin });

  const { data: clients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: isAdmin,
  });

  const { data: myClient } = useQuery<Client>({
    queryKey: ["/api/clients/user", user?.id],
    queryFn: () => fetch(`/api/clients/user/${user?.id}`).then(r => r.json()),
    enabled: !isAdmin && !!user?.id,
  });

  const { data: myAnalyses } = useQuery<Analysis[]>({
    queryKey: ["/api/clients", myClient?.id, "analyses"],
    queryFn: () => fetch(`/api/clients/${myClient?.id}/analyses`).then(r => r.json()),
    enabled: !isAdmin && !!myClient?.id,
  });

  if (isAdmin) {
    return (
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Overview of all lab clients and compliance status</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Clients", icon: Users, value: stats?.totalClients, loading: statsLoading },
            { label: "Active", icon: CheckCircle, value: stats?.activeClients, loading: statsLoading },
            { label: "Avg. Score", icon: TrendingUp, value: stats?.averageScore ? `${stats.averageScore}%` : "—", loading: statsLoading },
            { label: "Critical", icon: AlertTriangle, value: stats?.criticalClients, loading: statsLoading },
          ].map(({ label, icon: Icon, value, loading }) => (
            <Card key={label} className="border-card-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                {loading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-semibold text-foreground">{value ?? 0}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent clients */}
        <Card className="border-card-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Lab Clients</CardTitle>
              <CardDescription>Recently onboarded labs</CardDescription>
            </div>
            <Link href="/clients">
              <Button size="sm" data-testid="button-view-clients">
                <Plus className="w-4 h-4 mr-1.5" /> Add Client
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {clientsLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : !clients?.length ? (
              <div className="text-center py-10">
                <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No clients yet.</p>
                <Link href="/clients">
                  <Button size="sm" variant="outline" className="mt-3">Add your first client</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {clients.slice(0, 6).map(client => (
                  <div key={client.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    data-testid={`row-client-${client.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {client.labName.charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{client.labName}</p>
                        <p className="text-xs text-muted-foreground">{client.complianceFramework} · {client.labType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <ScoreBadge score={client.auditScore ?? null} />
                      <Link href={`/clients/${client.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 px-2">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Client view
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Welcome back, {user?.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {myClient?.labName || user?.organizationName || "Your lab"} — Compliance Overview
        </p>
      </div>

      {myClient && (
        <Card className="border-card-border bg-gradient-to-r from-primary/5 to-primary/0">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Audit Readiness Score</p>
                <p className="text-3xl font-bold text-foreground">
                  {myClient.auditScore !== null ? `${Math.round(myClient.auditScore ?? 0)}%` : "Not scored"}
                </p>
              </div>
              <Badge variant={myClient.status === "active" ? "default" : "secondary"}>
                {myClient.status}
              </Badge>
            </div>
            {myClient.auditScore !== null && (
              <Progress value={myClient.auditScore ?? 0} className="h-2" />
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Framework: {myClient.complianceFramework} · Type: {myClient.labType}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/documents">
          <Card className="border-card-border hover:border-primary/40 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Upload Documents</p>
                <p className="text-xs text-muted-foreground">SOPs, batch records…</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/analyses">
          <Card className="border-card-border hover:border-primary/40 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart2 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">View Reports</p>
                <p className="text-xs text-muted-foreground">Gap analyses & findings</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Card className="border-card-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Last Analysis</p>
              <p className="text-xs text-muted-foreground">
                {myAnalyses?.[myAnalyses.length - 1]
                  ? new Date(myAnalyses[myAnalyses.length - 1].createdAt).toLocaleDateString()
                  : "None yet"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {myAnalyses && myAnalyses.length > 0 && (
        <Card className="border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {myAnalyses.slice(-3).reverse().map(a => (
                <Link key={a.id} href={`/analyses/${a.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
                    data-testid={`row-analysis-${a.id}`}>
                    <div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.createdAt).toLocaleDateString()} · {a.status}
                      </p>
                    </div>
                    <ScoreBadge score={a.status === "complete" ? Math.round(a.overallScore) : null} />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
