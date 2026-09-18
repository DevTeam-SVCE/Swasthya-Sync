"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarPlus, Eye, RefreshCw, Search } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/context/AuthContext";
import { fetchDoctors } from "@/lib/patients";
import { fetchAppointments } from "@/lib/appointments";
import { APPOINTMENT_STATUSES } from "@/types/appointments";
import { DEPARTMENTS } from "@/types/patients";
import type { Appointment } from "@/types/appointments";
import type { Doctor } from "@/types/patients";
import styles from "@/components/appointments/Appointment.module.css";

export default function AppointmentsPage() {
  const { token } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [filters, setFilters] = useState<{
    q: string;
    date: string;
    department: string;
    doctorId: string;
    status: "" | typeof APPOINTMENT_STATUSES[number];
  }>({ q: "", date: "", department: "", doctorId: "", status: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (currentFilters = filters) => {
    if (!token) return;
    setLoading(true); setError("");
    try { const response = await fetchAppointments(token, currentFilters); setAppointments(response.appointments); }
    catch { setError("Unable to load appointments. Check that the backend is running."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([fetchAppointments(token), fetchDoctors(token)]).then(([appointmentResponse, doctorResponse]) => { if (active) { setAppointments(appointmentResponse.appointments); setDoctors(doctorResponse.doctors); } }).catch(() => { if (active) setError("Unable to load appointments."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  return <div className={styles.page}><div className={styles.header}><div><h1 className={styles.title}>Appointments</h1><p className={styles.subtitle}>Book and manage outpatient appointments across departments.</p></div><div className={styles.actions}><Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => void load()}>Refresh</Button><Link href="/appointments/new"><Button leftIcon={<CalendarPlus size={15} />}>New appointment</Button></Link></div></div>
    <Card className={styles.card} noPadding><form className={styles.toolbar} onSubmit={(event) => { event.preventDefault(); void load(); }}><Input label="Search" placeholder="Patient, UHID, or appointment ID" value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} leftIcon={<Search size={15} />} /><Input label="Date" type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} /><Select label="Department" placeholder="All departments" value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value, doctorId: "" }))} options={DEPARTMENTS.map((value) => ({ value, label: value }))} /><Select label="Doctor" placeholder="All doctors" value={filters.doctorId} onChange={(event) => setFilters((current) => ({ ...current, doctorId: event.target.value }))} options={doctors.filter((doctor) => !filters.department || doctor.department === filters.department).map((doctor) => ({ value: doctor.id, label: doctor.name }))} /><Select label="Status" placeholder="All statuses" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as typeof APPOINTMENT_STATUSES[number] }))} options={APPOINTMENT_STATUSES.map((value) => ({ value, label: value }))} /></form></Card>
    {error && <div className={styles.error} role="alert">{error}</div>}
    <Card className={styles.card} noPadding>{loading ? <div className={styles.empty}>Loading appointments…</div> : appointments.length === 0 ? <div className={styles.empty}>No appointments found.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Appointment</th><th>Date / Time</th><th>Patient</th><th>Department</th><th>Doctor</th><th>Status</th><th>Action</th></tr></thead><tbody>{appointments.map((appointment) => <tr key={appointment.id}><td><Link className={styles.link} href={`/appointments/${appointment.id}`}>{appointment.appointmentNumber}</Link></td><td className={styles.muted}>{appointment.appointmentDate} · {appointment.slotTime}</td><td><Link className={styles.link} href={`/patients/${appointment.patientId}`}>{appointment.patientName}</Link><br /><span className={styles.muted}>{appointment.uhid}</span></td><td><Badge size="sm">{appointment.department}</Badge></td><td className={styles.muted}>{appointment.doctorName}</td><td><StatusBadge status={appointment.status === "SCHEDULED" ? "Scheduled" : appointment.status === "CONFIRMED" ? "Confirmed" : appointment.status === "COMPLETED" ? "Completed" : "Cancelled"} size="sm" dot /></td><td><Link href={`/appointments/${appointment.id}`} aria-label={`View ${appointment.appointmentNumber}`}><Button variant="ghost" size="sm" leftIcon={<Eye size={14} />}>View</Button></Link></td></tr>)}</tbody></table></div>}</Card>
  </div>;
}
