"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Search, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { fetchPatient, fetchPatients } from "@/lib/patients";
import { fetchAdmissions } from "@/lib/ipd";
import { createPatientForm, fetchFormTemplate, fetchFormTemplates, fetchPatientForm, fetchPatientForms, updatePatientForm, type FormTemplate, type PatientForm } from "@/lib/forms";
import type { Patient } from "@/types/patients";
import type { IPDAdmission } from "@/types/ipd";
import styles from "./page.module.css";

interface StrokePoint { x: number; y: number; }
interface Stroke { points: StrokePoint[]; }

export default function FormsPage() {
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [forms, setForms] = useState<PatientForm[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientAdmission, setPatientAdmission] = useState<IPDAdmission | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [notes, setNotes] = useState("");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [openedFormId, setOpenedFormId] = useState<string | null>(null);
  const [currentForm, setCurrentForm] = useState<PatientForm | null>(null);
  const [formReady, setFormReady] = useState(false);
  const [returnPatientId, setReturnPatientId] = useState<string | null>(null);
  const [returnCategory, setReturnCategory] = useState("Admission");
  const [pdfUrl, setPdfUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState("Ready");
  const [error, setError] = useState("");

  function openPatientFormState(form: PatientForm) {
    setCurrentForm(form);
    setOpenedFormId(form.id);
    setNotes(typeof form.fieldData.notes === "string" ? form.fieldData.notes : "");
    setStrokes(Array.isArray(form.fieldData.strokes) ? form.fieldData.strokes as Stroke[] : []);
  }

  const loadTemplates = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetchFormTemplates(token, { q: search, category, subcategory });
      setTemplates(response.templates);
      if (selectedTemplate && !response.templates.some((item) => item.id === selectedTemplate.id)) setSelectedTemplate(null);
    } catch {
      setError("Unable to load real form templates.");
    } finally {
      setLoading(false);
    }
  }, [token, search, category, subcategory, selectedTemplate]);

  const loadPatientForms = useCallback(async () => {
    if (!token || !selectedPatient) return;
    try {
      const response = await fetchPatientForms(token, selectedPatient.id);
      setForms(response.forms);
    } catch {
      setForms([]);
    }
  }, [token, selectedPatient]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTemplates(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTemplates]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPatientForms(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPatientForms]);

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get("patientId");
    const templateId = params.get("templateId");
    const formId = params.get("formId");
    const categoryParam = params.get("category") || "Admission";
    if (!patientId || !templateId) return;
    const returnTimer = window.setTimeout(() => setReturnPatientId(patientId), 0);
    const categoryTimer = window.setTimeout(() => setReturnCategory(categoryParam), 0);

    const loadRequestedForm = async () => {
      try {
        const [patientResponse, templateResponse] = await Promise.all([
          fetchPatient(token, patientId),
          fetchFormTemplate(token, templateId),
        ]);
        setSelectedPatient(patientResponse.patient);
        setSelectedTemplate(templateResponse.template);
        const admissionResponse = await fetchAdmissions(token);
        setPatientAdmission(admissionResponse.admissions.find((admission) => admission.patientId === patientId) ?? null);
        if (formId) {
          const formResponse = await fetchPatientForm(token, formId);
          openPatientFormState(formResponse.form);
          setAutoSaveStatus("Saved");
        }
        setFormReady(true);
      } catch {
        setError("Unable to open the requested patient form.");
      }
    };
    void loadRequestedForm();
    return () => { window.clearTimeout(returnTimer); window.clearTimeout(categoryTimer); };
  }, [token]);

  useEffect(() => {
    if (!token || !selectedPatient || !selectedTemplate || !currentForm || !formReady) return;
    const timer = window.setTimeout(() => {
      setAutoSaveStatus("Saving…");
      void updatePatientForm(token, currentForm.id, { fieldData: { ...currentForm.fieldData, notes, strokes } })
        .then(() => setAutoSaveStatus("Saved"))
        .catch(() => setAutoSaveStatus("Save failed"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [token, selectedPatient, selectedTemplate, currentForm, notes, strokes, formReady]);

  useEffect(() => {
    if (!token || !selectedTemplate) {
      const timer = window.setTimeout(() => setPdfUrl(""), 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    const loadPdf = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"}${selectedTemplate.viewUrl}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error("PDF unavailable");
        const blobUrl = URL.createObjectURL(await response.blob());
        if (active) setPdfUrl(blobUrl);
      } catch {
        if (active) setPdfUrl("");
      }
    };
    void loadPdf();
    return () => { active = false; };
  }, [token, selectedTemplate]);

  const categories = useMemo(() => Array.from(new Set(templates.map((item) => item.category))).sort(), [templates]);
  const subcategories = useMemo(() => Array.from(new Set(templates.filter((item) => !category || item.category === category).map((item) => item.subcategory).filter(Boolean) as string[])).sort(), [templates, category]);

  const searchPatients = async () => {
    if (!token || patientSearch.trim().length < 2) return;
    try {
      const response = await fetchPatients(token, patientSearch.trim());
      setPatients(response.patients);
    } catch {
      setPatients([]);
    }
  };

  const createFormForPatient = async () => {
    if (!token || !selectedPatient || !selectedTemplate) {
      toastError("Select a patient and a real template first.", "The original PDF remains unchanged; this creates a separate patient form record.");
      return;
    }
    try {
      setSaving(true);
      const response = await createPatientForm(token, { patientId: selectedPatient.id, templateId: selectedTemplate.id, fieldData: { notes } });
      openPatientFormState(response.form);
      setFormReady(true);
      setStrokes([]);
      success("Patient form created.", `${selectedTemplate.name} is linked to ${selectedPatient.fullName}.`);
      await loadPatientForms();
    } catch (requestError) {
      toastError("Unable to create patient form.", requestError instanceof Error ? requestError.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const reopenPatientForm = (form: PatientForm) => {
    const template = templates.find((item) => item.id === form.templateId);
    if (template) setSelectedTemplate(template);
    openPatientFormState(form);
    setFormReady(true);
    document.getElementById("use-for-patient")?.scrollIntoView({ behavior: "smooth" });
  };

  const selectTemplate = (template: FormTemplate) => {
    setSelectedTemplate(template);
    if (currentForm?.templateId !== template.id) {
      setCurrentForm(null);
      setOpenedFormId(null);
      setFormReady(Boolean(selectedPatient));
      setNotes("");
      setStrokes([]);
      setAutoSaveStatus("Ready");
    }
  };

  const saveCurrentForm = async () => {
    if (!token || !currentForm) {
      toastError("Open a patient form first.", "Save is available for an existing patient form instance.");
      return;
    }
    try {
      setSaving(true);
      await updatePatientForm(token, currentForm.id, { fieldData: { ...currentForm.fieldData, notes, strokes } });
      setAutoSaveStatus("Saved");
      success("Form saved.", "Notes and annotations were saved to this patient form.");
    } catch (requestError) {
      setAutoSaveStatus("Save failed");
      toastError("Unable to save form.", requestError instanceof Error ? requestError.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div><h1 className={styles.title}>{returnPatientId ? "Patient Form Editor" : "Patient Forms"}</h1><p className={styles.subtitle}>{returnPatientId ? "Editing this patient’s saved form. Changes save automatically." : "Browse the imported hospital PDFs and create patient-specific form records."}</p>{returnPatientId && <Link className={styles.backLink} href={`/patients/${returnPatientId}?category=${encodeURIComponent(returnCategory)}`}>Back to patient forms</Link>}</div>
        <Badge variant="primary" size="sm" dot>{templates.length} real templates</Badge>
      </div>

      <div className={[styles.layout, returnPatientId ? styles.focusedLayout : ""].filter(Boolean).join(" ")}>
        {!returnPatientId && <Card className={styles.panel} noPadding>
          <div className={styles.panelHeader}><div><h2 className={styles.sectionTitle}>Form library</h2><p className={styles.sectionSubtitle}>Categories and consent subcategories are preserved.</p></div></div>
          <div className={styles.controls}>
            <div className={styles.search}><Input label="Search templates" placeholder="General Consent for Admission" value={search} onChange={(event) => setSearch(event.target.value)} leftIcon={<Search size={15} />} /></div>
            <Select label="Category" value={category} onChange={(event) => { setCategory(event.target.value); setSubcategory(""); }} options={[{ value: "", label: "All categories" }, ...categories.map((item) => ({ value: item, label: item }))]} />
            <Select label="Subcategory" value={subcategory} onChange={(event) => setSubcategory(event.target.value)} options={[{ value: "", label: "All subcategories" }, ...subcategories.map((item) => ({ value: item, label: item }))]} />
          </div>
          <div className={styles.list}>{loading ? <div className={styles.empty}>Loading real templates…</div> : templates.length === 0 ? <div className={styles.empty}>No matching templates.</div> : templates.map((template) => <button type="button" key={template.id} className={[styles.template, selectedTemplate?.id === template.id ? styles.templateActive : ""].filter(Boolean).join(" ")} onClick={() => selectTemplate(template)}><div className={styles.templateName}>{template.name}</div><div className={styles.templateMeta}>{template.category}{template.subcategory ? ` · ${template.subcategory}` : ""}</div></button>)}</div>
        </Card>}

        <Card className={styles.panel} noPadding>
          {!selectedTemplate ? <div className={styles.empty}><div><FileText size={32} /><p>Select a template to view the actual PDF.</p></div></div> : <div className={styles.viewer}>
            <div className={styles.viewerHeader}><div><h2 className={styles.sectionTitle}>{selectedTemplate.name}</h2><p className={styles.sectionSubtitle}>{selectedTemplate.category}{selectedTemplate.subcategory ? ` · ${selectedTemplate.subcategory}` : ""}</p>{selectedPatient && <p className={styles.muted}>Patient: {selectedPatient.fullName} · {autoSaveStatus}</p>}</div><div className={styles.viewerActions}><a href={pdfUrl || "#"} target="_blank" rel="noreferrer"><Button type="button" variant="secondary">Open PDF</Button></a>{!openedFormId && <Button type="button" leftIcon={<UserPlus size={15} />} onClick={() => document.getElementById("use-for-patient")?.scrollIntoView({ behavior: "smooth" })}>Use for patient</Button>}</div></div>
            {pdfUrl ? <div className={styles.pdfStage}><iframe title={selectedTemplate.name} className={styles.pdf} src={pdfUrl} /><PatientHeader patient={selectedPatient} admission={patientAdmission} /><AnnotationCanvas strokes={strokes} onChange={setStrokes} /></div> : <div className={styles.empty}>Loading PDF…</div>}
            <div id="use-for-patient" className={styles.formArea}><h3 className={styles.sectionTitle}>{selectedPatient ? `Patient form · ${selectedPatient.fullName}` : "Create patient form"}</h3>{!selectedPatient && <><div className={styles.search}><Input label="Search existing patient" placeholder="Name, UHID, or mobile" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchPatients(); } }} /></div>{patients.length > 0 && <div className={styles.list}>{patients.map((patient) => <button type="button" className={styles.template} key={patient.id} onClick={() => { setSelectedPatient(patient); setPatients([]); }}><div className={styles.templateName}>{patient.fullName}</div><div className={styles.templateMeta}>{patient.uhid} · {patient.department}</div></button>)}</div>}</>}{selectedPatient && <div className={styles.selectedPatient}><strong>{selectedPatient.fullName}</strong><span className={styles.muted}>{selectedPatient.uhid}</span><span className={styles.muted}>Auto-save: {autoSaveStatus}</span></div>}<Textarea label="Notes / data entry" placeholder="Record the information entered for this patient form. Changes save automatically." value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />{selectedPatient && openedFormId && <div className={styles.formActions}><Button type="button" loading={saving} onClick={() => void saveCurrentForm()}>Save form</Button><Button type="button" variant="ghost" onClick={() => setStrokes([])}>Clear pen marks</Button></div>}{!forms.some((form) => form.templateId === selectedTemplate.id && form.patientId === selectedPatient?.id) && <div className={styles.formActions}><Button type="button" loading={saving} onClick={() => void createFormForPatient()}>Create patient form</Button></div>}</div>
            {selectedPatient && <div className={styles.history}><h3 className={styles.sectionTitle}>Completed form history for {selectedPatient.fullName}</h3>{forms.length === 0 ? <p className={styles.muted}>No patient-specific forms yet.</p> : forms.map((form) => <div className={styles.historyRow} key={form.id}><div><strong>{form.templateName}</strong><div className={styles.muted}>{form.category} · {new Date(form.createdAt).toLocaleDateString("en-IN")}</div></div><div className={styles.viewerActions}><Badge variant={form.status === "COMPLETED" ? "success" : "warning"} size="sm">{form.status}</Badge><Button type="button" variant="ghost" size="sm" onClick={() => reopenPatientForm(form)}>Open</Button></div></div>)}</div>}
          </div>}
          {error && <div className={styles.error}>{error}</div>}
        </Card>
      </div>
    </div>
  );
}

function PatientHeader({ patient, admission }: { patient: Patient | null; admission: IPDAdmission | null }) {
  if (!patient) return null;
  return <div className={styles.patientHeaderOverlay} aria-label="Patient form header">
    <strong>{patient.fullName}</strong>
    <span>UHID: {patient.uhid}</span>
    <span>Age/Sex: {patient.age} / {patient.gender}</span>
    {admission && <span>IPID: {admission.admissionNumber}</span>}
    <span>Doctor: {patient.attendingDoctor}</span>
    <span>Department: {patient.department}</span>
    <span>Date: {new Date().toLocaleDateString("en-IN")}</span>
  </div>;
}

function AnnotationCanvas({ strokes, onChange }: { strokes: Stroke[]; onChange: (strokes: Stroke[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = canvas.clientWidth || 900;
    const height = canvas.clientHeight || 620;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "#2563eb";
    context.lineWidth = 2;
    context.lineCap = "round";
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      context.beginPath();
      stroke.points.forEach((point, index) => index === 0 ? context.moveTo(point.x * width, point.y * height) : context.lineTo(point.x * width, point.y * height));
      context.stroke();
    }
  }, [strokes]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  };

  return <canvas ref={canvasRef} className={styles.annotationCanvas} onPointerDown={(event) => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); onChange([...strokes, { points: [pointFromEvent(event)] }]); }} onPointerMove={(event) => { if (!drawing.current) return; const point = pointFromEvent(event); onChange(strokes.length ? [...strokes.slice(0, -1), { points: [...strokes[strokes.length - 1].points, point] }] : [{ points: [point] }]); }} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} aria-label="Draw on patient form" />;
}
