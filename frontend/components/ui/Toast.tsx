"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useId,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";
import styles from "./Toast.module.css";

/* ── Types ───────────────────────────────────────────────── */
export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number; /* ms — 0 = persist */
}

/* ── Context ─────────────────────────────────────────────── */
interface ToastContextValue {
  toasts: ToastMessage[];
  toast: (msg: Omit<ToastMessage, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/* ── Provider ────────────────────────────────────────────── */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => setToasts([]), []);

  const toast = useCallback(
    (msg: Omit<ToastMessage, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const duration = msg.duration ?? 4500;
      setToasts((prev) => [...prev.slice(-4), { ...msg, id }]); // max 5
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  const success = useCallback(
    (title: string, description?: string) =>
      toast({ type: "success", title, description }),
    [toast]
  );
  const error = useCallback(
    (title: string, description?: string) =>
      toast({ type: "error", title, description }),
    [toast]
  );
  const warning = useCallback(
    (title: string, description?: string) =>
      toast({ type: "warning", title, description }),
    [toast]
  );
  const info = useCallback(
    (title: string, description?: string) =>
      toast({ type: "info", title, description }),
    [toast]
  );

  return (
    <ToastContext.Provider
      value={{ toasts, toast, success, error, warning, info, dismiss, dismissAll }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/* ── Hook ────────────────────────────────────────────────── */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

/* ── Container (portal) ──────────────────────────────────── */
function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (typeof document === "undefined") return null;
  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className={styles.container}
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}

/* ── Single Toast ────────────────────────────────────────── */
const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error:   <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info:    <Info size={18} />,
};

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="alert"
      className={[styles.toast, styles[`toast--${toast.type}`]]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={styles.icon} aria-hidden="true">
        {iconMap[toast.type]}
      </span>
      <div className={styles.content}>
        <p className={styles.title}>{toast.title}</p>
        {toast.description && (
          <p className={styles.description}>{toast.description}</p>
        )}
      </div>
      <button
        className={styles.closeBtn}
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}
