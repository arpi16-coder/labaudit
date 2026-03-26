import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Shield, Microscope, FileCheck } from "lucide-react";

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/90 to-primary flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 36 36" fill="none" aria-label="LabAudit.ai logo" className="w-9 h-9">
            <rect width="36" height="36" rx="8" fill="white" fillOpacity="0.15"/>
            <path d="M8 26 L8 10 L14 10 L14 20 L22 20 L22 10 L28 10 L28 26" stroke="white" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
            <circle cx="28" cy="10" r="3" fill="white"/>
            <circle cx="22" cy="10" r="3" fill="white"/>
          </svg>
          <span className="text-xl font-semibold tracking-tight">LabAudit.ai</span>
        </div>
        <div>
          <h2 className="text-4xl font-bold leading-tight mb-4">
            Regulatory compliance,<br/>powered by AI.
          </h2>
          <p className="text-white/70 text-lg mb-10">
            Your remote documentation &amp; audit readiness partner for small biotech and regenerative medicine labs.
          </p>
          <div className="space-y-4">
            {[
              { icon: FileCheck, text: "AI-powered gap analysis on SOPs, batch records & training logs" },
              { icon: Shield, text: "GMP, GLP, ISO & FDA 21 CFR compliance frameworks" },
              { icon: Microscope, text: "Auto-generated SOP drafts with missing elements filled" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <div className="bg-white/20 rounded-lg p-2 shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-white/85 text-sm leading-relaxed">{text}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-white/40 text-xs">© 2026 LabAudit.ai</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <svg viewBox="0 0 36 36" fill="none" aria-label="LabAudit.ai" className="w-8 h-8">
              <rect width="36" height="36" rx="8" fill="hsl(var(--primary))"/>
              <path d="M8 26 L8 10 L14 10 L14 20 L22 20 L22 10 L28 10 L28 26" stroke="white" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
              <circle cx="28" cy="10" r="3" fill="white"/>
              <circle cx="22" cy="10" r="3" fill="white"/>
            </svg>
            <span className="text-xl font-semibold text-foreground">LabAudit.ai</span>
          </div>

          <Card className="border-border shadow-md">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl">Sign in</CardTitle>
              <CardDescription>Access your compliance dashboard</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@lab.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    data-testid="input-password"
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 px-3 py-2 rounded-md">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login">
                  {isLoading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
              <div className="mt-6 p-3 bg-muted rounded-md text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Demo credentials:</p>
                <p>Admin: <span className="font-mono">admin@labaudit.ai</span> / <span className="font-mono">admin123</span></p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
