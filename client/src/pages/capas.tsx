import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { Plus, ClipboardList, CheckCircle2, Clock, AlertTriangle, XCircle, Pencil } from "lucide-react";
import type { Capa } from "@shared/schema";
import type { Client } from "@shared/schema";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />,
  in_progress: <Clock className="w-3.5 h-3.5 text-blue-500" />,
  closed: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
  overdue: <XCircle className="w-3.5 h-3.5 text-red-500" />,
};

export default function CapasPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingCapa, setEditingCapa] = useState<Capa | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [form, setForm] = useState({
    clientId: "", title: "", description: "", assignedTo: "",
    priority: "medium", dueDate: "", rootCause: "", correctiveAction: "", preventiveAction: "",
  });

  const { data: capas, isLoading } = useQuery<Capa[]>({ queryKey: ["/api/capas"] });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/capas", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capas"] });
      setOpen(false);
      resetForm();
      toast({ title: "CAPA created", description: "Corrective action has been logged." });
    },
    onError: () => toast({ title: "Error", description: "Failed to create CAPA.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Capa> }) => {
      const res = await apiRequest("PATCH", `/api/capas/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capas"] });
      setEditingCapa(null);
      toast({ title: "CAPA updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/capas/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capas"] });
      toast({ title: "CAPA removed" });
    },
  });

  const resetForm = () => setForm({ clientId: "", title: "", description: "", assignedTo: "", priority: "medium", dueDate: "", rootCause: "", correctiveAction: "", preventiveAction: "" });

  const filtered = (capas ?? []).filter(c => filter === "all" || c.status === filter);

  const statusCounts = (capas ?? []).reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">CAPA Tracker</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Corrective & Preventive Actions — track, assign, and close compliance gaps</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New CAPA
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open", key: "open", color: "text-yellow-600 dark:text-yellow-400" },
          { label: "In Progress", key: "in_progress", color: "text-blue-600 dark:text-blue-400" },
          { label: "Closed", key: "closed", color: "text-green-600 dark:text-green-400" },
          { label: "Overdue", key: "overdue", color: "text-red-600 dark:text-red-400" },
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

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {["all", "open", "in_progress", "closed", "overdue"].map(f => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm"
            className="capitalize text-xs h-7" onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f.replace("_", " ")}
          </Button>
        ))}
      </div>

      {/* CAPA list */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>
      ) : !filtered.length ? (
        <div className="text-center py-16">
          <ClipboardList className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No CAPAs {filter !== "all" ? `with status "${filter.replace("_", " ")}"` : "yet"}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(capa => {
            const client = clients?.find(c => c.id === capa.clientId);
            const isOverdue = capa.dueDate && new Date(capa.dueDate) < new Date() && capa.status !== "closed";
            return (
              <Card key={capa.id} className={`border-card-border ${isOverdue ? "border-red-300 dark:border-red-800" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <div className="flex items-center gap-1">{STATUS_ICONS[capa.status]}<span className="text-xs text-muted-foreground capitalize">{capa.status.replace("_", " ")}</span></div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PRIORITY_COLORS[capa.priority]}`}>{capa.priority}</span>
                        {client && <span className="text-xs text-muted-foreground">{client.labName}</span>}
                        {isOverdue && <Badge variant="destructive" className="text-xs h-5">Overdue</Badge>}
                      </div>
                      <p className="text-sm font-medium">{capa.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{capa.description}</p>
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        {capa.assignedTo && <p className="text-xs text-muted-foreground">Assigned to: <span className="text-foreground">{capa.assignedTo}</span></p>}
                        {capa.dueDate && <p className="text-xs text-muted-foreground">Due: <span className={isOverdue ? "text-red-500" : "text-foreground"}>{new Date(capa.dueDate).toLocaleDateString()}</span></p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {capa.status !== "closed" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                          onClick={() => updateMutation.mutate({ id: capa.id, data: { status: capa.status === "open" ? "in_progress" : "closed" } })}>
                          {capa.status === "open" ? "Start" : "Close"}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 px-2"
                        onClick={() => setEditingCapa(capa)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create CAPA dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New CAPA</DialogTitle></DialogHeader>
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
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["critical","high","medium","low"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input placeholder="e.g. Missing signature on SOP-042" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} placeholder="Describe the issue and its impact" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Assigned To (email)</Label>
                <Input placeholder="analyst@lab.com" value={form.assignedTo}
                  onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Corrective Action</Label>
              <Textarea rows={2} placeholder="Immediate action taken to fix the issue" value={form.correctiveAction}
                onChange={e => setForm(f => ({ ...f, correctiveAction: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.title || !form.clientId}>
              {createMutation.isPending ? "Creating…" : "Create CAPA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit CAPA dialog */}
      {editingCapa && (
        <Dialog open={!!editingCapa} onOpenChange={() => setEditingCapa(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Edit CAPA</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editingCapa.status}
                  onValueChange={v => setEditingCapa(prev => prev ? { ...prev, status: v as any } : null)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["open","in_progress","closed","overdue"].map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_"," ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Root Cause</Label>
                <Textarea rows={2} value={editingCapa.rootCause || ""}
                  onChange={e => setEditingCapa(prev => prev ? { ...prev, rootCause: e.target.value } : null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Corrective Action</Label>
                <Textarea rows={2} value={editingCapa.correctiveAction || ""}
                  onChange={e => setEditingCapa(prev => prev ? { ...prev, correctiveAction: e.target.value } : null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Preventive Action</Label>
                <Textarea rows={2} value={editingCapa.preventiveAction || ""}
                  onChange={e => setEditingCapa(prev => prev ? { ...prev, preventiveAction: e.target.value } : null)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingCapa(null)}>Cancel</Button>
              <Button onClick={() => updateMutation.mutate({ id: editingCapa.id, data: editingCapa })}
                disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
