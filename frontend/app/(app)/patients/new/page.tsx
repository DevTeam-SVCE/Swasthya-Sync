"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PatientWizard } from "@/components/patients/PatientWizard";
import styles from "@/components/patients/Patient.module.css";

export default function NewPatientPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Register Patient</h1>
          <p className={styles.subtitle}>Create a patient record through the four-step registration workflow.</p>
        </div>
        <Link href="/patients"><Button variant="secondary" leftIcon={<ArrowLeft size={15} />}>Back to patients</Button></Link>
      </div>
      <PatientWizard />
    </div>
  );
}
