"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Plus, RefreshCw, Search } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/context/AuthContext";
import { fetchPatients } from "@/lib/patients";
import { ADMISSION_TYPES, DEPARTMENTS, INITIAL_STATUSES } from "@/types/patients";
import type { Patient } from "@/types/patients";
import styles from "@/components/patients/Patient.module.css";

export default function PatientsPage() {
  const { token } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filters, setFilters] = useState({ search: "", admissionType: "", department: "", status: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPatients = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetchPatients(token, filters.search);
      setPatients(response.patients);
    } catch {
      setError("Unable to load patients. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchPatients(token).then((response) => {
      if (active) setPatients(response.patients);
    }).catch(() => {
      if (active) setError("Unable to load patients. Check that the backend is running.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  const filteredPatients = patients.filter((patient) =>
    (!filters.admissionType || patient.admissionType === filters.admissionType) &&
    (!filters.department || patient.department === filters.department) &&
    (!filters.status || patient.initialStatus === filters.status)
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Patients</h1>
          <p className={styles.subtitle}>Registration, UHID management, records, and demographics.</p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => void loadPatients()}>Refresh</Button>
          <Link href="/patients/new"><Button leftIcon={<Plus size={15} />}>Add patient</Button></Link>
        </div>
      </div>

      <Card className={styles.card} noPadding>
        <form className={styles.toolbar} onSubmit={(event) => { event.preventDefault(); void loadPatients(); }}>
          <Input label="Search" placeholder="Name, UHID, or mobile" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} leftIcon={<Search size={15} />} />
          <Select label="Admission type" placeholder="All types" value={filters.admissionType} onChange={(event) => setFilters((current) => ({ ...current, admissionType: event.target.value }))} options={ADMISSION_TYPES.map((value) => ({ value, label: value }))} />
          <Select label="Department" placeholder="All departments" value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))} options={DEPARTMENTS.map((value) => ({ value, label: value }))} />
          <Select label="Status" placeholder="All statuses" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} options={INITIAL_STATUSES.map((value) => ({ value, label: value }))} />
        </form>
      </Card>

      {error && <div className={styles.error} role="alert">{error}</div>}
      <Card className={styles.card} noPadding>
        {loading ? <div className={styles.empty}>Loading patient records…</div> : filteredPatients.length === 0 ? <div className={styles.empty}>No patients found matching your search.</div> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>UHID</th><th>Patient</th><th>Age / Gender</th><th>Mobile</th><th>Admission</th><th>Department</th><th>Doctor</th><th>Status</th><th>Registered</th><th>Action</th></tr></thead>
              <tbody>{filteredPatients.map((patient) => <tr key={patient.id}>
                <td><Link href={`/patients/${patient.id}`} className={styles.patientLink}>{patient.uhid}</Link></td>
                <td><Link href={`/patients/${patient.id}`} className={styles.patientLink}>{patient.fullName}</Link></td>
                <td className={styles.muted}>{patient.age}y · {patient.gender}</td>
                <td className={styles.muted}>{patient.mobile}</td>
                <td><Badge size="sm">{patient.admissionType}</Badge></td>
                <td className={styles.muted}>{patient.department}</td>
                <td className={styles.muted}>{patient.attendingDoctor}</td>
                <td><StatusBadge status={patient.initialStatus as "Stable" | "Critical" | "Recovering" | "Serious" | "Under Obs"} size="sm" dot /></td>
                <td className={styles.muted}>{new Date(patient.createdAt).toLocaleDateString("en-IN")}</td>
                <td><Link href={`/patients/${patient.id}`} aria-label={`View ${patient.fullName}`}><Button variant="ghost" size="sm" leftIcon={<Eye size={14} />}>View</Button></Link></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
