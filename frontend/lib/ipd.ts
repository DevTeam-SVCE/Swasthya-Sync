import { apiRequest, authHeaders } from "@/lib/api";
import type { Bed, IPDAdmission, IPDOverview } from "@/types/ipd";

export async function fetchIPDOverview(token: string) { return apiRequest<IPDOverview>("/api/ipd/overview", { headers: authHeaders(token) }); }
export async function fetchBeds(token: string) { return apiRequest<{ beds: Bed[]; total: number }>("/api/ipd/beds", { headers: authHeaders(token) }); }
export async function createBed(token: string, input: { bedNumberPrefix: string; bedCount: number; floor: string; ward: string; room: string | null }) { return apiRequest<{ beds: Bed[]; total: number }>("/api/ipd/beds", { method: "POST", headers: authHeaders(token), body: JSON.stringify(input) }); }
export async function updateBed(token: string, id: string, input: Pick<Bed, "bedNumber" | "floor" | "ward" | "room">) { return apiRequest<{ bed: Bed }>(`/api/ipd/beds/${id}`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(input) }); }
export async function fetchAdmissions(token: string) { return apiRequest<{ admissions: IPDAdmission[]; total: number }>("/api/ipd/admissions", { headers: authHeaders(token) }); }
export async function createAdmission(token: string, patientId: string, bedId: string) { return apiRequest<{ admission: IPDAdmission }>("/api/ipd/admissions", { method: "POST", headers: authHeaders(token), body: JSON.stringify({ patientId, bedId }) }); }
export async function dischargeAdmission(token: string, id: string) { return apiRequest<{ released: boolean }>(`/api/ipd/admissions/${id}/discharge`, { method: "PUT", headers: authHeaders(token) }); }
