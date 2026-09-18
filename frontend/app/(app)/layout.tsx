"use client";

import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";
import { AppShell } from "@/components/layout/AppShell";
import { RouteGuard } from "@/components/shared/RouteGuard";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <ToastProvider>
        <RouteGuard>
          <AppShell>{children}</AppShell>
        </RouteGuard>
      </ToastProvider>
    </AuthProvider>
  );
}
