import { apiRequest, authHeaders } from "@/lib/api";

export type CpoeOrderCategory = "Laboratory" | "Radiology" | "Medication" | "Procedure" | "Other";
export type CpoeOrderPriority = "STAT" | "URGENT" | "ROUTINE";
export type CpoeOrderStatus = "ORDERED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface CpoeOrder {
  id: string;
  orderNumber: string;
  hospitalId: string;
  patientId: string;
  patientName: string;
  uhid: string;
  orderingClinician: string;
  category: CpoeOrderCategory;
  orderItem: string;
  priority: CpoeOrderPriority;
  clinicalInstructions?: string | null;
  notes?: string | null;
  status: CpoeOrderStatus;
  orderedAt: string;
  updatedAt: string;
}

export async function fetchCpoeOrders(token: string, filters?: { patientId?: string; status?: CpoeOrderStatus; q?: string }) {
  const params = new URLSearchParams();
  if (filters?.patientId) params.set("patientId", filters.patientId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.q) params.set("q", filters.q);

  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<{ orders: CpoeOrder[]; total: number }>(`/api/cpoe/orders${query}`, {
    headers: authHeaders(token),
  });
}

export async function fetchCpoeOrder(token: string, id: string) {
  return apiRequest<{ order: CpoeOrder }>(`/api/cpoe/orders/${id}`, { headers: authHeaders(token) });
}

export async function createCpoeOrder(
  token: string,
  input: {
    patientId: string;
    category: CpoeOrderCategory;
    orderItem: string;
    priority?: CpoeOrderPriority;
    clinicalInstructions?: string;
    notes?: string;
  }
) {
  return apiRequest<{ order: CpoeOrder }>("/api/cpoe/orders", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function updateCpoeOrder(
  token: string,
  id: string,
  input: Partial<{
    category: CpoeOrderCategory;
    orderItem: string;
    priority: CpoeOrderPriority;
    clinicalInstructions: string;
    notes: string;
    status: CpoeOrderStatus;
  }>
) {
  return apiRequest<{ order: CpoeOrder }>(`/api/cpoe/orders/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}
