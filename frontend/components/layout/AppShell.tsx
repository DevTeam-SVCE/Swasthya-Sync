"use client";

import React from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuth } from "@/context/AuthContext";
import { PageSpinner } from "@/components/ui/Loading";
import styles from "./AppShell.module.css";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <PageSpinner message="Loading SwasthyaSync…" />;
  }

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Topbar />
        <main className={styles.content} id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
