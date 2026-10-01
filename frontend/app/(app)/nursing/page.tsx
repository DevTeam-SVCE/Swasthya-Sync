"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ClipboardList, FileText, HeartPulse, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import {
  createNursingAssessment,
  createNursingIoEntry,
  createNursingNote,
  createNursingTask,
  createNursingVitals,
  fetchNursingAdmissions,
  fetchNursingWorkspace,
  updateNursingTask,
  type NursingAdmission,
  type NursingEntry,
  type NursingTask,
  type NursingTaskStatus,
  type NursingTaskType,
  type NursingVitalsInput,
  type NursingWorkspace,
} from "@/lib/nursing";
import { createPatientForm, fetchFormTemplates, fetchPatientForms, type FormTemplate, type PatientForm } from "@/lib/forms";
import styles from "./page.module.css";

type WorkspaceTab = "assessment" | "vitals" | "notes" | "tasks" | "medications" | "intake-output" | "forms";

const EMPTY_ASSESSMENT = { generalCondition: "", consciousness: "", painAssessment: "", mobility: "", nutrition: "", skinObservations: "", fallRiskObservations: "", otherObservations: "", remarks: "" };
const EMPTY_VITALS: NursingVitalsInput = { temperature: "", pulse: "", respiratoryRate: "", spo2: "", systolicBp: "", diastolicBp: "", weight: "", notes: "" };
const EMPTY_NOTE = { observation: "", intervention: "", response: "", remarks: "" };
const EMPTY_TASK = { taskType: "Vital-sign monitoring" as NursingTaskType, description: "" };
const EMPTY_IO = { direction: "INTAKE" as "INTAKE" | "OUTPUT", entryType: "Oral", amount: "", unit: "mL", notes: "" };

const TABS: { id: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
  { id: "assessment", label: "Assessment", icon: <ClipboardList size={15} /> },
  { id: "vitals", label: "Vital signs", icon: <HeartPulse size={15} /> },
  { id: "notes", label: "Nursing notes", icon: <FileText size={15} /> },
  { id: "tasks", label: "Care tasks", icon: <Activity size={15} /> },
  { id: "medications", label: "Medications", icon: <ClipboardList size={15} /> },
  { id: "intake-output", label: "Intake / output", icon: <Activity size={15} /> },
  { id: "forms", label: "Nursing forms", icon: <FileText size={15} /> },
];

const TASK_TYPES: { value: NursingTaskType; label: string }[] = [
  { value: "Medication administration", label: "Medication administration" },
  { value: "Vital-sign monitoring", label: "Vital-sign monitoring" },
  { value: "Patient repositioning", label: "Patient repositioning" },
  { value: "Wound / skin care", label: "Wound / skin care" },
  { value: "Intake / output monitoring", label: "Intake / output monitoring" },
  { value: "Other", label: "Other" },
];

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-IN") : "—";
}

function entryText(entry: NursingEntry, field: string) {
  const value = entry[field];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function todayTotal(entries: NursingEntry[], direction: string) {
  const today = new Date().toDateString();
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.direction !== direction || !entry.recordedAt || new Date(entry.recordedAt).toDateString() !== today) continue;
    const unit = typeof entry.unit === "string" ? entry.unit : "units";
    totals.set(unit, (totals.get(unit) || 0) + Number(entry.amount || 0));
  }
  return totals.size ? [...totals].map(([unit, amount]) => `${Number(amount.toFixed(2))} ${unit}`).join(" + ") : "0";
}

export default function NursingPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [admissions, setAdmissions] = useState<NursingAdmission[]>([]);
  const [wards, setWards] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [ward, setWard] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const admissionsRequestId = useRef(0);
  const workspaceRequestId = useRef(0);
  const [workspace, setWorkspace] = useState<NursingWorkspace | null>(null);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [patientForms, setPatientForms] = useState<PatientForm[]>([]);
  const [tab, setTab] = useState<WorkspaceTab>("assessment");
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assessment, setAssessment] = useState(EMPTY_ASSESSMENT);
  const [vitals, setVitals] = useState(EMPTY_VITALS);
  const [nursingNote, setNursingNote] = useState(EMPTY_NOTE);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK);
  const [ioForm, setIoForm] = useState(EMPTY_IO);

  const selectAdmission = (admissionId: string | null) => {
    if (selectedIdRef.current === admissionId) return;
    selectedIdRef.current = admissionId;
    workspaceRequestId.current += 1;
    setSelectedId(admissionId);
    setWorkspace(null);
    setPatientForms([]);
    setWorkspaceLoading(Boolean(admissionId));
    setSaving(false);
    setTab("assessment");
    setAssessment(EMPTY_ASSESSMENT);
    setVitals(EMPTY_VITALS);
    setNursingNote(EMPTY_NOTE);
    setTaskForm(EMPTY_TASK);
    setIoForm(EMPTY_IO);
  };

  const loadAdmissions = useCallback(async () => {
    if (!token) return;
    const requestId = ++admissionsRequestId.current;
    setLoading(true);
    try {
      const response = await fetchNursingAdmissions(token, { q: search.trim() || undefined, ward: ward || undefined });
      if (requestId !== admissionsRequestId.current) return;
      setAdmissions(response.admissions);
      setWards(response.wards);
      const nextId = selectedIdRef.current && response.admissions.some((item) => item.id === selectedIdRef.current)
        ? selectedIdRef.current
        : response.admissions[0]?.id ?? null;
      selectAdmission(nextId);
    } catch (requestError) {
      if (requestId !== admissionsRequestId.current) return;
      toastError("Unable to load Nursing patients.", requestError instanceof Error ? requestError.message : "Please check the backend and retry.");
    } finally {
      if (requestId === admissionsRequestId.current) setLoading(false);
    }
  }, [token, search, ward, toastError]);

  const loadWorkspace = useCallback(async (admissionId: string) => {
    if (!token) return;
    const requestId = ++workspaceRequestId.current;
    setWorkspaceLoading(true);
    try {
      const data = await fetchNursingWorkspace(token, admissionId);
      if (data.admission.id !== admissionId) throw new Error("Admission response did not match the selected patient.");
      const forms = await fetchPatientForms(token, data.admission.patientId);
      if (requestId !== workspaceRequestId.current || selectedIdRef.current !== admissionId) return;
      setWorkspace(data);
      setPatientForms(forms.forms.filter((form) => form.category === "Nursing"));
    } catch (requestError) {
      if (requestId !== workspaceRequestId.current || selectedIdRef.current !== admissionId) return;
      toastError("Unable to load nursing workspace.", requestError instanceof Error ? requestError.message : "Please try again.");
    } finally {
      if (requestId === workspaceRequestId.current && selectedIdRef.current === admissionId) setWorkspaceLoading(false);
    }
  }, [token, toastError]);

  useEffect(() => {
    void loadAdmissions();
  }, [loadAdmissions]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void fetchFormTemplates(token, { category: "Nursing" }).then((response) => {
      if (active) setTemplates(response.templates);
    }).catch(() => {
      if (active) setTemplates([]);
    });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!selectedId) {
      setWorkspace(null);
      setPatientForms([]);
      setWorkspaceLoading(false);
      return;
    }
    void loadWorkspace(selectedId);
  }, [selectedId, loadWorkspace]);

  const submitRecord = async (event: FormEvent, admissionId: string, action: () => Promise<unknown>, message: string, reset?: () => void) => {
    event.preventDefault();
    setSaving(true);
    try {
      await action();
      if (selectedIdRef.current === admissionId) {
        success(message, "The record has been saved to this admission.");
        reset?.();
        await loadWorkspace(admissionId);
      }
    } catch (requestError) {
      if (selectedIdRef.current === admissionId) {
        toastError(`${message} Failed.`, requestError instanceof Error ? requestError.message : "Please check the entered values.");
      }
    } finally {
      if (selectedIdRef.current === admissionId) setSaving(false);
    }
  };

  const updateTask = async (task: NursingTask, status: NursingTaskStatus) => {
    const admissionId = selectedIdRef.current;
    if (!token || !admissionId) return;
    setSaving(true);
    try {
      await updateNursingTask(token, admissionId, task.id, status);
      if (selectedIdRef.current === admissionId) {
        success("Care task updated.", `Task is now ${status}.`);
        await loadWorkspace(admissionId);
      }
    } catch (requestError) {
      if (selectedIdRef.current === admissionId) {
        toastError("Unable to update care task.", requestError instanceof Error ? requestError.message : "Please try again.");
      }
    } finally {
      if (selectedIdRef.current === admissionId) setSaving(false);
    }
  };

  const createForm = async (template: FormTemplate) => {
    if (!token || !selectedWorkspace) return;
    const admissionId = selectedWorkspace.admission.id;
    const patientId = selectedWorkspace.admission.patientId;
    setSaving(true);
    try {
      const result = await createPatientForm(token, { patientId, templateId: template.id });
      if (selectedIdRef.current !== admissionId) return;
      router.push(`/forms?patientId=${encodeURIComponent(patientId)}&templateId=${encodeURIComponent(template.id)}&formId=${encodeURIComponent(result.form.id)}&category=Nursing`);
    } catch (requestError) {
      if (selectedIdRef.current === admissionId) toastError("Unable to create Nursing form.", requestError instanceof Error ? requestError.message : "Please try again.");
    } finally {
      if (selectedIdRef.current === admissionId) setSaving(false);
    }
  };

  const openForm = (form: PatientForm) => {
    router.push(`/forms?patientId=${encodeURIComponent(form.patientId)}&templateId=${encodeURIComponent(form.templateId)}&formId=${encodeURIComponent(form.id)}&category=Nursing`);
  };

  const currentAdmission = admissions.find((admission) => admission.id === selectedId) ?? null;
  const selectedWorkspace = workspace?.admission.id === selectedId ? workspace : null;
  const tableRows = useMemo(() => admissions as Array<NursingAdmission & Record<string, unknown>>, [admissions]);
  const ioTypes = ioForm.direction === "INTAKE"
    ? [{ value: "Oral", label: "Oral" }, { value: "IV", label: "IV" }, { value: "Other intake", label: "Other" }]
    : [{ value: "Urine", label: "Urine" }, { value: "Drain", label: "Drain" }, { value: "Other output", label: "Other" }];

  useEffect(() => {
    setIoForm((current) => ({ ...current, entryType: ioForm.direction === "INTAKE" ? "Oral" : "Urine" }));
  }, [ioForm.direction]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Nursing"
        subtitle="Inpatient nursing care for active IPD admissions."
        icon={<HeartPulse size={18} />}
        accent="success"
        actions={<Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => void loadAdmissions()}>Refresh patients</Button>}
      />

      <Card noPadding>
        <div className={styles.toolbar}>
          <div className={styles.search}><Input label="Search admitted patients" placeholder="Patient name or UHID" value={search} onChange={(event) => setSearch(event.target.value)} leftIcon={<Search size={15} />} /></div>
          <div className={styles.wardFilter}><Select label="Ward / unit" value={ward} onChange={(event) => setWard(event.target.value)} options={[{ value: "", label: "All wards" }, ...wards.map((item) => ({ value: item, label: item }))]} /></div>
        </div>
      </Card>

      <DataTable
        columns={[
          { key: "patientName", header: "Patient", render: (_, row) => <><strong>{row.patientName}</strong><br /><span className={styles.muted}>{row.uhid} · {row.age} yrs · {row.sex}</span></> },
          { key: "admissionNumber", header: "Admission / Bed", render: (_, row) => <><strong>{row.admissionNumber}</strong><br /><span className={styles.muted}>{row.bedNumber} · {row.ward}</span></> },
          { key: "admissionDate", header: "Admitted", render: (_, row) => new Date(row.admissionDate).toLocaleDateString("en-IN") },
          { key: "status", header: "Status", render: (_, row) => <Badge variant="success" size="sm">{row.status}</Badge> },
          { key: "chiefComplaint", header: "Current information", render: (_, row) => row.chiefComplaint || "—" },
          { key: "action", header: "Action", render: (_, row) => <Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); selectAdmission(row.id); }}>Open</Button> },
        ]}
        data={tableRows}
        rowKey={(row) => row.id}
        onRowClick={(row) => selectAdmission(row.id)}
        loading={loading}
        emptyTitle="No active IPD admissions"
        emptyDescription="Nursing patients are drawn from currently admitted IPD patients."
      />

      {currentAdmission && (
        <section className={styles.workspace} aria-label="Nursing patient workspace">
          <Card className={styles.patientCard}>
            <div className={styles.patientHeading}>
              <div><h2>{currentAdmission.patientName}</h2><p>{currentAdmission.uhid} · {currentAdmission.age} yrs · {currentAdmission.sex}</p></div>
              <Badge variant="success" size="sm">ADMITTED</Badge>
            </div>
            <div className={styles.patientFacts}>
              <Fact label="Admission" value={currentAdmission.admissionNumber} />
              <Fact label="Bed / ward" value={`${currentAdmission.bedNumber} · ${currentAdmission.ward}${currentAdmission.room ? ` · Room ${currentAdmission.room}` : ""}`} />
              <Fact label="Admission date" value={dateTime(currentAdmission.admissionDate)} />
              <Fact label="Department" value={currentAdmission.department} />
              <Fact label="Attending doctor" value={currentAdmission.attendingDoctor} />
              <Fact label="Blood group" value={currentAdmission.bloodGroup} />
              <Fact label="Current information" value={currentAdmission.chiefComplaint} />
              <Fact label="Allergies" value="No allergy field is available on the patient record." />
            </div>
          </Card>

          <div className={styles.tabs} role="tablist" aria-label="Nursing care sections">
            {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? styles.activeTab : styles.tab} onClick={() => setTab(item.id)}>{item.icon}<span>{item.label}</span></button>)}
          </div>

          {workspaceLoading || !selectedWorkspace ? <Card><p className={styles.muted}>Loading admission workspace…</p></Card> : (
            <>
              {tab === "assessment" && <Card className={styles.section}>
                <h2>Nursing assessment</h2>
                <form className={styles.formGrid} onSubmit={(event) => void submitRecord(event, currentAdmission.id, () => createNursingAssessment(token!, currentAdmission.id, assessment), "Assessment recorded.", () => setAssessment(EMPTY_ASSESSMENT))}>
                  <Input label="General condition" value={assessment.generalCondition} onChange={(event) => setAssessment((value) => ({ ...value, generalCondition: event.target.value }))} />
                  <Input label="Consciousness / orientation" value={assessment.consciousness} onChange={(event) => setAssessment((value) => ({ ...value, consciousness: event.target.value }))} />
                  <Input label="Pain assessment" value={assessment.painAssessment} onChange={(event) => setAssessment((value) => ({ ...value, painAssessment: event.target.value }))} />
                  <Input label="Mobility" value={assessment.mobility} onChange={(event) => setAssessment((value) => ({ ...value, mobility: event.target.value }))} />
                  <Input label="Nutrition" value={assessment.nutrition} onChange={(event) => setAssessment((value) => ({ ...value, nutrition: event.target.value }))} />
                  <Input label="Skin / pressure-risk observations" value={assessment.skinObservations} onChange={(event) => setAssessment((value) => ({ ...value, skinObservations: event.target.value }))} />
                  <Input label="Fall-risk observations" value={assessment.fallRiskObservations} onChange={(event) => setAssessment((value) => ({ ...value, fallRiskObservations: event.target.value }))} />
                  <Input label="Other observations" value={assessment.otherObservations} onChange={(event) => setAssessment((value) => ({ ...value, otherObservations: event.target.value }))} />
                  <div className={styles.fullWidth}><Textarea label="Remarks" value={assessment.remarks} onChange={(event) => setAssessment((value) => ({ ...value, remarks: event.target.value }))} rows={2} /></div>
                  <div className={styles.fullWidth}><Button type="submit" loading={saving}>Record assessment</Button></div>
                </form>
                <History title="Assessment history" entries={selectedWorkspace.assessments} fields={[["generalCondition", "Condition"], ["consciousness", "Consciousness"], ["painAssessment", "Pain"], ["remarks", "Remarks"]]} />
              </Card>}

              {tab === "vitals" && <Card className={styles.section}>
                <h2>Vital signs</h2>
                {selectedWorkspace.vitals[0] && <div className={styles.latestVitals}><strong>Latest · {dateTime(selectedWorkspace.vitals[0].recordedAt)}</strong><span>{vitalSummary(selectedWorkspace.vitals[0])}</span></div>}
                <form className={styles.formGrid} onSubmit={(event) => {
                  const hasValue = Object.entries(vitals).some(([key, value]) => key !== "notes" && value.trim() !== "");
                  if (!hasValue) {
                    event.preventDefault();
                    toastError("Vital signs are required.", "Enter at least one measurement before recording.");
                    return;
                  }
                  if (Boolean(vitals.systolicBp) !== Boolean(vitals.diastolicBp)) {
                    event.preventDefault();
                    toastError("Blood pressure is incomplete.", "Enter both systolic and diastolic values.");
                    return;
                  }
                  void submitRecord(event, currentAdmission.id, () => createNursingVitals(token!, currentAdmission.id, vitals), "Vital signs recorded.", () => setVitals(EMPTY_VITALS));
                }}>
                  <Input type="number" step="0.1" label="Temperature (°C)" value={vitals.temperature} onChange={(event) => setVitals((value) => ({ ...value, temperature: event.target.value }))} />
                  <Input type="number" label="Pulse (bpm)" value={vitals.pulse} onChange={(event) => setVitals((value) => ({ ...value, pulse: event.target.value }))} />
                  <Input type="number" label="Respiratory rate (/min)" value={vitals.respiratoryRate} onChange={(event) => setVitals((value) => ({ ...value, respiratoryRate: event.target.value }))} />
                  <Input type="number" step="0.1" label="SpO2 (%)" value={vitals.spo2} onChange={(event) => setVitals((value) => ({ ...value, spo2: event.target.value }))} />
                  <Input type="number" label="Systolic BP (mmHg)" value={vitals.systolicBp} onChange={(event) => setVitals((value) => ({ ...value, systolicBp: event.target.value }))} />
                  <Input type="number" label="Diastolic BP (mmHg)" value={vitals.diastolicBp} onChange={(event) => setVitals((value) => ({ ...value, diastolicBp: event.target.value }))} />
                  <Input type="number" step="0.1" label="Weight (kg)" value={vitals.weight} onChange={(event) => setVitals((value) => ({ ...value, weight: event.target.value }))} />
                  <div className={styles.fullWidth}><Textarea label="Additional notes" value={vitals.notes} onChange={(event) => setVitals((value) => ({ ...value, notes: event.target.value }))} rows={2} /></div>
                  <div className={styles.fullWidth}><Button type="submit" loading={saving}>Record vital signs</Button></div>
                </form>
                <History title="Vital-sign history" entries={selectedWorkspace.vitals} summary={vitalSummary} />
              </Card>}

              {tab === "notes" && <Card className={styles.section}>
                <h2>Nursing notes</h2>
                <form className={styles.formGrid} onSubmit={(event) => void submitRecord(event, currentAdmission.id, () => createNursingNote(token!, currentAdmission.id, nursingNote), "Nursing note added.", () => setNursingNote(EMPTY_NOTE))}>
                  <Textarea label="Observation" value={nursingNote.observation} onChange={(event) => setNursingNote((value) => ({ ...value, observation: event.target.value }))} rows={3} />
                  <Textarea label="Intervention / action" value={nursingNote.intervention} onChange={(event) => setNursingNote((value) => ({ ...value, intervention: event.target.value }))} rows={3} />
                  <Textarea label="Response / outcome" value={nursingNote.response} onChange={(event) => setNursingNote((value) => ({ ...value, response: event.target.value }))} rows={3} />
                  <Textarea label="Additional remarks" value={nursingNote.remarks} onChange={(event) => setNursingNote((value) => ({ ...value, remarks: event.target.value }))} rows={3} />
                  <div className={styles.fullWidth}><Button type="submit" loading={saving}>Add note</Button></div>
                </form>
                <History title="Note history" entries={selectedWorkspace.notes} fields={[["observation", "Observation"], ["intervention", "Action"], ["response", "Response"], ["remarks", "Remarks"]]} />
              </Card>}

              {tab === "tasks" && <Card className={styles.section}>
                <h2>Care tasks</h2>
                <form className={styles.formGrid} onSubmit={(event) => void submitRecord(event, currentAdmission.id, () => createNursingTask(token!, currentAdmission.id, taskForm), "Care task created.", () => setTaskForm(EMPTY_TASK))}>
                  <Select label="Task type" value={taskForm.taskType} onChange={(event) => setTaskForm((value) => ({ ...value, taskType: event.target.value as NursingTaskType }))} options={TASK_TYPES} />
                  <Input label="Task description" required value={taskForm.description} onChange={(event) => setTaskForm((value) => ({ ...value, description: event.target.value }))} placeholder="e.g. Reposition patient at next round" />
                  <div className={styles.fullWidth}><Button type="submit" loading={saving}>Create task</Button></div>
                </form>
                <div className={styles.historyList}>{selectedWorkspace.tasks.length ? selectedWorkspace.tasks.map((task) => <div className={styles.historyEntry} key={task.id}><div className={styles.entryHeader}><strong>{task.taskType}</strong><Badge variant={task.status === "COMPLETED" ? "success" : task.status === "IN_PROGRESS" ? "warning" : "primary"} size="sm">{task.status}</Badge></div><p>{task.description}</p><span className={styles.muted}>Created by {task.createdByName || "—"} · {dateTime(task.createdAt)}</span><div className={styles.actionRow}>{task.status === "PENDING" && <Button size="sm" variant="secondary" disabled={saving} onClick={() => void updateTask(task, "IN_PROGRESS")}>Start</Button>}{task.status !== "COMPLETED" && <Button size="sm" disabled={saving} onClick={() => void updateTask(task, "COMPLETED")}>Complete</Button>}</div></div>) : <p className={styles.muted}>No care tasks recorded for this admission.</p>}</div>
              </Card>}

              {tab === "medications" && <Card className={styles.section}>
                <h2>Medication orders</h2>
                <p className={styles.muted}>Read-only view of the patient’s existing CPOE medication orders and Pharmacy status.</p>
                {selectedWorkspace.medications.length ? <div className={styles.historyList}>{selectedWorkspace.medications.map((medication) => <div className={styles.historyEntry} key={medication.cpoeOrderId}><div className={styles.entryHeader}><strong>{medication.medicationName}</strong><Badge variant={medication.pharmacyStatus === "DISPENSED" ? "success" : "primary"} size="sm">{medication.pharmacyStatus || medication.cpoeStatus}</Badge></div><p>{[medication.dose, medication.route, medication.frequency, medication.duration, medication.quantity].filter(Boolean).join(" · ") || medication.clinicalInstructions || "Details not entered"}</p><span className={styles.muted}>{medication.orderNumber} · {medication.priority} · {dateTime(medication.orderedAt)}</span></div>)}</div> : <p className={styles.muted}>No CPOE medication orders found for this patient.</p>}
              </Card>}

              {tab === "intake-output" && <Card className={styles.section}>
                <h2>Intake &amp; output</h2>
                <div className={styles.totalRow}><span>Today’s intake <strong>{todayTotal(selectedWorkspace.intakeOutput, "INTAKE")}</strong></span><span>Today’s output <strong>{todayTotal(selectedWorkspace.intakeOutput, "OUTPUT")}</strong></span></div>
                <form className={styles.formGrid} onSubmit={(event) => void submitRecord(event, currentAdmission.id, () => createNursingIoEntry(token!, currentAdmission.id, ioForm), "Intake / output recorded.", () => setIoForm(EMPTY_IO))}>
                  <Select label="Direction" value={ioForm.direction} onChange={(event) => setIoForm((value) => ({ ...value, direction: event.target.value as "INTAKE" | "OUTPUT" }))} options={[{ value: "INTAKE", label: "Intake" }, { value: "OUTPUT", label: "Output" }]} />
                  <Select label="Type" value={ioForm.entryType} onChange={(event) => setIoForm((value) => ({ ...value, entryType: event.target.value }))} options={ioTypes} />
                  <Input type="number" step="0.1" label="Amount" required value={ioForm.amount} onChange={(event) => setIoForm((value) => ({ ...value, amount: event.target.value }))} />
                  <Input label="Unit" required value={ioForm.unit} onChange={(event) => setIoForm((value) => ({ ...value, unit: event.target.value }))} />
                  <div className={styles.fullWidth}><Textarea label="Notes" value={ioForm.notes} onChange={(event) => setIoForm((value) => ({ ...value, notes: event.target.value }))} rows={2} /></div>
                  <div className={styles.fullWidth}><Button type="submit" loading={saving}>Record entry</Button></div>
                </form>
                <History title="Today’s entries" entries={selectedWorkspace.intakeOutput.filter((entry) => entry.recordedAt && new Date(entry.recordedAt).toDateString() === new Date().toDateString())} fields={[["direction", "Direction"], ["entryType", "Type"], ["amount", "Amount"], ["unit", "Unit"], ["notes", "Notes"]]} />
              </Card>}

              {tab === "forms" && <Card className={styles.section}>
                <h2>Nursing forms</h2>
                <p className={styles.muted}>Uses the existing patient form templates and saved patient-specific instances.</p>
                {templates.length ? <div className={styles.historyList}>{templates.map((template) => <div className={styles.historyEntry} key={template.id}><div className={styles.entryHeader}><strong>{template.name}</strong><Button size="sm" loading={saving} onClick={() => void createForm(template)}>Create form</Button></div><span className={styles.muted}>{template.category}{template.subcategory ? ` · ${template.subcategory}` : ""}</span></div>)}</div> : <p className={styles.muted}>No templates in the Nursing category are currently available.</p>}
                <h3>Saved forms for this patient</h3>
                {patientForms.filter((form) => form.patientId === currentAdmission.patientId).length ? <div className={styles.historyList}>{patientForms.filter((form) => form.patientId === currentAdmission.patientId).map((form) => <div className={styles.historyEntry} key={form.id}><div className={styles.entryHeader}><strong>{form.templateName}</strong><Button size="sm" variant="secondary" onClick={() => openForm(form)}>Open</Button></div><span className={styles.muted}>{form.category} · {form.status} · Updated {dateTime(form.updatedAt)}</span></div>)}</div> : <p className={styles.muted}>No Nursing forms saved for this patient.</p>}
              </Card>}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return <div className={styles.fact}><span>{label}</span><strong>{value || "—"}</strong></div>;
}

function vitalSummary(entry: NursingEntry) {
  const bp = entry.systolicBp && entry.diastolicBp ? `BP ${entry.systolicBp}/${entry.diastolicBp}` : "";
  return [entry.temperature ? `Temp ${entry.temperature} °C` : "", entry.pulse ? `Pulse ${entry.pulse}` : "", entry.respiratoryRate ? `RR ${entry.respiratoryRate}` : "", entry.spo2 ? `SpO2 ${entry.spo2}%` : "", bp, entry.weight ? `Wt ${entry.weight} kg` : ""].filter(Boolean).join(" · ") || "No values entered";
}

function History({ title, entries, fields, summary }: { title: string; entries: NursingEntry[]; fields?: [string, string][]; summary?: (entry: NursingEntry) => string }) {
  return <div className={styles.historyBlock}><h3>{title}</h3>{entries.length ? <div className={styles.historyList}>{entries.map((entry) => <div className={styles.historyEntry} key={entry.id}>{summary && <p>{summary(entry)}</p>}{fields?.map(([field, label]) => entryText(entry, field) ? <p key={field}><strong>{label}:</strong> {entryText(entry, field)}</p> : null)}<span className={styles.muted}>{dateTime(entry.recordedAt)} · {entry.recordedByName || "Nursing staff"}</span></div>)}</div> : <p className={styles.muted}>No history recorded for this admission.</p>}</div>;
}
