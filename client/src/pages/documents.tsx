import { useState, useRef } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Plus, AlertCircle, Zap } from "lucide-react";
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

export default function DocumentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [form, setForm] = useState({ fileName: "", fileType: "", content: "" });
  const [runningAnalysisDocId, setRunningAnalysisDocId] = useState<number | null>(null);

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

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/clients/${effectiveClientId}/documents`, form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", effectiveClientId, "documents"] });
      setOpen(false);
      setForm({ fileName: "", fileType: "", content: "" });
      toast({ title: "Document uploaded", description: "Document added successfully." });
    },
    onError: () => toast({ title: "Error", description: "Failed to upload document.", variant: "destructive" }),
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

  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setForm(f => ({
        ...f,
        fileName: file.name,
        content: (ev.target?.result as string) || "",
      }));
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Upload and manage compliance documents</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!effectiveClientId} data-testid="button-upload-doc">
          <Upload className="w-4 h-4 mr-1.5" /> Upload Document
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

      {/* Upload dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Document Type</Label>
              <Select value={form.fileType} onValueChange={v => setForm(f => ({ ...f, fileType: v }))}>
                <SelectTrigger data-testid="select-doc-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Upload File (TXT)</Label>
              <Input type="file" accept=".txt,.md,.csv" onChange={handleFileRead}
                data-testid="input-file-upload" />
              <p className="text-xs text-muted-foreground">Upload a .txt file or paste content below</p>
            </div>

            <div className="space-y-1.5">
              <Label>File Name</Label>
              <Input placeholder="SOP-001-cell-culture.txt" value={form.fileName}
                onChange={e => setForm(f => ({ ...f, fileName: e.target.value }))}
                data-testid="input-file-name" />
            </div>

            <div className="space-y-1.5">
              <Label>Document Content</Label>
              <Textarea
                placeholder="Paste your SOP, batch record, or training document text here…"
                rows={6}
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                className="font-mono text-xs"
                data-testid="textarea-doc-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !form.fileName || !form.fileType || !form.content}
              data-testid="button-submit-upload"
            >
              {uploadMutation.isPending ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
