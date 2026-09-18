import React from "react";
import styles from "./Badge.module.css";

export type BadgeVariant =
  | "default"
  | "primary"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "purple"
  | "triage-red"
  | "triage-orange"
  | "triage-yellow"
  | "triage-green"
  | "bed-available"
  | "bed-occupied"
  | "bed-reserved"
  | "bed-maintenance"
  | "invoice-paid"
  | "invoice-pending"
  | "invoice-partial"
  | "invoice-overdue";

export type BadgeSize = "sm" | "md" | "lg";

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Badge({
  variant = "default",
  size = "md",
  dot = false,
  pulse = false,
  children,
  className = "",
}: BadgeProps) {
  const classes = [
    styles.badge,
    styles[`badge--${variant}`],
    styles[`badge--${size}`],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      {dot && (
        <span
          className={[styles.dot, pulse ? styles["dot--pulse"] : ""]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

/* ── Convenience wrappers for common HMS status badges ────── */

export function StatusBadge({
  status,
  ...rest
}: Omit<BadgeProps, "variant" | "children"> & {
  status:
    | "Paid"
    | "Pending"
    | "Partial"
    | "Overdue"
    | "Active"
    | "Inactive"
    | "Completed"
    | "Cancelled"
    | "Scheduled"
    | "Confirmed"
    | "Critical"
    | "Stable"
    | "Recovering"
    | "Under Obs"
    | "Serious";
}) {
  const variantMap: Record<string, BadgeVariant> = {
    Paid: "invoice-paid",
    Pending: "invoice-pending",
    Partial: "invoice-partial",
    Overdue: "invoice-overdue",
    Active: "success",
    Inactive: "default",
    Completed: "success",
    Cancelled: "danger",
    Scheduled: "info",
    Confirmed: "primary",
    Critical: "triage-red",
    Stable: "success",
    Recovering: "triage-green",
    "Under Obs": "warning",
    Serious: "triage-orange",
  };

  return (
    <Badge variant={variantMap[status] ?? "default"} {...rest}>
      {status}
    </Badge>
  );
}

export function TriageBadge({
  level,
}: {
  level: "Red" | "Orange" | "Yellow" | "Green";
}) {
  const variantMap: Record<string, BadgeVariant> = {
    Red: "triage-red",
    Orange: "triage-orange",
    Yellow: "triage-yellow",
    Green: "triage-green",
  };
  const labelMap: Record<string, string> = {
    Red: "Critical",
    Orange: "Urgent",
    Yellow: "Semi-Urgent",
    Green: "Non-Urgent",
  };
  return (
    <Badge variant={variantMap[level]} dot pulse={level === "Red"}>
      {labelMap[level]}
    </Badge>
  );
}
