import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiRequest } from "./queryClient";

interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "client";
  organizationName?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  loginAsGuest: () => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// In-memory session store (no localStorage — blocked in sandbox)
let sessionUser: AuthUser | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(sessionUser);
  const [isLoading, setIsLoading] = useState(false);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const data = await apiRequest("POST", "/api/auth/login", { email, password });
      const u = await data.json();
      if (u.message) throw new Error(u.message);
      sessionUser = u;
      setUser(u);
    } finally {
      setIsLoading(false);
    }
  };

  // Beta mode: auto-login as admin guest (no password needed)
  const loginAsGuest = () => {
    const guestUser: AuthUser = {
      id: 1,
      email: "admin@labaudit.ai",
      name: "Admin",
      role: "admin",
    };
    sessionUser = guestUser;
    setUser(guestUser);
  };

  const logout = () => {
    sessionUser = null;
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
