import React from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import styles from "./Breadcrumb.module.css";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  showHome?: boolean;
  className?: string;
}

export function Breadcrumb({
  items,
  showHome = true,
  className = "",
}: BreadcrumbProps) {
  const allItems: BreadcrumbItem[] = showHome
    ? [{ label: "Dashboard", href: "/dashboard", icon: <Home size={12} /> }, ...items]
    : items;

  return (
    <nav aria-label="Breadcrumb" className={[styles.root, className].filter(Boolean).join(" ")}>
      <ol className={styles.list}>
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;
          return (
            <li key={index} className={styles.item}>
              {index > 0 && (
                <ChevronRight
                  size={12}
                  className={styles.separator}
                  aria-hidden="true"
                />
              )}
              {isLast ? (
                <span
                  className={styles.current}
                  aria-current="page"
                >
                  {item.icon && (
                    <span className={styles.itemIcon} aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </span>
              ) : item.href ? (
                <Link href={item.href} className={styles.link}>
                  {item.icon && (
                    <span className={styles.itemIcon} aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </Link>
              ) : (
                <span className={styles.text}>
                  {item.icon && (
                    <span className={styles.itemIcon} aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
