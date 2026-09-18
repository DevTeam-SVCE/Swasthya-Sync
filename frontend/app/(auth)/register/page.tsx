"use client";

import React, { FormEvent, useState } from "react";
import Link from "next/link";
import { Activity, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import styles from "../login/page.module.css";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({
    hospitalName: "",
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const result = await register(form);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? "Registration failed.");
      return;
    }

    setSuccess(true);
    window.setTimeout(() => router.replace("/login"), 1200);
  };

  return (
    <div className={styles.root}>
      <div className={styles.left} aria-hidden="true">
        <div className={styles.leftInner}>
          <div className={styles.brandMark}><Activity size={32} /></div>
          <h1 className={styles.brandName}>SwasthyaSync</h1>
          <p className={styles.brandTagline}>Hospital Management System</p>
          <p className={styles.brandDesc}>
            Create your hospital workspace and bring every workflow into one integrated platform.
          </p>
        </div>
        <p className={styles.leftFooter}>© 2026 SwasthyaSync. All rights reserved.</p>
      </div>

      <div className={styles.right}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.mobileLogoWrap}>
              <div className={styles.mobileLogo}><Activity size={20} /></div>
              <span className={styles.mobileLogoText}>SwasthyaSync</span>
            </div>
            <h2 className={styles.heading}>Register your hospital</h2>
            <p className={styles.subheading}>Create the first administrator account</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            {error && (
              <div className={styles.errorBanner} role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className={styles.successBanner} role="status">
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>Registration successful. Redirecting to sign in…</span>
              </div>
            )}

            <div className={styles.fieldGroup}>
              <label htmlFor="hospitalName" className={styles.label}>Hospital name</label>
              <input id="hospitalName" className={styles.input} value={form.hospitalName} onChange={(e) => updateField("hospitalName", e.target.value)} autoComplete="organization" required disabled={loading || success} />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="name" className={styles.label}>Administrator name</label>
              <input id="name" className={styles.input} value={form.name} onChange={(e) => updateField("name", e.target.value)} autoComplete="name" required disabled={loading || success} />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="email" className={styles.label}>Email address</label>
              <input id="email" type="email" className={styles.input} value={form.email} onChange={(e) => updateField("email", e.target.value)} autoComplete="email" required disabled={loading || success} />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="password" className={styles.label}>Password</label>
              <div className={styles.passwordWrap}>
                <input id="password" type={showPassword ? "text" : "password"} className={[styles.input, styles.inputPassword].join(" ")} value={form.password} onChange={(e) => updateField("password", e.target.value)} autoComplete="new-password" required disabled={loading || success} />
                <button type="button" className={styles.eyeBtn} onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="confirmPassword" className={styles.label}>Confirm password</label>
              <div className={styles.passwordWrap}>
                <input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} className={[styles.input, styles.inputPassword].join(" ")} value={form.confirmPassword} onChange={(e) => updateField("confirmPassword", e.target.value)} autoComplete="new-password" required disabled={loading || success} />
                <button type="button" className={styles.eyeBtn} onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "Hide password" : "Show password"}>
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading || success || Object.values(form).some((value) => !value.trim())}>
              {loading ? <span className={styles.submitSpinner} aria-hidden="true" /> : null}
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className={styles.registerLink}>
            Already registered? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
