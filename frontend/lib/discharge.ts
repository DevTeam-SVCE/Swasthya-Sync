import { apiRequest, authHeaders } from "@/lib/api";
import type { IPDAdmission } from "@/types/ipd";

export interface DischargeSummary {
  id: string;
  admissionId: string;
  admissionNumber: string;
  patientId: string;
  patientName: string;
  uhid: string;
  admissionDate: string;
  status: "DRAFT" | "COMPLETED";
  diagnosis: string | null;
  clinicalSummary: string | null;
  treatmentProcedure: string | null;
  dischargeCondition: string | null;
  dischargeInstructions: string | null;
  followUp: string | null;
  consultant: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DischargeSummaryInput {
  admissionId: string;
  diagnosis?: string;
  clinicalSummary?: string;
  treatmentProcedure?: string;
  dischargeCondition?: string;
  dischargeInstructions?: string;
  followUp?: string;
  consultant?: string;
  status?: "DRAFT" | "COMPLETED";
}

export async function fetchDischargeAdmissions(token: string) {
  return apiRequest<{ admissions: IPDAdmission[]; total: number }>("/api/discharge/admissions", { headers: authHeaders(token) });
}

export async function fetchDischargeSummaries(token: string) {
  return apiRequest<{ summaries: DischargeSummary[]; total: number }>("/api/discharge/summaries", { headers: authHeaders(token) });
}

export async function createDischargeSummary(token: string, input: DischargeSummaryInput) {
  return apiRequest<{ summary: DischargeSummary }>("/api/discharge/summaries", { method: "POST", headers: authHeaders(token), body: JSON.stringify(input) });
}

export async function updateDischargeSummary(token: string, id: string, input: Partial<DischargeSummaryInput>) {
  return apiRequest<{ summary: DischargeSummary }>(`/api/discharge/summaries/${id}`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(input) });
}

export function dischargePdfUrl(id: string) {
  return `/api/discharge/summaries/${id}/pdf`;
}
