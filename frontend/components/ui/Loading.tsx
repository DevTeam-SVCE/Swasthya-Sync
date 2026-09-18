import React from "react";
import styles from "./Loading.module.css";

/* ── Spinner ─────────────────────────────────────────────── */
export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";
export type SpinnerColor = "primary" | "white" | "muted";

export interface SpinnerProps {
  size?: SpinnerSize;
  color?: SpinnerColor;
  className?: string;
  label?: string;
}

export function Spinner({
  size = "md",
  color = "primary",
  className = "",
  label = "Loading…",
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={[
        styles.spinner,
        styles[`spinner--${size}`],
        styles[`spinner--${color}`],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

/* ── Page-level full-screen spinner ─────────────────────── */
export function PageSpinner({ message = "Loading…" }: { message?: string }) {
  return (
    <div className={styles.pageSpinner} role="status" aria-live="polite">
      <div className={styles.pageSpinnerInner}>
        <div className={styles.pageSpinnerLogo}>
          <span className={styles.pageSpinnerLogoText}>S</span>
        </div>
        <Spinner size="lg" color="primary" />
        <p className={styles.pageSpinnerMessage}>{message}</p>
      </div>
    </div>
  );
}

/* ── Skeleton line ───────────────────────────────────────── */
export interface SkeletonLineProps {
  width?: string;
  height?: string;
  className?: string;
}

export function SkeletonLine({
  width = "100%",
  height = "14px",
  className = "",
}: SkeletonLineProps) {
  return (
    <span
      aria-hidden="true"
      className={[styles.skeletonLine, "skeleton", className]
        .filter(Boolean)
        .join(" ")}
      style={{ width, height, display: "block" }}
    />
  );
}

/* ── Skeleton block ──────────────────────────────────────── */
export interface SkeletonBlockProps {
  width?: string;
  height?: string;
  rounded?: boolean;
  className?: string;
}

export function SkeletonBlock({
  width = "100%",
  height = "120px",
  rounded = false,
  className = "",
}: SkeletonBlockProps) {
  return (
    <span
      aria-hidden="true"
      className={[styles.skeletonBlock, "skeleton", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        width,
        height,
        display: "block",
        borderRadius: rounded ? "var(--radius-full)" : "var(--radius-lg)",
      }}
    />
  );
}

/* ── Card skeleton (common HMS pattern) ─────────────────── */
export function CardSkeleton() {
  return (
    <div className={styles.cardSkeleton} aria-hidden="true">
      <div className={styles.cardSkeletonHeader}>
        <SkeletonLine width="40%" height="16px" />
        <SkeletonLine width="20%" height="12px" />
      </div>
      <div className={styles.cardSkeletonBody}>
        <SkeletonLine width="100%" height="12px" />
        <SkeletonLine width="80%" height="12px" />
        <SkeletonLine width="60%" height="12px" />
      </div>
    </div>
  );
}

/* ── Table row skeleton ──────────────────────────────────── */
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className={styles.tableSkeleton} aria-hidden="true" aria-label="Loading table data">
      {/* Header */}
      <div className={styles.tableSkeletonRow} style={{ borderBottom: "2px solid var(--color-border)" }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} width={i === 0 ? "30%" : "15%"} height="12px" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className={styles.tableSkeletonRow}>
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={c} width={c === 0 ? "35%" : "18%"} height="13px" />
          ))}
        </div>
      ))}
    </div>
  );
}
