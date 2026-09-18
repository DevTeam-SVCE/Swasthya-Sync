"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { fetchPatients } from "@/lib/patients";
import { createAppointment, fetchAvailability } from "@/lib/appointments";
import { fetchDoctors } from "@/lib/patients";
import { DEPARTMENTS } from "@/types/patients";
import type { Doctor, Patient } from "@/types/patients";
import type { AvailabilitySlot } from "@/types/appointments";
import styles from "./Appointment.module.css";

const steps = ["Department & Doctor", "Date & Slot", "Patient", "Confirm"];

export function AppointmentWizard({ onCreated }: { onCreated: (id: string) => void }) {
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [step, setStep] = useState(0);
  const [department, setDepartment] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [slotLoading, setSlotLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetchDoctors(token).then((response) => setDoctors(response.doctors)).catch(() => setError("Unable to load doctors."));
  }, [token]);

  const availableDoctors = doctors.filter((doctor) => !department || doctor.department === department);

  const loadSlots = async () => {
    if (!token || !doctorId || !date) return;
    setSlotLoading(true); setError(""); setSlot("");
    try { const response = await fetchAvailability(token, doctorId, date); setSlots(response.slots); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to load available slots."); }
    finally { setSlotLoading(false); }
  };

  const searchPatients = async () => {
    if (!token || patientSearch.trim().length < 2) return;
    setLoading(true); setError("");
    try { const response = await fetchPatients(token, patientSearch.trim()); setPatients(response.patients); }
    catch { setError("Unable to search patients."); }
    finally { setLoading(false); }
  };

  const continueStep = () => {
    setError("");
    if (step === 0 && (!department || !doctorId)) { setError("Select a department and doctor."); return; }
    if (step === 1 && (!date || !slot)) { setError("Select a date and an available slot."); return; }
    if (step === 2 && !patient) { setError("Select an existing patient."); return; }
    setStep((current) => Math.min(current + 1, 3));
  };

  const submit = async () => {
    if (!token || !patient) return;
    setLoading(true); setError("");
    try {
      const response = await createAppointment(token, { patientId: patient.id, doctorId, department, appointmentDate: date, slotTime: slot });
      success("Appointment scheduled.", response.appointment.appointmentNumber);
      onCreated(response.appointment.id);
    } catch (requestError) {
      toastError("Unable to schedule appointment.", requestError instanceof Error ? requestError.message : "The selected slot may no longer be available.");
      setError(requestError instanceof Error ? requestError.message : "The selected slot may no longer be available.");
    } finally { setLoading(false); }
  };

  const doctor = doctors.find((item) => item.id === doctorId);
  const minDate = new Date().toISOString().slice(0, 10);

  return <Card className={styles.card} noPadding>
    <div className={styles.stepper} aria-label="Appointment booking progress">{steps.map((name, index) => <div key={name} className={[styles.step, index === step ? styles["step--active"] : "", index < step ? styles["step--complete"] : ""].filter(Boolean).join(" ")}><span className={styles.stepNumber}>{index < step ? "✓" : index + 1}</span><span>{name}</span></div>)}</div>
    <div className={styles.formBody}>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {step === 0 && <><h2 className={styles.sectionTitle}>Select Department & Doctor</h2><div className={styles.formGrid}><Select label="Department" placeholder="Select department" value={department} onChange={(event) => { setDepartment(event.target.value); setDoctorId(""); }} options={DEPARTMENTS.map((value) => ({ value, label: value }))} /><Select label="Doctor" placeholder="Select doctor" value={doctorId} onChange={(event) => setDoctorId(event.target.value)} options={availableDoctors.map((item) => ({ value: item.id, label: `${item.name} · ${item.department}` }))} /></div></>}
      {step === 1 && <><h2 className={styles.sectionTitle}>Check Slot Availability</h2><div className={styles.formGrid}><Input label="Appointment date" type="date" min={minDate} value={date} onChange={(event) => { setDate(event.target.value); setSlot(""); }} /><div><Button type="button" variant="secondary" disabled={!doctorId || !date || slotLoading} onClick={() => void loadSlots()}>{slotLoading ? "Checking slots…" : "Check available slots"}</Button></div></div>{slots.length > 0 && <div className={styles.slotGrid}>{slots.map((item) => <button type="button" key={item.time} disabled={!item.available} className={[styles.slot, slot === item.time ? styles["slot--selected"] : ""].filter(Boolean).join(" ")} onClick={() => setSlot(item.time)}>{item.time}</button>)}</div>}{slots.length === 0 && !slotLoading && <p className={styles.muted}>Choose a date and check availability to see slots.</p>}</>}
      {step === 2 && <><h2 className={styles.sectionTitle}>Select Existing Patient</h2><div className={styles.patientSearch}><Input label="Search patient" placeholder="Name, UHID, or mobile" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} /><Button type="button" variant="secondary" onClick={() => void searchPatients()} loading={loading}>Search</Button></div>{patients.length > 0 && <div className={styles.patientResults}>{patients.map((item) => <button type="button" className={styles.patientResult} key={item.id} onClick={() => { setPatient(item); setPatients([]); }}><span><strong>{item.fullName}</strong><br /><span className={styles.muted}>{item.uhid} · {item.age}y · {item.gender}</span></span><span className={styles.muted}>{item.mobile}</span></button>)}</div>}{patient && <div className={styles.selectedPatient}><span><small className={styles.detailLabel}>Patient</small><strong>{patient.fullName}</strong></span><span><small className={styles.detailLabel}>UHID</small><strong>{patient.uhid}</strong></span><span><small className={styles.detailLabel}>Age / Gender</small><strong>{patient.age}y · {patient.gender}</strong></span><span><small className={styles.detailLabel}>Mobile</small><strong>{patient.mobile}</strong></span></div>}</>}
      {step === 3 && <><h2 className={styles.sectionTitle}>Confirm Booking</h2><div className={styles.detailGrid}><Detail label="Department" value={department} /><Detail label="Doctor" value={doctor?.name ?? ""} /><Detail label="Date" value={date} /><Detail label="Time" value={slot} /><Detail label="Patient" value={patient?.fullName ?? ""} /><Detail label="UHID" value={patient?.uhid ?? ""} /></div><p className={styles.opdReady}>The appointment will be created with status SCHEDULED. Check-in will move it to CONFIRMED.</p></>}
    </div>
    <div className={styles.formFooter}><Button type="button" variant="secondary" disabled={step === 0} leftIcon={<ArrowLeft size={15} />} onClick={() => setStep((current) => Math.max(current - 1, 0))}>Back</Button>{step < 3 ? <Button type="button" rightIcon={<ArrowRight size={15} />} onClick={continueStep}>Continue</Button> : <Button type="button" loading={loading} leftIcon={<CheckCircle2 size={15} />} onClick={() => void submit()}>Confirm booking</Button>}</div>
  </Card>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className={styles.detailItem}><span className={styles.detailLabel}>{label}</span><span className={styles.detailValue}>{value}</span></div>; }
