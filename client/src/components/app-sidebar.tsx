import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Users, FileText, BarChart2, Settings, LogOut,
  Shield, AlertTriangle, GraduationCap, ClipboardList, UserCog, Bell
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useQuery } from "@tanstack/react-query";

const adminNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Documents", url: "/documents", icon: FileText },
  { title: "Analyses", url: "/analyses", icon: BarChart2 },
];

const qualityNav = [
  { title: "CAPAs", url: "/capas", icon: ClipboardList },
  { title: "Non-conformances", url: "/nonconformances", icon: AlertTriangle },
  { title: "Training Records", url: "/training", icon: GraduationCap },
];

const adminSecurityNav = [
  { title: "Users & Roles", url: "/users", icon: UserCog },
  { title: "Audit Log", url: "/audit-log", icon: Shield },
  { title: "Settings", url: "/settings", icon: Settings },
];

const clientNav = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "My Documents", url: "/documents", icon: FileText },
  { title: "Reports", url: "/analyses", icon: BarChart2 },
  { title: "CAPAs", url: "/capas", icon: ClipboardList },
  { title: "Training Records", url: "/training", icon: GraduationCap },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const isAdmin = user?.role === "admin";
  const nav = isAdmin ? adminNav : clientNav;

  // Notification unread count
  const { data: notifData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      const storedToken = sessionStorage.getItem("labaudit_token");
      const headers: Record<string, string> = {};
      if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
      const res = await fetch("/api/notifications/unread-count", { credentials: "include", headers });
      return res.ok ? res.json() : { count: 0 };
    },
    refetchInterval: 30000,
  });

  const unreadCount = notifData?.count ?? 0;

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 36 36" fill="none" aria-label="LabAudit.ai" className="w-7 h-7 shrink-0">
            <rect width="36" height="36" rx="7" fill="hsl(var(--sidebar-primary))"/>
            <path d="M8 26 L8 10 L14 10 L14 20 L22 20 L22 10 L28 10 L28 26"
              stroke="white" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
            <circle cx="28" cy="10" r="3" fill="white"/>
            <circle cx="22" cy="10" r="3" fill="white"/>
          </svg>
          <div>
            <p className="text-sm font-semibold leading-none text-sidebar-foreground">LabAudit.ai</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAdmin ? "Admin Portal" : "Client Portal"}
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Quality Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {qualityNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location === item.url}>
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminSecurityNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location === item.url}>
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-primary">
              {user?.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">{user?.role?.replace("_", " ")}</p>
          </div>
          {unreadCount > 0 && (
            <Badge className="h-5 w-5 p-0 flex items-center justify-center text-xs bg-primary text-primary-foreground rounded-full">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={logout}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
        <p className="text-[10px] text-muted-foreground/50 text-center px-2 pt-1 select-none">
          © {new Date().getFullYear()} LabAudit.ai. All rights reserved.
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
