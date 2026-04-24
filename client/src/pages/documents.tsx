import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Plus, AlertCircle, Zap, Loader2, Files, X, CheckCircle2 } from "lucide-react";
import type { Client, Document } from "@shared/schema";

const DOC_TYPES = [
  { value: "SOP", label: "SOP (Standard Operating Procedure)" },
  { value: "batch_record", label: "Batch Record" },
  { value: "training_record", label: "Training Record" },
  { value: "equipment_log", label: "Equipment Log" },
  { value: "deviation", label: "Deviation Report" },
  { value: "other", label: "Other" },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    analyzing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    analyzed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || map.pending}`}>
      {status}
    </span>
  );
}

// ── Single queued file state ──────────────────────────────────────────────────
interface QueuedFile {
  id: string;
  file: File;
  status: "pending" | "extracting" | "ready" | "uploading" | "done" | "error";
  fileName: string;
  content: string;
  errorMsg?: string;
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [fileType, setFileType] = useState<string>("");
  const [runningAnalysisDocId, setRunningAnalysisDocId] = useState<number | null>(null);

  // Multi-file queue
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [isBatchUploading, setIsBatchUploading] = useState(false);

  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"], enabled: user?.role === "admin" });
  const { data: myClient } = useQuery<Client>({
    queryKey: ["/api/clients/user", user?.id],
    queryFn: () => fetch(`/api/clients/user/${user?.id}`).then(r => r.json()),
    enabled: user?.role === "client" && !!user?.id,
  });

  const effectiveClientId = user?.role === "admin" ? (selectedClientId || clients?.[0]?.id?.toString()) : myClient?.id?.toString();
  const effectiveClient = user?.role === "admin"
    ? clients?.find(c => c.id === Number(effectiveClientId))
    : myClient;

  const { data: docs, isLoading } = useQuery<Document[]>({
    queryKey: ["/api/clients", effectiveClientId, "documents"],
    queryFn: () => fetch(`/api/clients/${effectiveClientId}/documents`).then(r => r.json()),
    enabled: !!effectiveClientId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/documents/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/clients", effectiveClientId, "documents"] }),
  });

  const analyzeMutation = useMutation({
    mutationFn: async (docId: number) => {
      setRunningAnalysisDocId(docId);
      const res = await apiRequest("POST", "/api/analyses", {
        clientId: Number(effectiveClientId),
        documentId: docId,
        title: `Gap Analysis — ${docs?.find(d => d.id === docId)?.fileName || "Document"}`,
      });
      return res.json();
    },
    onSuccess: (_, docId) => {
      toast({ title: "Analysis started", description: "AI is processing the document. Check Analyses tab in a moment." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/clients", effectiveClientId, "documents"] });
        setRunningAnalysisDocId(null);
      }, 5000);
    },
    onError: () => { setRunningAnalysisDocId(null); toast({ title: "Error", variant: "destructive" }); },
  });

  // ── Extract one file → text ───────────────────────────────────────────────
  const extractFile = useCallback(async (file: File): Promise<{ fileName: string; content: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/extract-text", { method: "POST", body: formData });
    if (!res.ok) throw new Error("Extraction failed");
    const { text, fileName } = await res.json();
    return { fileName: fileName || file.name, content: text };
  }, []);

  // ── Handle file selection (multi-file) ────────────────────────────────────
  const handleFilesSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Add to queue as pending
    const newItems: QueuedFile[] = files.map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      status: "pending" as const,
      fileName: f.name,
      content: "",
    }));
    setQueue(prev => [...prev, ...newItems]);

    // Extract each file
    for (const item of newItems) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "extracting" } : q));
      try {
        const { fileName, content } = await extractFile(item.file);
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "ready", fileName, content } : q));
      } catch {
        // Fallback: plain text
        try {
          const text = await item.file.text();
          setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "ready", content: text } : q));
        } catch {
          setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "error", errorMsg: "Could not read file" } : q));
        }
      }
    }

    // Reset the input so same files can be re-selected
    e.target.value = "";
  }, [extractFile]);

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(q => q.id !== id));
  };

  const updateQueueFileName = (id: string, fileName: string) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, fileName } : q));
  };

  // ── Batch upload all ready files ──────────────────────────────────────────
  const handleBatchUpload = async () => {
    const readyItems = queue.filter(q => q.status === "ready" && q.content);
    if (!readyItems.length || !fileType || !effectiveClientId) return;

    setIsBatchUploading(true);
    let done = 0;

    for (const item of readyItems) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "uploading" } : q));
      try {
        await apiRequest("POST", `/api/clients/${effectiveClientId}/documents`, {
          fileName: item.fileName,
          fileType,
          content: item.content,
        });
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "done" } : q));
        done++;
        setBatchProgress(Math.round((done / readyItems.length) * 100));
      } catch {
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "error", errorMsg: "Upload failed" } : q));
      }
    }

    queryClient.invalidateQueries({ queryKey: ["/api/clients", effectiveClientId, "documents"] });
    setIsBatchUploading(false);

    const allDone = queue.filter(q => q.status === "done").length + done;
    toast({
      title: `${done} document${done !== 1 ? "s" : ""} uploaded`,
      description: done < readyItems.length
        ? `${readyItems.length - done} file(s) failed.`
        : "All documents uploaded successfully.",
    });

    // Auto-close after a moment if all done
    if (done === readyItems.length) {
      setTimeout(() => {
        setOpen(false);
        setQueue([]);
        setFileType("");
        setBatchProgress(0);
      }, 1200);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v && !isBatchUploading) {
      setQueue([]);
      setFileType("");
      setBatchProgress(0);
    }
    setOpen(v);
  };

  const readyCount = queue.filter(q => q.status === "ready").length;
  const doneCount = queue.filter(q => q.status === "done").length;
  const extractingCount = queue.filter(q => q.status === "extracting").length;

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Upload and manage compliance documents</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!effectiveClientId} data-testid="button-upload-doc">
          <Upload className="w-4 h-4 mr-1.5" /> Upload Documents
        </Button>
      </div>

      {/* Admin: client selector */}
      {user?.role === "admin" && clients && clients.length > 0 && (
        <div className="flex items-center gap-3">
          <Label className="text-sm shrink-0">Viewing client:</Label>
          <Select value={selectedClientId || clients[0]?.id?.toString()}
            onValueChange={setSelectedClientId}>
            <SelectTrigger className="w-56" data-testid="select-client-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.labName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {!effectiveClientId ? (
        <div className="text-center py-12 bg-muted/20 rounded-lg">
          <AlertCircle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No client selected. Add a client first.</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : !docs?.length ? (
        <div className="text-center py-14 border-2 border-dashed border-border rounded-xl">
          <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium">No documents yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Upload SOPs, batch records, training logs, or equipment records
          </p>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Upload className="w-4 h-4 mr-1.5" /> Upload your first document
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <Card key={doc.id} className="border-card-border" data-testid={`card-doc-${doc.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-medium truncate">{doc.fileName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {DOC_TYPES.find(t => t.value === doc.fileType)?.label || doc.fileType} ·
                          Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={doc.status} />
                        <Button
                          size="sm" variant="outline"
                          className="h-7 gap-1.5 text-xs"
                          onClick={() => analyzeMutation.mutate(doc.id)}
                          disabled={analyzeMutation.isPending && runningAnalysisDocId === doc.id}
                          data-testid={`button-analyze-doc-${doc.id}`}
                        >
                          <Zap className="w-3 h-3" />
                          {analyzeMutation.isPending && runningAnalysisDocId === doc.id ? "Analyzing…" : "Analyze"}
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMutation.mutate(doc.id)}
                          data-testid={`button-delete-doc-${doc.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2 font-mono bg-muted/30 rounded px-2 py-1">
                      {doc.content.substring(0, 150)}…
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Upload Dialog (multi-file) ──────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Files className="w-5 h-5 text-primary" />
              Upload Documents
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Document type — shared for entire batch */}
            <div className="space-y-1.5">
              <Label>Document Type <span className="text-muted-foreground text-xs">(applies to all files in this batch)</span></Label>
              <Select value={fileType} onValueChange={setFileType}>
                <SelectTrigger data-testid="select-doc-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* File drop zone / picker */}
            <div className="space-y-1.5">
              <Label>Select Files</Label>
              <label
                className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border rounded-xl cursor-pointer bg-muted/20 hover:bg-muted/40 transition-colors"
                data-testid="label-file-dropzone"
              >
                <Upload className="w-6 h-6 text-muted-foreground mb-1.5" />
                <span className="text-sm text-muted-foreground">Click to select files</span>
                <span className="text-xs text-muted-foreground/60 mt-0.5">PDF, DOCX, TXT, CSV, PNG, JPG, TIFF — up to 20 MB each</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.xml,.html,.png,.jpg,.jpeg,.webp,.tiff"
                  onChange={handleFilesSelected}
                  className="hidden"
                  data-testid="input-file-upload"
                />
              </label>
              <div className="flex flex-wrap gap-1 mt-1">
                {[".pdf",".docx",".doc",".txt",".csv"].map(ext => (
                  <span key={ext} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{ext}</span>
                ))}
                {[".png",".jpg",".jpeg",".tiff"].map(ext => (
                  <span key={ext} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-mono">{ext}</span>
                ))}
                <span className="text-[10px] text-muted-foreground ml-1">Images are OCR-scanned</span>
              </div>
            </div>

            {/* File queue */}
            {queue.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    {queue.length} file{queue.length !== 1 ? "s" : ""} queued
                    {extractingCount > 0 && ` · Extracting ${extractingCount}…`}
                  </Label>
                  {!isBatchUploading && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-6 text-xs text-muted-foreground"
                      onClick={() => setQueue([])}
                    >
                      Clear all
                    </Button>
                  )}
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {queue.map(item => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors ${
                        item.status === "done"
                          ? "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-900/10"
                          : item.status === "error"
                          ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/10"
                          : "border-border bg-muted/20"
                      }`}
                      data-testid={`queue-item-${item.id}`}
                    >
                      {/* Status icon */}
                      <div className="shrink-0 w-5 flex items-center justify-center">
                        {item.status === "extracting" || item.status === "uploading" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        ) : item.status === "done" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        ) : item.status === "error" ? (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                        ) : item.status === "ready" ? (
                          <FileText className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </div>

                      {/* Editable file name */}
                      <div className="flex-1 min-w-0">
                        {item.status === "ready" || item.status === "pending" ? (
                          <Input
                            value={item.fileName}
                            onChange={e => updateQueueFileName(item.id, e.target.value)}
                            className="h-6 text-xs px-1.5 font-mono"
                            data-testid={`input-queue-name-${item.id}`}
                          />
                        ) : (
                          <p className="text-xs font-mono truncate">{item.fileName}</p>
                        )}
                        {item.status === "extracting" && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">Extracting text…</p>
                        )}
                        {item.status === "uploading" && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">Uploading…</p>
                        )}
                        {item.status === "done" && (
                          <p className="text-[10px] text-green-600 mt-0.5">Uploaded</p>
                        )}
                        {item.status === "error" && (
                          <p className="text-[10px] text-red-500 mt-0.5">{item.errorMsg || "Error"}</p>
                        )}
                        {item.status === "ready" && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {item.content.length.toLocaleString()} chars extracted · ready to upload
                          </p>
                        )}
                      </div>

                      {/* Remove button */}
                      {!isBatchUploading && item.status !== "done" && item.status !== "uploading" && (
                        <Button
                          variant="ghost" size="icon"
                          className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeFromQueue(item.id)}
                          data-testid={`button-remove-queue-${item.id}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Batch progress */}
                {isBatchUploading && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Uploading…</span>
                      <span>{batchProgress}%</span>
                    </div>
                    <Progress value={batchProgress} className="h-1.5" />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isBatchUploading}>
              Cancel
            </Button>
            <Button
              onClick={handleBatchUpload}
              disabled={
                isBatchUploading ||
                !fileType ||
                !effectiveClientId ||
                readyCount === 0 ||
                extractingCount > 0
              }
              data-testid="button-submit-upload"
            >
              {isBatchUploading ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Uploading…</>
              ) : (
                <><Upload className="w-4 h-4 mr-1.5" /> Upload {readyCount > 0 ? `${readyCount} Document${readyCount !== 1 ? "s" : ""}` : "Documents"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
