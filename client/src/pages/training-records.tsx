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
import { Plus, GraduationCap, Trash2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import type { TrainingRecord } from "@shared/schema";
import type { Client } from "@shared/schema";

const TRAINING_TYPES = ["SOP", "GMP", "GLP", "ISO 15189", "Safety", "Competency", "Equipment", "Other"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    expiring_soon: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    expired: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const icons: Record<string, React.ReactNode> = {
    active: <CheckCircle2 className="w-3 h-3" />,
    expiring_soon: <Clock className="w-3 h-3" />,
    expired: <AlertCircle className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] || ""}`}>
      {icons[status]} {status.replace("_", " ")}
    </span>
  );
}

export default function TrainingRecordsPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    clientId: "", traineeName: "", traineeEmail: "", trainingTitle: "",
    trainingType: "SOP", completedDate: "", expiryDate: "", notes: "",
  });

  const { data: records, isLoading } = useQuery<TrainingRecord[]>({ queryKey: ["/api/training-records"] });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/training-records", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-records"] });
      setOpen(false);
      setForm({ clientId: "", traineeName: "", traineeEmail: "", trainingTitle: "", trainingType: "SOP", completedDate: "", expiryDate: "", notes: "" });
      toast({ title: "Training record added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add record.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/training-records/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-records"] });
      toast({ title: "Record deleted" });
    },
  });

  const filtered = (records ?? []).filter(r =>
    r.traineeName.toLowerCase().includes(search.toLowerCase()) ||
    r.trainingTitle.toLowerCase().includes(search.toLowerCase())
  );

  const expiringSoon = (records ?? []).filter(r => r.status === "expiring_soon").length;
  const expired = (records ?? []).filter(r => r.status === "expired").length;

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Training Records</h1>
          <p className="text-sm text-muted-foreground mt-0.5">ISO 15189 competency &amp; training compliance (Clause 5.1.6)</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Record
        </Button>
      </div>

      {/* Alerts */}
      {(expiringSoon > 0 || expired > 0) && (
        <div className="flex gap-3 flex-wrap">
          {expired > 0 && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4" /> {expired} expired training{expired > 1 ? "s" : ""}
            </div>
          )}
          {expiringSoon > 0 && (
            <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
              <Clock className="w-4 h-4" /> {expiringSoon} expiring within 30 days
            </div>
          )}
        </div>
      )}

      <Input placeholder="Search by trainee or training title…" value={search}
        onChange={e => setSearch(e.target.value)} className="max-w-sm" />

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
      ) : !filtered.length ? (
        <div className="text-center py-16">
          <GraduationCap className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No training records yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(record => {
            const client = clients?.find(c => c.id === record.clientId);
            return (
              <Card key={record.id} className="border-card-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <StatusBadge status={record.status} />
                        <Badge variant="outline" className="text-xs">{record.trainingType}</Badge>
                        {client && <span className="text-xs text-muted-foreground">{client.labName}</span>}
                      </div>
                      <p className="text-sm font-medium">{record.trainingTitle}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{record.traineeName}{record.traineeEmail ? ` · ${record.traineeEmail}` : ""}</p>
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        <p className="text-xs text-muted-foreground">Completed: {new Date(record.completedDate).toLocaleDateString()}</p>
                        {record.expiryDate && (
                          <p className="text-xs text-muted-foreground">
                            Expires: <span className={record.status === "expired" ? "text-red-500" : record.status === "expiring_soon" ? "text-yellow-500" : ""}>
                              {new Date(record.expiryDate).toLocaleDateString()}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteMutation.mutate(record.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add Training Record</DialogTitle></DialogHeader>
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
                <Label>Training Type</Label>
                <Select value={form.trainingType} onValueChange={v => setForm(f => ({ ...f, trainingType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TRAINING_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Training Title</Label>
              <Input placeholder="e.g. GMP Refresher Training 2026" value={form.trainingTitle}
                onChange={e => setForm(f => ({ ...f, trainingTitle: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Trainee Name</Label>
                <Input placeholder="Dr. Jane Smith" value={form.traineeName}
                  onChange={e => setForm(f => ({ ...f, traineeName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Trainee Email (optional)</Label>
                <Input placeholder="jane@lab.com" type="email" value={form.traineeEmail}
                  onChange={e => setForm(f => ({ ...f, traineeEmail: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Completed Date</Label>
                <Input type="date" value={form.completedDate}
                  onChange={e => setForm(f => ({ ...f, completedDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date (optional)</Label>
                <Input type="date" value={form.expiryDate}
                  onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Any additional notes or certificate reference" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.traineeName || !form.trainingTitle || !form.completedDate || !form.clientId}>
              {createMutation.isPending ? "Saving…" : "Add Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
