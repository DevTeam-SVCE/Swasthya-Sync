import { apiRequest, authHeaders } from "@/lib/api";

export type BloodBankStatus = "ORDERED" | "REQUESTED" | "PROCESSING" | "ISSUED" | "COMPLETED" | "CANCELLED";
export type BloodBankPriority = "STAT" | "URGENT" | "ROUTINE";

export interface BloodBankOrder {
  id: string;
  hospitalId: string;
  patientId: string;
  patientName: string;
  uhid: string;
  age: number;
  sex: string;
  cpoeOrderId: string;
  cpoeOrderNumber: string;
  bloodGroup: string;
  component: string;
  quantity: number;
  priority: BloodBankPriority;
  status: BloodBankStatus;
  clinicalIndication?: string | null;
  clinicalInstructions?: string | null;
  notes?: string | null;
  orderedBy: string;
  orderedByName: string;
  orderedAt: string;
  requestedByName?: string | null;
  requestedAt?: string | null;
  processingByName?: string | null;
  processingAt?: string | null;
  issuedByName?: string | null;
  issuedAt?: string | null;
  completedByName?: string | null;
  completedAt?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
  updatedAt: string;
}

export async function fetchBloodBankOrders(
  token: string,
  filters?: { patientId?: string; status?: BloodBankStatus; priority?: BloodBankPriority; q?: string }
) {
  const params = new URLSearchParams();
  if (filters?.patientId) params.set("patientId", filters.patientId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.priority) params.set("priority", filters.priority);
  if (filters?.q) params.set("q", filters.q);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<{ orders: BloodBankOrder[]; total: number }>(`/api/blood-bank/orders${query}`, { headers: authHeaders(token) });
}

export async function fetchBloodBankOrder(token: string, id: string) {
  return apiRequest<{ order: BloodBankOrder }>(`/api/blood-bank/orders/${id}`, { headers: authHeaders(token) });
}

export async function updateBloodBankOrderStatus(token: string, id: string, status: BloodBankStatus) {
  return apiRequest<{ order: BloodBankOrder }>(`/api/blood-bank/orders/${id}/status`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  });
}