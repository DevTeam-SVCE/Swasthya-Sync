"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BedDouble, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { dischargeAdmission, fetchAdmissions, fetchBeds, fetchIPDOverview } from "@/lib/ipd";
import type { Bed, IPDAdmission, IPDOverview } from "@/types/ipd";
import { AdmissionPanel } from "@/components/ipd/AdmissionPanel";
import styles from "@/components/ipd/IPD.module.css";

export default function IPDPage() {
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [overview, setOverview] = useState<IPDOverview>({ total: 0, available: 0, occupied: 0 });
  const [beds, setBeds] = useState<Bed[]>([]);
  const [admissions, setAdmissions] = useState<IPDAdmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    if (!token) return;
    setLoading(true); setError("");
    try { const [summary, bedResponse, admissionResponse] = await Promise.all([fetchIPDOverview(token), fetchBeds(token), fetchAdmissions(token)]); setOverview(summary); setBeds(bedResponse.beds); setAdmissions(admissionResponse.admissions); }
    catch { setError("Unable to load IPD data. Check that the backend is running."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([fetchIPDOverview(token), fetchBeds(token), fetchAdmissions(token)]).then(([summary, bedResponse, admissionResponse]) => { if (active) { setOverview(summary); setBeds(bedResponse.beds); setAdmissions(admissionResponse.admissions); } }).catch(() => { if (active) setError("Unable to load IPD data. Check that the backend is running."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const discharge = async (admission: IPDAdmission) => {
    if (!token || !window.confirm(`Discharge ${admission.patientName} and release ${admission.bedNumber}?`)) return;
    try { await dischargeAdmission(token, admission.id); success("Patient discharged.", `${admission.bedNumber} is now available.`); await load(); }
    catch (requestError) { const message = requestError instanceof Error ? requestError.message : "Unable to discharge patient."; toastError("Unable to discharge patient.", message); }
  };

  return <div className={styles.page}><div className={styles.header}><div><h1 className={styles.title}>IPD & Bed Management</h1><p className={styles.subtitle}>Manage inpatient admissions, bed availability, and releases.</p></div><Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => void load()}>Refresh</Button></div>
    {error && <div className={styles.error}>{error}</div>}
    <div className={styles.kpis}><Card className={styles.kpi}><span className={styles.kpiLabel}>Total beds</span><div className={styles.kpiValue}>{overview.total}</div></Card><Card className={styles.kpi}><span className={styles.kpiLabel}>Available</span><div className={styles.kpiValue}>{overview.available}</div></Card><Card className={styles.kpi}><span className={styles.kpiLabel}>Occupied</span><div className={styles.kpiValue}>{overview.occupied}</div></Card></div>
    <Card className={styles.card}><h2 className={styles.sectionTitle}>Bed Overview</h2>{loading ? <div className={styles.empty}>Loading beds…</div> : beds.length === 0 ? <div className={styles.empty}>No beds configured.</div> : <div className={styles.bedGrid}>{beds.map((bed) => <div key={bed.id} className={[styles.bed, bed.status === "AVAILABLE" ? styles.bedAvailable : styles.bedOccupied].join(" ")}><div className={styles.bedTop}><span className={styles.bedNumber}><BedDouble size={15} /> {bed.bedNumber}</span><Badge variant={bed.status === "AVAILABLE" ? "bed-available" : "bed-occupied"} size="sm">{bed.status === "AVAILABLE" ? "Available" : "Occupied"}</Badge></div><div className={styles.bedMeta}>{bed.ward}{bed.room ? ` · ${bed.room}` : ""}</div>{bed.patientName && <div className={styles.bedPatient}>{bed.patientName}<br /><span className={styles.muted}>{bed.uhid}</span></div>}</div>)}</div>}</Card>
    <AdmissionPanel beds={beds} onCreated={() => void load()} />
    <Card className={styles.card} noPadding><h2 className={styles.sectionTitle}>Current Inpatients</h2>{loading ? <div className={styles.empty}>Loading admissions…</div> : admissions.length === 0 ? <div className={styles.empty}>No patients currently admitted.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Admission</th><th>Patient</th><th>Ward / Bed</th><th>Admitted</th><th>Status</th><th>Action</th></tr></thead><tbody>{admissions.map((admission) => <tr key={admission.id}><td>{admission.admissionNumber}</td><td><Link className={styles.link} href={`/patients/${admission.patientId}`}>{admission.patientName}</Link><br /><span className={styles.muted}>{admission.uhid}</span></td><td>{admission.ward} · {admission.bedNumber}</td><td className={styles.muted}>{new Date(admission.admissionDate).toLocaleString("en-IN")}</td><td><Badge variant="bed-occupied" size="sm">Admitted</Badge></td><td><Button variant="danger" size="sm" onClick={() => void discharge(admission)}>Discharge / release</Button></td></tr>)}</tbody></table></div>}</Card>
  </div>;
}
