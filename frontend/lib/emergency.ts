import { apiRequest, authHeaders } from "@/lib/api";

export type TriageLevel = "Red" | "Orange" | "Yellow" | "Green";
export type EmergencyStatus = "Waiting" | "In Treatment" | "Transferred" | "Discharged";

export interface EmergencyEncounter {
  id: string;
  hospitalId: string;
  patientId: string;
  patientName: string;
  uhid: string;
  age: number;
  gender: string;
  department: string;
  mlcType: string;
  arrivalTime: string;
  triageLevel: TriageLevel;
  status: EmergencyStatus;
  complaint: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchEmergencyQueue(token: string) {
  return apiRequest<{ encounters: EmergencyEncounter[]; total: number }>("/api/emergency/queue", {
    headers: authHeaders(token),
  });
}

export async function createEmergencyEncounter(
  token: string,
  input: {
    patientId: string;
    triageLevel: TriageLevel;
    status?: EmergencyStatus;
    complaint: string;
    notes?: string;
    arrivalTime?: string;
  }
) {
  return apiRequest<{ encounter: EmergencyEncounter }>("/api/emergency/encounters", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function updateEmergencyEncounter(
  token: string,
  id: string,
  input: Partial<{
    triageLevel: TriageLevel;
    status: EmergencyStatus;
    complaint: string;
    notes: string;
  }>
) {
  return apiRequest<{ encounter: EmergencyEncounter }>(`/api/emergency/encounters/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}
