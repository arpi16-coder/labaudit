import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiRequest } from "./queryClient";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "client" | "lab_manager" | "qa_analyst" | "reviewer" | "auditor";
  organizationName?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true); // start true — restoring session

  // Token in-memory store (no localStorage/sessionStorage needed — JWT cookie is primary)
  // sessionStorage used as optional fallback only when cookies are blocked (e.g., preview envs)
  const trySessionStorage = (fn: () => string | null): string | null => {
    try { return fn(); } catch { return null; }
  };
  const saveToken = (t: string) => { try { sessionStorage.setItem("labaudit_token", t); } catch {} };
  const clearToken = () => { try { sessionStorage.removeItem("labaudit_token"); } catch {} };
  const getToken = () => trySessionStorage(() => sessionStorage.getItem("labaudit_token"));

  // Restore session on mount via /api/auth/me (JWT cookie)
  useEffect(() => {
    const restore = async () => {
      try {
        const storedToken = getToken();
        const headers: Record<string, string> = {};
        if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;

        const res = await fetch("/api/auth/me", { credentials: "include", headers });
        if (res.ok) {
          const u = await res.json();
          setUser(u);
        }
      } catch {
        // No session — that's fine
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      const data = await res.json();
      if (data.message) throw new Error(data.message);
      if (data.token) saveToken(data.token);
      const { token: _, password: __, ...safeUser } = data;
      setUser(safeUser as AuthUser);
    } finally {
      setIsLoading(false);
    }
  };

  // Beta mode: auto-login via /api/auth/beta-access which sets a JWT cookie
  const loginAsGuest = async () => {
    try {
      const res = await apiRequest("POST", "/api/auth/beta-access", {});
      const data = await res.json();
      if (data.token) saveToken(data.token);
      const headers: Record<string, string> = {};
      if (data.token) headers["Authorization"] = `Bearer ${data.token}`;
      const meRes = await fetch("/api/auth/me", { credentials: "include", headers });
      if (meRes.ok) {
        setUser(await meRes.json());
      } else {
        setUser({ id: 1, email: "admin@labaudit.ai", name: "Admin", role: "admin" });
      }
    } catch {
      setUser({ id: 1, email: "admin@labaudit.ai", name: "Admin", role: "admin" });
    }
  };

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout", {});
    } catch {}
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, loginAsGuest, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
