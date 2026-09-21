"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

type AuthStatus =
  | "loading"
  | "signed_out"
  | "authenticated"
  | "error";

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const applySession = useCallback((next: Session | null) => {
    setSession(next);
    setUser(next?.user ?? null);
    setStatus(next ? "authenticated" : "signed_out");
  }, []);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      applySession(null);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setStatus("error");
      setSession(null);
      setUser(null);
      return;
    }
    applySession(data.session);
  }, [applySession]);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    applySession(null);
    window.location.href = "/login";
  }, [applySession]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      applySession(null);
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setStatus("error");
          return;
        }
        applySession(data.session);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (cancelled) return;
      applySession(next);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const value = useMemo(
    () => ({ status, session, user, refresh, signOut }),
    [status, session, user, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
