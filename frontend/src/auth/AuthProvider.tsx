/**
 * Authentication behind one interface, so Amazon Cognito can replace the mock
 * provider without touching pages or API clients.
 *
 * MockAuthProvider issues the same dev tokens the services accept when
 * AUTH_MODE=dev ("dev-customer", "dev-staff"). For production, implement
 * AuthProviderImpl with Cognito (Hosted UI + PKCE, e.g. via aws-amplify or
 * oidc-client-ts) and return the ID token from getToken().
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setTokenProvider } from "@/api/http";
import { MOCK_USERS } from "@/api/mock/mockBackend";
import type { AuthUser, Role } from "@/api/types";

export interface AuthProviderImpl {
  signIn(role: Role): Promise<void>;
  signOut(): Promise<void>;
  getToken(): string | null;
  getUser(): AuthUser | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  role: Role | null;
  signIn(role: Role): Promise<void>;
  signOut(): Promise<void>;
}

const STORAGE_KEY = "horizon.session";

function createMockProvider(): AuthProviderImpl {
  let token: string | null = null;
  try {
    token = localStorage.getItem(STORAGE_KEY);
  } catch {
    token = null;
  }
  return {
    async signIn(role) {
      token = role === "staff" ? "dev-staff" : "dev-customer";
      try { localStorage.setItem(STORAGE_KEY, token); } catch { /* private mode */ }
    },
    async signOut() {
      token = null;
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    },
    getToken: () => token,
    getUser: () => (token ? MOCK_USERS[token] ?? null : null),
  };
}

const provider: AuthProviderImpl = createMockProvider();
setTokenProvider(() => provider.getToken());

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => provider.getUser());

  useEffect(() => setTokenProvider(() => provider.getToken()), []);

  const signIn = useCallback(async (role: Role) => {
    await provider.signIn(role);
    setUser(provider.getUser());
  }, []);
  const signOut = useCallback(async () => {
    await provider.signOut();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, role: user?.role ?? null, signIn, signOut }), [user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
