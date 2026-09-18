import React from "react";
import styles from "./PageHeader.module.css";
import { Breadcrumb, BreadcrumbItem } from "./Breadcrumb";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  /** Coloured left accent bar: maps to HMS module categories */
  accent?: "primary" | "success" | "danger" | "warning" | "info";
  /** Optional icon shown left of title */
  icon?: React.ReactNode;
  /** Optional meta tags / badge row below subtitle */
  meta?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  accent,
  icon,
  meta,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={[
        styles.root,
        accent ? styles[`root--accent-${accent}`] : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Breadcrumbs row */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className={styles.breadcrumbRow}>
          <Breadcrumb items={breadcrumbs} />
        </div>
      )}

      {/* Main row */}
      <div className={styles.main}>
        <div className={styles.titleGroup}>
          {icon && (
            <div className={styles.iconWrap} aria-hidden="true">
              {icon}
            </div>
          )}
          <div>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </div>

        {actions && (
          <div className={styles.actions}>{actions}</div>
        )}
      </div>

      {/* Meta row */}
      {meta && <div className={styles.meta}>{meta}</div>}
    </div>
  );
}
