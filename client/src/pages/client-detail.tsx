import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileText, BarChart2, Plus, Zap } from "lucide-react";
import type { Client, Document, Analysis } from "@shared/schema";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const clientId = Number(id);
  const { toast } = useToast();

  const { data: client, isLoading } = useQuery<Client>({
    queryKey: ["/api/clients", clientId],
    queryFn: () => fetch(`/api/clients/${clientId}`).then(r => r.json()),
  });

  const { data: docs } = useQuery<Document[]>({
    queryKey: ["/api/clients", clientId, "documents"],
    queryFn: () => fetch(`/api/clients/${clientId}/documents`).then(r => r.json()),
  });

  const { data: analyses, refetch: refetchAnalyses } = useQuery<Analysis[]>({
    queryKey: ["/api/clients", clientId, "analyses"],
    queryFn: () => fetch(`/api/clients/${clientId}/analyses`).then(r => r.json()),
  });

  const runAnalysis = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/analyses", {
        clientId,
        title: `Full Documentation Audit — ${new Date().toLocaleDateString()}`,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Analysis started", description: "AI is analyzing all documents. Refresh in a moment." });
      setTimeout(() => refetchAnalyses(), 3000);
      setTimeout(() => {
        refetchAnalyses();
        queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      }, 8000);
    },
    onError: () => toast({ title: "Error", description: "Failed to start analysis.", variant: "destructive" }),
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-40 w-full" /></div>;
  if (!client) return <div className="p-6 text-muted-foreground">Client not found.</div>;

  const scoreColor = (client.auditScore ?? 0) >= 80 ? "text-green-600 dark:text-green-400"
    : (client.auditScore ?? 0) >= 60 ? "text-yellow-600 dark:text-yellow-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/clients">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Clients
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary">
            {client.labName.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{client.labName}</h1>
            <p className="text-sm text-muted-foreground">{client.contactName} · {client.contactEmail}</p>
            <div className="flex gap-2 mt-1">
              <Badge variant="outline" className="text-xs">{client.labType}</Badge>
              <Badge variant="outline" className="text-xs">{client.complianceFramework}</Badge>
              <Badge variant={client.status === "active" ? "default" : "secondary"} className="text-xs">
                {client.status}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {client.auditScore !== null && (
            <div className="text-right">
              <p className={`text-2xl font-bold ${scoreColor}`}>
                {Math.round(client.auditScore ?? 0)}%
              </p>
              <p className="text-xs text-muted-foreground">Audit Score</p>
            </div>
          )}
          <Button onClick={() => runAnalysis.mutate()} disabled={runAnalysis.isPending || !docs?.length}
            data-testid="button-run-analysis">
            <Zap className="w-4 h-4 mr-1.5" />
            {runAnalysis.isPending ? "Running…" : "Run Analysis"}
          </Button>
        </div>
      </div>

      {client.auditScore !== null && (
        <div className="space-y-1">
          <Progress value={client.auditScore ?? 0} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {(client.auditScore ?? 0) >= 80 ? "Audit-ready" : (client.auditScore ?? 0) >= 60 ? "Needs improvement" : "Critical gaps — action required"}
          </p>
        </div>
      )}

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">
            <FileText className="w-4 h-4 mr-1.5" /> Documents ({docs?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="analyses">
            <BarChart2 className="w-4 h-4 mr-1.5" /> Analyses ({analyses?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-4">
          <div className="flex justify-end mb-3">
            <Link href={`/documents?clientId=${clientId}`}>
              <Button size="sm" variant="outline">
                <Plus className="w-4 h-4 mr-1.5" /> Upload Document
              </Button>
            </Link>
          </div>
          {!docs?.length ? (
            <div className="text-center py-12 bg-muted/20 rounded-lg">
              <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-card border border-card-border rounded-lg"
                  data-testid={`row-doc-${doc.id}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.fileName}</p>
                      <p className="text-xs text-muted-foreground">{doc.fileType} · {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <Badge variant={
                    doc.status === "analyzed" ? "default" :
                    doc.status === "analyzing" ? "secondary" :
                    "outline"
                  } className="text-xs shrink-0">
                    {doc.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analyses" className="mt-4">
          {!analyses?.length ? (
            <div className="text-center py-12 bg-muted/20 rounded-lg">
              <BarChart2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No analyses yet. Upload documents and run an analysis.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {analyses.map(a => (
                <Link key={a.id} href={`/analyses/${a.id}`}>
                  <div className="flex items-center justify-between p-3 bg-card border border-card-border rounded-lg hover:bg-muted/20 cursor-pointer transition-colors"
                    data-testid={`row-analysis-${a.id}`}>
                    <div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.status === "complete" && (
                        <span className={`text-sm font-semibold ${
                          a.overallScore >= 80 ? "text-green-600 dark:text-green-400" :
                          a.overallScore >= 60 ? "text-yellow-600 dark:text-yellow-400" :
                          "text-red-600 dark:text-red-400"
                        }`}>{Math.round(a.overallScore)}%</span>
                      )}
                      <Badge variant={a.status === "complete" ? "default" : a.status === "running" ? "secondary" : "outline"} className="text-xs">
                        {a.status}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
