"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  helperText?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  selectSize?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  required?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      helperText,
      error,
      options,
      placeholder,
      selectSize = "md",
      fullWidth = true,
      required,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const selectId = id ?? `select-${Math.random().toString(36).slice(2, 9)}`;

    const wrapperClasses = [
      styles.wrapper,
      fullWidth ? styles["wrapper--full"] : "",
    ]
      .filter(Boolean)
      .join(" ");

    const fieldClasses = [
      styles.field,
      styles[`field--${selectSize}`],
      error ? styles["field--error"] : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={wrapperClasses}>
        {label && (
          <label htmlFor={selectId} className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        <div className={styles.selectWrap}>
          <select
            ref={ref}
            id={selectId}
            className={fieldClasses}
            aria-invalid={!!error}
            aria-describedby={
              error
                ? `${selectId}-error`
                : helperText
                ? `${selectId}-helper`
                : undefined
            }
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className={styles.chevron} aria-hidden="true">
            <ChevronDown size={14} />
          </span>
        </div>
        {error && (
          <p
            id={`${selectId}-error`}
            className={styles.errorText}
            role="alert"
          >
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${selectId}-helper`} className={styles.helperText}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
