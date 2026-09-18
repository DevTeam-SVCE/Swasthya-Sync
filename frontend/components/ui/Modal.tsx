"use client";

import React, { useEffect, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./Modal.module.css";
import { Button } from "./Button";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Prevent closing on backdrop click */
  disableBackdropClose?: boolean;
  /** Hide the X close button */
  hideCloseButton?: boolean;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = "md",
  children,
  footer,
  disableBackdropClose = false,
  hideCloseButton = false,
  className = "",
}: ModalProps) {
  const titleId = useId();

  /* Lock body scroll when open */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  /* ESC key */
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
      className={styles.overlay}
      role="presentation"
      onClick={disableBackdropClose ? undefined : (e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={[
          styles.dialog,
          styles[`dialog--${size}`],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Header */}
        {(title || !hideCloseButton) && (
          <div className={styles.header}>
            <div className={styles.headerText}>
              {title && (
                <h2 id={titleId} className={styles.title}>
                  {title}
                </h2>
              )}
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            {!hideCloseButton && (
              <Button
                variant="ghost"
                size="sm"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label="Close dialog"
              >
                <X size={16} />
              </Button>
            )}
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
