"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { PageSpinner } from "@/components/ui/Loading";
import type { UserRole } from "@/types/auth";

interface RouteGuardProps {
  children: React.ReactNode;
  /** If set, only this role can access */
  requiredRole?: UserRole;
}

export function RouteGuard({ children, requiredRole }: RouteGuardProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const adminOnlyPath = ["/staff", "/form-templates", "/audit-log"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  const deniedByRole = adminOnlyPath && user?.role !== "admin";

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if ((requiredRole && user?.role !== requiredRole) || deniedByRole) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, requiredRole, user, deniedByRole, router]);

  if (isLoading) return <PageSpinner message="Verifying session…" />;
  if (!isAuthenticated) return <PageSpinner message="Redirecting…" />;
  if ((requiredRole && user?.role !== requiredRole) || deniedByRole) {
    return <PageSpinner message="Access denied…" />;
  }

  return <>{children}</>;
}
