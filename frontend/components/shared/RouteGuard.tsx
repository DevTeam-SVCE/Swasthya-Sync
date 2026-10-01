"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { PageSpinner } from "@/components/ui/Loading";
import type { UserRole } from "@/types/auth";
import { canAccessPath, normalizeUserRole } from "@/lib/permissions";

interface RouteGuardProps {
  children: React.ReactNode;
  /** If set, only this role can access */
  requiredRole?: UserRole;
}

export function RouteGuard({ children, requiredRole }: RouteGuardProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const deniedByRole = !canAccessPath(user?.role, pathname);
  const deniedByRequiredRole = !!requiredRole && normalizeUserRole(user?.role) !== normalizeUserRole(requiredRole);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (deniedByRequiredRole || deniedByRole) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, deniedByRequiredRole, deniedByRole, router]);

  if (isLoading) return <PageSpinner message="Verifying session…" />;
  if (!isAuthenticated) return <PageSpinner message="Redirecting…" />;
  if (deniedByRequiredRole || deniedByRole) {
    return <PageSpinner message="Access denied…" />;
  }

  return <>{children}</>;
}
