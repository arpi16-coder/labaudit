import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthProvider, useAuth } from "@/lib/auth";
import LoginPage from "@/pages/login";
import BetaGate, { BETA_EXPIRY } from "@/pages/beta-gate";
import Dashboard from "@/pages/dashboard";
import ClientsPage from "@/pages/clients";
import ClientDetail from "@/pages/client-detail";
import DocumentsPage from "@/pages/documents";
import AnalysesPage from "@/pages/analyses";
import AnalysisDetail from "@/pages/analysis-detail";
import SettingsPage from "@/pages/settings";
import AuditLogPage from "@/pages/audit-log";
import CapasPage from "@/pages/capas";
import TrainingRecordsPage from "@/pages/training-records";
import NonconformancesPage from "@/pages/nonconformances";
import UsersPage from "@/pages/users";
import OnboardingWizard from "@/components/onboarding-wizard";
import NotFound from "@/pages/not-found";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Beta is active if current date is before expiry
const IS_BETA_ACTIVE = new Date() < BETA_EXPIRY;

function AppRouter() {
  return (
    <Switch>
      <Route path="/login"><Redirect to="/" /></Route>
      <Route path="/" component={Dashboard} />
      <Route path="/clients" component={ClientsPage} />
      <Route path="/clients/:id" component={ClientDetail} />
      <Route path="/documents" component={DocumentsPage} />
      <Route path="/analyses" component={AnalysesPage} />
      <Route path="/analyses/:id" component={AnalysisDetail} />
      <Route path="/capas" component={CapasPage} />
      <Route path="/training" component={TrainingRecordsPage} />
      <Route path="/nonconformances" component={NonconformancesPage} />
      <Route path="/users" component={UsersPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/audit-log" component={AuditLogPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppShell() {
  const { user, loginAsGuest, isLoading } = useAuth();
  const [betaUnlocked, setBetaUnlocked] = useState(false);

  // Initialize theme from system preference
  useEffect(() => {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  // Show loading spinner while restoring JWT session
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-40 mx-auto" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4 mx-auto" />
        </div>
      </div>
    );
  }

  // Show beta gate if beta period is active and user hasn't unlocked yet
  if (IS_BETA_ACTIVE && !betaUnlocked && !user) {
    return (
      <BetaGate
        onAccess={async () => {
          await loginAsGuest();
          setBetaUnlocked(true);
        }}
      />
    );
  }

  if (!user) return <LoginPage />;

  const sidebarStyle = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <Router hook={useHashLocation}>
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full bg-background">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center justify-between px-4 py-2 border-b border-border h-12 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-40">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2">
                <ThemeToggle />
              </div>
            </header>
            <main className="flex-1 overflow-y-auto">
              <AppRouter />
            </main>
          </div>
        </div>
        {/* Onboarding wizard — shows automatically for new admin users */}
        <OnboardingWizard />
      </SidebarProvider>
    </Router>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppShell />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
