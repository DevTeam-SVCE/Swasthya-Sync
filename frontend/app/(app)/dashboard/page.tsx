"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, BedDouble, CalendarDays, CalendarPlus, Clock3, RefreshCw, Siren, UserRoundPlus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { fetchAppointments } from "@/lib/appointments";
import { fetchEmergencyQueue, type EmergencyEncounter } from "@/lib/emergency";
import { fetchAdmissions, fetchBeds, fetchIPDOverview } from "@/lib/ipd";
import { canAccessPath } from "@/lib/permissions";
import type { Appointment } from "@/types/appointments";
import type { Bed, IPDAdmission, IPDOverview } from "@/types/ipd";
import styles from "./page.module.css";

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function formatArrival(date: string) {
  return new Date(date).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

const statusLabel: Record<Appointment["status"], string> = {
  SCHEDULED: "Scheduled",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default function DashboardPage() {
  const { user, token } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [admissions, setAdmissions] = useState<IPDAdmission[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [ipd, setIpd] = useState<IPDOverview>({ total: 0, available: 0, occupied: 0 });
  const [emergencies, setEmergencies] = useState<EmergencyEncounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const today = localDateKey(new Date());

  const loadDashboard = useCallback(async (manual = false) => {
    if (!token) return;
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError("");
    const results = await Promise.allSettled([
      fetchAppointments(token, { date: today }),
      fetchAdmissions(token),
      fetchIPDOverview(token),
      fetchEmergencyQueue(token),
      fetchBeds(token),
    ]);
    let failures = 0;
    const [appointmentResult, admissionResult, ipdResult, emergencyResult, bedsResult] = results;
    if (appointmentResult.status === "fulfilled") setAppointments(appointmentResult.value.appointments.filter((item) => item.status !== "CANCELLED"));
    else failures += 1;
    if (admissionResult.status === "fulfilled") setAdmissions(admissionResult.value.admissions);
    else failures += 1;
    if (ipdResult.status === "fulfilled") setIpd(ipdResult.value);
    else failures += 1;
    if (emergencyResult.status === "fulfilled") setEmergencies(emergencyResult.value.encounters.filter((item) => item.status === "Waiting" || item.status === "In Treatment"));
    else failures += 1;
    if (bedsResult.status === "fulfilled") setBeds(bedsResult.value.beds);
    else failures += 1;
    setError(failures === results.length ? "Unable to load dashboard data. Check your connection and sign-in." : failures ? "Some dashboard information could not be refreshed." : "");
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, [token, today]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const redEmergencies = emergencies.filter((item) => item.triageLevel === "Red").length;
  const todayAppointments = appointments.length;
  const nextAppointments = appointments.filter((item) => item.status !== "COMPLETED");
  const floorBeds = Object.entries(beds.filter((bed) => bed.floor && bed.floor !== "Unassigned").reduce<Record<string, Bed[]>>((groups, bed) => {
    (groups[bed.floor] ??= []).push(bed);
    return groups;
  }, {})).sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }));
  const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const quickActions = [
    { href: "/patients/new", label: "Register patient", icon: <UserRoundPlus size={16} /> },
    { href: "/appointments/new", label: "Book appointment", icon: <CalendarPlus size={16} /> },
    { href: "/ipd", label: "Manage beds", icon: <BedDouble size={16} /> },
    { href: "/emergency", label: "Emergency triage", icon: <Siren size={16} /> },
  ].filter((action) => canAccessPath(user?.role, action.href));

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headingCopy}>
          <p className={styles.eyebrow}>{user?.hospitalName ?? "Hospital operations"}</p>
          <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {user?.name?.split(" ")[0] ?? "Admin"}</h1>
          <p className={styles.dateText}>{dateLabel} <span aria-hidden="true">·</span> Hospital operations overview</p>
        </div>
        <div className={styles.headerActions}>
          <nav className={styles.quickActions} aria-label="Quick actions">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href} title={action.label} aria-label={action.label}>{action.icon}</Link>
            ))}
          </nav>
          <span className={styles.updatedText}>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "Live data"}</span>
          <Button type="button" variant="secondary" size="sm" leftIcon={<RefreshCw size={14} />} loading={refreshing} onClick={() => void loadDashboard(true)}>Refresh</Button>
        </div>
      </header>

      {error && <div className={styles.error} role="status">{error}</div>}

      <section className={styles.metrics} aria-label="Hospital status">
        <div className={styles.metric}><span className={styles.metricIcon}><CalendarDays size={17} /></span><div><span className={styles.metricLabel}>Today&apos;s appointments</span><strong>{loading ? "—" : todayAppointments}</strong></div><Link href="/appointments" aria-label="View appointments"><ArrowRight size={16} /></Link></div>
        <div className={styles.metric}><span className={styles.metricIcon}><BedDouble size={17} /></span><div><span className={styles.metricLabel}>Beds occupied</span><strong>{loading ? "—" : `${ipd.occupied} / ${ipd.total}`}</strong></div><Link href="/ipd" aria-label="Open bed management"><ArrowRight size={16} /></Link></div>
        <div className={styles.metric}><span className={styles.metricIcon}><Activity size={17} /></span><div><span className={styles.metricLabel}>Current inpatients</span><strong>{loading ? "—" : admissions.length}</strong></div><Link href="/ipd" aria-label="View inpatients"><ArrowRight size={16} /></Link></div>
        <div className={[styles.metric, redEmergencies > 0 ? styles.metricUrgent : ""].filter(Boolean).join(" ")}><span className={styles.metricIcon}><Siren size={17} /></span><div><span className={styles.metricLabel}>Emergency queue</span><strong>{loading ? "—" : emergencies.length}</strong></div><span className={styles.metricAlert}>{redEmergencies ? `${redEmergencies} critical` : "Active"}</span><Link href="/emergency" aria-label="Open emergency queue"><ArrowRight size={16} /></Link></div>
      </section>

      <section className={styles.workArea} aria-label="Hospital worklists">
        <section className={[styles.panel, styles.schedulePanel].join(" ")} aria-labelledby="schedule-heading">
          <div className={styles.panelHeader}><div><h2 id="schedule-heading">Today&apos;s schedule</h2><p>Next appointments · {todayAppointments} today</p></div><Link href="/appointments" className={styles.viewAll}>All <ArrowRight size={14} /></Link></div>
          {loading ? <div className={styles.empty}>Loading…</div> : nextAppointments.length === 0 ? <div className={styles.empty}>No upcoming appointments today.</div> : <div className={styles.list}>{nextAppointments.map((appointment) => <Link className={styles.appointmentRow} href={`/appointments/${appointment.id}`} key={appointment.id}><span className={styles.time}><Clock3 size={12} />{formatTime(appointment.slotTime)}</span><span className={styles.person}><strong>{appointment.patientName}</strong><small>{appointment.department}</small></span><Badge size="sm" variant={appointment.status === "CONFIRMED" ? "success" : "warning"}>{statusLabel[appointment.status]}</Badge></Link>)}</div>}
        </section>

        <section className={[styles.panel, styles.opdPanel].join(" ")} aria-labelledby="opd-heading">
          <div className={styles.panelHeader}><div><h2 id="opd-heading">OPD patients</h2><p>{todayAppointments} registered today</p></div><Link href="/opd" className={styles.viewAll}>OPD <ArrowRight size={14} /></Link></div>
          {loading ? <div className={styles.empty}>Loading…</div> : appointments.length === 0 ? <div className={styles.empty}>No OPD patients scheduled today.</div> : <div className={styles.list}>{appointments.map((appointment) => <Link className={styles.opdRow} href={`/patients/${appointment.patientId}`} key={appointment.id}><span className={styles.person}><strong>{appointment.patientName}</strong><small>{appointment.uhid} · {appointment.department}</small></span><span className={styles.doctor}>{appointment.doctorName}</span><Badge size="sm" variant={appointment.status === "COMPLETED" ? "success" : "warning"}>{statusLabel[appointment.status]}</Badge></Link>)}</div>}
        </section>

        <section className={[styles.panel, styles.inpatientPanel].join(" ")} aria-labelledby="inpatients-heading">
          <div className={styles.panelHeader}><div><h2 id="inpatients-heading">Current inpatients</h2><p>{admissions.length} admitted</p></div><Link href="/ipd" className={styles.viewAll}>IPD <ArrowRight size={14} /></Link></div>
          {loading ? <div className={styles.empty}>Loading…</div> : admissions.length === 0 ? <div className={styles.empty}>No active IPD admissions.</div> : <div className={styles.list}>{admissions.map((admission) => <Link className={styles.inpatientRow} href={`/patients/${admission.patientId}`} key={admission.id}><span className={styles.bedTag}>{admission.bedNumber}</span><span className={styles.person}><strong>{admission.patientName}</strong><small>{admission.uhid} · {admission.floor} · {admission.ward}</small></span><span className={styles.admittedDate}>{new Date(admission.admissionDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></Link>)}</div>}
        </section>

        <section className={[styles.panel, styles.emergencyPanel].join(" ")} aria-labelledby="emergency-heading">
          <div className={styles.panelHeader}><div><h2 id="emergency-heading">Emergency attention</h2><p>{emergencies.length} active · {redEmergencies} critical</p></div><Link href="/emergency" className={styles.viewAll}>Queue <ArrowRight size={14} /></Link></div>
          {loading ? <div className={styles.empty}>Loading…</div> : emergencies.length === 0 ? <div className={styles.empty}>No active emergency cases.</div> : <div className={styles.emergencyList}>{emergencies.map((item) => <Link className={styles.emergencyRow} href="/emergency" key={item.id}><span className={[styles.triage, item.triageLevel === "Red" ? styles.triageRed : item.triageLevel === "Orange" ? styles.triageOrange : ""].filter(Boolean).join(" ")}>{item.triageLevel}</span><span className={styles.person}><strong>{item.patientName}</strong><small>{item.complaint}</small></span><span className={styles.arrival}>{formatArrival(item.arrivalTime)}</span></Link>)}</div>}
          {redEmergencies > 0 && <div className={styles.criticalNotice}><Siren size={13} /> {redEmergencies} critical case{redEmergencies === 1 ? "" : "s"}</div>}
        </section>

        <section className={[styles.panel, styles.capacityPanel].join(" ")} aria-labelledby="capacity-heading">
          <div className={styles.panelHeader}><div><h2 id="capacity-heading">Bed capacity by floor</h2><p>{ipd.available} available · {ipd.occupied} occupied</p></div><Link href="/ipd" className={styles.viewAll}>Bed management <ArrowRight size={14} /></Link></div>
          {loading ? <div className={styles.empty}>Loading…</div> : floorBeds.length === 0 ? <div className={styles.empty}>No floor bed data available.</div> : <div className={styles.capacityList}>{floorBeds.map(([floor, floorList]) => {
            const occupied = floorList.filter((bed) => bed.status === "OCCUPIED").length;
            const available = floorList.length - occupied;
            return <div className={styles.capacityRow} key={floor}><div className={styles.capacityLabel}><strong>{floor}</strong><span>{available} free / {floorList.length}</span></div><div className={styles.capacityTrack} role="img" aria-label={`${floor}: ${occupied} occupied, ${available} available`}><span style={{ width: `${floorList.length ? (occupied / floorList.length) * 100 : 0}%` }} /></div></div>;
          })}</div>}
        </section>
      </section>
    </main>
  );
}