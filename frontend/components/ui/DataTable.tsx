"use client";

import React, { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import styles from "./DataTable.module.css";
import { Spinner } from "./Loading";
import { EmptyState } from "./EmptyState";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: "left" | "center" | "right";
  className?: string;
}

export interface DataTableProps<T extends Record<string, unknown>> {
  columns: DataTableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  rowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** Renders an expanded row detail below the clicked row */
  expandable?: (row: T) => React.ReactNode;
  striped?: boolean;
  compact?: boolean;
  stickyHeader?: boolean;
  className?: string;
}

type SortDir = "asc" | "desc" | null;

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyTitle = "No records found",
  emptyDescription,
  rowKey,
  onRowClick,
  expandable,
  striped = true,
  compact = false,
  stickyHeader = false,
  className = "",
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  /* Sorting */
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) =>
        prev === "asc" ? "desc" : prev === "desc" ? null : "asc"
      );
      if (sortDir === "desc") setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const aStr = String(av ?? "").toLowerCase();
      const bStr = String(bv ?? "").toLowerCase();
      if (aStr < bStr) return sortDir === "asc" ? -1 : 1;
      if (aStr > bStr) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDir]);

  const getRowId = (row: T, index: number) =>
    rowKey ? rowKey(row, index) : String(index);

  const tableClasses = [
    styles.table,
    compact ? styles["table--compact"] : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const wrapClasses = [
    styles.wrapper,
    stickyHeader ? styles["wrapper--sticky"] : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapClasses}>
      <table className={tableClasses} role="table">
        <thead className={styles.thead}>
          <tr>
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  className={[
                    styles.th,
                    col.sortable ? styles["th--sortable"] : "",
                    col.align ? styles[`th--${col.align}`] : "",
                    col.className ?? "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  aria-sort={
                    isSorted
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <span className={styles.thContent}>
                    {col.header}
                    {col.sortable && (
                      <span className={styles.sortIcon} aria-hidden="true">
                        {isSorted && sortDir === "asc" ? (
                          <ChevronUp size={13} />
                        ) : isSorted && sortDir === "desc" ? (
                          <ChevronDown size={13} />
                        ) : (
                          <ChevronsUpDown size={13} />
                        )}
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className={styles.tbody}>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className={styles.loadingCell}>
                <Spinner size="md" />
                <span className={styles.loadingText}>Loading…</span>
              </td>
            </tr>
          ) : sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.emptyCell}>
                <EmptyState
                  title={emptyTitle}
                  description={emptyDescription}
                  compact
                />
              </td>
            </tr>
          ) : (
            sortedData.map((row, rowIndex) => {
              const id = getRowId(row, rowIndex);
              const isExpanded = expandedRow === id;

              return (
                <React.Fragment key={id}>
                  <tr
                    className={[
                      styles.tr,
                      striped && rowIndex % 2 === 1 ? styles["tr--striped"] : "",
                      onRowClick || expandable ? styles["tr--clickable"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      if (expandable) {
                        setExpandedRow(isExpanded ? null : id);
                      }
                      onRowClick?.(row);
                    }}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={[
                          styles.td,
                          col.align ? styles[`td--${col.align}`] : "",
                          col.className ?? "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {col.render
                          ? col.render(row[col.key], row, rowIndex)
                          : String(row[col.key] ?? "—")}
                      </td>
                    ))}
                  </tr>

                  {expandable && isExpanded && (
                    <tr className={styles["tr--expanded"]}>
                      <td
                        colSpan={columns.length}
                        className={styles["td--expanded"]}
                      >
                        {expandable(row)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
