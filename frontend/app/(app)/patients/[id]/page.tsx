"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ChevronDown, Edit3, Paperclip, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { createPatientForm, fetchPatientForms, fetchFormTemplates, type FormTemplate, type PatientForm } from "@/lib/forms";
import { fetchPatient } from "@/lib/patients";
import type { Patient } from "@/types/patients";
import { PatientWizard } from "@/components/patients/PatientWizard";
import styles from "@/components/patients/Patient.module.css";

const tabs = ["Overview", "Clinical", "Forms", "Discharge"] as const;
type Tab = typeof tabs[number];

const patientFormCategoryOrder = [
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
  const router = useRouter();
  const { token } = useAuth();
  const { error: toastError } = useToast();
  const [forms, setForms] = useState<PatientForm[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(() => new Set());
  const [pickerCollapsedCategories, setPickerCollapsedCategories] = useState<Set<string>>(() => new Set());
  const [addingRecords, setAddingRecords] = useState(false);

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

  useEffect(() => {
    if (!pickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !addingRecords) setPickerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pickerOpen, addingRecords]);

  const categories = useMemo(() => {
    const available = new Set(templates.map((template) => template.category));
    const ordered = patientFormCategoryOrder.filter((item) => available.has(item));
    const additional = Array.from(available).filter((item) => !patientFormCategoryOrder.includes(item)).sort((left, right) => left.localeCompare(right));
    return [...ordered, ...additional];
  }, [templates]);
  const existingTemplateIds = useMemo(() => new Set(forms.map((form) => form.templateId)), [forms]);
  const patientFormGroups = useMemo(() => {
    const groups = new Map<string, PatientForm[]>();
    for (const form of forms) {
      const group = groups.get(form.category) ?? [];
      group.push(form);
      groups.set(form.category, group);
    }
    return Array.from(groups, ([categoryName, categoryForms]) => ({
      category: categoryName,
      forms: categoryForms,
    })).sort((left, right) => {
      const leftIndex = patientFormCategoryOrder.indexOf(left.category);
      const rightIndex = patientFormCategoryOrder.indexOf(right.category);
      if (leftIndex < 0 && rightIndex < 0) return left.category.localeCompare(right.category);
      if (leftIndex < 0) return 1;
      if (rightIndex < 0) return -1;
      return leftIndex - rightIndex;
    });
  }, [forms]);
  const pickerGroups = useMemo(() => {
    const query = pickerSearch.trim().toLocaleLowerCase();
    const available = templates.filter((template) => !query || `${template.name} ${template.category} ${template.subcategory ?? ""}`.toLocaleLowerCase().includes(query));
    return categories
      .map((categoryName) => ({ category: categoryName, templates: available.filter((template) => template.category === categoryName) }))
      .filter((group) => group.templates.length > 0);
  }, [templates, categories, pickerSearch]);

  if (loading) return <div className={styles.empty}>Loading forms for {patientName}…</div>;

  const openPicker = () => {
    setError("");
    setPickerSearch("");
    setSelectedTemplateIds(new Set());
    setPickerCollapsedCategories(new Set());
    setPickerOpen(true);
  };

  const addSelectedRecords = async () => {
    if (!token || selectedTemplateIds.size === 0 || addingRecords) return;
    setAddingRecords(true);
    setError("");
    const failedTemplates: string[] = [];
    const selectedTemplates = templates.filter((template) => selectedTemplateIds.has(template.id) && !existingTemplateIds.has(template.id));
    const createdForms: PatientForm[] = [];
    for (const template of selectedTemplates) {
      try {
        const response = await createPatientForm(token, { patientId, templateId: template.id, fieldData: {} });
        createdForms.push(response.form);
      } catch (requestError) {
        failedTemplates.push(`${template.name}: ${requestError instanceof Error ? requestError.message : "Please try again."}`);
      }
    }

    let updatedForms = createdForms;
    try {
      const response = await fetchPatientForms(token, patientId);
      updatedForms = response.forms;
    } catch (refreshError) {
      updatedForms = [...createdForms, ...forms.filter((form) => !createdForms.some((created) => created.id === form.id))];
      toastError("Unable to refresh patient forms.", refreshError instanceof Error ? refreshError.message : "The records were added, but the library could not be refreshed.");
    }
    setForms(updatedForms);

    const firstAddedForm = selectedTemplates
      .map((template) => updatedForms.find((form) => form.templateId === template.id))
      .find((form): form is PatientForm => Boolean(form));

    if (failedTemplates.length > 0) {
      toastError("Some forms could not be added.", failedTemplates.join(", "));
    }
    if (firstAddedForm) {
      setPickerOpen(false);
      setAddingRecords(false);
      router.push(`/forms?patientId=${encodeURIComponent(patientId)}&templateId=${encodeURIComponent(firstAddedForm.templateId)}&formId=${encodeURIComponent(firstAddedForm.id)}&category=${encodeURIComponent(firstAddedForm.category)}`);
      return;
    }

    setError(failedTemplates.length > 0 ? `Unable to add selected forms: ${failedTemplates.join(", ")}` : "No new forms were added.");
    setAddingRecords(false);
  };

  return <>
    <div className={styles.formsWorkspace}>
      <div className={styles.patientFormsLayout}>
        <aside className={styles.patientFormsSidebar} aria-label="Patient form categories">
          <div className={styles.patientFormsSidebarHeader}>
            <div><h3 className={styles.formSectionTitle}>Form library</h3><p className={styles.muted}>All available templates</p></div>
            <span className={styles.patientFormsCount}>{templates.length}</span>
          </div>
          <div className={styles.patientFormsCategoryList}>
            {patientFormGroups.length === 0
              ? <p className={styles.patientFormsEmpty}>No forms added yet.</p>
              : patientFormGroups.map(({ category: categoryName, forms: categoryForms }) => {
              const isExpanded = activeCategory === categoryName;
              return <section className={styles.patientFormsCategoryGroup} key={categoryName}>
                <button
                  type="button"
                  className={[styles.patientFormsCategory, isExpanded ? styles.patientFormsCategoryActive : ""].filter(Boolean).join(" ")}
                  onClick={() => setActiveCategory((current) => current === categoryName ? "" : categoryName)}
                  aria-expanded={isExpanded}
                >
                  <ChevronDown className={isExpanded ? "" : styles.patientFormsCategoryChevronCollapsed} size={15} />
                  <span>{categoryName}</span><span className={styles.patientFormsCount}>{categoryForms.length}</span>
                </button>
                {isExpanded && <div className={styles.patientFormsTemplateList}>
                  {categoryForms.map((form) => <button
                    type="button"
                    key={form.id}
                    className={styles.patientFormsTemplate}
                    onClick={() => router.push(`/forms?patientId=${encodeURIComponent(patientId)}&templateId=${encodeURIComponent(form.templateId)}&formId=${encodeURIComponent(form.id)}&category=${encodeURIComponent(form.category)}`)}
                    aria-label={`${form.templateName}, added to patient, open form`}
                  >
                    <span className={styles.patientFormsAddedIndicator} aria-hidden="true" />
                    <span>{form.templateName}</span>
                    <span className={styles.patientFormsAddedMark}>Added</span>
                  </button>)}
                </div>}
              </section>;
            })}
          </div>
        </aside>

        <div className={styles.patientRecordsContent}>
          <div className={styles.patientFormsActions}>
            <Button type="button" leftIcon={<Plus size={15} />} onClick={openPicker}>Add Records</Button>
          </div>
          {error && !pickerOpen && <div className={styles.error}>{error}</div>}
          <section className={styles.patientAttachments}>
            <div className={styles.patientAttachmentsHeader}><div className={styles.patientAttachmentsIcon}><Paperclip size={17} /></div><div><h3 className={styles.formSectionTitle}>Attachments</h3><p className={styles.muted}>Files associated with this patient</p></div></div>
            <p className={styles.patientAttachmentsEmpty}>No attachments are available. Patient file uploads are not supported yet.</p>
          </section>
        </div>
      </div>
    </div>

    {pickerOpen && <div className={styles.recordsPickerBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !addingRecords) setPickerOpen(false); }}>
      <section className={styles.recordsPicker} role="dialog" aria-modal="true" aria-labelledby="records-picker-title">
        <header className={styles.recordsPickerHeader}>
          <div><h2 id="records-picker-title">Add records</h2><p>Choose forms to add to {patientName}&apos;s patient records.</p></div>
          <button type="button" className={styles.recordsPickerClose} onClick={() => setPickerOpen(false)} disabled={addingRecords} aria-label="Close form picker"><X size={18} /></button>
        </header>
        <label className={styles.recordsPickerSearch}>
          <Search size={16} />
          <input type="search" value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Search forms or categories" aria-label="Search forms" />
        </label>
        <div className={styles.recordsPickerBody}>
          {error && <div className={styles.error}>{error}</div>}
          {pickerGroups.length === 0 ? <p className={styles.recordsPickerEmpty}>No matching forms found.</p> : pickerGroups.map(({ category: categoryName, templates: groupTemplates }) => {
            const isExpanded = !pickerCollapsedCategories.has(categoryName);
            return <section className={styles.recordsPickerGroup} key={categoryName}>
              <button type="button" className={styles.recordsPickerCategory} onClick={() => setPickerCollapsedCategories((previous) => {
                const next = new Set(previous);
                if (next.has(categoryName)) next.delete(categoryName);
                else next.add(categoryName);
                return next;
              })} aria-expanded={isExpanded}>
                <ChevronDown className={isExpanded ? "" : styles.patientFormsCategoryChevronCollapsed} size={15} />
                <span>{categoryName}</span><span className={styles.patientFormsCount}>{groupTemplates.length}</span>
              </button>
              {isExpanded && <div className={styles.recordsPickerTemplates}>
                {groupTemplates.map((template) => {
                  const alreadyAdded = existingTemplateIds.has(template.id);
                  return <label className={[styles.recordsPickerTemplate, alreadyAdded ? styles.recordsPickerTemplateAdded : ""].filter(Boolean).join(" ")} key={template.id}>
                    <input type="checkbox" checked={alreadyAdded || selectedTemplateIds.has(template.id)} disabled={alreadyAdded || addingRecords} onChange={() => setSelectedTemplateIds((previous) => {
                      const next = new Set(previous);
                      if (next.has(template.id)) next.delete(template.id);
                      else next.add(template.id);
                      return next;
                    })} />
                    <span className={styles.recordsPickerTemplateText}><strong>{template.name}</strong>{template.subcategory && <small>{template.subcategory}</small>}</span>
                    {alreadyAdded && <span className={styles.patientFormsAddedMark}>Already added</span>}
                  </label>;
                })}
              </div>}
            </section>;
          })}
        </div>
        <footer className={styles.recordsPickerFooter}>
          <span>{selectedTemplateIds.size} selected</span>
          <div><Button type="button" variant="secondary" onClick={() => setPickerOpen(false)} disabled={addingRecords}>Cancel</Button><Button type="button" onClick={() => void addSelectedRecords()} disabled={selectedTemplateIds.size === 0 || addingRecords} loading={addingRecords}>Add</Button></div>
        </footer>
      </section>
    </div>}
  </>;
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
