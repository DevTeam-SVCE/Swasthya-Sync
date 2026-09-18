"use client";

import React, { useState, useId } from "react";
import styles from "./Tabs.module.css";

export interface TabItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  disabled?: boolean;
  content: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultKey?: string;
  activeKey?: string;
  onChange?: (key: string) => void;
  variant?: "line" | "pill" | "enclosed";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
}

export function Tabs({
  items,
  defaultKey,
  activeKey: controlledKey,
  onChange,
  variant = "line",
  size = "md",
  fullWidth = false,
  className = "",
}: TabsProps) {
  const id = useId();
  const [internalKey, setInternalKey] = useState(
    defaultKey ?? items[0]?.key ?? ""
  );

  const activeKey = controlledKey ?? internalKey;

  const handleSelect = (key: string) => {
    if (controlledKey === undefined) setInternalKey(key);
    onChange?.(key);
  };

  const activeItem = items.find((i) => i.key === activeKey);

  return (
    <div
      className={[styles.tabs, styles[`tabs--${variant}`], className]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Tab list */}
      <div
        role="tablist"
        className={[
          styles.tabList,
          styles[`tabList--${size}`],
          fullWidth ? styles["tabList--full"] : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-orientation="horizontal"
      >
        {items.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <button
              key={item.key}
              role="tab"
              id={`${id}-tab-${item.key}`}
              aria-controls={`${id}-panel-${item.key}`}
              aria-selected={isActive}
              disabled={item.disabled}
              className={[
                styles.tab,
                styles[`tab--${size}`],
                isActive ? styles["tab--active"] : "",
                item.disabled ? styles["tab--disabled"] : "",
                fullWidth ? styles["tab--full"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => !item.disabled && handleSelect(item.key)}
              tabIndex={isActive ? 0 : -1}
            >
              {item.icon && (
                <span className={styles.tabIcon} aria-hidden="true">
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className={styles.tabBadge}>{item.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab panel */}
      {items.map((item) => (
        <div
          key={item.key}
          role="tabpanel"
          id={`${id}-panel-${item.key}`}
          aria-labelledby={`${id}-tab-${item.key}`}
          hidden={item.key !== activeKey}
          className={styles.panel}
        >
          {item.key === activeKey && activeItem?.content}
        </div>
      ))}
    </div>
  );
}

/* Headless single tab for manual composition */
export function Tab({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={[styles.tabContent, className].filter(Boolean).join(" ")}>{children}</div>;
}
