"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { fetchPatientForms, type PatientForm } from "@/lib/forms";
import { fetchFormTemplates, type FormTemplate } from "@/lib/forms";
import { fetchPatient } from "@/lib/patients";
import type { Patient } from "@/types/patients";
import { PatientWizard } from "@/components/patients/PatientWizard";
import styles from "@/components/patients/Patient.module.css";

const tabs = ["Overview", "Clinical", "Forms", "Discharge"] as const;
type Tab = typeof tabs[number];

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !params.id) return;
    fetchPatient(token, params.id).then((response) => setPatient(response.patient)).catch(() => setError("Patient not found or unavailable.")).finally(() => setLoading(false));
  }, [token, params.id]);

  if (loading) return <div className={styles.page}><div className={styles.empty}>Loading patient record…</div></div>;
  if (error || !patient) return <div className={styles.page}><div className={styles.error}>{error || "Patient not found."}</div><Link href="/patients"><Button variant="secondary" leftIcon={<ArrowLeft size={15} />}>Back to patients</Button></Link></div>;
  if (editing) return <div className={styles.page}>
    <div className={styles.header}><div><h1 className={styles.title}>Edit Patient</h1><p className={styles.subtitle}>{patient.uhid} · {patient.fullName}</p></div><Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button></div>
    <PatientWizard initialPatient={patient} patientId={patient.id} onSaved={(updated) => { setPatient(updated); setEditing(false); }} />
  </div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div><Link href="/patients" className={styles.backLink}>← Back to patients</Link><h1 className={styles.title}>{patient.fullName}</h1><p className={styles.subtitle}>{patient.uhid} · Registered {new Date(patient.createdAt).toLocaleDateString("en-IN")}</p></div>
        <div className={styles.actions}><Button variant="secondary" leftIcon={<Edit3 size={15} />} onClick={() => setEditing(true)}>Edit patient</Button></div>
      </div>
      {patient.mlcType !== "None" && <div className={styles.alert}><AlertTriangle size={17} /><strong>MLC case:</strong> {patient.mlcType}. Full medico-legal workflow is handled in a later phase.</div>}
      <Card className={styles.card} noPadding>
        <div className={styles.detailTabs} role="tablist" aria-label="Patient details">
          {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={[styles.detailTab, tab === item ? styles["detailTab--active"] : ""].filter(Boolean).join(" ")} onClick={() => setTab(item)}>{item}</button>)}
        </div>
        <CardBody>{tab === "Overview" && <Overview patient={patient} />}{tab === "Clinical" && <Clinical patient={patient} />}{tab === "Forms" && <PatientForms patientId={patient.id} patientName={patient.fullName} initialCategory={searchParams.get("category") || "Admission"} />}{tab === "Discharge" && <EmptyState title="No discharge summary available." description="Discharge summaries will be available when the discharge workflow is implemented." compact />}</CardBody>
      </Card>
    </div>
  );
}

function PatientForms({ patientId, patientName, initialCategory }: { patientId: string; patientName: string; initialCategory: string }) {
  const { token } = useAuth();
  const [forms, setForms] = useState<PatientForm[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [category, setCategory] = useState(initialCategory);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => {
      void Promise.all([fetchPatientForms(token, patientId), fetchFormTemplates(token)])
        .then(([formResponse, templateResponse]) => { setForms(formResponse.forms); setTemplates(templateResponse.templates); })
        .catch(() => setError("Unable to load forms for this patient."))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [token, patientId]);

  if (loading) return <div className={styles.empty}>Loading forms for {patientName}…</div>;
  if (error) return <div className={styles.error}>{error}</div>;

  const availableCategories = new Set(templates.map((template) => template.category));
  const categories = ["Admission", "Nursing", "Assessment", ...Array.from(availableCategories).filter((item) => !["Admission", "Nursing", "Assessment"].includes(item)).sort()];
  const categoryTemplates = templates.filter((template) => template.category === category);

  const categoryOrder = [
    "Admission",
    "Nursing",
    "Assessment",
    "Consent",
    "Discharge & End of Life",
    "Infection Control",
    "Medication",
    "Monitoring",
    "Surgery & OT",
    "Transfer & Referral",
  ];

  const usedFormGroups = Array.from(new Map(
    forms.reduce<Map<string, PatientForm[]>>((accumulator, form) => {
      const current = accumulator.get(form.category) ?? [];
      current.push(form);
      accumulator.set(form.category, current);
      return accumulator;
    }, new Map())
  ).entries())
    .map(([categoryName, categoryForms]) => ({
      category: categoryName,
      forms: categoryForms.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    }))
    .sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.category);
      const bIndex = categoryOrder.indexOf(b.category);
      if (aIndex !== -1 || bIndex !== -1) {
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      }
      return a.category.localeCompare(b.category);
    });

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories((previous) => ({
      ...previous,
      [categoryName]: !(previous[categoryName] ?? true),
    }));
  };

  return <div className={styles.formsLayout}>
    <div className={styles.formsLibrary}>
      <div className={styles.formCategories} aria-label="Patient form categories">
        {categories.map((item) => <button type="button" key={item} className={[styles.formCategory, category === item ? styles.formCategoryActive : ""].filter(Boolean).join(" ")} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <div className={styles.formSection}>
        <h3 className={styles.formSectionTitle}>{category} forms</h3>
        <p className={styles.muted}>Available templates for {patientName}.</p>
        {categoryTemplates.length === 0 ? <p className={styles.muted}>No templates are available in this category.</p> : <div className={styles.formTemplateList}>{categoryTemplates.map((template) => <div className={styles.formTemplateRow} key={template.id}><div><strong>{template.name}</strong><div className={styles.muted}>{template.subcategory || template.category}</div></div><Link href={`/forms?patientId=${patientId}&templateId=${template.id}&category=${encodeURIComponent(category)}`}><Button type="button" variant="secondary" size="sm">Open form</Button></Link></div>)}</div>}
      </div>
    </div>

    <aside className={styles.usedFormsPanel}>
      <div className={styles.usedFormsHeader}>
        <h3 className={styles.formSectionTitle}>Forms Used for This Patient</h3>
        <p className={styles.muted}>All saved forms for this patient</p>
      </div>

      {usedFormGroups.length === 0 ? (
        <div className={styles.usedFormsEmpty}>No forms have been used for this patient yet.</div>
      ) : (
        <div className={styles.usedFormsList}>
          {usedFormGroups.map(({ category: categoryName, forms: categoryItems }) => {
            const isExpanded = expandedCategories[categoryName] ?? true;
            return (
              <div key={categoryName} className={styles.usedFormGroup}>
                <button type="button" className={styles.usedCategoryToggle} onClick={() => toggleCategory(categoryName)}>
                  <span className={styles.usedCategoryChevron} data-expanded={isExpanded}>{isExpanded ? "▾" : "▸"}</span>
                  <span>{categoryName}</span>
                </button>

                {isExpanded && (
                  <div className={styles.usedFormEntries}>
                    {categoryItems.map((form) => (
                      <div key={form.id} className={styles.usedFormEntry}>
                        <div className={styles.usedFormMeta}>
                          <strong>{form.templateName}</strong>
                          <span className={styles.muted}>Saved {new Date(form.updatedAt).toLocaleDateString("en-IN")}</span>
                        </div>
                        <div className={styles.usedFormActions}>
                          <Badge variant={form.status === "COMPLETED" ? "success" : "warning"} size="sm">{form.status}</Badge>
                          <Link href={`/forms?patientId=${patientId}&templateId=${form.templateId}&formId=${form.id}&category=${encodeURIComponent(form.category)}`}><Button type="button" variant="ghost" size="sm">Open</Button></Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  </div>;
}

function Overview({ patient }: { patient: Patient }) {
  return <div className={styles.detailGrid}>{[
    ["UHID", patient.uhid], ["Admission type", patient.admissionType], ["Age / gender", `${patient.age} years · ${patient.gender}`], ["Mobile", patient.mobile], ["Department", patient.department], ["Attending doctor", patient.attendingDoctor], ["Current status", patient.initialStatus], ["Patient category", patient.patientCategory], ["Chief complaint", patient.chiefComplaint || "Not provided"],
  ].map(([label, value]) => <DetailItem key={label} label={label} value={value} />)}</div>;
}

function Clinical({ patient }: { patient: Patient }) {
  return <div className={styles.detailGrid}>{[
    ["Full name", patient.fullName], ["Date of birth", patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString("en-IN") : "Not provided"], ["Blood group", patient.bloodGroup], ["Aadhaar", patient.aadhaar ? `XXXX XXXX ${patient.aadhaar.slice(-4)}` : "Not provided"], ["ABHA Health ID", patient.abhaId || "Not provided"], ["Address", patient.address || "Not provided"], ["Guardian", patient.guardianName ? `${patient.guardianName} (${patient.guardianRelation || "relation not provided"})` : "Not provided"], ["Payment type", patient.paymentType], ["Insurance / TPA", patient.insuranceCompany ? `${patient.insuranceCompany}${patient.tpaName ? ` · ${patient.tpaName}` : ""}` : "Not applicable"], ["Policy validity", patient.policyValidity ? new Date(patient.policyValidity).toLocaleDateString("en-IN") : "Not applicable"], ["MLC type", patient.mlcType], ["Chief complaint", patient.chiefComplaint || "Not provided"],
  ].map(([label, value]) => <DetailItem key={label} label={label} value={value} />)}</div>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div className={styles.detailItem}><span className={styles.detailLabel}>{label}</span><span className={styles.detailValue}>{value}</span></div>;
}
