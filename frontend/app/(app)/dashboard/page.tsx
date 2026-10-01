"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  BedDouble,
  ClipboardList,
  Activity,
  CalendarDays,
  TrendingUp,
  FlaskConical,
  AlertTriangle,
  IndianRupee,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ArrowRight,
  RefreshCw,
  Siren,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  DEMO_KPI,
  DEMO_REVENUE_CHART,
  DEMO_BED_BY_WARD,
  DEMO_RECENT_PATIENTS,
  DEMO_PENDING_LABS,
  DEMO_OPD_QUEUE,
  DEMO_ALERTS,
} from "@/lib/demo-data";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import { canAccessPath, normalizeUserRole } from "@/lib/permissions";
import { fetchAppointments } from "@/lib/appointments";
import { fetchEmergencyQueue, type EmergencyEncounter } from "@/lib/emergency";
import { fetchAdmissions, fetchBeds, fetchIPDOverview } from "@/lib/ipd";
import type { Appointment } from "@/types/appointments";
import type { Bed, IPDAdmission, IPDOverview } from "@/types/ipd";
import styles from "./page.module.css";
import { DASHBOARD_MODULE_CATEGORIES } from "@/lib/dashboard/dashboardData";

/* ── KPI card ────────────────────────────────────────────── */
interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconColor: string;
  trend?: string | null;
  trendUp?: boolean | null;
  detail?: string;
}

function KpiCard({ label, value, icon, iconColor, trend, trendUp, detail }: KpiCardProps) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiTop}>
        <div className={styles.kpiIconWrap} style={{ background: `${iconColor}18` }}>
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        {trend && (
          <span
            className={[
              styles.kpiTrend,
              trendUp === true
                ? styles["kpiTrend--up"]
                : trendUp === false
                ? styles["kpiTrend--down"]
                : styles["kpiTrend--neutral"],
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {trendUp === true ? (
              <ArrowUpRight size={12} aria-hidden="true" />
            ) : trendUp === false ? (
              <ArrowDownRight size={12} aria-hidden="true" />
            ) : (
              <Minus size={12} aria-hidden="true" />
            )}
            {trend}
          </span>
        )}
      </div>
      <div className={styles.kpiValue}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
      {detail && <div className={styles.kpiDetail}>{detail}</div>}
    </div>
  );
}

/* ── Alert dot ───────────────────────────────────────────── */
function AlertDot({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    critical: "var(--color-danger)",
    warning:  "var(--color-warning)",
    info:     "var(--color-info)",
    success:  "var(--color-success)",
  };
  return (
    <span
      className={styles.alertDot}
      style={{ background: colorMap[type] ?? "var(--color-gray-400)" }}
      aria-hidden="true"
    />
  );
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function LiveOperations() {
  const { token } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [admissions, setAdmissions] = useState<IPDAdmission[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [ipd, setIpd] = useState<IPDOverview>({ total: 0, available: 0, occupied: 0 });
  const [emergencies, setEmergencies] = useState<EmergencyEncounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const today = localDateKey(new Date());

  const load = useCallback(async (manual = false) => {
    if (!token) return;
    if (manual) setRefreshing(true);
    else setLoading(true);
    const results = await Promise.allSettled([
      fetchAppointments(token, { date: today }),
      fetchAdmissions(token),
      fetchIPDOverview(token),
      fetchEmergencyQueue(token),
      fetchBeds(token),
    ]);
    let failures = 0;
    const [appointmentResult, admissionResult, ipdResult, emergencyResult, bedsResult] = results;
    if (appointmentResult.status === "fulfilled") setAppointments(appointmentResult.value.appointments);
    else failures += 1;
    if (admissionResult.status === "fulfilled") setAdmissions(admissionResult.value.admissions);
    else failures += 1;
    if (ipdResult.status === "fulfilled") setIpd(ipdResult.value);
    else failures += 1;
    if (emergencyResult.status === "fulfilled") setEmergencies(emergencyResult.value.encounters.filter((item) => item.status === "Waiting" || item.status === "In Treatment"));
    else failures += 1;
    if (bedsResult.status === "fulfilled") setBeds(bedsResult.value.beds);
    else failures += 1;
    setError(failures === results.length ? "Unable to load live operational data." : failures ? "Some live dashboard sections could not be refreshed." : "");
    setLoading(false);
    setRefreshing(false);
  }, [today, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const redEmergencies = emergencies.filter((item) => item.triageLevel === "Red").length;
  const upcomingAppointments = appointments.filter((item) => item.status !== "COMPLETED" && item.status !== "CANCELLED").slice(0, 4);
  const visibleAdmissions = admissions.slice(0, 4);
  const visibleEmergencies = emergencies.slice(0, 4);
  const floorBeds = Object.entries(beds.filter((bed) => bed.floor && bed.floor !== "Unassigned").reduce<Record<string, Bed[]>>((groups, bed) => {
    (groups[bed.floor] ??= []).push(bed);
    return groups;
  }, {})).sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }));

  return <section className={styles.liveOperations} aria-label="Live operational dashboard">
    <div className={styles.liveHeading}><div><span className={styles.liveEyebrow}>Operational snapshot</span><h2>Live hospital activity</h2></div><div className={styles.liveHeadingActions}>{error && <span className={styles.liveError}>{error}</span>}<Button type="button" variant="secondary" leftIcon={<RefreshCw size={14} />} loading={refreshing} onClick={() => void load(true)}>Refresh live data</Button></div></div>
    <div className={styles.liveMetrics}>
      <div className={styles.liveMetric}><CalendarDays size={17} /><span>Today&apos;s appointments</span><strong>{loading ? "—" : appointments.length}</strong></div>
      <div className={styles.liveMetric}><BedDouble size={17} /><span>Beds occupied</span><strong>{loading ? "—" : `${ipd.occupied} / ${ipd.total}`}</strong></div>
      <div className={styles.liveMetric}><Activity size={17} /><span>Current inpatients</span><strong>{loading ? "—" : admissions.length}</strong></div>
      <div className={[styles.liveMetric, redEmergencies ? styles.liveMetricUrgent : ""].filter(Boolean).join(" ")}><Siren size={17} /><span>Emergency queue</span><strong>{loading ? "—" : emergencies.length}</strong><small>{redEmergencies ? `${redEmergencies} critical` : "No red triage"}</small></div>
    </div>
    <div className={styles.livePanels}>
      <section className={styles.livePanel}><header><h3>Today&apos;s schedule</h3><Link href="/appointments">All appointments <ArrowRight size={13} /></Link></header>{loading ? <p className={styles.liveEmpty}>Loading appointments…</p> : upcomingAppointments.length === 0 ? <p className={styles.liveEmpty}>No upcoming appointments today.</p> : <div className={styles.liveList}>{upcomingAppointments.map((appointment) => <Link className={styles.liveRow} href={`/appointments/${appointment.id}`} key={appointment.id}><span className={styles.liveTime}>{appointment.slotTime}</span><span className={styles.liveCopy}><strong>{appointment.patientName}</strong><small>{appointment.department} · {appointment.doctorName}</small></span><Badge size="sm" variant={appointment.status === "CONFIRMED" ? "success" : "warning"}>{appointment.status}</Badge></Link>)}</div>}</section>
      <section className={styles.livePanel}><header><h3>Current inpatients</h3><Link href="/ipd">IPD <ArrowRight size={13} /></Link></header>{loading ? <p className={styles.liveEmpty}>Loading admissions…</p> : visibleAdmissions.length === 0 ? <p className={styles.liveEmpty}>No active IPD admissions.</p> : <div className={styles.liveList}>{visibleAdmissions.map((admission) => <Link className={styles.liveRow} href={`/patients/${admission.patientId}`} key={admission.id}><span className={styles.liveBed}>{admission.bedNumber}</span><span className={styles.liveCopy}><strong>{admission.patientName}</strong><small>{admission.uhid} · {admission.floor} · {admission.ward}</small></span></Link>)}</div>}</section>
      <section className={styles.livePanel}><header><h3>Emergency attention</h3><Link href="/emergency">Open queue <ArrowRight size={13} /></Link></header>{loading ? <p className={styles.liveEmpty}>Loading emergencies…</p> : visibleEmergencies.length === 0 ? <p className={styles.liveEmpty}>No active emergency cases.</p> : <div className={styles.liveList}>{visibleEmergencies.map((encounter) => <Link className={styles.liveRow} href="/emergency" key={encounter.id}><Badge size="sm" variant={encounter.triageLevel === "Red" ? "danger" : encounter.triageLevel === "Orange" ? "warning" : "info"}>{encounter.triageLevel}</Badge><span className={styles.liveCopy}><strong>{encounter.patientName}</strong><small>{encounter.complaint}</small></span></Link>)}</div>}</section>
      <section className={styles.livePanel}><header><h3>Bed capacity by floor</h3><Link href="/ipd">Bed management <ArrowRight size={13} /></Link></header>{loading ? <p className={styles.liveEmpty}>Loading capacity…</p> : floorBeds.length === 0 ? <p className={styles.liveEmpty}>No floor bed data available.</p> : <div className={styles.liveCapacity}>{floorBeds.map(([floor, floorList]) => { const occupied = floorList.filter((bed) => bed.status === "OCCUPIED").length; const available = floorList.length - occupied; return <div className={styles.liveCapacityRow} key={floor}><div><strong>{floor}</strong><small>{available} free / {floorList.length}</small></div><span className={styles.liveTrack} role="img" aria-label={`${floor}: ${occupied} occupied, ${available} available`}><i style={{ width: `${floorList.length ? (occupied / floorList.length) * 100 : 0}%` }} /></span></div>; })}</div>}</section>
    </div>
  </section>;
}

function ModuleLauncher() {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState(DASHBOARD_MODULE_CATEGORIES[0].key);
  const visibleCategories = DASHBOARD_MODULE_CATEGORIES.map((item) => ({
    ...item,
    modules: item.modules.filter((module) => module.href ? canAccessPath(user?.role, module.href) : normalizeUserRole(user?.role) === "admin"),
  })).filter((item) => item.modules.length > 0);
  const category = visibleCategories.find((item) => item.key === activeCategory) ?? visibleCategories[0];

  if (!category) return null;

  return (
    <section className={styles.launcher} aria-labelledby="module-launcher-title">
      <div className={styles.launcherHeader}>
        <div>
          <span className={styles.sectionEyebrow}>Workspace</span>
          <h2 id="module-launcher-title" className={styles.sectionTitle}>Module Launcher</h2>
          <p className={styles.sectionSubtitle}>Move between hospital workflows from one place.</p>
        </div>
        <span className={styles.launcherCount}>{visibleCategories.length} categories</span>
      </div>
      <div className={styles.launcherTabs} role="tablist" aria-label="Dashboard module categories">
        {visibleCategories.map((item) => {
          const Icon = item.icon;
          const active = item.key === category.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`module-panel-${item.key}`}
              className={[styles.launcherTab, active ? styles["launcherTab--active"] : ""].filter(Boolean).join(" ")}
              onClick={() => setActiveCategory(item.key)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div id={`module-panel-${category.key}`} className={styles.moduleGrid} role="tabpanel" aria-label={`${category.label} modules`}>
        {category.modules.map((module) => {
          const Icon = module.icon;
          const content = (
            <>
              <span className={styles.moduleIcon}><Icon size={18} aria-hidden="true" /></span>
              <span className={styles.moduleCopy}>
                <span className={styles.moduleName}>{module.label}</span>
                <span className={styles.moduleDescription}>{module.description}</span>
              </span>
              {module.href ? <ArrowRight size={15} className={styles.moduleArrow} aria-hidden="true" /> : <span className={styles.moduleStatus}>Soon</span>}
            </>
          );
          return module.href ? (
            <Link key={module.key} href={module.href} className={styles.moduleItem}>{content}</Link>
          ) : (
            <div key={module.key} className={[styles.moduleItem, styles["moduleItem--disabled"]].join(" ")} aria-label={`${module.label}, coming soon`}>{content}</div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Page ────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className={styles.page}>
      {/* ── Page header ─────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>SwasthyaSync HMS</h1>
          <p className={styles.pageSubtitle}>
            {user?.hospitalName ?? "Hospital"} &mdash; live overview
          </p>
        </div>
        <div className={styles.pageHeaderRight}>
          <span className={styles.liveDot} aria-hidden="true" />
          <span className={styles.liveLabel}>Live</span>
          <span className={styles.pageDate}>
            {new Date().toLocaleDateString("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      <LiveOperations />

      {/* ── KPI grid ────────────────────────────────────── */}
      <div className={styles.kpiGrid}>
        <KpiCard
          label="Total Patients"
          value={DEMO_KPI.totalPatients.value.toLocaleString("en-IN")}
          icon={<Users size={20} />}
          iconColor="var(--color-primary)"
          trend={DEMO_KPI.totalPatients.trend}
          trendUp={DEMO_KPI.totalPatients.trendUp}
        />
        <KpiCard
          label="Bed Occupancy"
          value={DEMO_KPI.bedOccupancy.value}
          icon={<BedDouble size={20} />}
          iconColor="var(--color-info)"
          trend={DEMO_KPI.bedOccupancy.trend}
          trendUp={DEMO_KPI.bedOccupancy.trendUp}
          detail={DEMO_KPI.bedOccupancy.detail}
        />
        <KpiCard
          label="Pending Notes"
          value={DEMO_KPI.pendingNotes.value}
          icon={<ClipboardList size={20} />}
          iconColor="var(--color-warning)"
          trend={DEMO_KPI.pendingNotes.trend}
          trendUp={DEMO_KPI.pendingNotes.trendUp}
        />
        <KpiCard
          label="Today OPD"
          value={DEMO_KPI.todayOPD.value}
          icon={<Activity size={20} />}
          iconColor="var(--color-success)"
          trend={DEMO_KPI.todayOPD.trend}
          trendUp={DEMO_KPI.todayOPD.trendUp}
        />
        <KpiCard
          label="Revenue (Month)"
          value={DEMO_KPI.revenueMonth.value}
          icon={<TrendingUp size={20} />}
          iconColor="var(--color-primary)"
          trend={DEMO_KPI.revenueMonth.trend}
          trendUp={DEMO_KPI.revenueMonth.trendUp}
        />
        <KpiCard
          label="Pending Lab Tests"
          value={DEMO_KPI.pendingLabTests.value}
          icon={<FlaskConical size={20} />}
          iconColor="var(--color-warning)"
          trend={null}
          trendUp={null}
        />
        <KpiCard
          label="Critical Patients"
          value={DEMO_KPI.criticalPatients.value}
          icon={<AlertTriangle size={20} />}
          iconColor="var(--color-danger)"
          trend={null}
          trendUp={null}
        />
        <KpiCard
          label="Today Revenue"
          value={DEMO_KPI.todayRevenue.value}
          icon={<IndianRupee size={20} />}
          iconColor="var(--color-success)"
          trend={DEMO_KPI.todayRevenue.trend}
          trendUp={DEMO_KPI.todayRevenue.trendUp}
        />
      </div>

      <ModuleLauncher />

      {/* ── Charts row ──────────────────────────────────── */}
      <div className={styles.chartsRow}>
        {/* Revenue trend */}
        <Card className={styles.chartCardLarge}>
          <CardHeader title="Revenue Trend" subtitle="OPD · IPD · Pharmacy (₹)" divider />
          <CardBody>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart
                data={DEMO_REVENUE_CHART}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="opd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--color-primary)" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ipd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--color-info)" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="var(--color-info)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="pharm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--color-success)" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => `₹${(v / 100000).toFixed(1)}L`}
                  tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  formatter={(v) =>
                    `₹${(Number(v ?? 0) / 100000).toFixed(2)}L`
                  }
                  contentStyle={{
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--color-border)",
                    fontSize: "12px",
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
                />
                <Area type="monotone" dataKey="opd"      name="OPD"      stroke="var(--color-primary)" fill="url(#opd)"   strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="ipd"      name="IPD"      stroke="var(--color-info)"    fill="url(#ipd)"   strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="pharmacy" name="Pharmacy" stroke="var(--color-success)" fill="url(#pharm)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Bed occupancy by ward */}
        <Card className={styles.chartCardSmall}>
          <CardHeader title="Bed Occupancy by Ward" subtitle="Occupied / Total" divider />
          <CardBody>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={DEMO_BED_BY_WARD}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                barSize={14}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="ward"
                  tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--color-border)",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="total"    name="Total"    fill="var(--color-gray-200)"   radius={[3,3,0,0]} />
                <Bar dataKey="occupied" name="Occupied" fill="var(--color-primary-400)" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* ── Bottom row ──────────────────────────────────── */}
      <div className={styles.bottomRow}>
        {/* Recent patients */}
        <Card className={styles.bottomCardLarge}>
          <CardHeader
            title="Recent Patients"
            subtitle="Latest registrations"
            divider
            action={
              <Link href="/patients" className={styles.viewAllLink}>
                View all →
              </Link>
            }
          />
          <CardBody className={styles.noPadding}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>UHID</th>
                    <th>Patient</th>
                    <th>Dept.</th>
                    <th>Doctor</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {DEMO_RECENT_PATIENTS.map((p) => (
                    <tr key={p.uhid}>
                      <td>
                        <span className={styles.uhid}>{p.uhid}</span>
                      </td>
                      <td>
                        <div className={styles.patientCell}>
                          <span className={styles.patientAvatar}>
                            {p.name.charAt(0)}
                          </span>
                          <div>
                            <span className={styles.patientName}>{p.name}</span>
                            <span className={styles.patientMeta}>
                              {p.age}y · {p.gender}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className={styles.tdMuted}>{p.department}</td>
                      <td className={styles.tdMuted}>{p.doctor}</td>
                      <td>
                        <Badge variant="default" size="sm">
                          {p.admissionType}
                        </Badge>
                      </td>
                      <td>
                        <StatusBadge
                          status={
                            p.status as
                              | "Critical"
                              | "Stable"
                              | "Recovering"
                              | "Serious"
                          }
                          size="sm"
                          dot
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* Right column */}
        <div className={styles.rightCol}>
          {/* Alerts */}
          <Card>
            <CardHeader
              title="System Alerts"
              subtitle="Requires attention"
              divider
              action={
                <Badge variant="danger" size="sm" dot pulse>
                  {DEMO_ALERTS.length}
                </Badge>
              }
            />
            <CardBody className={styles.alertsBody}>
              {DEMO_ALERTS.map((a) => (
                <div key={a.id} className={styles.alertItem}>
                  <AlertDot type={a.type} />
                  <div className={styles.alertContent}>
                    <p className={styles.alertMessage}>{a.message}</p>
                    <span className={styles.alertTime}>{a.time}</span>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          {/* Pending labs */}
          <Card>
            <CardHeader
              title="Pending Lab Tests"
              divider
              action={
                <a href="/laboratory" className={styles.viewAllLink}>
                  View all →
                </a>
              }
            />
            <CardBody className={styles.labsBody}>
              {DEMO_PENDING_LABS.map((l) => (
                <div key={l.id} className={styles.labItem}>
                  <div className={styles.labLeft}>
                    <span className={styles.labId}>{l.id}</span>
                    <span className={styles.labTest}>{l.test}</span>
                    <span className={styles.labPatient}>{l.patient}</span>
                  </div>
                  <div className={styles.labRight}>
                    <Badge
                      variant={
                        l.priority === "STAT"
                          ? "danger"
                          : l.priority === "URGENT"
                          ? "warning"
                          : "default"
                      }
                      size="sm"
                    >
                      {l.priority}
                    </Badge>
                    <span className={styles.labTime}>{l.ordered}</span>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          {/* OPD Queue */}
          <Card>
            <CardHeader
              title="OPD Queue"
              subtitle="Today"
              divider
              action={
                <a href="/opd" className={styles.viewAllLink}>
                  View all →
                </a>
              }
            />
            <CardBody className={styles.queueBody}>
              {DEMO_OPD_QUEUE.map((q) => (
                <div key={q.token} className={styles.queueItem}>
                  <div className={styles.queueToken}>{q.token}</div>
                  <div className={styles.queueInfo}>
                    <span className={styles.queueName}>{q.name}</span>
                    <span className={styles.queueDept}>
                      {q.dept} · {q.doctor}
                    </span>
                  </div>
                  <div className={styles.queueRight}>
                    <StatusBadge
                      status={q.status as "Scheduled" | "Confirmed"}
                      size="sm"
                    />
                    <span className={styles.queueWait}>{q.wait}</span>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
