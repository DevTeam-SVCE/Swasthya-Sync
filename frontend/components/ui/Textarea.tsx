"use client";

import React from "react";
import styles from "./Textarea.module.css";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
  fullWidth?: boolean;
  resize?: "none" | "vertical" | "horizontal" | "both";
}

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(
  (
    {
      label,
      helperText,
      error,
      required,
      fullWidth = true,
      resize = "vertical",
      className = "",
      id,
      rows = 3,
      ...props
    },
    ref
  ) => {
    const textareaId =
      id ?? `textarea-${Math.random().toString(36).slice(2, 9)}`;

    const wrapperClasses = [
      styles.wrapper,
      fullWidth ? styles["wrapper--full"] : "",
    ]
      .filter(Boolean)
      .join(" ");

    const fieldClasses = [
      styles.field,
      error ? styles["field--error"] : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={wrapperClasses}>
        {label && (
          <label htmlFor={textareaId} className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={fieldClasses}
          rows={rows}
          style={{ resize }}
          aria-invalid={!!error}
          aria-describedby={
            error
              ? `${textareaId}-error`
              : helperText
              ? `${textareaId}-helper`
              : undefined
          }
          {...props}
        />
        {error && (
          <p
            id={`${textareaId}-error`}
            className={styles.errorText}
            role="alert"
          >
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${textareaId}-helper`} className={styles.helperText}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
