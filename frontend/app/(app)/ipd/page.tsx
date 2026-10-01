"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Pencil, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { createBed, dischargeAdmission, fetchAdmissions, fetchBeds, fetchIPDOverview, updateBed } from "@/lib/ipd";
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
  const [bedSaving, setBedSaving] = useState(false);
  const [editingBedId, setEditingBedId] = useState("");
  const [selectedFloor, setSelectedFloor] = useState("");
  const [bedForm, setBedForm] = useState({ bedNumberPrefix: "", bedCount: "1", floor: "", ward: "", room: "" });

  const assignedBeds = beds.filter((bed) => bed.floor && bed.floor !== "Unassigned");
  const unassignedBeds = beds.filter((bed) => !bed.floor || bed.floor === "Unassigned");
  const bedsByFloor = assignedBeds.reduce<Record<string, Bed[]>>((groups, bed) => {
    (groups[bed.floor] ??= []).push(bed);
    return groups;
  }, {});
  const floorOrder = ["GROUND FLOOR", "1ST FLOOR", "2ND FLOOR WARD", "3RD FLOOR", "4TH FLOOR", "5TH FLOOR"];
  const floorGroups = Object.entries(bedsByFloor).sort(([left], [right]) => {
    const leftIndex = floorOrder.indexOf(left.toUpperCase());
    const rightIndex = floorOrder.indexOf(right.toUpperCase());
    if (leftIndex !== -1 || rightIndex !== -1) return (leftIndex === -1 ? floorOrder.length : leftIndex) - (rightIndex === -1 ? floorOrder.length : rightIndex);
    return left.localeCompare(right, undefined, { numeric: true });
  }).map(([floor, floorBeds]) => ({
    floor,
    beds: floorBeds,
    wards: Object.entries(floorBeds.reduce<Record<string, Bed[]>>((groups, bed) => {
      (groups[bed.ward] ??= []).push(bed);
      return groups;
    }, {})).sort(([left], [right]) => left.localeCompare(right)),
  }));
  const displayedFloor = floorGroups.find(({ floor }) => floor === selectedFloor) ?? floorGroups[0];

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

  const saveBed = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    setBedSaving(true);
    setError("");
    try {
      if (editingBedId) {
        const bed = beds.find((item) => item.id === editingBedId);
        if (!bed) throw new Error("The selected bed could not be found.");
        await updateBed(token, editingBedId, { bedNumber: bed.bedNumber, floor: bedForm.floor, ward: bedForm.ward, room: bedForm.room || null });
        success("Bed location updated.", `${bed.bedNumber} · ${bedForm.floor}`);
      } else {
        const response = await createBed(token, { bedNumberPrefix: bedForm.bedNumberPrefix, bedCount: Number(bedForm.bedCount), floor: bedForm.floor, ward: bedForm.ward, room: bedForm.room || null });
        success(`${response.total} bed${response.total === 1 ? "" : "s"} added.`, `${bedForm.floor} · ${bedForm.ward}`);
      }
      setBedForm({ bedNumberPrefix: "", bedCount: "1", floor: "", ward: "", room: "" });
      setEditingBedId("");
      await load();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to save bed details.";
      setError(message);
      toastError("Unable to save bed details.", message);
    } finally {
      setBedSaving(false);
    }
  };

  const editBed = (bed: Bed) => {
    setEditingBedId(bed.id);
    setBedForm({ bedNumberPrefix: "", bedCount: "1", floor: bed.floor === "Unassigned" ? "" : bed.floor, ward: bed.ward, room: bed.room ?? "" });
  };

  const resetBedForm = () => {
    setEditingBedId("");
    setBedForm({ bedNumberPrefix: "", bedCount: "1", floor: "", ward: "", room: "" });
  };

  return <div className={styles.page}><div className={styles.header}><div><h1 className={styles.title}>IPD & Bed Management</h1><p className={styles.subtitle}>Manage inpatient admissions, bed availability, and releases.</p></div><Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => void load()}>Refresh</Button></div>
    {error && <div className={styles.error}>{error}</div>}
    <div className={styles.kpis}><Card className={styles.kpi}><span className={styles.kpiLabel}>Total beds</span><div className={styles.kpiValue}>{overview.total}</div></Card><Card className={styles.kpi}><span className={styles.kpiLabel}>Available</span><div className={styles.kpiValue}>{overview.available}</div></Card><Card className={styles.kpi}><span className={styles.kpiLabel}>Occupied</span><div className={styles.kpiValue}>{overview.occupied}</div></Card></div>
    <Card className={styles.card}><h2 className={styles.sectionTitle}>Floor and Ward Bed Overview</h2>{loading ? <div className={styles.empty}>Loading beds…</div> : assignedBeds.length === 0 ? <div className={styles.empty}>No beds have floor locations yet.</div> : <><div className={styles.floorTabs} role="tablist" aria-label="Select floor">{floorGroups.map(({ floor, beds: floorBeds }) => <button key={floor} type="button" role="tab" aria-selected={displayedFloor?.floor === floor} className={[styles.floorTab, displayedFloor?.floor === floor ? styles.floorTabActive : ""].filter(Boolean).join(" ")} onClick={() => setSelectedFloor(floor)}><span>{floor}</span><strong>{floorBeds.length}</strong><small>{floorBeds.filter((bed) => bed.status === "AVAILABLE").length} available</small></button>)}</div>{displayedFloor && <div className={styles.selectedFloor}><div className={styles.floorHeading}><h3>{displayedFloor.floor}</h3><span>{displayedFloor.wards.length} wards · {displayedFloor.beds.length} beds · {displayedFloor.beds.filter((bed) => bed.status === "AVAILABLE").length} available</span></div><div className={styles.wardGrid}>{displayedFloor.wards.map(([ward, wardBeds]) => <section className={styles.wardPanel} key={ward}><div className={styles.wardHeading}><h4>{ward}</h4><span>{wardBeds.length} beds · {wardBeds.filter((bed) => bed.status === "AVAILABLE").length} free</span></div><div className={styles.compactBeds}>{wardBeds.map((bed) => <div key={bed.id} className={[styles.compactBed, bed.status === "AVAILABLE" ? styles.compactBedAvailable : styles.compactBedOccupied].join(" ")} title={`${bed.bedNumber} · ${bed.room || "Room not set"}${bed.patientName ? ` · ${bed.patientName} (${bed.uhid})` : ""}`}><span className={styles.compactBedNumber}>{bed.bedNumber}</span><span className={styles.compactBedStatus}>{bed.status === "AVAILABLE" ? "Available" : bed.patientName || "Occupied"}</span>{bed.patientName && <span className={styles.compactBedPatient}>{bed.uhid}</span>}<Button type="button" variant="ghost" size="xs" leftIcon={<Pencil size={12} />} aria-label={`Edit ${bed.bedNumber} location`} onClick={() => editBed(bed)}>Edit</Button></div>)}</div></section>)}</div></div>}</>}</Card>
    <AdmissionPanel beds={beds} onCreated={() => void load()} />
      {unassignedBeds.length > 0 && <Card className={styles.card}><h2 className={styles.sectionTitle}>Unassigned bed locations</h2><div className={styles.bedGrid}>{unassignedBeds.map((bed) => <div key={bed.id} className={[styles.bed, bed.status === "AVAILABLE" ? styles.bedAvailable : styles.bedOccupied].join(" ")}><div className={styles.bedTop}><span className={styles.bedNumber}>{bed.bedNumber}</span><Badge variant={bed.status === "AVAILABLE" ? "bed-available" : "bed-occupied"} size="sm">{bed.status === "AVAILABLE" ? "Available" : "Occupied"}</Badge></div><div className={styles.bedMeta}>{bed.ward}{bed.room ? ` · ${bed.room}` : ""}</div>{bed.patientName && <div className={styles.bedPatient}>{bed.patientName}<br /><span className={styles.muted}>{bed.uhid}</span></div>}<Button type="button" variant="ghost" size="sm" leftIcon={<Pencil size={13} />} onClick={() => editBed(bed)}>Assign location</Button></div>)}</div></Card>}
    <Card className={styles.card} noPadding><h2 className={styles.sectionTitle}>Current Inpatients</h2>{loading ? <div className={styles.empty}>Loading admissions…</div> : admissions.length === 0 ? <div className={styles.empty}>No patients currently admitted.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Admission</th><th>Patient</th><th>Floor / Ward / Bed</th><th>Admitted</th><th>Status</th><th>Action</th></tr></thead><tbody>{admissions.map((admission) => <tr key={admission.id}><td>{admission.admissionNumber}</td><td><Link className={styles.link} href={`/patients/${admission.patientId}`}>{admission.patientName}</Link><br /><span className={styles.muted}>{admission.uhid}</span></td><td>{admission.floor} · {admission.ward}{admission.room ? ` · ${admission.room}` : ""} · {admission.bedNumber}</td><td className={styles.muted}>{new Date(admission.admissionDate).toLocaleString("en-IN")}</td><td><Badge variant="bed-occupied" size="sm">Admitted</Badge></td><td><Button variant="danger" size="sm" onClick={() => void discharge(admission)}>Discharge / release</Button></td></tr>)}</tbody></table></div>}</Card>
    <Card className={styles.card}><h2 className={styles.sectionTitle}>{editingBedId ? "Assign Bed Location" : "Add Beds"}</h2>{unassignedBeds.length > 0 && <div className={styles.locationNotice}><span>{unassignedBeds.length} existing beds need a floor assignment.</span><Select label="Choose bed to assign" placeholder="Select an existing bed" value={editingBedId && unassignedBeds.some((bed) => bed.id === editingBedId) ? editingBedId : ""} onChange={(event) => { const selected = unassignedBeds.find((bed) => bed.id === event.target.value); if (selected) editBed(selected); }} options={unassignedBeds.map((bed) => ({ value: bed.id, label: `${bed.bedNumber} · ${bed.ward}${bed.room ? ` · ${bed.room}` : ""}` }))} />{editingBedId && unassignedBeds.some((bed) => bed.id === editingBedId) && <Button type="button" variant="ghost" size="sm" onClick={resetBedForm}>Clear selection</Button>}</div>}<form className={styles.bedForm} onSubmit={(event) => void saveBed(event)}>{!editingBedId && <><Input label="Number of beds" type="number" min="1" max="200" value={bedForm.bedCount} onChange={(event) => setBedForm((current) => ({ ...current, bedCount: event.target.value }))} required /><Input label="Bed number prefix (optional)" placeholder="Defaults to ward name" value={bedForm.bedNumberPrefix} onChange={(event) => setBedForm((current) => ({ ...current, bedNumberPrefix: event.target.value }))} /></>}<Input label="Floor" placeholder="e.g. First Floor" value={bedForm.floor} onChange={(event) => setBedForm((current) => ({ ...current, floor: event.target.value }))} required /><Input label="Ward" placeholder="e.g. General Ward" value={bedForm.ward} onChange={(event) => setBedForm((current) => ({ ...current, ward: event.target.value }))} required /><Input label="Room (optional)" placeholder="e.g. G-1" value={bedForm.room} onChange={(event) => setBedForm((current) => ({ ...current, room: event.target.value }))} /><div className={styles.bedFormActions}><Button type="submit" loading={bedSaving}>{editingBedId ? "Save location" : "Add beds"}</Button>{editingBedId && <Button type="button" variant="secondary" onClick={resetBedForm}>Cancel edit</Button>}</div></form></Card>
  </div>;
}
