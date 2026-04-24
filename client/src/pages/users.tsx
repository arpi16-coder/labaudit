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
import { Plus, UserCog, Shield } from "lucide-react";
import type { AuthUser } from "@/lib/auth";

const ROLES = [
  { value: "admin", label: "Admin", desc: "Full access to all features" },
  { value: "lab_manager", label: "Lab Manager", desc: "Manage clients, documents, analyses" },
  { value: "qa_analyst", label: "QA Analyst", desc: "Run analyses, manage CAPAs" },
  { value: "reviewer", label: "Reviewer", desc: "Read-only access + comment" },
  { value: "auditor", label: "External Auditor", desc: "View audit reports only" },
  { value: "client", label: "Client", desc: "Lab client portal access" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  lab_manager: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  qa_analyst: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  reviewer: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  auditor: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  client: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export default function UsersPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editUser, setEditUser] = useState<AuthUser | null>(null);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "client", organizationName: "" });

  // Get stored token for auth header
  const authHeaders = () => {
    const t = sessionStorage.getItem("labaudit_token");
    return t ? { "Authorization": `Bearer ${t}` } : {};
  };

  const { data: users, isLoading } = useQuery<AuthUser[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include", headers: authHeaders() });
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.message) throw new Error(data.message);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setOpen(false);
      setForm({ email: "", name: "", password: "", role: "client", organizationName: "" });
      toast({ title: "User created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to create user.", variant: "destructive" }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      const res = await fetch(`/api/users/${id}/role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ role }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditUser(null);
      toast({ title: "Role updated" });
    },
  });

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Users & Roles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage user accounts and access permissions</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add User
        </Button>
      </div>

      {/* Role legend */}
      <Card className="border-card-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Role Permissions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ROLES.map(r => (
              <div key={r.value} className="flex items-start gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 whitespace-nowrap ${ROLE_COLORS[r.value]}`}>{r.label}</span>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <div className="space-y-2">
          {(users ?? []).map(user => (
            <Card key={user.id} className="border-card-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-primary">{user.name?.charAt(0)?.toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[user.role] || ""}`}>
                      {user.role?.replace("_", " ")}
                    </span>
                    <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                      onClick={() => setEditUser(user)}>
                      <UserCog className="w-3.5 h-3.5 mr-1" /> Change Role
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create user dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input placeholder="Dr. Jane Smith" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input placeholder="jane@lab.com" type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" placeholder="Min 6 characters" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Organization (optional)</Label>
              <Input placeholder="BioGen Labs" value={form.organizationName}
                onChange={e => setForm(f => ({ ...f, organizationName: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.email || !form.name || !form.password}>
              {createMutation.isPending ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change role dialog */}
      {editUser && (
        <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Change Role — {editUser.name}</DialogTitle></DialogHeader>
            <div className="py-3">
              <Label>New Role</Label>
              <Select value={editUser.role}
                onValueChange={v => setEditUser(prev => prev ? { ...prev, role: v as any } : null)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label} — {r.desc}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button onClick={() => updateRoleMutation.mutate({ id: editUser.id, role: editUser.role })}
                disabled={updateRoleMutation.isPending}>
                {updateRoleMutation.isPending ? "Saving…" : "Update Role"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
