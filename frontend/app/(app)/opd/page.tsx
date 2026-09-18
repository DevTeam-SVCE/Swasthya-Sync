"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import { fetchAppointments } from "@/lib/appointments";
import type { Appointment } from "@/types/appointments";
import styles from "@/components/appointments/Appointment.module.css";

function label(status: Appointment["status"]) { return status === "SCHEDULED" ? "Scheduled" : status === "CONFIRMED" ? "Confirmed" : status === "COMPLETED" ? "Completed" : "Cancelled"; }

export default function OpdPage() {
  const { token } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const load = async () => { if (!token) return; setLoading(true); try { const response = await fetchAppointments(token, { date: today }); setAppointments(response.appointments); } catch { setError("Unable to load today's OPD appointments."); } finally { setLoading(false); } };
  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchAppointments(token, { date: today }).then((response) => {
      if (active) setAppointments(response.appointments);
    }).catch(() => {
      if (active) setError("Unable to load today's OPD appointments.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token, today]);
  return <div className={styles.page}><div className={styles.header}><div><h1 className={styles.title}>OPD Foundation</h1><p className={styles.subtitle}>Today&apos;s appointments and consultation handoff.</p></div><Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => void load()}>Refresh</Button></div>{error && <div className={styles.error}>{error}</div>}<Card className={styles.card} noPadding>{loading ? <div className={styles.empty}>Loading today&apos;s OPD…</div> : appointments.length === 0 ? <div className={styles.empty}>No OPD appointments for today.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Time</th><th>Patient</th><th>Department</th><th>Doctor</th><th>Status</th><th>OPD state</th></tr></thead><tbody>{appointments.map((appointment) => <tr key={appointment.id}><td className={styles.muted}>{appointment.slotTime}</td><td><Link className={styles.link} href={`/patients/${appointment.patientId}`}>{appointment.patientName}</Link><br /><span className={styles.muted}>{appointment.uhid}</span></td><td><Badge size="sm">{appointment.department}</Badge></td><td className={styles.muted}>{appointment.doctorName}</td><td><StatusBadge status={label(appointment.status) as "Scheduled" | "Confirmed" | "Completed" | "Cancelled"} size="sm" dot /></td><td className={styles.muted}>{appointment.status === "COMPLETED" ? "OPD-ready" : "Awaiting consultation"}</td></tr>)}</tbody></table></div>}</Card></div>;
}
