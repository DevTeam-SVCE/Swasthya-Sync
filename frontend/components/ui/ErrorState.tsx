import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import styles from "./ErrorState.module.css";
import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: string;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  error,
  onRetry,
  compact = false,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={[
        styles.root,
        compact ? styles["root--compact"] : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="alert"
    >
      <div className={styles.iconWrap}>
        <AlertCircle className={styles.icon} aria-hidden="true" />
      </div>
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        {description && (
          <p className={styles.description}>{description}</p>
        )}
        {error && (
          <code className={styles.errorCode}>{error}</code>
        )}
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          leftIcon={<RefreshCw size={14} />}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
