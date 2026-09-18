"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AppointmentWizard } from "@/components/appointments/AppointmentWizard";
import styles from "@/components/appointments/Appointment.module.css";
import { useRouter } from "next/navigation";

export default function NewAppointmentPage() {
  const router = useRouter();
  return <div className={styles.page}><div className={styles.header}><div><h1 className={styles.title}>Book Appointment</h1><p className={styles.subtitle}>Select a doctor, check availability, and link an existing patient.</p></div><Link href="/appointments"><Button variant="secondary" leftIcon={<ArrowLeft size={15} />}>Back to appointments</Button></Link></div><AppointmentWizard onCreated={(id) => router.push(`/appointments/${id}`)} /></div>;
}
