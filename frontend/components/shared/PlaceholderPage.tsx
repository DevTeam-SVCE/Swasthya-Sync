import React from "react";
import { Construction } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./PlaceholderPage.module.css";

interface PlaceholderPageProps {
  title: string;
  subtitle?: string;
  phase?: string;
  Icon?: LucideIcon;
}

export function PlaceholderPage({
  title,
  subtitle,
  phase = "Phase 2",
  Icon = Construction,
}: PlaceholderPageProps) {
  return (
    <div className={styles.root}>
      <div className={styles.inner}>
        <div className={styles.iconWrap}>
          <Icon size={28} aria-hidden="true" />
        </div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <div className={styles.pill}>
          <span className={styles.pillDot} aria-hidden="true" />
          Scheduled for {phase}
        </div>
        <p className={styles.note}>
          This module is part of the SwasthyaSync HMS implementation plan.
          The foundation, design system, and shell are complete.
        </p>
      </div>
    </div>
  );
}
