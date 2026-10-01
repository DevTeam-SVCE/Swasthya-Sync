import { apiRequest, authHeaders } from "@/lib/api";

export type OtStatus = "SCHEDULED" | "PREPARATION" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "POSTPONED";
export type OtPriority = "STAT" | "URGENT" | "ROUTINE";
export type OtNoteType = "PRE_OPERATIVE" | "INTRA_OPERATIVE" | "POST_OPERATIVE";

export interface OtTheatre {
  id: string;
  name: string;
  active: boolean;
}

export interface OtProcedureOrder {
  id: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  uhid: string;
  procedureName: string;
  priority: OtPriority;
  clinicalInstructions?: string | null;
  notes?: string | null;
  orderedAt: string;
}

export interface OtCase {
  id: string;
  patientId: string;
  patientName: string;
  uhid: string;
  age: number;
  sex: string;
  bloodGroup?: string | null;
  chiefComplaint?: string | null;
  department: string;
  attendingDoctor: string;
  admissionId?: string | null;
  admissionNumber?: string | null;
  admissionStatus?: string | null;
  bedNumber?: string | null;
  ward?: string | null;
  room?: string | null;
  cpoeOrderId?: string | null;
  cpoeOrderNumber?: string | null;
  theatreId: string;
  theatreName: string;
  procedureName: string;
  surgeon: string;
  anaesthetist: string;
  anaesthesiaType?: string | null;
  scheduledAt: string;
  durationMinutes: number;
  priority: OtPriority;
  status: OtStatus;
  clinicalIndication?: string | null;
  clinicalInstructions?: string | null;
  checklist: Record<string, boolean>;
  actualProcedure?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  operativeSurgeon?: string | null;
  operativeAnaesthetist?: string | null;
  findings?: string | null;
  procedureNotes?: string | null;
  complications?: string | null;
  estimatedBloodLossMl?: number | string | null;
  specimens?: string | null;
  operativeRemarks?: string | null;
  recoveryStatus?: string | null;
  postoperativeInstructions?: string | null;
  followUpInstructions?: string | null;
  postoperativeComplications?: string | null;
  postoperativeRemarks?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OtCaseNote {
  id: string;
  otCaseId: string;
  noteType: OtNoteType;
  noteText: string;
  createdAt: string;
  createdBy: string;
  authorName?: string | null;
}

export interface OtCaseDetails {
  otCase: OtCase;
  notes: OtCaseNote[];
}

export async function fetchOtTheatres(token: string) {
  return apiRequest<{ theatres: OtTheatre[]; total: number }>("/api/ot/theatres", { headers: authHeaders(token) });
}

export async function fetchOtProcedureOrders(token: string) {
  return apiRequest<{ orders: OtProcedureOrder[]; total: number }>("/api/ot/procedure-orders", { headers: authHeaders(token) });
}

export async function fetchOtCases(token: string, filters?: { q?: string; status?: OtStatus; date?: string }) {
  const params = new URLSearchParams();
  if (filters?.q) params.set("q", filters.q);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.date) params.set("date", filters.date);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<{ cases: OtCase[]; total: number }>(`/api/ot/cases${query}`, { headers: authHeaders(token) });
}

export async function fetchOtCase(token: string, id: string): Promise<OtCaseDetails> {
  return apiRequest<OtCaseDetails>(`/api/ot/cases/${id}`, { headers: authHeaders(token) });
}

export async function createOtCase(token: string, input: {
  patientId: string;
  admissionId?: string;
  cpoeOrderId?: string;
  procedureName: string;
  surgeon: string;
  anaesthetist: string;
  theatreId: string;
  scheduledAt: string;
  durationMinutes: number;
  priority: OtPriority;
  anaesthesiaType?: string;
  clinicalIndication?: string;
  clinicalInstructions?: string;
}) {
  return apiRequest<{ otCase: OtCase }>("/api/ot/cases", { method: "POST", headers: authHeaders(token), body: JSON.stringify(input) });
}

export async function updateOtCaseStatus(token: string, id: string, input: { status: OtStatus; scheduledAt?: string; theatreId?: string }) {
  return apiRequest<{ otCase: OtCase }>(`/api/ot/cases/${id}/status`, { method: "PATCH", headers: authHeaders(token), body: JSON.stringify(input) });
}

export async function updateOtChecklist(token: string, id: string, checklist: Record<string, boolean>) {
  return apiRequest<{ otCase: OtCase }>(`/api/ot/cases/${id}/checklist`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify({ checklist }) });
}

export async function createOtCaseNote(token: string, id: string, noteType: OtNoteType, noteText: string) {
  return apiRequest<{ note: OtCaseNote }>(`/api/ot/cases/${id}/notes`, { method: "POST", headers: authHeaders(token), body: JSON.stringify({ noteType, noteText }) });
}

export async function updateOtOperativeDetails(token: string, id: string, input: Record<string, string>) {
  return apiRequest<{ otCase: OtCase }>(`/api/ot/cases/${id}/operative-details`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(input) });
}

export async function updateOtPostoperative(token: string, id: string, input: Record<string, string>) {
  return apiRequest<{ otCase: OtCase }>(`/api/ot/cases/${id}/postoperative`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(input) });
}