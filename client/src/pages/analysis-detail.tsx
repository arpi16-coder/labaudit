import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Info, XCircle,
  FileText, Download, RefreshCw, Circle, Plus, Wand2,
  Loader2, Copy, RotateCcw, Sparkles, PenLine,
  History, GitCompare, ChevronDown, ChevronRight, Bookmark,
  Clock, Cpu, User, OrigamiIcon
} from "lucide-react";
import type { Analysis } from "@shared/schema";
import type { Finding } from "@shared/schema";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
type SnapshotType = "original" | "ai" | "manual";

interface VersionSnapshot {
  id: string;
  label: string;
  type: SnapshotType;
  timestamp: Date;
  content: string;
  instruction?: string;
  charCount: number;
  lineCount: number;
}

// ── Diff engine (line-level LCS) ──────────────────────────────────────────────
type DiffLine = { type: "same" | "added" | "removed"; text: string };

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // LCS table
  const m = oldLines.length;
  const n = newLines.length;
  // Cap at 500 lines each to keep it snappy
  const A = oldLines.slice(0, 500);
  const B = newLines.slice(0, 500);
  const am = A.length;
  const bn = B.length;

  const dp: number[][] = Array.from({ length: am + 1 }, () => new Array(bn + 1).fill(0));
  for (let i = am - 1; i >= 0; i--) {
    for (let j = bn - 1; j >= 0; j--) {
      if (A[i] === B[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < am && j < bn) {
    if (A[i] === B[j]) {
      result.push({ type: "same", text: A[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "removed", text: A[i] });
      i++;
    } else {
      result.push({ type: "added", text: B[j] });
      j++;
    }
  }
  while (i < am) { result.push({ type: "removed", text: A[i++] }); }
  while (j < bn) { result.push({ type: "added", text: B[j++] }); }

  // Append any lines beyond cap as "same" (approximation)
  for (let k = 500; k < oldLines.length; k++) result.push({ type: "removed", text: oldLines[k] });
  for (let k = 500; k < newLines.length; k++) result.push({ type: "added", text: newLines[k] });

  return result;
}

function diffStats(diff: DiffLine[]) {
  return {
    added: diff.filter(d => d.type === "added").length,
    removed: diff.filter(d => d.type === "removed").length,
    same: diff.filter(d => d.type === "same").length,
  };
}

// ── Snapshot type pill ────────────────────────────────────────────────────────
function TypePill({ type }: { type: SnapshotType }) {
  if (type === "original") return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
      <FileText className="w-2.5 h-2.5" /> Original
    </span>
  );
  if (type === "ai") return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
      <Cpu className="w-2.5 h-2.5" /> AI
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
      <User className="w-2.5 h-2.5" /> Manual
    </span>
  );
}

// ── Diff viewer ───────────────────────────────────────────────────────────────
function DiffViewer({ leftSnap, rightSnap }: { leftSnap: VersionSnapshot; rightSnap: VersionSnapshot }) {
  const diff = computeDiff(leftSnap.content, rightSnap.content);
  const stats = diffStats(diff);
  const unchanged = stats.same === diff.length;

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">Comparing</span>
        <TypePill type={leftSnap.type} />
        <span className="font-medium text-muted-foreground truncate max-w-[120px]">{leftSnap.label}</span>
        <span className="text-muted-foreground">→</span>
        <TypePill type={rightSnap.type} />
        <span className="font-medium text-muted-foreground truncate max-w-[120px]">{rightSnap.label}</span>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {stats.added > 0 && (
            <span className="text-green-600 dark:text-green-400 font-mono">+{stats.added}</span>
          )}
          {stats.removed > 0 && (
            <span className="text-red-500 font-mono">−{stats.removed}</span>
          )}
          {unchanged && (
            <span className="text-muted-foreground">No differences</span>
          )}
        </div>
      </div>

      {unchanged ? (
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <CheckCircle2 className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">These two versions are identical.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Side-by-side header */}
          <div className="grid grid-cols-2 border-b border-border bg-muted/40">
            <div className="px-3 py-2 flex items-center gap-2 border-r border-border">
              <TypePill type={leftSnap.type} />
              <span className="text-xs font-medium truncate">{leftSnap.label}</span>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                {leftSnap.charCount.toLocaleString()} chars
              </span>
            </div>
            <div className="px-3 py-2 flex items-center gap-2">
              <TypePill type={rightSnap.type} />
              <span className="text-xs font-medium truncate">{rightSnap.label}</span>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                {rightSnap.charCount.toLocaleString()} chars
              </span>
            </div>
          </div>

          {/* Diff lines — side by side */}
          <ScrollArea className="h-[420px]">
            <div className="font-mono text-[11px] leading-5">
              {/* Build paired rows: for each removed line pair it with the next added if contiguous */}
              {buildSideBySideRows(diff).map((row, idx) => (
                <div key={idx} className="grid grid-cols-2 border-b border-border/40 last:border-0">
                  {/* Left */}
                  <div className={`px-3 py-0.5 border-r border-border/40 whitespace-pre-wrap break-all min-h-[22px] ${
                    row.left?.type === "removed"
                      ? "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
                      : row.left?.type === "same"
                      ? "text-foreground"
                      : "bg-muted/20 text-muted-foreground/30"
                  }`}>
                    {row.left?.type === "removed" && <span className="select-none mr-1 opacity-60">−</span>}
                    {row.left?.type === "same" && <span className="select-none mr-1 opacity-30"> </span>}
                    {row.left ? row.left.text || "\u00a0" : ""}
                  </div>
                  {/* Right */}
                  <div className={`px-3 py-0.5 whitespace-pre-wrap break-all min-h-[22px] ${
                    row.right?.type === "added"
                      ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400"
                      : row.right?.type === "same"
                      ? "text-foreground"
                      : "bg-muted/20 text-muted-foreground/30"
                  }`}>
                    {row.right?.type === "added" && <span className="select-none mr-1 opacity-60">+</span>}
                    {row.right?.type === "same" && <span className="select-none mr-1 opacity-30"> </span>}
                    {row.right ? row.right.text || "\u00a0" : ""}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// Build side-by-side row pairs from a flat diff
function buildSideBySideRows(diff: DiffLine[]): Array<{ left?: DiffLine; right?: DiffLine }> {
  const rows: Array<{ left?: DiffLine; right?: DiffLine }> = [];
  let i = 0;
  while (i < diff.length) {
    const cur = diff[i];
    if (cur.type === "same") {
      rows.push({ left: cur, right: cur });
      i++;
    } else if (cur.type === "removed") {
      // Peek ahead: if next is "added", pair them
      if (i + 1 < diff.length && diff[i + 1].type === "added") {
        rows.push({ left: cur, right: diff[i + 1] });
        i += 2;
      } else {
        rows.push({ left: cur, right: undefined });
        i++;
      }
    } else {
      // standalone "added"
      rows.push({ left: undefined, right: cur });
      i++;
    }
  }
  return rows;
}

// ── Version history panel ─────────────────────────────────────────────────────
function VersionHistoryPanel({
  snapshots,
  activeId,
  onRestore,
  onCompare,
  compareIds,
  onSetCompare,
}: {
  snapshots: VersionSnapshot[];
  activeId: string;
  onRestore: (snap: VersionSnapshot) => void;
  onCompare: (a: string, b: string) => void;
  compareIds: [string, string] | null;
  onSetCompare: (ids: [string, string] | null) => void;
}) {
  const [selectingCompare, setSelectingCompare] = useState<string | null>(null);

  const handleCompareClick = (id: string) => {
    if (!selectingCompare) {
      setSelectingCompare(id);
    } else if (selectingCompare === id) {
      setSelectingCompare(null);
    } else {
      onCompare(selectingCompare, id);
      setSelectingCompare(null);
    }
  };

  const cancelCompare = () => {
    setSelectingCompare(null);
    onSetCompare(null);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Version History</span>
          <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 ml-1">
            {snapshots.length}
          </span>
        </div>
        {selectingCompare ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-primary animate-pulse">Select another version to compare</span>
            <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={cancelCompare}>
              Cancel
            </Button>
          </div>
        ) : compareIds ? (
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5 text-muted-foreground" onClick={cancelCompare}>
            Close diff
          </Button>
        ) : null}
      </div>

      <ScrollArea className="max-h-64">
        <div className="divide-y divide-border/60">
          {snapshots.map((snap, idx) => {
            const isActive = snap.id === activeId;
            const isInCompare = compareIds?.includes(snap.id);
            const isSelectingThis = selectingCompare === snap.id;

            return (
              <div
                key={snap.id}
                className={`group flex items-start gap-2.5 px-3 py-2.5 transition-colors cursor-default ${
                  isActive
                    ? "bg-primary/5 border-l-2 border-l-primary"
                    : isInCompare
                    ? "bg-blue-50/50 dark:bg-blue-950/20 border-l-2 border-l-blue-400"
                    : isSelectingThis
                    ? "bg-primary/8 border-l-2 border-l-primary/60 ring-1 ring-inset ring-primary/20"
                    : "hover:bg-muted/30"
                }`}
                data-testid={`version-snap-${snap.id}`}
              >
                {/* Timeline dot */}
                <div className="flex flex-col items-center shrink-0 mt-0.5">
                  <div className={`w-2 h-2 rounded-full mt-0.5 ${
                    snap.type === "original"
                      ? "bg-muted-foreground/40"
                      : snap.type === "ai"
                      ? "bg-primary"
                      : "bg-orange-500"
                  }`} />
                  {idx < snapshots.length - 1 && (
                    <div className="w-px flex-1 bg-border/60 mt-1 min-h-[12px]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <TypePill type={snap.type} />
                    <span className="text-xs font-medium truncate max-w-[160px]">{snap.label}</span>
                    {isActive && (
                      <span className="text-[10px] text-primary font-medium ml-auto shrink-0">current</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      {snap.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{snap.charCount.toLocaleString()} chars</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{snap.lineCount} lines</span>
                  </div>
                  {snap.instruction && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 italic truncate">"{snap.instruction}"</p>
                  )}
                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isActive && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => onRestore(snap)}
                        data-testid={`button-restore-${snap.id}`}
                      >
                        <RotateCcw className="w-2.5 h-2.5 mr-1" /> Restore
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="sm"
                      className={`h-5 text-[10px] px-1.5 ${
                        isSelectingThis
                          ? "text-primary"
                          : isInCompare
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => handleCompareClick(snap.id)}
                      data-testid={`button-compare-${snap.id}`}
                    >
                      <GitCompare className="w-2.5 h-2.5 mr-1" />
                      {isSelectingThis ? "Selected" : isInCompare ? "In diff" : "Compare"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Severity helpers ──────────────────────────────────────────────────────────
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

// ── Compliance radar ──────────────────────────────────────────────────────────
function ComplianceRadar({ findings, score }: { findings: Finding[]; score: number }) {
  const categories = [
    { label: "Signatures", key: "signature" },
    { label: "Dates", key: "date" },
    { label: "Procedures", key: "procedure_gap" },
    { label: "Formatting", key: "formatting" },
    { label: "Terminology", key: "terminology" },
    { label: "Fields", key: "missing_field" },
  ];

  const data = categories.map(cat => {
    const catFindings = findings.filter(f => f.category === cat.key);
    const criticals = catFindings.filter(f => f.severity === "critical").length;
    const majors = catFindings.filter(f => f.severity === "major").length;
    const penalty = Math.min(100, criticals * 30 + majors * 15);
    return { subject: cat.label, score: Math.max(0, 100 - penalty), fullMark: 100 };
  });

  return (
    <Card className="border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Compliance Radar</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={220}>
          <RadarChart data={data}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(val: number) => [`${val}%`, "Score"]}
            />
            <Radar name="Compliance" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── AI Document Editor ────────────────────────────────────────────────────────
function makeSnap(
  label: string,
  type: SnapshotType,
  content: string,
  instruction?: string
): VersionSnapshot {
  return {
    id: Math.random().toString(36).slice(2),
    label,
    type,
    timestamp: new Date(),
    content,
    instruction,
    charCount: content.length,
    lineCount: content.split("\n").length,
  };
}

function AIDocumentEditor({ analysis, findings }: { analysis: Analysis; findings: Finding[] }) {
  const { toast } = useToast();

  const originalSnap = useRef<VersionSnapshot>(
    makeSnap("Original SOP Draft", "original", analysis.sopDraft || "")
  ).current;

  const [snapshots, setSnapshots] = useState<VersionSnapshot[]>([originalSnap]);
  const [activeId, setActiveId] = useState(originalSnap.id);
  const [editorContent, setEditorContent] = useState(analysis.sopDraft || "");
  const [instruction, setInstruction] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const activeSnap = snapshots.find(s => s.id === activeId) ?? originalSnap;
  const unresolvedCount = findings.filter(f => !f.resolved).length;

  // ── Mutation ──
  const correctMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/analyses/${analysis.id}/correct-document`, {
        currentContent: editorContent,
        instruction: instruction.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data: { correctedText: string }) => {
      const aiSnap = makeSnap(
        instruction.trim() ? `AI: "${instruction.trim().slice(0, 40)}"` : `AI Correction #${snapshots.filter(s => s.type === "ai").length + 1}`,
        "ai",
        data.correctedText,
        instruction.trim() || undefined
      );
      setSnapshots(prev => [...prev, aiSnap]);
      setActiveId(aiSnap.id);
      setEditorContent(data.correctedText);
      setIsDirty(false);
      setInstruction("");
      setShowHistory(true);
      toast({
        title: "AI corrections applied",
        description: `Saved as version "${aiSnap.label}".`,
      });
    },
    onError: () => {
      toast({ title: "AI correction failed", description: "Check that an AI provider is configured in Settings.", variant: "destructive" });
    },
  });

  const handleEditorChange = (val: string) => {
    setEditorContent(val);
    setIsDirty(val !== activeSnap.content);
  };

  const handleSaveSnapshot = () => {
    if (!isDirty) return;
    const manualSnap = makeSnap(
      `Manual Edit #${snapshots.filter(s => s.type === "manual").length + 1}`,
      "manual",
      editorContent
    );
    setSnapshots(prev => [...prev, manualSnap]);
    setActiveId(manualSnap.id);
    setIsDirty(false);
    setShowHistory(true);
    toast({ title: "Snapshot saved", description: `Saved as "${manualSnap.label}".` });
  };

  const handleRestore = (snap: VersionSnapshot) => {
    setEditorContent(snap.content);
    setActiveId(snap.id);
    setIsDirty(false);
    toast({ title: "Restored", description: `Editing "${snap.label}" now.` });
  };

  const handleCompare = (aId: string, bId: string) => {
    setCompareIds([aId, bId]);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editorContent).then(() => {
      toast({ title: "Copied to clipboard" });
    });
  };

  const handleDownload = (content: string, label: string) => {
    const watermark = [
      "================================================================",
      "  LABAUDIT.AI — BETA VERSION",
      "  FOR EVALUATION PURPOSES ONLY",
      "  This document is AI-generated during the beta testing period.",
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
      `  Version: ${label}`,
      `  Generated: ${new Date().toUTCString()}`,
      "  LabAudit.ai Beta | labaudit-production.up.railway.app",
      "================================================================",
    ].join("\n");
    const blob = new Blob([watermark + content + footer], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BETA-Doc-${analysis.id}-${label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const compareLeft = compareIds ? snapshots.find(s => s.id === compareIds[0]) : null;
  const compareRight = compareIds ? snapshots.find(s => s.id === compareIds[1]) : null;

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
        <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">AI Document Editor</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {unresolvedCount > 0
              ? `${unresolvedCount} open finding${unresolvedCount !== 1 ? "s" : ""} will be used to correct this document. Each AI run and manual save creates a new version you can compare or restore.`
              : "All findings resolved. Ask AI to improve or reformat — each run is saved as a version."}
          </p>
        </div>
      </div>

      {/* AI instruction row */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">Additional instruction for AI (optional)</Label>
          <Input
            placeholder="e.g. Add ISO 15189 clause references, use formal language, add missing signature block…"
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            className="text-sm"
            data-testid="input-ai-instruction"
          />
        </div>
        <Button
          onClick={() => correctMutation.mutate()}
          disabled={correctMutation.isPending}
          className="shrink-0"
          data-testid="button-ai-apply"
        >
          {correctMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Correcting…</>
          ) : (
            <><Wand2 className="w-4 h-4 mr-1.5" /> Apply AI Corrections</>
          )}
        </Button>
      </div>

      {/* Editor toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <TypePill type={activeSnap.type} />
          <span className="text-xs text-muted-foreground font-medium">{activeSnap.label}</span>
          {isDirty && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-0">
              Unsaved changes
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isDirty && (
            <Button
              variant="outline" size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleSaveSnapshot}
              data-testid="button-save-snapshot"
            >
              <Bookmark className="w-3 h-3" /> Save Version
            </Button>
          )}
          <Button
            variant="ghost" size="sm"
            className={`h-7 text-xs gap-1.5 ${showHistory ? "text-primary" : ""}`}
            onClick={() => { setShowHistory(v => !v); setCompareIds(null); }}
            data-testid="button-toggle-history"
          >
            <History className="w-3 h-3" />
            History
            {snapshots.length > 1 && (
              <span className="text-[10px] bg-primary/10 text-primary rounded-full px-1.5 py-0">{snapshots.length}</span>
            )}
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleCopy}
            data-testid="button-copy-editor"
          >
            <Copy className="w-3 h-3" /> Copy
          </Button>
          <Button
            variant="outline" size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => handleDownload(editorContent, activeSnap.label)}
            disabled={!editorContent}
            data-testid="button-download-corrected"
          >
            <Download className="w-3 h-3" /> Download
          </Button>
        </div>
      </div>

      {/* Version history panel */}
      {showHistory && (
        <VersionHistoryPanel
          snapshots={snapshots}
          activeId={activeId}
          onRestore={handleRestore}
          onCompare={handleCompare}
          compareIds={compareIds}
          onSetCompare={setCompareIds}
        />
      )}

      {/* Diff viewer */}
      {compareIds && compareLeft && compareRight && (
        <DiffViewer leftSnap={compareLeft} rightSnap={compareRight} />
      )}

      {/* Editor area */}
      {!compareIds && (
        editorContent || analysis.sopDraft ? (
          <div className="relative">
            {correctMutation.isPending && (
              <div className="absolute inset-0 bg-background/70 rounded-lg z-10 flex items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  AI is rewriting your document…
                </div>
              </div>
            )}
            <Textarea
              value={editorContent}
              onChange={e => handleEditorChange(e.target.value)}
              className="font-mono text-xs leading-relaxed min-h-[480px] resize-y"
              placeholder="Document content will appear here after analysis…"
              data-testid="textarea-doc-editor"
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">
              {editorContent.length.toLocaleString()} chars · {editorContent.split("\n").length} lines
            </p>
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
            <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No document content available.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Run the gap analysis first to generate a corrected document draft.</p>
          </div>
        )
      )}

      {/* Findings reference */}
      {findings.filter(f => !f.resolved).length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1.5 py-1">
            <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
            View {findings.filter(f => !f.resolved).length} open finding{findings.filter(f => !f.resolved).length !== 1 ? "s" : ""} the AI will address
          </summary>
          <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
            {findings.filter(f => !f.resolved).map(f => (
              <div key={f.id} className="flex items-start gap-2 p-2 rounded bg-muted/30 text-xs">
                <SeverityIcon severity={f.severity} />
                <div className="min-w-0">
                  <span className="font-medium">{f.description}</span>
                  <span className="text-muted-foreground"> → {f.recommendation}</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalysisDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: analysis, isLoading } = useQuery<Analysis>({
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-card-border col-span-2 sm:col-span-1">
              <CardContent className="p-4 text-center">
                <p className={`text-3xl font-bold ${scoreColor}`}>{Math.round(analysis.overallScore)}%</p>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysis.summary && (
              <Card className="border-card-border bg-muted/20">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">AI Summary</p>
                  <p className="text-sm leading-relaxed">{analysis.summary}</p>
                </CardContent>
              </Card>
            )}
            {findings.length > 0 && <ComplianceRadar findings={findings} score={analysis.overallScore} />}
          </div>

          <Tabs defaultValue="findings">
            <TabsList>
              <TabsTrigger value="findings">
                Findings ({findings.filter(f => !f.resolved).length})
              </TabsTrigger>
              <TabsTrigger value="sop">SOP Draft</TabsTrigger>
              <TabsTrigger value="ai-editor" data-testid="tab-ai-editor">
                <Wand2 className="w-3.5 h-3.5 mr-1.5" /> AI Editor
              </TabsTrigger>
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
                  <Card key={finding.id} className="border-card-border" data-testid={`card-finding-${finding.id}`}>
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
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm" variant="outline"
                                className="h-6 text-xs px-2 shrink-0"
                                onClick={() => resolveMutation.mutate({ analysisId: analysis.id, findingId: finding.id })}
                                data-testid={`button-resolve-${finding.id}`}
                              >
                                Mark resolved
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="h-6 text-xs px-2 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={() => navigate(`/capas?from=finding&analysisId=${analysis.id}&findingId=${finding.id}&title=${encodeURIComponent(finding.description.substring(0, 80))}`)}
                              >
                                <Plus className="w-3 h-3 mr-1" /> CAPA
                              </Button>
                            </div>
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

            <TabsContent value="ai-editor" className="mt-4">
              <AIDocumentEditor analysis={analysis} findings={findings} />
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
