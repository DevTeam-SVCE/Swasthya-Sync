"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { fetchPatients } from "@/lib/patients";
import { createAdmission } from "@/lib/ipd";
import type { Patient } from "@/types/patients";
import type { Bed, IPDAdmission } from "@/types/ipd";
import styles from "./IPD.module.css";

export function AdmissionPanel({ beds, onCreated }: { beds: Bed[]; onCreated: (admission: IPDAdmission) => void }) {
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [bedId, setBedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const availableBeds = beds.filter((bed) => bed.status === "AVAILABLE");

  const findPatients = async () => {
    if (!token || search.trim().length < 2) return;
    setLoading(true); setError("");
    try { const response = await fetchPatients(token, search); setPatients(response.patients); }
    catch { setError("Unable to search patients."); }
    finally { setLoading(false); }
  };

  const submit = async () => {
    if (!token || !patient || !bedId) { setError("Select an existing patient and an available bed."); return; }
    setLoading(true); setError("");
    try { const response = await createAdmission(token, patient.id, bedId); success("Patient admitted to IPD.", response.admission.admissionNumber); setPatient(null); setSearch(""); setBedId(""); setPatients([]); onCreated(response.admission); }
    catch (requestError) { const message = requestError instanceof Error ? requestError.message : "Unable to admit patient."; setError(message); toastError("Unable to admit patient.", message); }
    finally { setLoading(false); }
  };

  return <div className={styles.card}><h2 className={styles.sectionTitle}>Admit Patient</h2><div className={styles.formGrid}><div><Input label="Search existing patient" placeholder="Name, UHID, or mobile" value={search} onChange={(event) => setSearch(event.target.value)} /><Button type="button" variant="secondary" loading={loading} onClick={() => void findPatients()}>Search patient</Button>{patients.length > 0 && <div className={styles.patientResults}>{patients.map((item) => <button type="button" key={item.id} className={styles.patientResult} onClick={() => { setPatient(item); setPatients([]); }}><strong>{item.fullName}</strong><span>{item.uhid}</span></button>)}</div>}{patient && <p className={styles.selectedPatient}><strong>{patient.fullName}</strong><br />{patient.uhid} · {patient.age}y · {patient.gender}</p>}</div><Select label="Available bed" placeholder={availableBeds.length ? "Select a bed" : "No beds available"} value={bedId} onChange={(event) => setBedId(event.target.value)} options={availableBeds.map((bed) => ({ value: bed.id, label: `${bed.bedNumber} · ${bed.ward}${bed.room ? ` · ${bed.room}` : ""}` }))} /></div>{error && <div className={styles.error}>{error}</div>}<div style={{ padding: "0 var(--space-5) var(--space-5)" }}><Button type="button" loading={loading} onClick={() => void submit()}>Admit to selected bed</Button></div></div>;
}
