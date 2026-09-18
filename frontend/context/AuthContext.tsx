"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import type { AuthUser, LoginCredentials, LoginResponse, RegisterCredentials } from "@/types/auth";
import { ApiError, apiRequest, authHeaders } from "@/lib/api";

/* ── Context shape ───────────────────────────────────────── */
interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  register: (credentials: RegisterCredentials) => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "swasthyasync_token";
const USER_KEY  = "swasthyasync_user";

/* ── Provider ────────────────────────────────────────────── */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        if (active) setIsLoading(false);
        return;
      }

      setToken(storedToken);
      try {
        const response = await apiRequest<{ user: AuthUser }>("/api/auth/me", {
          headers: authHeaders(storedToken),
        });
        if (active) {
          setUser(response.user);
          localStorage.setItem(USER_KEY, JSON.stringify(response.user));
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        if (active) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
      setIsLoading(true);
      try {
        const response = await apiRequest<LoginResponse>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(credentials),
        });
        localStorage.setItem(TOKEN_KEY, response.token);
        localStorage.setItem(USER_KEY, JSON.stringify(response.user));
        setToken(response.token);
        setUser(response.user);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof ApiError ? error.message : "Login failed.",
        };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const register = useCallback(
    async (credentials: RegisterCredentials): Promise<{ success: boolean; error?: string }> => {
      setIsLoading(true);
      try {
        await apiRequest<{ user: AuthUser }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(credentials),
        });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof ApiError ? error.message : "Registration failed.",
        };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const refreshUser = useCallback(async () => {
    if (!token) return false;
    try {
      const response = await apiRequest<{ user: AuthUser }>("/api/auth/me", {
        headers: authHeaders(token),
      });
      setUser(response.user);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      return true;
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken(null);
      setUser(null);
      return false;
    }
  }, [token]);

  /* Logout */
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    register,
    refreshUser,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ── Hook ────────────────────────────────────────────────── */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
