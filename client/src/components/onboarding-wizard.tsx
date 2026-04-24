import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Users, FileText, BarChart2 } from "lucide-react";
import { Link } from "wouter";

const STEPS = [
  {
    title: "Welcome to LabAudit.ai",
    description: "Your AI-powered compliance audit platform. Let's get you set up in 3 quick steps.",
    icon: CheckCircle2,
    action: null,
    actionLabel: null,
  },
  {
    title: "Add your first lab client",
    description: "Start by adding a lab client — the organization whose documents you'll be auditing. Go to Clients → Add Client.",
    icon: Users,
    action: "/clients",
    actionLabel: "Go to Clients",
  },
  {
    title: "Upload a compliance document",
    description: "Upload a SOP, batch record, training record, or any lab document. Supports PDF, Word, images, and more.",
    icon: FileText,
    action: "/documents",
    actionLabel: "Go to Documents",
  },
  {
    title: "Run your first gap analysis",
    description: "Select a client and document, then run an AI gap analysis. Your compliance score and findings will appear in seconds.",
    icon: BarChart2,
    action: "/analyses",
    actionLabel: "Go to Analyses",
  },
];

export default function OnboardingWizard() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const authHeaders = () => {
    const t = sessionStorage.getItem("labaudit_token");
    return t ? { "Authorization": `Bearer ${t}` } : {};
  };

  const { data: state } = useQuery({
    queryKey: ["/api/onboarding"],
    queryFn: async () => {
      const res = await fetch("/api/onboarding", { credentials: "include", headers: authHeaders() });
      return res.ok ? res.json() : { completed: 0, step: 0 };
    },
    enabled: !!user && user.role === "admin",
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { step: number; completed: boolean }) => {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] }),
  });

  useEffect(() => {
    if (user?.role === "admin" && state && !state.completed) {
      setCurrentStep(state.step || 0);
      setVisible(true);
    }
  }, [user, state]);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      updateMutation.mutate({ step: next, completed: false });
    } else {
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    updateMutation.mutate({ step: STEPS.length, completed: true });
  };

  if (!visible || !user) return null;

  const step = STEPS[currentStep];
  const StepIcon = step.icon;
  const progress = ((currentStep) / (STEPS.length - 1)) * 100;

  return (
    <Dialog open={visible} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <StepIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Step {currentStep + 1} of {STEPS.length}</p>
              <DialogTitle className="text-base">{step.title}</DialogTitle>
            </div>
          </div>
          <Progress value={progress} className="h-1.5" />
        </DialogHeader>

        <p className="text-sm text-muted-foreground leading-relaxed py-2">{step.description}</p>

        {/* Step previews */}
        <div className="grid grid-cols-4 gap-1.5">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className={`p-2 rounded-lg text-center transition-colors ${i < currentStep ? "bg-primary/10 text-primary" : i === currentStep ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground"}`}>
                <Icon className="w-4 h-4 mx-auto mb-1" />
                <p className="text-xs leading-tight">{s.title.split(" ").slice(0, 2).join(" ")}</p>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-muted-foreground">
            Skip setup
          </Button>
          <div className="flex gap-2">
            {step.action && (
              <Link href={step.action}>
                <Button variant="outline" size="sm" onClick={handleDismiss}>{step.actionLabel}</Button>
              </Link>
            )}
            <Button size="sm" onClick={handleNext}>
              {currentStep < STEPS.length - 1 ? "Next" : "Get Started"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
