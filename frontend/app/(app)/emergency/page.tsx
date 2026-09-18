"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock3, RefreshCw, Search, Stethoscope } from "lucide-react";
import { Badge, TriageBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { fetchPatients } from "@/lib/patients";
import type { Patient } from "@/types/patients";
import {
  createEmergencyEncounter,
  fetchEmergencyQueue,
  updateEmergencyEncounter,
  type EmergencyEncounter,
  type TriageLevel,
} from "@/lib/emergency";
import styles from "./page.module.css";

const TRIAGE_OPTIONS: { value: TriageLevel; label: string }[] = [
  { value: "Red", label: "Red - Critical" },
  { value: "Orange", label: "Orange - Urgent" },
  { value: "Yellow", label: "Yellow - Semi-Urgent" },
  { value: "Green", label: "Green - Non-Urgent" },
];

const STATUS_OPTIONS = [
  { value: "Waiting", label: "Waiting" },
  { value: "In Treatment", label: "In Treatment" },
  { value: "Transferred", label: "Transferred" },
  { value: "Discharged", label: "Discharged" },
] as const;

export default function EmergencyPage() {
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [queue, setQueue] = useState<EmergencyEncounter[]>([]);
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    triageLevel: "Red" as TriageLevel,
    status: "Waiting" as EmergencyEncounter["status"],
    complaint: "",
    notes: "",
  });

  const queueSummary = useMemo(() => {
    const counts = { Red: 0, Orange: 0, Yellow: 0, Green: 0 };
    for (const item of queue) counts[item.triageLevel] += 1;
    return counts;
  }, [queue]);

  const loadQueue = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetchEmergencyQueue(token);
      setQueue(response.encounters);
    } catch {
      setError("Unable to load emergency queue.");
    } finally {
      setLoading(false);
    }
  };

  const searchPatientsByName = async (value: string) => {
    if (!token || value.trim().length < 2) {
      setPatients([]);
      return;
    }
    setSearchingPatients(true);
    try {
      const response = await fetchPatients(token, value.trim());
      setPatients(response.patients.filter((patient) => patient.admissionType !== "Emergency" || patient.id !== selectedPatient?.id));
    } catch {
      setPatients([]);
    } finally {
      setSearchingPatients(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void loadQueue();
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !selectedPatient) {
      toastError("Select a patient before triaging.", "Use the patient lookup to choose the emergency case.");
      return;
    }
    if (!form.complaint.trim()) {
      toastError("Complaint is required.", "Add a concise presenting complaint before saving.");
      return;
    }

    try {
      setSubmitting(true);
      await createEmergencyEncounter(token, {
        patientId: selectedPatient.id,
        triageLevel: form.triageLevel,
        status: form.status,
        complaint: form.complaint,
        notes: form.notes || undefined,
      });
      success("Emergency encounter created.", `${selectedPatient.fullName} has been added to the queue.`);
      setForm({ triageLevel: "Red", status: "Waiting", complaint: "", notes: "" });
      setSelectedPatient(null);
      setSearch("");
      setPatients([]);
      await loadQueue();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to create emergency encounter.";
      toastError("Unable to save triage case.", message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (encounter: EmergencyEncounter, status: EmergencyEncounter["status"]) => {
    if (!token) return;
    try {
      await updateEmergencyEncounter(token, encounter.id, { status });
      success("Queue updated.", `${encounter.patientName} moved to ${status}.`);
      await loadQueue();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to update encounter.";
      toastError("Unable to update status.", message);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Emergency Department</h1>
          <p className={styles.subtitle}>Triage, queue priority, and emergency clinical handoff.</p>
        </div>
        <Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => void loadQueue()}>
          Refresh queue
        </Button>
      </div>

      <div className={styles.kpis}>
        <Card className={styles.kpi}>
          <span className={styles.kpiLabel}>Red</span>
          <div className={styles.kpiValue}>{queueSummary.Red}</div>
        </Card>
        <Card className={styles.kpi}>
          <span className={styles.kpiLabel}>Orange</span>
          <div className={styles.kpiValue}>{queueSummary.Orange}</div>
        </Card>
        <Card className={styles.kpi}>
          <span className={styles.kpiLabel}>Yellow</span>
          <div className={styles.kpiValue}>{queueSummary.Yellow}</div>
        </Card>
        <Card className={styles.kpi}>
          <span className={styles.kpiLabel}>Green</span>
          <div className={styles.kpiValue}>{queueSummary.Green}</div>
        </Card>
      </div>

      <div className={styles.grid}>
        <Card className={styles.panel} noPadding>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.sectionTitle}>New triage entry</h2>
              <p className={styles.sectionSubtitle}>Register a patient and assign priority.</p>
            </div>
            <Badge variant="warning" size="sm" dot>
              Active queue
            </Badge>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.searchWrap}>
              <Input
                label="Search patient"
                placeholder="Search by name, UHID, or mobile"
                value={search}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setSearch(nextValue);
                  void searchPatientsByName(nextValue);
                }}
                leftIcon={<Search size={15} />}
              />
              {searchingPatients && <p className={styles.muted}>Searching patients…</p>}
              {patients.length > 0 && (
                <div className={styles.searchResults}>
                  {patients.map((patient) => (
                    <button
                      key={patient.id}
                      type="button"
                      className={styles.resultItem}
                      onClick={() => {
                        setSelectedPatient(patient);
                        setSearch("");
                        setPatients([]);
                      }}
                    >
                      <span>
                        <strong>{patient.fullName}</strong>
                        <small>{patient.uhid}</small>
                      </span>
                      <span className={styles.muted}>{patient.department}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedPatient ? (
              <div className={styles.selectedPatient}>
                <div>
                  <strong>{selectedPatient.fullName}</strong>
                  <div className={styles.muted}>{selectedPatient.uhid} · {selectedPatient.age} yrs · {selectedPatient.gender}</div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedPatient(null)}>
                  Change patient
                </Button>
              </div>
            ) : (
              <div className={styles.emptyState}>No patient selected.</div>
            )}

            <div className={styles.formGrid}>
              <Select
                label="Triage level"
                value={form.triageLevel}
                onChange={(event) => setForm((current) => ({ ...current, triageLevel: event.target.value as TriageLevel }))}
                options={TRIAGE_OPTIONS}
              />
              <Select
                label="Current status"
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as EmergencyEncounter["status"] }))}
                options={STATUS_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              />
            </div>

            <Textarea
              label="Presenting complaint"
              value={form.complaint}
              onChange={(event) => setForm((current) => ({ ...current, complaint: event.target.value }))}
              placeholder="Describe the patient complaint, symptoms, and urgency."
              rows={4}
              required
            />
            <Textarea
              label="Clinical notes"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Add triage notes, vitals, observation summary, or referral info."
              rows={3}
            />

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actionsRow}>
              <Button type="submit" loading={submitting} leftIcon={<Stethoscope size={15} />}>
                Save triage
              </Button>
            </div>
          </form>
        </Card>

        <Card className={styles.panel} noPadding>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Emergency queue</h2>
              <p className={styles.sectionSubtitle}>Sorted by urgency and arrival time.</p>
            </div>
            <Badge variant="primary" size="sm">{queue.length} cases</Badge>
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading queue…</div>
          ) : queue.length === 0 ? (
            <div className={styles.emptyState}>No active emergency cases.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Triage</th>
                    <th>Status</th>
                    <th>Complaint</th>
                    <th>Time</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <Link className={styles.link} href={`/patients/${entry.patientId}`}>
                          {entry.patientName}
                        </Link>
                        <div className={styles.meta}>{entry.uhid} · {entry.age} yrs · {entry.gender}</div>
                      </td>
                      <td><TriageBadge level={entry.triageLevel} /></td>
                      <td>
                        <Badge variant={entry.status === "Waiting" ? "warning" : entry.status === "In Treatment" ? "primary" : entry.status === "Transferred" ? "info" : "success"} size="sm">
                          {entry.status}
                        </Badge>
                      </td>
                      <td>
                        <div className={styles.complaint}>{entry.complaint}</div>
                        {entry.notes && <div className={styles.notes}>{entry.notes}</div>}
                      </td>
                      <td>
                        <div className={styles.meta}><Clock3 size={12} /> {new Date(entry.arrivalTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
                      </td>
                      <td>
                        <div className={styles.actionStack}>
                          <Button type="button" variant="secondary" size="sm" onClick={() => void updateStatus(entry, "In Treatment")}>
                            Treating
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => void updateStatus(entry, "Transferred")}>
                            Transfer
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => void updateStatus(entry, "Discharged")}>
                            Discharge
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className={styles.footerNotice}>
        <AlertTriangle size={15} />
        <span>Use red and orange cases as the highest priority in the queue. Ensure each patient is linked to an existing hospital record.</span>
      </div>
    </div>
  );
}
