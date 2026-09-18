import { apiRequest, authHeaders } from "@/lib/api";
import type { Doctor, Patient, PatientFormData, PatientListResponse } from "@/types/patients";

export async function fetchPatients(token: string, search = ""): Promise<PatientListResponse> {
  const query = search ? `?q=${encodeURIComponent(search)}` : "";
  return apiRequest<PatientListResponse>(`/api/patients${query}`, { headers: authHeaders(token) });
}

export async function fetchPatient(token: string, id: string): Promise<{ patient: Patient }> {
  return apiRequest<{ patient: Patient }>(`/api/patients/${id}`, { headers: authHeaders(token) });
}

export async function fetchDoctors(token: string): Promise<{ doctors: Doctor[] }> {
  return apiRequest<{ doctors: Doctor[] }>("/api/doctors", { headers: authHeaders(token) });
}

export async function createPatient(token: string, data: PatientFormData): Promise<{ patient: Patient }> {
  return apiRequest<{ patient: Patient }>("/api/patients", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ...data, age: Number(data.age) }),
  });
}

export async function updatePatient(token: string, id: string, data: PatientFormData): Promise<{ patient: Patient }> {
  return apiRequest<{ patient: Patient }>(`/api/patients/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ ...data, age: Number(data.age) }),
  });
}
