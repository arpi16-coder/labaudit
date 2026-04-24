import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, Shield, Brain, Database, Clock, CheckCircle } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const [form, setForm] = useState<Record<string, string>>({});

  const effectiveSettings = { ...settings, ...form };

  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const res = await apiRequest("PATCH", "/api/settings", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setForm({});
      toast({ title: "Settings saved", description: "Configuration updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  const retentionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/apply-retention", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Retention policy checked", description: `${data.documentsAffected} document(s) are older than ${data.retentionDays} days.` });
    },
  });

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const hasChanges = Object.keys(form).length > 0;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading settings...</div>;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" /> Platform Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Configure security, AI provider, and data retention policies.</p>
      </div>

      {/* Encryption */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Encryption at Rest
          </CardTitle>
          <CardDescription>Documents are encrypted with AES-256-GCM before being stored in the database.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Encryption</Label>
              <p className="text-xs text-muted-foreground mt-0.5">All new document uploads will be encrypted. Existing documents are unaffected until re-uploaded.</p>
            </div>
            <Switch
              data-testid="toggle-encryption"
              checked={effectiveSettings.encryption_enabled !== "false"}
              onCheckedChange={(v) => set("encryption_enabled", v ? "true" : "false")}
            />
          </div>
          <div className="rounded-md bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
            <p>🔑 Set <code className="text-foreground">ENCRYPTION_KEY</code> environment variable (any string) on your server for production use.</p>
            <p>⚠️ Without a custom key, a development key is used — not suitable for real client data.</p>
          </div>
        </CardContent>
      </Card>

      {/* AI Provider */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" /> AI Analysis Provider
          </CardTitle>
          <CardDescription>Choose between Perplexity API (cloud) or Ollama (on-premise, no data leaves your server).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select
              value={effectiveSettings.ai_provider || "perplexity"}
              onValueChange={(v) => set("ai_provider", v)}
            >
              <SelectTrigger data-testid="select-ai-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="perplexity">
                  <div className="flex items-center gap-2">
                    Perplexity API
                    <Badge variant="secondary" className="text-xs">Cloud</Badge>
                  </div>
                </SelectItem>
                <SelectItem value="ollama">
                  <div className="flex items-center gap-2">
                    Ollama (Local)
                    <Badge variant="outline" className="text-xs text-green-600 border-green-600">On-Premise</Badge>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(effectiveSettings.ai_provider || "perplexity") === "perplexity" && (
            <div className="rounded-md bg-muted/50 border border-border p-3 text-xs text-muted-foreground">
              <p>Set <code className="text-foreground">PERPLEXITY_API_KEY</code> env var on your server. Document text is sent to Perplexity's servers for analysis.</p>
            </div>
          )}

          {effectiveSettings.ai_provider === "ollama" && (
            <div className="space-y-3">
              <div className="rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3 text-xs text-green-700 dark:text-green-400">
                ✅ On-premise mode — document content never leaves your server.
              </div>
              <div className="space-y-1.5">
                <Label>Ollama Server URL</Label>
                <Input
                  data-testid="input-ollama-url"
                  value={effectiveSettings.ollama_url || "http://localhost:11434"}
                  onChange={(e) => set("ollama_url", e.target.value)}
                  placeholder="http://localhost:11434"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Model Name</Label>
                <Input
                  data-testid="input-ollama-model"
                  value={effectiveSettings.ollama_model || "llama3"}
                  onChange={(e) => set("ollama_model", e.target.value)}
                  placeholder="llama3"
                />
                <p className="text-xs text-muted-foreground">Recommended: llama3, mistral, or mixtral. Must be pulled with <code>ollama pull &lt;model&gt;</code> first.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Retention */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Data Retention
          </CardTitle>
          <CardDescription>Control how long documents are kept. Important for GDPR / HIPAA compliance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Retention Period (days)</Label>
            <div className="flex gap-2">
              <Input
                data-testid="input-retention-days"
                type="number"
                min={30}
                max={3650}
                value={effectiveSettings.data_retention_days || "365"}
                onChange={(e) => set("data_retention_days", e.target.value)}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground self-center">days after upload</span>
            </div>
            <p className="text-xs text-muted-foreground">Default: 365 days (1 year). Minimum 30 days.</p>
          </div>
          <Button
            data-testid="button-check-retention"
            variant="outline"
            size="sm"
            onClick={() => retentionMutation.mutate()}
            disabled={retentionMutation.isPending}
          >
            <Database className="w-3.5 h-3.5 mr-1.5" />
            {retentionMutation.isPending ? "Checking..." : "Check Retention Policy"}
          </Button>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center justify-between pt-2">
        {hasChanges ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">You have unsaved changes.</p>
        ) : (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-green-500" /> All settings saved
          </p>
        )}
        <Button
          data-testid="button-save-settings"
          onClick={() => updateMutation.mutate(form)}
          disabled={!hasChanges || updateMutation.isPending}
        >
          {updateMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
