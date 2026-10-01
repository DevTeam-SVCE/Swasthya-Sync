import { apiRequest, authHeaders } from "@/lib/api";

export type PharmacyOrderStatus = "ORDERED" | "DISPENSING" | "DISPENSED" | "CANCELLED";
export type PharmacyOrderPriority = "STAT" | "URGENT" | "ROUTINE";

export interface PharmacyOrder {
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
  medicationName: string;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  quantity?: string | null;
  priority: PharmacyOrderPriority;
  status: PharmacyOrderStatus;
  orderedBy: string;
  orderedByName: string;
  orderedAt: string;
  createdAt: string;
  updatedAt: string;
  dispensedBy?: string | null;
  dispensedByName?: string | null;
  dispensedAt?: string | null;
  quantityDispensed?: number | null;
  remarks?: string | null;
}

export async function fetchPharmacyOrders(
  token: string,
  filters?: { patientId?: string; status?: PharmacyOrderStatus; priority?: PharmacyOrderPriority; q?: string }
): Promise<{ orders: PharmacyOrder[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.patientId) params.set("patientId", filters.patientId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.priority) params.set("priority", filters.priority);
  if (filters?.q) params.set("q", filters.q);

  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<{ orders: PharmacyOrder[]; total: number }>(`/api/pharmacy/orders${query}`, {
    headers: authHeaders(token),
  });
}

export async function fetchPharmacyOrder(token: string, id: string) {
  return apiRequest<{ order: PharmacyOrder }>(`/api/pharmacy/orders/${id}`, {
    headers: authHeaders(token),
  });
}

export async function dispensePharmacyOrder(
  token: string,
  id: string,
  input: { quantityDispensed: number | string; remarks?: string }
) {
  return apiRequest<{ order: PharmacyOrder }>(`/api/pharmacy/orders/${id}/dispense`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function updatePharmacyOrderStatus(
  token: string,
  id: string,
  status: PharmacyOrderStatus
) {
  return apiRequest<{ order: PharmacyOrder }>(`/api/pharmacy/orders/${id}/status`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  });
}
