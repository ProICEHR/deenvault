import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { auth as authApi } from "./api";

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  userId?: string;
  tenantId?: string;
  role?: string;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, tenantId: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isSuperAdmin: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, authenticated: false });

  const refresh = useCallback(async () => {
    try {
      const session = await authApi.session();
      setState({
        loading: false,
        authenticated: session.authenticated,
        userId: session.userId,
        tenantId: session.tenantId,
        role: session.role,
      });
    } catch {
      setState({ loading: false, authenticated: false });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email: string, password: string, tenantId: string) => {
    await authApi.login(email, password, tenantId);
    await refresh();
  };

  const logout = async () => {
    await authApi.logout();
    setState({ loading: false, authenticated: false });
  };

  const isSuperAdmin = state.role === "super_admin";
  const isAdmin = ["super_admin", "tenant_admin", "admin"].includes(state.role || "");

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refresh, isSuperAdmin, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
