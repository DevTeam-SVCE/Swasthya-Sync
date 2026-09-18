"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Bell,
  Search,
  HelpCircle,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Shield,
  Building2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/Badge";
import styles from "./Topbar.module.css";

const DEMO_NOTIFICATIONS = [
  {
    id: "1",
    type: "warning" as const,
    message: "3 lab results awaiting review",
    time: "5m ago",
  },
  {
    id: "2",
    type: "danger" as const,
    message: "Critical patient in Bed 12-B",
    time: "12m ago",
  },
  {
    id: "3",
    type: "info" as const,
    message: "IPD discharge clearance pending — Priya Sharma",
    time: "1h ago",
  },
];

export function Topbar() {
  const { user, logout } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const unreadCount = DEMO_NOTIFICATIONS.length;

  return (
    <header className={styles.topbar} role="banner">
      {/* ── Left: Hospital name ────────────────────────── */}
      <div className={styles.left}>
        <div className={styles.hospitalInfo}>
          <Building2 size={15} className={styles.hospitalIcon} aria-hidden="true" />
          <span className={styles.hospitalName}>
            {user?.hospitalName ?? "City General Hospital"}
          </span>
        </div>
      </div>

      {/* ── Centre: Search hint ────────────────────────── */}
      <div className={styles.centre}>
        <button className={styles.searchTrigger} aria-label="Open global search">
          <Search size={14} aria-hidden="true" />
          <span className={styles.searchText}>Search patients, UHID, orders…</span>
          <kbd className={styles.searchKbd}>Ctrl K</kbd>
        </button>
      </div>

      {/* ── Right: actions ────────────────────────────── */}
      <div className={styles.right}>
        {/* Help */}
        <button className={styles.iconBtn} aria-label="Help">
          <HelpCircle size={18} aria-hidden="true" />
        </button>

        {/* Notifications */}
        <div className={styles.dropdownWrap}>
          <button
            className={styles.iconBtn}
            aria-label={`Notifications — ${unreadCount} unread`}
            aria-expanded={notifOpen}
            onClick={() => {
              setNotifOpen((o) => !o);
              setProfileOpen(false);
            }}
          >
            <Bell size={18} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className={styles.notifDot} aria-hidden="true">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div
                className={styles.backdrop}
                onClick={() => setNotifOpen(false)}
              />
              <div className={styles.dropdown} role="menu" aria-label="Notifications">
                <div className={styles.dropdownHeader}>
                  <span className={styles.dropdownTitle}>Notifications</span>
                  <Badge variant="danger" size="sm">{unreadCount} new</Badge>
                </div>
                <ul className={styles.notifList}>
                  {DEMO_NOTIFICATIONS.map((n) => (
                    <li key={n.id} className={styles.notifItem}>
                      <span
                        className={[
                          styles.notifDotInline,
                          styles[`notifDotInline--${n.type}`],
                        ].join(" ")}
                        aria-hidden="true"
                      />
                      <div className={styles.notifContent}>
                        <p className={styles.notifMessage}>{n.message}</p>
                        <span className={styles.notifTime}>{n.time}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className={styles.dropdownFooter}>
                  <Link href="/notifications" onClick={() => setNotifOpen(false)}>
                    View all notifications
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div className={styles.divider} aria-hidden="true" />

        {/* Profile */}
        <div className={styles.dropdownWrap}>
          <button
            className={styles.profileBtn}
            aria-label="User menu"
            aria-expanded={profileOpen}
            onClick={() => {
              setProfileOpen((o) => !o);
              setNotifOpen(false);
            }}
          >
            <div className={styles.profileAvatar} aria-hidden="true">
              {user?.name?.charAt(0).toUpperCase() ?? "U"}
            </div>
            <div className={styles.profileMeta}>
              <span className={styles.profileName}>{user?.name ?? "User"}</span>
              <span className={styles.profileRole}>
                {user?.role === "admin" ? "Admin" : "Staff"}
              </span>
            </div>
            <ChevronDown
              size={14}
              className={[
                styles.profileChevron,
                profileOpen ? styles["profileChevron--open"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden="true"
            />
          </button>

          {profileOpen && (
            <>
              <div
                className={styles.backdrop}
                onClick={() => setProfileOpen(false)}
              />
              <div
                className={[styles.dropdown, styles["dropdown--right"]].join(" ")}
                role="menu"
              >
                {/* User info block */}
                <div className={styles.profileDropdownUser}>
                  <div className={styles.profileDropdownAvatar}>
                    {user?.name?.charAt(0).toUpperCase() ?? "U"}
                  </div>
                  <div>
                    <p className={styles.profileDropdownName}>{user?.name ?? "User"}</p>
                    <p className={styles.profileDropdownEmail}>{user?.email ?? ""}</p>
                  </div>
                </div>

                <div className={styles.dropdownDivider} />

                {/* Role badge */}
                <div className={styles.profileDropdownRole}>
                  <Shield size={13} aria-hidden="true" />
                  <span>
                    {user?.role === "admin" ? "Administrator" : "Staff Member"}
                  </span>
                </div>

                <div className={styles.dropdownDivider} />

                <ul className={styles.menuList}>
                  <li>
                    <Link
                      href="/settings/profile"
                      className={styles.menuItem}
                      onClick={() => setProfileOpen(false)}
                    >
                      <User size={14} aria-hidden="true" />
                      My Profile
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/settings"
                      className={styles.menuItem}
                      onClick={() => setProfileOpen(false)}
                    >
                      <Settings size={14} aria-hidden="true" />
                      Settings
                    </Link>
                  </li>
                </ul>

                <div className={styles.dropdownDivider} />

                <ul className={styles.menuList}>
                  <li>
                    <button
                      className={[styles.menuItem, styles["menuItem--danger"]].join(" ")}
                      onClick={() => { setProfileOpen(false); logout(); }}
                    >
                      <LogOut size={14} aria-hidden="true" />
                      Sign out
                    </button>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
