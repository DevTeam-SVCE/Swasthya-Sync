"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ClipboardCheck, ClipboardList, FileText, RefreshCw, Search } from "lucide-react";
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
import { createPatientForm, fetchFormTemplates, fetchPatientForms, type FormTemplate, type PatientForm } from "@/lib/forms";
import { fetchAdmissions } from "@/lib/ipd";
import { fetchPatients } from "@/lib/patients";
import type { IPDAdmission } from "@/types/ipd";
import type { Patient } from "@/types/patients";
import {
  createOtCase,
  createOtCaseNote,
  fetchOtCase,
  fetchOtCases,
  fetchOtProcedureOrders,
  fetchOtTheatres,
  updateOtCaseStatus,
  updateOtChecklist,
  updateOtOperativeDetails,
  updateOtPostoperative,
  type OtCase,
  type OtCaseNote,
  type OtNoteType,
  type OtPriority,
  type OtProcedureOrder,
  type OtStatus,
  type OtTheatre,
} from "@/lib/operation-theatre";
import styles from "./page.module.css";

type OtTab = "checklist" | "notes" | "operative" | "postoperative" | "forms";
type ScheduleForm = {
  patientId: string;
  procedureOrderId: string;
  procedureName: string;
  surgeon: string;
  anaesthetist: string;
  anaesthesiaType: string;
  theatreId: string;
  scheduledAt: string;
  durationMinutes: string;
  priority: OtPriority;
  clinicalIndication: string;
  clinicalInstructions: string;
};

const STATUS_FILTERS: { value: "ALL" | OtStatus; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "SCHEDULED", label: "SCHEDULED" },
  { value: "PREPARATION", label: "PREPARATION" },
  { value: "IN_PROGRESS", label: "IN_PROGRESS" },
  { value: "COMPLETED", label: "COMPLETED" },
  { value: "POSTPONED", label: "POSTPONED" },
  { value: "CANCELLED", label: "CANCELLED" },
];

const CHECKLIST: { key: string; label: string }[] = [
  { key: "patientIdentityConfirmed", label: "Patient identity confirmed" },
  { key: "consentAvailable", label: "Consent available" },
  { key: "procedureConfirmed", label: "Procedure confirmed" },
  { key: "siteVerified", label: "Site / procedure verification complete" },
  { key: "investigationsReviewed", label: "Relevant investigations reviewed" },
  { key: "anaesthesiaAssessmentAvailable", label: "Anaesthesia assessment available" },
  { key: "allergiesReviewed", label: "Allergies reviewed" },
  { key: "equipmentConfirmed", label: "Required equipment / instruments confirmed" },
  { key: "bloodAvailable", label: "Blood availability reviewed if required" },
  { key: "preoperativePreparationCompleted", label: "Pre-operative preparation completed" },
];

const NOTE_TYPES: { value: OtNoteType; label: string }[] = [
  { value: "PRE_OPERATIVE", label: "Pre-operative" },
  { value: "INTRA_OPERATIVE", label: "Intra-operative" },
  { value: "POST_OPERATIVE", label: "Post-operative" },
];

const OPERATIVE_EMPTY = { actualProcedure: "", actualStartAt: "", actualEndAt: "", operativeSurgeon: "", operativeAnaesthetist: "", findings: "", procedureNotes: "", complications: "", estimatedBloodLossMl: "", specimens: "", operativeRemarks: "" };
const POSTOP_EMPTY = { recoveryStatus: "", postoperativeInstructions: "", followUpInstructions: "", postoperativeComplications: "", postoperativeRemarks: "" };

function statusVariant(status: OtStatus) {
  if (status === "SCHEDULED") return "primary";
  if (status === "PREPARATION") return "warning";
  if (status === "IN_PROGRESS") return "info";
  if (status === "COMPLETED") return "success";
  if (status === "CANCELLED") return "danger";
  return "default";
}

function priorityVariant(priority: OtPriority) {
  return priority === "STAT" ? "danger" : priority === "URGENT" ? "warning" : "success";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-IN") : "—";
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : "";
}

export default function OperationTheatrePage() {
  const router = useRouter();
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [cases, setCases] = useState<OtCase[]>([]);
  const [theatres, setTheatres] = useState<OtTheatre[]>([]);
  const [procedureOrders, setProcedureOrders] = useState<OtProcedureOrder[]>([]);
  const [admissions, setAdmissions] = useState<IPDAdmission[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientLabel, setPatientLabel] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OtStatus>("ALL");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const [selectedCase, setSelectedCase] = useState<OtCase | null>(null);
  const [notes, setNotes] = useState<OtCaseNote[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [patientForms, setPatientForms] = useState<PatientForm[]>([]);
  const [tab, setTab] = useState<OtTab>("checklist");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [noteType, setNoteType] = useState<OtNoteType>("PRE_OPERATIVE");
  const [noteText, setNoteText] = useState("");
  const [operative, setOperative] = useState(OPERATIVE_EMPTY);
  const [postoperative, setPostoperative] = useState(POSTOP_EMPTY);
  const [schedule, setSchedule] = useState<ScheduleForm>({ patientId: "", procedureOrderId: "", procedureName: "", surgeon: "", anaesthetist: "", anaesthesiaType: "", theatreId: "", scheduledAt: "", durationMinutes: "60", priority: "ROUTINE", clinicalIndication: "", clinicalInstructions: "" });
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [rescheduleTheatre, setRescheduleTheatre] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectCase = (id: string | null) => {
    if (selectedIdRef.current === id) return;
    selectedIdRef.current = id;
    detailRequestId.current += 1;
    setSelectedId(id);
    setSelectedCase(null);
    setNotes([]);
    setPatientForms([]);
    setChecklist({});
    setNoteText("");
    setOperative(OPERATIVE_EMPTY);
    setPostoperative(POSTOP_EMPTY);
    setRescheduleAt("");
    setRescheduleTheatre("");
    setTab("checklist");
    setDetailLoading(Boolean(id));
  };

  const loadCases = useCallback(async () => {
    if (!token) return;
    const requestId = ++listRequestId.current;
    setLoading(true);
    try {
      const response = await fetchOtCases(token, { q: search.trim() || undefined, status: statusFilter === "ALL" ? undefined : statusFilter, date: dateFilter || undefined });
      if (requestId !== listRequestId.current) return;
      setCases(response.cases);
      const nextId = selectedIdRef.current && response.cases.some((item) => item.id === selectedIdRef.current) ? selectedIdRef.current : response.cases[0]?.id ?? null;
      selectCase(nextId);
    } catch (requestError) {
      if (requestId === listRequestId.current) toastError("Unable to load OT schedule.", requestError instanceof Error ? requestError.message : "Please retry.");
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, [token, search, statusFilter, dateFilter, toastError]);

  const loadDetails = useCallback(async (caseId: string) => {
    if (!token) return;
    const requestId = ++detailRequestId.current;
    setDetailLoading(true);
    try {
      const details = await fetchOtCase(token, caseId);
      const forms = await fetchPatientForms(token, details.otCase.patientId);
      if (requestId !== detailRequestId.current || selectedIdRef.current !== caseId || details.otCase.id !== caseId) return;
      setSelectedCase(details.otCase);
      setNotes(details.notes);
      setChecklist(details.otCase.checklist || {});
      setOperative({
        actualProcedure: details.otCase.actualProcedure || "",
        actualStartAt: toDateTimeLocal(details.otCase.actualStartAt),
        actualEndAt: toDateTimeLocal(details.otCase.actualEndAt),
        operativeSurgeon: details.otCase.operativeSurgeon || details.otCase.surgeon,
        operativeAnaesthetist: details.otCase.operativeAnaesthetist || details.otCase.anaesthetist,
        findings: details.otCase.findings || "",
        procedureNotes: details.otCase.procedureNotes || "",
        complications: details.otCase.complications || "",
        estimatedBloodLossMl: details.otCase.estimatedBloodLossMl == null ? "" : String(details.otCase.estimatedBloodLossMl),
        specimens: details.otCase.specimens || "",
        operativeRemarks: details.otCase.operativeRemarks || "",
      });
      setPostoperative({
        recoveryStatus: details.otCase.recoveryStatus || "",
        postoperativeInstructions: details.otCase.postoperativeInstructions || "",
        followUpInstructions: details.otCase.followUpInstructions || "",
        postoperativeComplications: details.otCase.postoperativeComplications || "",
        postoperativeRemarks: details.otCase.postoperativeRemarks || "",
      });
      setPatientForms(forms.forms.filter((form) => form.patientId === details.otCase.patientId && /operation theatre|\bot\b|surgical/i.test(form.category)));
    } catch (requestError) {
      if (requestId === detailRequestId.current && selectedIdRef.current === caseId) toastError("Unable to load OT case.", requestError instanceof Error ? requestError.message : "Please retry.");
    } finally {
      if (requestId === detailRequestId.current && selectedIdRef.current === caseId) setDetailLoading(false);
    }
  }, [token, toastError]);

  useEffect(() => { void loadCases(); }, [loadCases]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void fetchOtTheatres(token)
      .then((response) => {
        if (!active) return;
        setTheatres(response.theatres);
        setSchedule((current) => ({ ...current, theatreId: response.theatres.some((theatre) => theatre.id === current.theatreId) ? current.theatreId : response.theatres[0]?.id || "" }));
      })
      .catch((requestError) => {
        if (active) toastError("Unable to load OT theatres.", requestError instanceof Error ? requestError.message : "Please retry.");
      });
    void Promise.allSettled([fetchOtProcedureOrders(token), fetchAdmissions(token), fetchFormTemplates(token)])
      .then(([orderResult, admissionResult, templateResult]) => {
        if (!active) return;
        if (orderResult.status === "fulfilled") setProcedureOrders(orderResult.value.orders);
        if (admissionResult.status === "fulfilled") setAdmissions(admissionResult.value.admissions);
        if (templateResult.status === "fulfilled") setTemplates(templateResult.value.templates.filter((template) => /operation theatre|\bot\b|surgical/i.test(template.category)));
        if ([orderResult, admissionResult, templateResult].some((result) => result.status === "rejected")) {
          toastError("Some OT setup information is unavailable.", "Theatre options load independently; retry other case details if needed.");
        }
      });
    return () => { active = false; };
  }, [token, toastError]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedCase(null);
      setNotes([]);
      setPatientForms([]);
      setDetailLoading(false);
      return;
    }
    void loadDetails(selectedId);
  }, [selectedId, loadDetails]);

  const updateCase = (updated: OtCase) => {
    if (selectedIdRef.current !== updated.id) return;
    setSelectedCase(updated);
    setCases((current) => current.map((item) => item.id === updated.id ? updated : item));
    setChecklist(updated.checklist || {});
    setOperative((current) => ({ ...current, actualProcedure: updated.actualProcedure || "", actualStartAt: toDateTimeLocal(updated.actualStartAt), actualEndAt: toDateTimeLocal(updated.actualEndAt), operativeSurgeon: updated.operativeSurgeon || updated.surgeon, operativeAnaesthetist: updated.operativeAnaesthetist || updated.anaesthetist, findings: updated.findings || "", procedureNotes: updated.procedureNotes || "", complications: updated.complications || "", estimatedBloodLossMl: updated.estimatedBloodLossMl == null ? "" : String(updated.estimatedBloodLossMl), specimens: updated.specimens || "", operativeRemarks: updated.operativeRemarks || "" }));
    setPostoperative((current) => ({ ...current, recoveryStatus: updated.recoveryStatus || "", postoperativeInstructions: updated.postoperativeInstructions || "", followUpInstructions: updated.followUpInstructions || "", postoperativeComplications: updated.postoperativeComplications || "", postoperativeRemarks: updated.postoperativeRemarks || "" }));
  };

  const runCaseAction = async (action: () => Promise<{ otCase: OtCase }>, message: string) => {
    if (!selectedCase) return;
    const caseId = selectedCase.id;
    setSaving(true);
    try {
      const response = await action();
      if (selectedIdRef.current !== caseId) return;
      updateCase(response.otCase);
      success(message, `${response.otCase.procedureName} · ${response.otCase.status}`);
    } catch (requestError) {
      if (selectedIdRef.current === caseId) toastError(message, requestError instanceof Error ? requestError.message : "Please retry.");
    } finally {
      if (selectedIdRef.current === caseId) setSaving(false);
    }
  };

  const handleSchedule = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !schedule.patientId || !schedule.scheduledAt) {
      toastError("Required surgery details are missing.", "Select a patient and scheduled date/time.");
      return;
    }
    setSaving(true);
    try {
      const result = await createOtCase(token, {
        patientId: schedule.patientId,
        admissionId: admissions.find((admission) => admission.patientId === schedule.patientId)?.id,
        cpoeOrderId: schedule.procedureOrderId || undefined,
        procedureName: schedule.procedureName,
        surgeon: schedule.surgeon,
        anaesthetist: schedule.anaesthetist,
        anaesthesiaType: schedule.anaesthesiaType || undefined,
        theatreId: schedule.theatreId,
        scheduledAt: fromDateTimeLocal(schedule.scheduledAt),
        durationMinutes: Number(schedule.durationMinutes),
        priority: schedule.priority,
        clinicalIndication: schedule.clinicalIndication || undefined,
        clinicalInstructions: schedule.clinicalInstructions || undefined,
      });
      success("OT case scheduled.", `${result.otCase.procedureName} · ${result.otCase.theatreName}`);
      setSchedule((current) => ({ ...current, patientId: "", procedureOrderId: "", procedureName: "", surgeon: "", anaesthetist: "", anaesthesiaType: "", theatreId: "", scheduledAt: "", durationMinutes: "60", priority: "ROUTINE", clinicalIndication: "", clinicalInstructions: "" }));
      setPatientLabel("");
      setPatientQuery("");
      setPatientResults([]);
      setProcedureOrders((current) => current.filter((order) => order.id !== result.otCase.cpoeOrderId));
      await loadCases();
      selectCase(result.otCase.id);
    } catch (requestError) {
      toastError("Unable to schedule OT case.", requestError instanceof Error ? requestError.message : "Please check the case details.");
    } finally {
      setSaving(false);
    }
  };

  const searchExistingPatients = async () => {
    if (!token || patientQuery.trim().length < 2) return;
    try {
      const result = await fetchPatients(token, patientQuery.trim());
      setPatientResults(result.patients);
    } catch {
      setPatientResults([]);
      toastError("Patient search failed.", "Please retry the search.");
    }
  };

  const selectProcedureOrder = (id: string) => {
    const order = procedureOrders.find((item) => item.id === id);
    if (!order) {
      setSchedule((current) => ({ ...current, procedureOrderId: "" }));
      return;
    }
    setSchedule((current) => ({ ...current, procedureOrderId: order.id, patientId: order.patientId, procedureName: order.procedureName, priority: order.priority, clinicalInstructions: order.clinicalInstructions || order.notes || current.clinicalInstructions }));
    setPatientLabel(`${order.patientName} · ${order.uhid}`);
    setPatientQuery("");
    setPatientResults([]);
  };

  const saveChecklist = () => selectedCase && token && void runCaseAction(() => updateOtChecklist(token, selectedCase.id, checklist), "Checklist saved.");

  const saveOperative = (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedCase) return;
    void runCaseAction(() => updateOtOperativeDetails(token, selectedCase.id, {
      ...operative,
      actualStartAt: operative.actualStartAt ? fromDateTimeLocal(operative.actualStartAt) : "",
      actualEndAt: operative.actualEndAt ? fromDateTimeLocal(operative.actualEndAt) : "",
    }), "Operative details saved.");
  };

  const savePostoperative = (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedCase) return;
    void runCaseAction(() => updateOtPostoperative(token, selectedCase.id, postoperative), "Post-operative details saved.");
  };

  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedCase || !noteText.trim()) return;
    const caseId = selectedCase.id;
    setSaving(true);
    try {
      const result = await createOtCaseNote(token, caseId, noteType, noteText);
      if (selectedIdRef.current !== caseId) return;
      setNotes((current) => [result.note, ...current]);
      setNoteText("");
      success("OT note added.", "The note was added to the case history.");
    } catch (requestError) {
      if (selectedIdRef.current === caseId) toastError("Unable to add OT note.", requestError instanceof Error ? requestError.message : "Please retry.");
    } finally {
      if (selectedIdRef.current === caseId) setSaving(false);
    }
  };

  const createForm = async (template: FormTemplate) => {
    if (!token || !selectedCase) return;
    const caseId = selectedCase.id;
    try {
      const result = await createPatientForm(token, { patientId: selectedCase.patientId, templateId: template.id, fieldData: { otCaseId: selectedCase.id } });
      if (selectedIdRef.current !== caseId) return;
      router.push(`/forms?patientId=${encodeURIComponent(selectedCase.patientId)}&templateId=${encodeURIComponent(template.id)}&formId=${encodeURIComponent(result.form.id)}&category=${encodeURIComponent(result.form.category)}`);
    } catch (requestError) {
      if (selectedIdRef.current === caseId) toastError("Unable to create OT form.", requestError instanceof Error ? requestError.message : "Please retry.");
    }
  };

  const currentTheatreOptions = theatres.map((theatre) => ({ value: theatre.id, label: theatre.name }));
  const tableRows = useMemo(() => cases as Array<OtCase & Record<string, unknown>>, [cases]);

  return (
    <div className={styles.page}>
      <PageHeader title="Operation Theatre" subtitle="Surgery schedule, pre-operative preparation, operative notes, and recovery details." icon={<Activity size={18} />} accent="warning" actions={<Button variant="secondary" loading={loading} leftIcon={<RefreshCw size={15} />} onClick={() => { setCases([]); void loadCases(); }}>Refresh schedule</Button>} />

      <Card className={styles.scheduleCard}>
        <h2>Schedule surgery</h2>
        <form className={styles.formGrid} onSubmit={(event) => void handleSchedule(event)}>
          <div className={styles.fullWidth}>
            <Select label="CPOE Procedure order (optional)" value={schedule.procedureOrderId} onChange={(event) => selectProcedureOrder(event.target.value)} options={[{ value: "", label: "Schedule without a CPOE order" }, ...procedureOrders.map((order) => ({ value: order.id, label: `${order.orderNumber} · ${order.patientName} · ${order.procedureName}` }))]} />
          </div>
          <div className={styles.patientPicker}>
            <Input label="Existing patient" placeholder="Search by name, UHID, or mobile" value={patientQuery || patientLabel} onChange={(event) => { setPatientQuery(event.target.value); setPatientLabel(""); setSchedule((current) => ({ ...current, patientId: "", procedureOrderId: "" })); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchExistingPatients(); } }} />
            {patientQuery.trim().length >= 2 && <Button type="button" size="sm" variant="secondary" onClick={() => void searchExistingPatients()}>Search</Button>}
            {patientResults.length > 0 && <div className={styles.patientResults}>{patientResults.map((patient) => <button type="button" key={patient.id} onClick={() => { setSchedule((current) => ({ ...current, patientId: patient.id, procedureOrderId: "" })); setPatientLabel(`${patient.fullName} · ${patient.uhid}`); setPatientQuery(""); setPatientResults([]); }}><strong>{patient.fullName}</strong><span>{patient.uhid} · {patient.age} · {patient.gender}</span></button>)}</div>}
          </div>
          <Input label="Procedure / surgery" required value={schedule.procedureName} onChange={(event) => setSchedule((current) => ({ ...current, procedureName: event.target.value }))} />
          <Input label="Surgeon" required value={schedule.surgeon} onChange={(event) => setSchedule((current) => ({ ...current, surgeon: event.target.value }))} />
          <Input label="Anaesthetist" required value={schedule.anaesthetist} onChange={(event) => setSchedule((current) => ({ ...current, anaesthetist: event.target.value }))} />
          <Input label="Anaesthesia type" value={schedule.anaesthesiaType} onChange={(event) => setSchedule((current) => ({ ...current, anaesthesiaType: event.target.value }))} placeholder="e.g. General" />
          <Select label="Theatre" required value={schedule.theatreId} onChange={(event) => setSchedule((current) => ({ ...current, theatreId: event.target.value }))} options={currentTheatreOptions} />
          <Input type="datetime-local" label="Scheduled date / time" required value={schedule.scheduledAt} onChange={(event) => setSchedule((current) => ({ ...current, scheduledAt: event.target.value }))} />
          <Input type="number" min="15" max="1440" label="Estimated duration (minutes)" required value={schedule.durationMinutes} onChange={(event) => setSchedule((current) => ({ ...current, durationMinutes: event.target.value }))} />
          <Select label="Priority" value={schedule.priority} onChange={(event) => setSchedule((current) => ({ ...current, priority: event.target.value as OtPriority }))} options={[{ value: "STAT", label: "STAT" }, { value: "URGENT", label: "URGENT" }, { value: "ROUTINE", label: "ROUTINE" }]} />
          <Textarea label="Clinical indication" value={schedule.clinicalIndication} onChange={(event) => setSchedule((current) => ({ ...current, clinicalIndication: event.target.value }))} rows={2} />
          <Textarea label="Clinical instructions" value={schedule.clinicalInstructions} onChange={(event) => setSchedule((current) => ({ ...current, clinicalInstructions: event.target.value }))} rows={2} />
          <div className={styles.fullWidth}><Button type="submit" loading={saving}>Schedule case</Button></div>
        </form>
      </Card>

      <Card noPadding>
        <div className={styles.toolbar}>
          <div className={styles.search}><Input label="Search schedule" placeholder="Patient, UHID, procedure, surgeon, theatre" value={search} onChange={(event) => setSearch(event.target.value)} leftIcon={<Search size={15} />} /></div>
          <div className={styles.filters}>
            <Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | OtStatus)} options={STATUS_FILTERS} />
            <Input type="date" label="Scheduled date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
          </div>
        </div>
      </Card>

      <DataTable
        columns={[
          { key: "patientName", header: "Patient", render: (_, row) => <><strong>{row.patientName}</strong><br /><span className={styles.muted}>{row.uhid} · {row.age} · {row.sex}</span></> },
          { key: "procedureName", header: "Procedure", render: (_, row) => <><strong>{row.procedureName}</strong><br /><span className={styles.muted}>{row.surgeon}</span></> },
          { key: "theatreName", header: "Theatre" },
          { key: "scheduledAt", header: "Scheduled", render: (_, row) => formatDate(row.scheduledAt) },
          { key: "priority", header: "Priority", render: (_, row) => <Badge variant={priorityVariant(row.priority)} size="sm">{row.priority}</Badge> },
          { key: "status", header: "Status", render: (_, row) => <Badge variant={statusVariant(row.status)} size="sm">{row.status}</Badge> },
          { key: "action", header: "Action", render: (_, row) => <Button size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); selectCase(row.id); }}>Open</Button> },
        ]}
        data={tableRows}
        rowKey={(row) => row.id}
        onRowClick={(row) => selectCase(row.id)}
        loading={loading}
        emptyTitle="No OT cases found"
        emptyDescription="Schedule a case above or link an existing CPOE Procedure order."
      />

      {selectedId && (detailLoading || !selectedCase || selectedCase.id !== selectedId) ? <Card><p className={styles.muted}>Loading OT case…</p></Card> : null}
      {selectedCase && selectedCase.id === selectedId && !detailLoading && <section className={styles.caseWorkspace} aria-label="Selected OT case">
        <Card className={styles.caseSummary}>
          <div className={styles.caseHeading}><div><h2>{selectedCase.patientName}</h2><p>{selectedCase.uhid} · {selectedCase.age} · {selectedCase.sex}</p></div><Badge variant={statusVariant(selectedCase.status)} size="sm">{selectedCase.status}</Badge></div>
          <div className={styles.facts}>
            <Fact label="Procedure" value={selectedCase.procedureName} /><Fact label="Surgeon" value={selectedCase.surgeon} /><Fact label="Anaesthetist" value={selectedCase.anaesthetist} /><Fact label="Anaesthesia" value={selectedCase.anaesthesiaType} />
            <Fact label="Theatre" value={selectedCase.theatreName} /><Fact label="Scheduled" value={formatDate(selectedCase.scheduledAt)} /><Fact label="Priority" value={selectedCase.priority} /><Fact label="CPOE reference" value={selectedCase.cpoeOrderNumber} />
            <Fact label="Admission / bed" value={selectedCase.admissionNumber ? `${selectedCase.admissionNumber} · ${selectedCase.bedNumber || "Bed —"} · ${selectedCase.ward || ""}` : "Not admitted to IPD"} />
            <Fact label="Attending doctor" value={selectedCase.attendingDoctor} /><Fact label="Clinical indication" value={selectedCase.clinicalIndication || selectedCase.chiefComplaint} /><Fact label="Allergies" value="No allergy field is available on the patient record." />
          </div>
          {selectedCase.clinicalInstructions && <p className={styles.instructions}><strong>Instructions:</strong> {selectedCase.clinicalInstructions}</p>}
          <div className={styles.actionRow}>
            {selectedCase.status === "SCHEDULED" && <Button disabled={saving} onClick={() => void runCaseAction(() => updateOtCaseStatus(token!, selectedCase.id, { status: "PREPARATION" }), "Preparation started.")}>Start preparation</Button>}
            {selectedCase.status === "PREPARATION" && <Button disabled={saving} onClick={() => void runCaseAction(() => updateOtCaseStatus(token!, selectedCase.id, { status: "IN_PROGRESS" }), "Surgery started.")}>Start surgery</Button>}
            {selectedCase.status === "IN_PROGRESS" && <Button variant="success" disabled={saving} onClick={() => void runCaseAction(() => updateOtCaseStatus(token!, selectedCase.id, { status: "COMPLETED" }), "Surgery completed.")}>Complete surgery</Button>}
            {(selectedCase.status === "SCHEDULED" || selectedCase.status === "PREPARATION") && <Button variant="secondary" disabled={saving} onClick={() => void runCaseAction(() => updateOtCaseStatus(token!, selectedCase.id, { status: "POSTPONED" }), "Case postponed.")}>Postpone</Button>}
            {(selectedCase.status === "SCHEDULED" || selectedCase.status === "PREPARATION" || selectedCase.status === "POSTPONED") && <Button variant="ghost" disabled={saving} onClick={() => void runCaseAction(() => updateOtCaseStatus(token!, selectedCase.id, { status: "CANCELLED" }), "Case cancelled.")}>Cancel case</Button>}
          </div>
          {selectedCase.status === "POSTPONED" && <div className={styles.reschedule}><Input type="datetime-local" label="New scheduled time" value={rescheduleAt} onChange={(event) => setRescheduleAt(event.target.value)} /><Select label="Theatre" value={rescheduleTheatre || selectedCase.theatreId} onChange={(event) => setRescheduleTheatre(event.target.value)} options={currentTheatreOptions} /><Button disabled={saving || !rescheduleAt} onClick={() => void runCaseAction(() => updateOtCaseStatus(token!, selectedCase.id, { status: "SCHEDULED", scheduledAt: fromDateTimeLocal(rescheduleAt), theatreId: rescheduleTheatre || selectedCase.theatreId }), "Case rescheduled.")}>Reschedule</Button></div>}
        </Card>

        <div className={styles.tabs} role="tablist" aria-label="OT case sections">
          {([{ id: "checklist", label: "Pre-op checklist", icon: <ClipboardCheck size={15} /> }, { id: "notes", label: "Case notes", icon: <FileText size={15} /> }, { id: "operative", label: "Operative details", icon: <Activity size={15} /> }, { id: "postoperative", label: "Post-operative", icon: <ClipboardList size={15} /> }, { id: "forms", label: "OT forms", icon: <FileText size={15} /> }] as { id: OtTab; label: string; icon: React.ReactNode }[]).map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? styles.activeTab : styles.tab} onClick={() => setTab(item.id)}>{item.icon}<span>{item.label}</span></button>)}
        </div>

        {tab === "checklist" && <Card className={styles.section}><h2>Pre-operative checklist</h2><div className={styles.checklist}>{CHECKLIST.map((item) => <label key={item.key}><input type="checkbox" checked={Boolean(checklist[item.key])} disabled={selectedCase.status !== "SCHEDULED" && selectedCase.status !== "PREPARATION"} onChange={(event) => setChecklist((current) => ({ ...current, [item.key]: event.target.checked }))} /><span>{item.label}</span></label>)}</div><Button disabled={saving || (selectedCase.status !== "SCHEDULED" && selectedCase.status !== "PREPARATION")} onClick={saveChecklist}>Save checklist</Button></Card>}

        {tab === "notes" && <Card className={styles.section}><h2>OT case notes</h2><form className={styles.formGrid} onSubmit={(event) => void addNote(event)}><Select label="Note type" value={noteType} onChange={(event) => setNoteType(event.target.value as OtNoteType)} options={NOTE_TYPES} /><div className={styles.fullWidth}><Textarea label="Note" required value={noteText} onChange={(event) => setNoteText(event.target.value)} rows={4} /></div><div className={styles.fullWidth}><Button type="submit" loading={saving}>Add note</Button></div></form><div className={styles.historyList}>{notes.length ? notes.map((note) => <div key={note.id} className={styles.historyEntry}><div className={styles.entryHeader}><Badge variant="info" size="sm">{note.noteType.replaceAll("_", " ")}</Badge><span className={styles.muted}>{note.authorName || "Staff"} · {formatDate(note.createdAt)}</span></div><p>{note.noteText}</p></div>) : <p className={styles.muted}>No notes recorded.</p>}</div></Card>}

        {tab === "operative" && <Card className={styles.section}><h2>Operative details</h2>{selectedCase.status !== "IN_PROGRESS" && <p className={styles.muted}>Operative details are editable while the case is IN_PROGRESS.</p>}<form className={styles.formGrid} onSubmit={(event) => saveOperative(event)}><Input label="Actual procedure performed" value={operative.actualProcedure} disabled={selectedCase.status !== "IN_PROGRESS"} onChange={(event) => setOperative((current) => ({ ...current, actualProcedure: event.target.value }))} /><Input label="Operative surgeon" value={operative.operativeSurgeon} disabled={selectedCase.status !== "IN_PROGRESS"} onChange={(event) => setOperative((current) => ({ ...current, operativeSurgeon: event.target.value }))} /><Input label="Operative anaesthetist" value={operative.operativeAnaesthetist} disabled={selectedCase.status !== "IN_PROGRESS"} onChange={(event) => setOperative((current) => ({ ...current, operativeAnaesthetist: event.target.value }))} /><Input type="datetime-local" label="Actual start" value={operative.actualStartAt} disabled={selectedCase.status !== "IN_PROGRESS"} onChange={(event) => setOperative((current) => ({ ...current, actualStartAt: event.target.value }))} /><Input type="datetime-local" label="Actual end" value={operative.actualEndAt} disabled={selectedCase.status !== "IN_PROGRESS"} onChange={(event) => setOperative((current) => ({ ...current, actualEndAt: event.target.value }))} /><Input type="number" min="0" step="0.1" label="Estimated blood loss (mL)" value={operative.estimatedBloodLossMl} disabled={selectedCase.status !== "IN_PROGRESS"} onChange={(event) => setOperative((current) => ({ ...current, estimatedBloodLossMl: event.target.value }))} /><Textarea label="Findings" value={operative.findings} disabled={selectedCase.status !== "IN_PROGRESS"} onChange={(event) => setOperative((current) => ({ ...current, findings: event.target.value }))} rows={3} /><Textarea label="Procedure notes" value={operative.procedureNotes} disabled={selectedCase.status !== "IN_PROGRESS"} onChange={(event) => setOperative((current) => ({ ...current, procedureNotes: event.target.value }))} rows={3} /><Textarea label="Complications" value={operative.complications} disabled={selectedCase.status !== "IN_PROGRESS"} onChange={(event) => setOperative((current) => ({ ...current, complications: event.target.value }))} rows={3} /><Textarea label="Specimens" value={operative.specimens} disabled={selectedCase.status !== "IN_PROGRESS"} onChange={(event) => setOperative((current) => ({ ...current, specimens: event.target.value }))} rows={2} /><div className={styles.fullWidth}><Textarea label="Additional remarks" value={operative.operativeRemarks} disabled={selectedCase.status !== "IN_PROGRESS"} onChange={(event) => setOperative((current) => ({ ...current, operativeRemarks: event.target.value }))} rows={2} /></div><div className={styles.fullWidth}><Button type="submit" loading={saving} disabled={selectedCase.status !== "IN_PROGRESS"}>Save operative details</Button></div></form></Card>}

        {tab === "postoperative" && <Card className={styles.section}><h2>Post-operative information</h2>{selectedCase.status !== "COMPLETED" && <p className={styles.muted}>Post-operative details can be saved after the case is completed.</p>}<form className={styles.formGrid} onSubmit={(event) => savePostoperative(event)}><Input label="Recovery status" value={postoperative.recoveryStatus} disabled={selectedCase.status !== "COMPLETED"} onChange={(event) => setPostoperative((current) => ({ ...current, recoveryStatus: event.target.value }))} /><Textarea label="Post-operative instructions" value={postoperative.postoperativeInstructions} disabled={selectedCase.status !== "COMPLETED"} onChange={(event) => setPostoperative((current) => ({ ...current, postoperativeInstructions: event.target.value }))} rows={3} /><Textarea label="Follow-up instructions" value={postoperative.followUpInstructions} disabled={selectedCase.status !== "COMPLETED"} onChange={(event) => setPostoperative((current) => ({ ...current, followUpInstructions: event.target.value }))} rows={3} /><Textarea label="Complications" value={postoperative.postoperativeComplications} disabled={selectedCase.status !== "COMPLETED"} onChange={(event) => setPostoperative((current) => ({ ...current, postoperativeComplications: event.target.value }))} rows={3} /><div className={styles.fullWidth}><Textarea label="Additional remarks" value={postoperative.postoperativeRemarks} disabled={selectedCase.status !== "COMPLETED"} onChange={(event) => setPostoperative((current) => ({ ...current, postoperativeRemarks: event.target.value }))} rows={2} /></div><div className={styles.fullWidth}><Button type="submit" loading={saving} disabled={selectedCase.status !== "COMPLETED"}>Save post-operative information</Button></div></form></Card>}

        {tab === "forms" && <Card className={styles.section}><h2>OT forms</h2><p className={styles.muted}>Uses existing Operation Theatre / OT / Surgical templates and patient-specific form records.</p>{templates.length ? <div className={styles.historyList}>{templates.map((template) => <div className={styles.historyEntry} key={template.id}><div className={styles.entryHeader}><strong>{template.name}</strong><Button size="sm" onClick={() => void createForm(template)}>Create form</Button></div><span className={styles.muted}>{template.category}{template.subcategory ? ` · ${template.subcategory}` : ""}</span></div>)}</div> : <p className={styles.muted}>No OT-related templates are currently available.</p>}<h3>Saved forms for this patient</h3>{patientForms.length ? <div className={styles.historyList}>{patientForms.map((form) => <div className={styles.historyEntry} key={form.id}><div className={styles.entryHeader}><strong>{form.templateName}</strong><Button size="sm" variant="secondary" onClick={() => router.push(`/forms?patientId=${encodeURIComponent(form.patientId)}&templateId=${encodeURIComponent(form.templateId)}&formId=${encodeURIComponent(form.id)}&category=${encodeURIComponent(form.category)}`)}>Open</Button></div><span className={styles.muted}>{form.status} · Updated {formatDate(form.updatedAt)}</span></div>)}</div> : <p className={styles.muted}>No OT forms saved for this patient.</p>}</Card>}
      </section>}
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return <div className={styles.fact}><span>{label}</span><strong>{value || "—"}</strong></div>;
}
