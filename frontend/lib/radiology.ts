import { apiRequest, authHeaders } from "@/lib/api";

export type RadiologyPriority = "STAT" | "URGENT" | "ROUTINE";
export type RadiologyStatus = "ORDERED" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "VERIFIED";

export interface RadiologyOrder {
  id: string;
  hospitalId: string;
  patientId: string;
  patientName: string;
  uhid: string;
  age: number;
  sex: string;
  department: string;
  cpoeOrderId: string;
  cpoeOrderNumber: string;
  examinationName: string;
  modality?: string | null;
  bodyPart?: string | null;
  clinicalIndication?: string | null;
  clinicalInstructions?: string | null;
  notes?: string | null;
  priority: RadiologyPriority;
  status: RadiologyStatus;
  orderedBy: string;
  orderedByName: string;
  orderedAt: string;
  scheduledAt?: string | null;
  performedAt?: string | null;
  performedBy?: string | null;
  performedByName?: string | null;
  findings?: string | null;
  impression?: string | null;
  remarks?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  verifiedByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

type RadiologyOrderResponse = { order: RadiologyOrder };

export async function fetchRadiologyOrders(
  token: string,
  filters?: { patientId?: string; status?: RadiologyStatus; priority?: RadiologyPriority; q?: string }
): Promise<{ orders: RadiologyOrder[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.patientId) params.set("patientId", filters.patientId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.priority) params.set("priority", filters.priority);
  if (filters?.q) params.set("q", filters.q);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<{ orders: RadiologyOrder[]; total: number }>(`/api/radiology/orders${query}`, {
    headers: authHeaders(token),
  });
}

export async function fetchRadiologyOrder(token: string, id: string): Promise<RadiologyOrderResponse> {
  return apiRequest<RadiologyOrderResponse>(`/api/radiology/orders/${id}`, { headers: authHeaders(token) });
}

export async function scheduleRadiologyOrder(token: string, id: string): Promise<RadiologyOrderResponse> {
  return apiRequest<RadiologyOrderResponse>(`/api/radiology/orders/${id}/schedule`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function startRadiologyOrder(token: string, id: string): Promise<RadiologyOrderResponse> {
  return apiRequest<RadiologyOrderResponse>(`/api/radiology/orders/${id}/start`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function saveRadiologyReport(
  token: string,
  id: string,
  input: { findings: string; impression: string; remarks: string }
): Promise<RadiologyOrderResponse> {
  return apiRequest<RadiologyOrderResponse>(`/api/radiology/orders/${id}/report`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function completeRadiologyOrder(token: string, id: string): Promise<RadiologyOrderResponse> {
  return apiRequest<RadiologyOrderResponse>(`/api/radiology/orders/${id}/complete`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function verifyRadiologyOrder(token: string, id: string): Promise<RadiologyOrderResponse> {
  return apiRequest<RadiologyOrderResponse>(`/api/radiology/orders/${id}/verify`, {
    method: "POST",
    headers: authHeaders(token),
  });
}