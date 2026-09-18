import React from "react";
import { Inbox } from "lucide-react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  title = "No data found",
  description,
  icon,
  action,
  compact = false,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={[
        styles.root,
        compact ? styles["root--compact"] : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
    >
      <div className={styles.iconWrap}>
        {icon ?? <Inbox className={styles.defaultIcon} aria-hidden="true" />}
      </div>
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        {description && (
          <p className={styles.description}>{description}</p>
        )}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
