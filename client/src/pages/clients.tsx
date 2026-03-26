import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Mail, Trash2, ArrowRight, AlertTriangle, CheckCircle, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import type { Client } from "@shared/schema";

const LAB_TYPES = ["GMP", "GLP", "Regenerative", "Biotech", "IVF Clinic", "Biobank", "Other"];
const FRAMEWORKS = ["GMP", "GLP", "ISO 15189", "FDA 21 CFR Part 211", "FDA 21 CFR Part 11", "ICH Q7", "Other"];

function scoreColor(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export default function ClientsPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    labName: "", contactName: "", contactEmail: "",
    labType: "", complianceFramework: "",
  });

  const { data: clients, isLoading } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/clients", { ...data, userId: 1 });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setOpen(false);
      setForm({ labName: "", contactName: "", contactEmail: "", labType: "", complianceFramework: "" });
      toast({ title: "Client added", description: "New lab client has been created." });
    },
    onError: () => toast({ title: "Error", description: "Failed to add client.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/clients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Removed", description: "Client deleted." });
    },
  });

  const filtered = clients?.filter(c =>
    c.labName.toLowerCase().includes(search.toLowerCase()) ||
    c.contactEmail.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Lab Clients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your partner labs and their compliance status</p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-add-client">
          <Plus className="w-4 h-4 mr-1.5" /> Add Client
        </Button>
      </div>

      <Input
        placeholder="Search by lab name or email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
        data-testid="input-search-clients"
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : !filtered.length ? (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {search ? "No clients match your search." : "No clients yet. Add your first lab partner."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(client => (
            <Card key={client.id} className="border-card-border hover:shadow-sm transition-shadow"
              data-testid={`card-client-${client.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm">
                    {client.labName.charAt(0)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={client.status === "active" ? "default" : "secondary"} className="text-xs">
                      {client.status}
                    </Badge>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate(client.id)}
                      data-testid={`button-delete-client-${client.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <h3 className="font-medium text-sm mb-0.5 truncate">{client.labName}</h3>
                <p className="text-xs text-muted-foreground mb-1">{client.labType} · {client.complianceFramework}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                  <Mail className="w-3 h-3" />
                  <span className="truncate">{client.contactEmail}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Audit Score</p>
                    <p className={`text-lg font-semibold ${scoreColor(client.auditScore ?? null)}`}>
                      {client.auditScore !== null ? `${Math.round(client.auditScore ?? 0)}%` : "—"}
                    </p>
                  </div>
                  <Link href={`/clients/${client.id}`}>
                    <Button size="sm" variant="outline" data-testid={`button-view-client-${client.id}`}>
                      View <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add client dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Lab Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Lab Name</Label>
              <Input placeholder="BioGen Labs" value={form.labName}
                onChange={e => setForm(f => ({ ...f, labName: e.target.value }))}
                data-testid="input-lab-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact Name</Label>
                <Input placeholder="Dr. Jane Smith" value={form.contactName}
                  onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                  data-testid="input-contact-name" />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Email</Label>
                <Input placeholder="jane@lab.com" type="email" value={form.contactEmail}
                  onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
                  data-testid="input-contact-email" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Lab Type</Label>
                <Select value={form.labType} onValueChange={v => setForm(f => ({ ...f, labType: v }))}>
                  <SelectTrigger data-testid="select-lab-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {LAB_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Framework</Label>
                <Select value={form.complianceFramework} onValueChange={v => setForm(f => ({ ...f, complianceFramework: v }))}>
                  <SelectTrigger data-testid="select-framework">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {FRAMEWORKS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.labName || !form.labType || !form.complianceFramework}
              data-testid="button-submit-client"
            >
              {createMutation.isPending ? "Adding…" : "Add Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
