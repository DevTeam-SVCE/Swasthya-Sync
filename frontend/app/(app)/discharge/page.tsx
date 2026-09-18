"use client";

import { useCallback, useEffect, useState } from "react";
import { FileDown, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { createDischargeSummary, dischargePdfUrl, fetchDischargeAdmissions, fetchDischargeSummaries, updateDischargeSummary, type DischargeSummary } from "@/lib/discharge";
import type { IPDAdmission } from "@/types/ipd";
import styles from "./page.module.css";

const emptyForm = { diagnosis: "", clinicalSummary: "", treatmentProcedure: "", dischargeCondition: "", dischargeInstructions: "", followUp: "", consultant: "" };
type SummaryForm = typeof emptyForm;

export default function DischargePage() {
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [admissions, setAdmissions] = useState<IPDAdmission[]>([]);
  const [summaries, setSummaries] = useState<DischargeSummary[]>([]);
  const [selectedAdmission, setSelectedAdmission] = useState<IPDAdmission | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<DischargeSummary | null>(null);
  const [form, setForm] = useState<SummaryForm>(emptyForm);
  const [pdfUrl, setPdfUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [admissionResponse, summaryResponse] = await Promise.all([fetchDischargeAdmissions(token), fetchDischargeSummaries(token)]);
      setAdmissions(admissionResponse.admissions);
      setSummaries(summaryResponse.summaries);
    } catch {
      setError("Unable to load IPD admissions and discharge summaries.");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!token || !selectedSummary) {
      const timer = window.setTimeout(() => setPdfUrl(""), 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    const loadPdf = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"}${dischargePdfUrl(selectedSummary.id)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error("PDF unavailable");
        const url = URL.createObjectURL(await response.blob());
        if (active) setPdfUrl(url);
      } catch { if (active) setPdfUrl(""); }
    };
    void loadPdf();
    return () => { active = false; };
  }, [token, selectedSummary]);

  const chooseAdmission = (admission: IPDAdmission) => {
    const existing = summaries.find((summary) => summary.admissionId === admission.id) ?? null;
    setSelectedAdmission(admission);
    setSelectedSummary(existing);
    setForm(existing ? { diagnosis: existing.diagnosis ?? "", clinicalSummary: existing.clinicalSummary ?? "", treatmentProcedure: existing.treatmentProcedure ?? "", dischargeCondition: existing.dischargeCondition ?? "", dischargeInstructions: existing.dischargeInstructions ?? "", followUp: existing.followUp ?? "", consultant: existing.consultant ?? "" } : emptyForm);
  };

  const save = async (status: "DRAFT" | "COMPLETED") => {
    if (!token || !selectedAdmission) { toastError("Select an IPD admission first.", "Discharge summaries are linked to existing admissions."); return; }
    try {
      setSaving(true);
      const input = { admissionId: selectedAdmission.id, ...form, status };
      const response = selectedSummary ? await updateDischargeSummary(token, selectedSummary.id, input) : await createDischargeSummary(token, input);
      setSelectedSummary(response.summary);
      success(status === "COMPLETED" ? "Discharge summary completed." : "Discharge summary saved.", selectedAdmission.patientName);
      await load();
    } catch (requestError) { toastError("Unable to save discharge summary.", requestError instanceof Error ? requestError.message : "Please try again."); }
    finally { setSaving(false); }
  };

  const setField = (field: keyof SummaryForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return <div className={styles.page}>
    <div className={styles.header}><div><h1 className={styles.title}>Discharge Summary</h1><p className={styles.subtitle}>Create, save, reopen, and render summaries against existing IPD admissions.</p></div><Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => void load()}>Refresh</Button></div>
    {error && <div className={styles.error}>{error}</div>}
    <div className={styles.grid}>
      <Card className={styles.card} noPadding><div className={styles.cardHeader}><h2 className={styles.sectionTitle}>IPD admissions</h2><p className={styles.sectionSubtitle}>Select an existing admission.</p></div><div className={styles.admissions}>{loading ? <div className={styles.empty}>Loading admissions…</div> : admissions.length === 0 ? <div className={styles.empty}>No IPD admissions found.</div> : admissions.map((admission) => <button type="button" key={admission.id} className={[styles.admission, selectedAdmission?.id === admission.id ? styles.admissionActive : ""].filter(Boolean).join(" ")} onClick={() => chooseAdmission(admission)}><div className={styles.admissionName}>{admission.patientName}</div><div className={styles.meta}>{admission.uhid} · {admission.admissionNumber}</div><div className={styles.meta}>{admission.status} · {admission.ward} / {admission.bedNumber}</div></button>)}</div></Card>
      <Card className={styles.card} noPadding>{!selectedAdmission ? <div className={styles.empty}>Select an IPD admission to begin.</div> : <><div className={styles.cardHeader}><h2 className={styles.sectionTitle}>{selectedAdmission.patientName}</h2><p className={styles.sectionSubtitle}>{selectedAdmission.uhid} · {selectedAdmission.admissionNumber}</p></div><div className={styles.form}><div className={styles.formGrid}><Input label="Consultant / doctor" value={form.consultant} onChange={(event) => setField("consultant", event.target.value)} placeholder="Consultant name" /><Select label="Summary status" value={selectedSummary?.status ?? "DRAFT"} onChange={() => undefined} options={[{ value: "DRAFT", label: "Draft" }, { value: "COMPLETED", label: "Completed" }]} /></div><Textarea label="Diagnosis" value={form.diagnosis} onChange={(event) => setField("diagnosis", event.target.value)} rows={3} /><Textarea label="Clinical summary" value={form.clinicalSummary} onChange={(event) => setField("clinicalSummary", event.target.value)} rows={4} /><Textarea label="Treatment / procedure information" value={form.treatmentProcedure} onChange={(event) => setField("treatmentProcedure", event.target.value)} rows={4} /><Textarea label="Discharge condition" value={form.dischargeCondition} onChange={(event) => setField("dischargeCondition", event.target.value)} rows={3} /><Textarea label="Discharge instructions" value={form.dischargeInstructions} onChange={(event) => setField("dischargeInstructions", event.target.value)} rows={4} /><Textarea label="Follow-up" value={form.followUp} onChange={(event) => setField("followUp", event.target.value)} rows={3} /><div className={styles.actions}><div className={styles.actionGroup}><Button type="button" loading={saving} onClick={() => void save("DRAFT")}>Save draft</Button><Button type="button" variant="success" loading={saving} onClick={() => void save("COMPLETED")}>Complete summary</Button></div>{selectedSummary && pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer"><Button type="button" variant="secondary" leftIcon={<FileDown size={15} />}>View PDF</Button></a>}</div></div></>}</Card>
    </div>
    <Card className={styles.history} noPadding><div className={styles.cardHeader}><h2 className={styles.sectionTitle}>Saved summaries</h2><p className={styles.sectionSubtitle}>Reopen an existing summary at any time.</p></div><div style={{ padding: "0 var(--space-5)" }}>{summaries.length === 0 ? <div className={styles.empty}>No summaries saved yet.</div> : summaries.map((summary) => <div className={styles.historyRow} key={summary.id}><div><strong>{summary.patientName}</strong><div className={styles.meta}>{summary.admissionNumber} · {new Date(summary.updatedAt).toLocaleDateString("en-IN")}</div></div><div className={styles.actionGroup}><Badge variant={summary.status === "COMPLETED" ? "success" : "warning"} size="sm">{summary.status}</Badge><Button type="button" variant="ghost" size="sm" onClick={() => { const admission = admissions.find((item) => item.id === summary.admissionId); if (admission) chooseAdmission(admission); }}>Open</Button></div></div>)}</div></Card>
  </div>;
}
