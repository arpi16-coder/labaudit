import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Info, XCircle,
  FileText, Download, RefreshCw, Circle
} from "lucide-react";
import type { Analysis } from "@shared/schema";
import type { Finding } from "@shared/schema";

function SeverityIcon({ severity }: { severity: Finding["severity"] }) {
  if (severity === "critical") return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
  if (severity === "major") return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />;
  if (severity === "minor") return <Circle className="w-4 h-4 text-blue-400 shrink-0" />;
  return <Info className="w-4 h-4 text-muted-foreground shrink-0" />;
}

function SeverityBadge({ severity }: { severity: Finding["severity"] }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    major: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    minor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    info: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[severity]}`}>
      {severity}
    </span>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  missing_field: "Missing Field",
  formatting: "Formatting",
  terminology: "Terminology",
  signature: "Signature",
  date: "Date/Version",
  lot_number: "Lot/Batch Number",
  procedure_gap: "Procedure Gap",
  other: "Other",
};

export default function AnalysisDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: analysis, isLoading, refetch } = useQuery<Analysis>({
    queryKey: ["/api/analyses", id],
    queryFn: () => fetch(`/api/analyses/${id}`).then(r => r.json()),
    refetchInterval: (data) => data?.status === "running" ? 2000 : false,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ analysisId, findingId }: { analysisId: number; findingId: string }) => {
      const findings: Finding[] = JSON.parse(analysis?.findings || "[]");
      const updated = findings.map(f => f.id === findingId ? { ...f, resolved: !f.resolved } : f);
      const res = await apiRequest("PATCH", `/api/analyses/${analysisId}`, {
        findings: JSON.stringify(updated),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/analyses", id] });
    },
  });

  const downloadSOP = () => {
    if (!analysis?.sopDraft) return;
    const watermark = [
      "================================================================",
      "  LABAUDIT.AI — BETA VERSION",
      "  FOR EVALUATION PURPOSES ONLY",
      "  This document is generated during the beta testing period.",
      "  It may not be used, distributed, or relied upon for any",
      "  official, regulatory, or commercial purpose.",
      "  © 2026 LabAudit.ai — All rights reserved.",
      "================================================================",
      "",
    ].join("\n");
    const footer = [
      "",
      "================================================================",
      "  BETA WATERMARK — NOT FOR OFFICIAL USE",
      `  Generated: ${new Date().toUTCString()}`,
      "  LabAudit.ai Beta | labaudit-production.up.railway.app",
      "================================================================",
    ].join("\n");
    const blob = new Blob([watermark + analysis.sopDraft + footer], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BETA-SOP-Draft-${analysis.id}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!analysis) return <div className="p-6 text-muted-foreground">Analysis not found.</div>;

  const findings: Finding[] = (() => {
    try { return JSON.parse(analysis.findings || "[]"); } catch { return []; }
  })();

  const critical = findings.filter(f => f.severity === "critical" && !f.resolved);
  const major = findings.filter(f => f.severity === "major" && !f.resolved);
  const minor = findings.filter(f => f.severity === "minor" && !f.resolved);
  const resolved = findings.filter(f => f.resolved);

  const scoreColor = analysis.overallScore >= 80
    ? "text-green-600 dark:text-green-400"
    : analysis.overallScore >= 60
    ? "text-yellow-600 dark:text-yellow-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href="/analyses">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Analyses
          </Button>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{analysis.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date(analysis.createdAt).toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric"
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {analysis.status === "running" && (
            <Badge variant="secondary" className="gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" /> Analyzing…
            </Badge>
          )}
          {analysis.status === "complete" && analysis.sopDraft && (
            <Button size="sm" variant="outline" onClick={downloadSOP} data-testid="button-download-sop">
              <Download className="w-4 h-4 mr-1.5" /> Download SOP Draft
            </Button>
          )}
        </div>
      </div>

      {analysis.status === "running" && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-700 dark:text-blue-400">
          AI is analyzing your documentation. This page will update automatically…
        </div>
      )}

      {analysis.status === "complete" && (
        <>
          {/* Score card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-card-border col-span-2 sm:col-span-1">
              <CardContent className="p-4 text-center">
                <p className={`text-3xl font-bold ${scoreColor}`}>
                  {Math.round(analysis.overallScore)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">Compliance Score</p>
                <Progress value={analysis.overallScore} className="h-1.5 mt-2" />
              </CardContent>
            </Card>
            {[
              { label: "Critical", count: critical.length, color: "text-red-500" },
              { label: "Major", count: major.length, color: "text-yellow-500" },
              { label: "Resolved", count: resolved.length, color: "text-green-500" },
            ].map(({ label, count, color }) => (
              <Card key={label} className="border-card-border">
                <CardContent className="p-4 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{count}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Summary */}
          {analysis.summary && (
            <Card className="border-card-border bg-muted/20">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">AI Summary</p>
                <p className="text-sm leading-relaxed">{analysis.summary}</p>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="findings">
            <TabsList>
              <TabsTrigger value="findings">
                Findings ({findings.filter(f => !f.resolved).length})
              </TabsTrigger>
              <TabsTrigger value="sop">SOP Draft</TabsTrigger>
              {resolved.length > 0 && (
                <TabsTrigger value="resolved">Resolved ({resolved.length})</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="findings" className="mt-4 space-y-3">
              {findings.filter(f => !f.resolved).length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium">All findings resolved</p>
                </div>
              ) : (
                findings.filter(f => !f.resolved).map(finding => (
                  <Card key={finding.id} className="border-card-border"
                    data-testid={`card-finding-${finding.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <SeverityIcon severity={finding.severity} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <SeverityBadge severity={finding.severity} />
                              <span className="text-xs text-muted-foreground">
                                {CATEGORY_LABELS[finding.category] || finding.category}
                              </span>
                            </div>
                            <Button
                              size="sm" variant="outline"
                              className="h-6 text-xs px-2 shrink-0"
                              onClick={() => resolveMutation.mutate({ analysisId: analysis.id, findingId: finding.id })}
                              data-testid={`button-resolve-${finding.id}`}
                            >
                              Mark resolved
                            </Button>
                          </div>
                          <p className="text-sm mb-2">{finding.description}</p>
                          <div className="bg-muted/30 rounded-md p-2.5">
                            <p className="text-xs text-muted-foreground font-medium mb-0.5">Recommendation</p>
                            <p className="text-xs leading-relaxed">{finding.recommendation}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="sop" className="mt-4">
              {analysis.sopDraft ? (
                <div className="relative">
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" onClick={downloadSOP}>
                      <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                    </Button>
                  </div>
                  <Card className="border-card-border">
                    <CardContent className="p-4">
                      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground overflow-x-auto">
                        {analysis.sopDraft}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground text-sm">No SOP draft generated.</div>
              )}
            </TabsContent>

            <TabsContent value="resolved" className="mt-4 space-y-3">
              {resolved.map(finding => (
                <Card key={finding.id} className="border-card-border opacity-60">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <SeverityBadge severity={finding.severity} />
                          <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[finding.category]}</span>
                        </div>
                        <p className="text-sm text-muted-foreground line-through">{finding.description}</p>
                        <Button
                          size="sm" variant="ghost"
                          className="h-6 text-xs px-2 mt-1"
                          onClick={() => resolveMutation.mutate({ analysisId: analysis.id, findingId: finding.id })}
                        >
                          Undo
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </>
      )}

      {analysis.status === "error" && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          Analysis failed. Please try again.
        </div>
      )}
    </div>
  );
}
