import { apiRequest, authHeaders } from "@/lib/api";

export type NursingTaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type NursingTaskType =
  | "Medication administration"
  | "Vital-sign monitoring"
  | "Patient repositioning"
  | "Wound / skin care"
  | "Intake / output monitoring"
  | "Other";

export interface NursingAdmission {
  id: string;
  admissionNumber: string;
  admissionDate: string;
  status: "ADMITTED";
  patientId: string;
  patientName: string;
  uhid: string;
  age: number;
  sex: string;
  bloodGroup?: string | null;
  chiefComplaint?: string | null;
  department: string;
  attendingDoctor: string;
  bedNumber: string;
  ward: string;
  room?: string | null;
}

export interface NursingEntry {
  id: string;
  admissionId: string;
  patientId: string;
  recordedAt?: string;
  recordedBy?: string;
  recordedByName?: string;
  [key: string]: unknown;
}

export interface NursingTask extends NursingEntry {
  taskType: NursingTaskType;
  description: string;
  status: NursingTaskStatus;
  createdAt: string;
  createdByName?: string;
  completedAt?: string | null;
  completedByName?: string | null;
}

export interface NursingMedication {
  cpoeOrderId: string;
  orderNumber: string;
  medicationName: string;
  clinicalInstructions?: string | null;
  priority: "STAT" | "URGENT" | "ROUTINE";
  cpoeStatus: string;
  pharmacyStatus?: string | null;
  orderedAt: string;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  quantity?: string | null;
}

export interface NursingWorkspace {
  admission: NursingAdmission;
  assessments: NursingEntry[];
  vitals: NursingEntry[];
  notes: NursingEntry[];
  tasks: NursingTask[];
  intakeOutput: NursingEntry[];
  medications: NursingMedication[];
}

export interface NursingVitalsInput {
  temperature: string;
  pulse: string;
  respiratoryRate: string;
  spo2: string;
  systolicBp: string;
  diastolicBp: string;
  weight: string;
  notes: string;
}

export async function fetchNursingAdmissions(token: string, filters?: { q?: string; ward?: string }) {
  const params = new URLSearchParams();
  if (filters?.q) params.set("q", filters.q);
  if (filters?.ward) params.set("ward", filters.ward);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<{ admissions: NursingAdmission[]; total: number; wards: string[] }>(`/api/nursing/admissions${query}`, { headers: authHeaders(token) });
}

export async function fetchNursingWorkspace(token: string, admissionId: string) {
  return apiRequest<NursingWorkspace>(`/api/nursing/admissions/${admissionId}`, { headers: authHeaders(token) });
}

export async function createNursingAssessment(token: string, admissionId: string, input: Record<string, string>) {
  return apiRequest<{ assessment: NursingEntry }>(`/api/nursing/admissions/${admissionId}/assessments`, { method: "POST", headers: authHeaders(token), body: JSON.stringify(input) });
}

export async function createNursingVitals(token: string, admissionId: string, input: NursingVitalsInput) {
  return apiRequest<{ vital: NursingEntry }>(`/api/nursing/admissions/${admissionId}/vitals`, { method: "POST", headers: authHeaders(token), body: JSON.stringify(input) });
}

export async function createNursingNote(token: string, admissionId: string, input: Record<string, string>) {
  return apiRequest<{ note: NursingEntry }>(`/api/nursing/admissions/${admissionId}/notes`, { method: "POST", headers: authHeaders(token), body: JSON.stringify(input) });
}

export async function createNursingTask(token: string, admissionId: string, input: { taskType: NursingTaskType; description: string }) {
  return apiRequest<{ task: NursingTask }>(`/api/nursing/admissions/${admissionId}/tasks`, { method: "POST", headers: authHeaders(token), body: JSON.stringify(input) });
}

export async function updateNursingTask(token: string, admissionId: string, taskId: string, status: NursingTaskStatus) {
  return apiRequest<{ task: NursingTask }>(`/api/nursing/admissions/${admissionId}/tasks/${taskId}`, { method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ status }) });
}

export async function createNursingIoEntry(token: string, admissionId: string, input: { direction: "INTAKE" | "OUTPUT"; entryType: string; amount: string; unit: string; notes: string }) {
  return apiRequest<{ entry: NursingEntry }>(`/api/nursing/admissions/${admissionId}/intake-output`, { method: "POST", headers: authHeaders(token), body: JSON.stringify(input) });
}