"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Activity,
  LogOut,
} from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav";
import { useAuth } from "@/context/AuthContext";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.adminOnly || user?.role === "admin"
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <aside
      className={[styles.sidebar, collapsed ? styles["sidebar--collapsed"] : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label="Main navigation"
    >
      {/* ── Brand ─────────────────────────────────────────── */}
      <div className={styles.brand}>
        <div className={styles.brandLogo}>
          <Activity size={18} aria-hidden="true" />
        </div>
        {!collapsed && (
          <div className={styles.brandText}>
            <span className={styles.brandName}>SwasthyaSync</span>
            <span className={styles.brandTagline}>HMS v1.0</span>
          </div>
        )}
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight size={14} aria-hidden="true" />
          ) : (
            <ChevronLeft size={14} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* ── Nav ───────────────────────────────────────────── */}
      <nav className={styles.nav} aria-label="Application navigation">
        <ul className={styles.navList} role="list">
          {visibleGroups.map((group) => (
            <li key={group.groupLabel} className={styles.group}>
              {!collapsed && (
                <span className={styles.groupLabel} aria-hidden="true">
                  {group.groupLabel}
                </span>
              )}
              <ul className={styles.groupItems} role="list">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className={[
                          styles.navItem,
                          active ? styles["navItem--active"] : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                      >
                        <span className={styles.navIcon} aria-hidden="true">
                          <Icon size={16} />
                        </span>
                        {!collapsed && (
                          <span className={styles.navLabel}>{item.label}</span>
                        )}
                        {!collapsed && item.badge && (
                          <span className={styles.navBadge}>{item.badge}</span>
                        )}
                        {active && (
                          <span className={styles.activeIndicator} aria-hidden="true" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── User footer ───────────────────────────────────── */}
      <div className={styles.userFooter}>
        <div className={styles.userInfo}>
          <div className={styles.userAvatar} aria-hidden="true">
            {user?.name?.charAt(0).toUpperCase() ?? "U"}
          </div>
          {!collapsed && (
            <div className={styles.userMeta}>
              <span className={styles.userName}>{user?.name ?? "User"}</span>
              <span className={styles.userRole}>
                {user?.role === "admin" ? "Administrator" : "Staff"}
              </span>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            className={styles.logoutBtn}
            onClick={logout}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </aside>
  );
}
