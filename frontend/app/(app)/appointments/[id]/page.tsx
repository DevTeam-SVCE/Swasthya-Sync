"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, LogIn, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import { fetchAppointment, updateAppointmentStatus } from "@/lib/appointments";
import type { Appointment, AppointmentStatus } from "@/types/appointments";
import styles from "@/components/appointments/Appointment.module.css";

function statusLabel(status: AppointmentStatus) { return status === "SCHEDULED" ? "Scheduled" : status === "CONFIRMED" ? "Confirmed" : status === "COMPLETED" ? "Completed" : "Cancelled"; }

export default function AppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !params.id) return;
    fetchAppointment(token, params.id).then((response) => setAppointment(response.appointment)).catch(() => setError("Appointment not found or unavailable.")).finally(() => setLoading(false));
  }, [token, params.id]);

  const changeStatus = async (status: AppointmentStatus) => {
    if (!token || !appointment) return;
    if (status === "CANCELLED" && !window.confirm("Are you sure you want to cancel this appointment?")) return;
    setUpdating(true); setError("");
    try { const response = await updateAppointmentStatus(token, appointment.id, status); setAppointment(response.appointment); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to update appointment."); }
    finally { setUpdating(false); }
  };

  if (loading) return <div className={styles.page}><div className={styles.empty}>Loading appointment…</div></div>;
  if (!appointment) return <div className={styles.page}><div className={styles.error}>{error || "Appointment not found."}</div><Link href="/appointments"><Button variant="secondary" leftIcon={<ArrowLeft size={15} />}>Back to appointments</Button></Link></div>;

  return <div className={styles.page}><div className={styles.header}><div><Link href="/appointments" className={styles.link}>← Back to appointments</Link><h1 className={styles.title}>{appointment.appointmentNumber}</h1><p className={styles.subtitle}>Appointment details and status workflow</p></div><div className={styles.actions}>{appointment.status === "SCHEDULED" && <><Button leftIcon={<LogIn size={15} />} loading={updating} onClick={() => void changeStatus("CONFIRMED")}>Check in</Button><Button variant="danger" leftIcon={<XCircle size={15} />} disabled={updating} onClick={() => void changeStatus("CANCELLED")}>Cancel</Button></>}{appointment.status === "CONFIRMED" && <><Button leftIcon={<CheckCircle2 size={15} />} loading={updating} onClick={() => void changeStatus("COMPLETED")}>Complete</Button><Button variant="danger" leftIcon={<XCircle size={15} />} disabled={updating} onClick={() => void changeStatus("CANCELLED")}>Cancel</Button></>}</div></div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {appointment.status === "COMPLETED" && <div className={styles.opdReady}>This appointment is OPD-ready. The clinical consultation workflow will be added in a later phase.</div>}
    <Card className={styles.card}><CardBody><div className={styles.detailGrid}><Detail label="Status" value={statusLabel(appointment.status)} badge={appointment.status} /><Detail label="Patient" value={appointment.patientName} /><Detail label="UHID" value={appointment.uhid} /><Detail label="Age / Gender" value={`${appointment.patientAge}y · ${appointment.patientGender}`} /><Detail label="Mobile" value={appointment.patientMobile} /><Detail label="Department" value={appointment.department} /><Detail label="Doctor" value={appointment.doctorName} /><Detail label="Date" value={appointment.appointmentDate} /><Detail label="Time" value={appointment.slotTime} /><Detail label="Booked by" value={appointment.createdBy} /><Detail label="Created" value={new Date(appointment.createdAt).toLocaleString("en-IN")} /></div></CardBody></Card>
    <div className={styles.actionGroup}><Link href={`/patients/${appointment.patientId}`}><Button variant="secondary">View patient</Button></Link>{appointment.status === "COMPLETED" && <Button variant="secondary" onClick={() => router.push("/opd")}>Open OPD foundation</Button>}</div>
  </div>;
}

function Detail({ label, value, badge }: { label: string; value: string; badge?: AppointmentStatus }) { return <div className={styles.detailItem}><span className={styles.detailLabel}>{label}</span>{badge ? <StatusBadge status={statusLabel(badge) as "Scheduled" | "Confirmed" | "Completed" | "Cancelled"} size="sm" dot /> : <span className={styles.detailValue}>{value}</span>}</div>; }
