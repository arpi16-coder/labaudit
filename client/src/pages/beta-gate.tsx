import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const BETA_CODE = "LABAUDIT-BETA";
const BETA_EXPIRY = new Date("2026-05-30T23:59:59Z");

interface BetaGateProps {
  onAccess: () => void;
}

export default function BetaGate({ onAccess }: BetaGateProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    setTimeout(() => {
      if (code.trim().toUpperCase() === BETA_CODE) {
        onAccess();
      } else {
        setError("Invalid access code. Please try again.");
      }
      setLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth="2">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span className="text-xl font-semibold tracking-tight">LabAudit.ai</span>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          {/* Beta badge */}
          <div className="flex items-center justify-center mb-6">
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Beta Access
            </span>
          </div>

          <h1 className="text-xl font-semibold text-center text-foreground mb-1">
            Welcome to LabAudit.ai Beta
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Enter your beta access code to continue
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Input
                data-testid="input-beta-code"
                type="text"
                placeholder="e.g. LABAUDIT-BETA"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(""); }}
                className="text-center tracking-widest font-mono uppercase"
                autoFocus
              />
              {error && (
                <p className="text-xs text-destructive text-center">{error}</p>
              )}
            </div>

            <Button
              data-testid="button-beta-submit"
              type="submit"
              className="w-full"
              disabled={loading || !code.trim()}
            >
              {loading ? "Verifying..." : "Enter Beta"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Don't have a code?{" "}
            <a href="mailto:admin@labaudit.ai" className="text-primary hover:underline">
              Request access
            </a>
          </p>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          © 2026 LabAudit.ai · Beta program ends May 30, 2026
        </p>
      </div>
    </div>
  );
}

export { BETA_EXPIRY };
