"use client";

import React, { useEffect, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./Drawer.module.css";
import { Button } from "./Button";

export type DrawerPlacement = "right" | "left" | "bottom";
export type DrawerSize = "sm" | "md" | "lg" | "xl";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  placement?: DrawerPlacement;
  size?: DrawerSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  disableBackdropClose?: boolean;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  placement = "right",
  size = "md",
  children,
  footer,
  disableBackdropClose = false,
  className = "",
}: DrawerProps) {
  const titleId = useId();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    },
    [open, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!open) return null;

  const content = (
    <div
      className={[styles.overlay, open ? styles["overlay--open"] : ""]
        .filter(Boolean)
        .join(" ")}
      role="presentation"
      onClick={
        disableBackdropClose
          ? undefined
          : (e) => {
              if (e.target === e.currentTarget) onClose();
            }
      }
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={[
          styles.drawer,
          styles[`drawer--${placement}`],
          styles[`drawer--${size}`],
          open ? styles["drawer--open"] : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Header */}
        {(title || true) && (
          <div className={styles.header}>
            <div className={styles.headerText}>
              {title && (
                <h2 id={titleId} className={styles.title}>
                  {title}
                </h2>
              )}
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close panel"
            >
              <X size={16} />
            </Button>
          </div>
        )}

        {/* Body */}
        <div className={styles.body}>{children}</div>

        {/* Footer */}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
