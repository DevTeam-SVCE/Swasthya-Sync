import React from "react";
import styles from "./Card.module.css";

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  /** Adds a coloured left border accent */
  accent?: "primary" | "success" | "danger" | "warning" | "info";
  hoverable?: boolean;
}

export function Card({
  children,
  className = "",
  noPadding = false,
  accent,
  hoverable = false,
}: CardProps) {
  const classes = [
    styles.card,
    noPadding ? styles["card--no-padding"] : "",
    accent ? styles[`card--accent-${accent}`] : "",
    hoverable ? styles["card--hoverable"] : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}

export interface CardHeaderProps {
  children?: React.ReactNode;
  className?: string;
  /** Renders a horizontal rule below the header */
  divider?: boolean;
  action?: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function CardHeader({
  children,
  className = "",
  divider = false,
  action,
  title,
  subtitle,
}: CardHeaderProps) {
  const classes = [
    styles.header,
    divider ? styles["header--divider"] : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (title || subtitle) {
    return (
      <div className={classes}>
        <div className={styles.headerMeta}>
          {title && <h3 className={styles.headerTitle}>{title}</h3>}
          {subtitle && <p className={styles.headerSubtitle}>{subtitle}</p>}
        </div>
        {action && <div className={styles.headerAction}>{action}</div>}
      </div>
    );
  }

  return (
    <div className={classes}>
      <div className={styles.headerContent}>{children}</div>
      {action && <div className={styles.headerAction}>{action}</div>}
    </div>
  );
}

export interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function CardBody({ children, className = "" }: CardBodyProps) {
  return (
    <div className={[styles.body, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

export interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "between";
}

export function CardFooter({
  children,
  className = "",
  align = "right",
}: CardFooterProps) {
  const classes = [
    styles.footer,
    styles[`footer--${align}`],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
