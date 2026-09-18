"use client";

import React, { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Activity, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  /* Redirect if already authenticated */
  React.useEffect(() => {
    if (!authLoading && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login({ email, password });
    if (result.success) {
      router.replace("/dashboard");
    } else {
      setError(result.error ?? "Login failed.");
      setLoading(false);
    }
  };

  return (
    <div className={styles.root}>
      {/* Left panel — branding */}
      <div className={styles.left} aria-hidden="true">
        <div className={styles.leftInner}>
          <div className={styles.brandMark}>
            <Activity size={32} />
          </div>
          <h1 className={styles.brandName}>SwasthyaSync</h1>
          <p className={styles.brandTagline}>
            Hospital Management System
          </p>
          <p className={styles.brandDesc}>
            Digitise and unify all hospital workflows into a single integrated platform.
            40+ modules. NABH compliant.
          </p>
          <ul className={styles.featureList}>
            {[
              "Patient Registration & UHID",
              "IPD Bed Management",
              "Laboratory & Radiology",
              "Billing & Revenue Cycle",
              "Pharmacy & Inventory",
              "Real-time Analytics",
            ].map((f) => (
              <li key={f} className={styles.featureItem}>
                <span className={styles.featureDot} />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className={styles.leftFooter}>© 2026 SwasthyaSync. All rights reserved.</p>
      </div>

      {/* Right panel — form */}
      <div className={styles.right}>
        <div className={styles.card}>
          {/* Header */}
          <div className={styles.cardHeader}>
            <div className={styles.mobileLogoWrap}>
              <div className={styles.mobileLogo}>
                <Activity size={20} />
              </div>
              <span className={styles.mobileLogoText}>SwasthyaSync</span>
            </div>
            <h2 className={styles.heading}>Welcome back</h2>
            <p className={styles.subheading}>
              Sign in to your HMS account
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            {error && (
              <div className={styles.errorBanner} role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.fieldGroup}>
              <label htmlFor="email" className={styles.label}>
                Email address
              </label>
              <input
                id="email"
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@hospital.com"
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>

            <div className={styles.fieldGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="password" className={styles.label}>
                  Password
                </label>
                  <span className={styles.forgotLink}>
                  Forgot password?
                  </span>
              </div>
              <div className={styles.passwordWrap}>
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  className={[styles.input, styles.inputPassword].join(" ")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading || !email || !password}
            >
              {loading ? (
                <span className={styles.submitSpinner} aria-hidden="true" />
              ) : null}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className={styles.registerLink}>
            New hospital?{" "}
            <Link href="/register">Register your organisation</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
