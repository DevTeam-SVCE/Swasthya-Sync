"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, BedDouble, CalendarDays, RefreshCw, Siren } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { fetchAppointments } from "@/lib/appointments";
import { fetchEmergencyQueue, type EmergencyEncounter } from "@/lib/emergency";
import { fetchAdmissions, fetchBeds, fetchIPDOverview } from "@/lib/ipd";
import type { Appointment } from "@/types/appointments";
import type { Bed, IPDAdmission, IPDOverview } from "@/types/ipd";
import styles from "./page.module.css";

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const appointmentStatuses: Appointment["status"][] = ["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED"];
const triageLevels: EmergencyEncounter["triageLevel"][] = ["Red", "Orange", "Yellow", "Green"];
const statusNames: Record<Appointment["status"], string> = { SCHEDULED: "Scheduled", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELLED: "Cancelled" };

export default function AnalyticsPage() {
  const { token } = useAuth();
  const [reportDate, setReportDate] = useState(localDateKey(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [admissions, setAdmissions] = useState<IPDAdmission[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [ipd, setIpd] = useState<IPDOverview>({ total: 0, available: 0, occupied: 0 });
  const [emergencies, setEmergencies] = useState<EmergencyEncounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadReport = useCallback(async (manual = false) => {
    if (!token || !reportDate) return;
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError("");
    const results = await Promise.allSettled([
      fetchAppointments(token, { date: reportDate }),
      fetchAdmissions(token),
      fetchBeds(token),
      fetchIPDOverview(token),
      fetchEmergencyQueue(token),
    ]);
    let failures = 0;
    const [appointmentResult, admissionResult, bedsResult, ipdResult, emergencyResult] = results;
    if (appointmentResult.status === "fulfilled") setAppointments(appointmentResult.value.appointments);
    else failures += 1;
    if (admissionResult.status === "fulfilled") setAdmissions(admissionResult.value.admissions);
    else failures += 1;
    if (bedsResult.status === "fulfilled") setBeds(bedsResult.value.beds);
    else failures += 1;
    if (ipdResult.status === "fulfilled") setIpd(ipdResult.value);
    else failures += 1;
    if (emergencyResult.status === "fulfilled") setEmergencies(emergencyResult.value.encounters.filter((item) => item.status === "Waiting" || item.status === "In Treatment"));
    else failures += 1;
    setError(failures === results.length ? "Unable to load operational data. Check your connection and sign-in." : failures ? "Some report sections could not be refreshed." : "");
    setLoading(false);
    setRefreshing(false);
  }, [reportDate, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReport]);

  const statusCounts = useMemo(() => Object.fromEntries(appointmentStatuses.map((status) => [status, appointments.filter((item) => item.status === status).length])) as Record<Appointment["status"], number>, [appointments]);
  const departmentCounts = useMemo(() => Object.entries(appointments.reduce<Record<string, number>>((counts, appointment) => {
    counts[appointment.department] = (counts[appointment.department] ?? 0) + 1;
    return counts;
  }, {})).sort((left, right) => right[1] - left[1]), [appointments]);
  const floorCounts = useMemo(() => Object.entries(beds.filter((bed) => bed.floor && bed.floor !== "Unassigned").reduce<Record<string, Bed[]>>((groups, bed) => {
    (groups[bed.floor] ??= []).push(bed);
    return groups;
  }, {})).sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true })), [beds]);
  const triageCounts = useMemo(() => Object.fromEntries(triageLevels.map((level) => [level, emergencies.filter((item) => item.triageLevel === level).length])) as Record<EmergencyEncounter["triageLevel"], number>, [emergencies]);
  const largestDepartment = Math.max(1, ...departmentCounts.map(([, count]) => count));

  return (
    <main className={styles.page}>
      <PageHeader title="Analytics & MIS" subtitle="Live operational summary for appointments, inpatient capacity, and emergency activity." accent="info" actions={<div className={styles.headerActions}><Input label="Report date" type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /><Button type="button" variant="secondary" leftIcon={<RefreshCw size={14} />} loading={refreshing} onClick={() => void loadReport(true)}>Refresh</Button></div>} />
      {error && <div className={styles.error} role="status">{error}</div>}
      <section className={styles.kpis} aria-label="Operational totals">
        <article className={styles.kpi}><CalendarDays size={18} /><span>Appointments on selected date</span><strong>{loading ? "—" : appointments.length}</strong><Link href="/appointments">Open appointments</Link></article>
        <article className={styles.kpi}><BedDouble size={18} /><span>Occupied beds</span><strong>{loading ? "—" : `${ipd.occupied} / ${ipd.total}`}</strong><small>{ipd.available} available now</small></article>
        <article className={styles.kpi}><Activity size={18} /><span>Current inpatients</span><strong>{loading ? "—" : admissions.length}</strong><Link href="/ipd">Open IPD</Link></article>
        <article className={styles.kpi}><Siren size={18} /><span>Active emergency cases</span><strong>{loading ? "—" : emergencies.length}</strong><small>{triageCounts.Red} red triage</small></article>
      </section>
      <section className={styles.reportGrid}>
        <article className={styles.panel}><header className={styles.panelHeader}><div><h2>Appointment status</h2><p>{new Date(`${reportDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div><Badge size="sm">Live data</Badge></header>{loading ? <p className={styles.empty}>Loading appointments…</p> : <div className={styles.statusList}>{appointmentStatuses.map((status) => <div className={styles.statusRow} key={status}><span>{statusNames[status]}</span><div className={styles.track}><i className={styles[`status${status}`]} style={{ width: `${appointments.length ? (statusCounts[status] / appointments.length) * 100 : 0}%` }} /></div><strong>{statusCounts[status]}</strong></div>)}</div>}</article>
        <article className={styles.panel}><header className={styles.panelHeader}><div><h2>Appointments by department</h2><p>Selected date · ranked by scheduled volume</p></div></header>{loading ? <p className={styles.empty}>Loading departments…</p> : departmentCounts.length === 0 ? <p className={styles.empty}>No appointments on this date.</p> : <div className={styles.departmentList}>{departmentCounts.map(([department, count]) => <div className={styles.departmentRow} key={department}><span>{department}</span><div className={styles.track}><i style={{ width: `${(count / largestDepartment) * 100}%` }} /></div><strong>{count}</strong></div>)}</div>}</article>
        <article className={styles.panel}><header className={styles.panelHeader}><div><h2>Bed capacity by floor</h2><p>Current occupancy and availability</p></div><Link href="/ipd">Bed management</Link></header>{loading ? <p className={styles.empty}>Loading bed capacity…</p> : floorCounts.length === 0 ? <p className={styles.empty}>No floor bed data available.</p> : <div className={styles.floorList}>{floorCounts.map(([floor, floorBeds]) => { const occupied = floorBeds.filter((bed) => bed.status === "OCCUPIED").length; const available = floorBeds.length - occupied; return <div className={styles.floorRow} key={floor}><span>{floor}</span><div className={styles.track} aria-label={`${occupied} occupied, ${available} available`}><i style={{ width: `${floorBeds.length ? (occupied / floorBeds.length) * 100 : 0}%` }} /></div><strong>{occupied}/{floorBeds.length}</strong></div>; })}</div>}</article>
        <article className={styles.panel}><header className={styles.panelHeader}><div><h2>Emergency triage</h2><p>Active cases only · waiting or in treatment</p></div><Link href="/emergency">Open emergency</Link></header>{loading ? <p className={styles.empty}>Loading emergency cases…</p> : <div className={styles.triageList}>{triageLevels.map((level) => <div className={styles.triageRow} key={level}><span className={[styles.triageDot, styles[`triage${level}`]].join(" ")} />{level}<strong>{triageCounts[level]}</strong></div>)}</div>}</article>
      </section>
      <p className={styles.sourceNote}>Operational report only. Revenue and inventory metrics are not shown because those records are not yet connected to the reporting API.</p>
    </main>
  );
}
