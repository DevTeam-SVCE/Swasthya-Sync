"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/context/AuthContext";
import { createPatient, fetchDoctors, updatePatient } from "@/lib/patients";
import { useToast } from "@/components/ui/Toast";
import { ADMISSION_TYPES, BLOOD_GROUPS, DEPARTMENTS, GENDERS, INITIAL_STATUSES, MLC_TYPES, PATIENT_CATEGORIES, PAYMENT_TYPES } from "@/types/patients";
import type { Doctor, Patient, PatientFormData } from "@/types/patients";
import styles from "./Patient.module.css";

export const emptyPatientForm: PatientFormData = {
  fullName: "", admissionType: "", age: "", dateOfBirth: "", gender: "", bloodGroup: "Unknown", mobile: "", aadhaar: "", abhaId: "", address: "", guardianName: "", guardianRelation: "", guardianPhone: "", department: "", attendingDoctorId: "", initialStatus: "Stable", patientCategory: "General", mlcType: "None", chiefComplaint: "", paymentType: "Self Pay", insuranceCompany: "", tpaName: "", policyMemberId: "", policyValidity: "",
};

function formFromPatient(patient?: Patient): PatientFormData {
  if (!patient) return emptyPatientForm;
  return { ...patient, age: String(patient.age), dateOfBirth: patient.dateOfBirth?.slice(0, 10) ?? "", createdAt: undefined, updatedAt: undefined, attendingDoctor: undefined } as unknown as PatientFormData;
}

interface PatientWizardProps {
  initialPatient?: Patient;
  patientId?: string;
  onSaved?: (patient: Patient) => void;
}

const stepNames = ["Personal Details", "Clinical Information", "Payment / Insurance", "Consent & Submit"];

export function PatientWizard({ initialPatient, patientId, onSaved }: PatientWizardProps) {
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [form, setForm] = useState<PatientFormData>(() => formFromPatient(initialPatient));
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doctorError, setDoctorError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetchDoctors(token).then((response) => setDoctors(response.doctors)).catch(() => setDoctorError("Unable to load registered doctors."));
  }, [token]);

  const update = (field: keyof PatientFormData, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const validateStep = (currentStep: number) => {
    const nextErrors: Record<string, string> = {};
    if (currentStep === 0) {
      if (form.fullName.trim().length < 2) nextErrors.fullName = "Enter the patient's full name.";
      if (!form.admissionType) nextErrors.admissionType = "Select an admission type.";
      if (!form.age || !/^\d+$/.test(form.age) || Number(form.age) < 0 || Number(form.age) > 130) nextErrors.age = "Enter a valid age from 0 to 130.";
      if (!form.gender) nextErrors.gender = "Select a gender.";
      if (!/^\d{10}$/.test(form.mobile)) nextErrors.mobile = "Enter a valid 10-digit mobile number.";
      if (form.aadhaar && !/^\d{4} \d{4} \d{4}$/.test(form.aadhaar)) nextErrors.aadhaar = "Use XXXX XXXX XXXX format.";
      if (form.abhaId && !/^\d{14}$/.test(form.abhaId)) nextErrors.abhaId = "ABHA Health ID must contain 14 digits.";
    }
    if (currentStep === 1) {
      if (!form.department) nextErrors.department = "Select a department.";
      if (!form.attendingDoctorId) nextErrors.attendingDoctorId = "Select an attending doctor.";
    }
    if (currentStep === 2 && form.paymentType === "Insurance / TPA" && !form.insuranceCompany.trim()) nextErrors.insuranceCompany = "Enter the insurance company.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const next = () => { if (validateStep(step)) setStep((current) => Math.min(current + 1, 3)); };
  const back = () => setStep((current) => Math.max(current - 1, 0));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validateStep(2)) { setStep(2); return; }
    if (!consent) { setErrors({ consent: "Consent is required before registration." }); return; }
    if (!token) return;
    setSaving(true);
    try {
      const response = patientId ? await updatePatient(token, patientId, form) : await createPatient(token, form);
      success(patientId ? "Patient updated successfully." : "Patient registered successfully.", response.patient.uhid);
      onSaved?.(response.patient);
    } catch (requestError) {
      toastError("Unable to save patient.", requestError instanceof Error ? requestError.message : "Please try again.");
    } finally { setSaving(false); }
  };

  const doctorOptions = doctors.filter((doctor) => !form.department || doctor.department === form.department).map((doctor) => ({ value: doctor.id, label: `${doctor.name} · ${doctor.department}` }));
  const field = (name: keyof PatientFormData) => ({ value: form[name], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => update(name, event.target.value) });

  return (
    <Card className={styles.card} noPadding>
      <div className={styles.stepper} aria-label="Registration progress">
        {stepNames.map((name, index) => <div key={name} className={[styles.step, index === step ? styles["step--active"] : "", index < step ? styles["step--complete"] : ""].filter(Boolean).join(" ")}><span className={styles.stepNumber}>{index < step ? "✓" : index + 1}</span><span>{name}</span></div>)}
      </div>
      <form onSubmit={submit}>
        <div className={styles.formBody}>
          {step === 0 && <>
            <h2 className={styles.sectionTitle}>Personal Details</h2>
            <p className={styles.stepHint}>Required fields are marked with an asterisk.</p>
            <div className={styles.formGrid}>
              <Input label="Full name" required error={errors.fullName} {...field("fullName")} />
              <Select label="Admission type" required placeholder="Select admission type" error={errors.admissionType} options={ADMISSION_TYPES.map((value) => ({ value, label: value }))} {...field("admissionType")} />
              <Input label="Age" type="number" min="0" max="130" required error={errors.age} {...field("age")} />
              <Input label="Date of birth" type="date" error={errors.dateOfBirth} {...field("dateOfBirth")} />
              <Select label="Gender" required placeholder="Select gender" error={errors.gender} options={GENDERS.map((value) => ({ value, label: value }))} {...field("gender")} />
              <Select label="Blood group" options={BLOOD_GROUPS.map((value) => ({ value, label: value }))} {...field("bloodGroup")} />
              <Input label="Mobile number" required inputMode="numeric" placeholder="10-digit mobile number" error={errors.mobile} {...field("mobile")} />
              <Input label="Aadhaar number" placeholder="XXXX XXXX XXXX" helperText="Optional; stored securely." error={errors.aadhaar} {...field("aadhaar")} />
              <Input label="ABHA Health ID" placeholder="14 digits" error={errors.abhaId} {...field("abhaId")} />
              <Input label="Guardian name" {...field("guardianName")} />
              <Input label="Guardian relation" {...field("guardianRelation")} />
              <Input label="Guardian phone" inputMode="numeric" {...field("guardianPhone")} />
              <Textarea label="Address" className={styles.formGridFull} rows={3} {...field("address")} />
            </div>
          </>}
          {step === 1 && <>
            <h2 className={styles.sectionTitle}>Clinical Information</h2>
            <div className={styles.formGrid}>
              <Select label="Department" required placeholder="Select department" error={errors.department} options={DEPARTMENTS.map((value) => ({ value, label: value }))} {...field("department")} />
              <Select label="Attending doctor" required placeholder={doctorError || "Select doctor"} error={errors.attendingDoctorId} options={doctorOptions} {...field("attendingDoctorId")} />
              <Select label="Initial status" options={INITIAL_STATUSES.map((value) => ({ value, label: value }))} {...field("initialStatus")} />
              <Select label="Patient category" options={PATIENT_CATEGORIES.map((value) => ({ value, label: value }))} {...field("patientCategory")} />
              <Select label="MLC type" options={MLC_TYPES.map((value) => ({ value, label: value }))} {...field("mlcType")} />
              <Textarea label="Chief complaint" rows={4} className={styles.formGridFull} {...field("chiefComplaint")} />
            </div>
            {form.mlcType !== "None" && <div className={styles.alert}><AlertTriangle size={16} /> This patient is marked as an MLC case. The full medico-legal workflow is handled in a later phase.</div>}
          </>}
          {step === 2 && <>
            <h2 className={styles.sectionTitle}>Payment / Insurance</h2>
            <div className={styles.formGrid}>
              <Select label="Payment type" options={PAYMENT_TYPES.map((value) => ({ value, label: value }))} {...field("paymentType")} />
              {form.paymentType === "Insurance / TPA" && <>
                <Input label="Insurance company" required error={errors.insuranceCompany} {...field("insuranceCompany")} />
                <Input label="TPA name" {...field("tpaName")} />
                <Input label="Policy / member ID" {...field("policyMemberId")} />
                <Input label="Policy validity" type="date" {...field("policyValidity")} />
              </>}
            </div>
          </>}
          {step === 3 && <>
            <h2 className={styles.sectionTitle}>Review & Consent</h2>
            <div className={styles.summary}>
              <SummarySection title="Personal Details" rows={[["Name", form.fullName], ["Admission", form.admissionType], ["Age / Gender", `${form.age} / ${form.gender}`], ["Mobile", form.mobile], ["Blood group", form.bloodGroup], ["Address", form.address || "Not provided"]]} />
              <SummarySection title="Clinical Information" rows={[["Department", form.department], ["Doctor", doctors.find((doctor) => doctor.id === form.attendingDoctorId)?.name ?? "Not selected"], ["Status", form.initialStatus], ["Category", form.patientCategory], ["MLC", form.mlcType], ["Complaint", form.chiefComplaint || "Not provided"]]} />
              <SummarySection title="Payment / Insurance" rows={[["Payment type", form.paymentType], ["Insurance", form.insuranceCompany || "Not applicable"], ["Policy ID", form.policyMemberId || "Not provided"]]} />
            </div>
            <label className={styles.consent}><input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setErrors({}); }} /> I confirm that the information provided is accurate and consent to create this patient record. {errors.consent && <span className={styles.consentError}>{errors.consent}</span>}</label>
          </>}
        </div>
        <div className={styles.formFooter}>
          <div>{step > 0 && <Button type="button" variant="secondary" leftIcon={<ArrowLeft size={15} />} onClick={back}>Back</Button>}</div>
          <div className={styles.footerRight}>{step < 3 ? <Button type="button" rightIcon={<ArrowRight size={15} />} onClick={next}>Continue</Button> : <Button type="submit" loading={saving} leftIcon={<CheckCircle2 size={15} />}>{patientId ? "Save changes" : "Register patient"}</Button>}</div>
        </div>
      </form>
    </Card>
  );
}

function SummarySection({ title, rows }: { title: string; rows: string[][] }) {
  return <div className={styles.summarySection}><h3>{title}</h3>{rows.map(([label, value]) => <div className={styles.summaryRow} key={label}><span className={styles.summaryLabel}>{label}</span><span className={styles.summaryValue}>{value || "Not provided"}</span></div>)}</div>;
}
