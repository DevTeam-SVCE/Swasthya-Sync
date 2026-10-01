import { apiRequest, authHeaders } from "@/lib/api";

export type LabPriority = "STAT" | "URGENT" | "ROUTINE";
export type LabStatus =
  | "ORDERED"
  | "SAMPLE_PENDING"
  | "COLLECTED"
  | "PROCESSING"
  | "RESULT_ENTERED"
  | "VERIFIED"
  | "COMPLETED";

export type LabSampleType = "Blood" | "Urine" | "Stool" | "Swab" | "Other";

export interface LabSample {
  id: string;
  labOrderId: string;
  sampleType: LabSampleType;
  sampleStatus: "PENDING" | "COLLECTED";
  collectedBy?: string | null;
  collectedByName?: string | null;
  collectedAt?: string | null;
}

export interface LabResult {
  id: string;
  labOrderId: string;
  resultValue: string;
  unit?: string | null;
  referenceRange?: string | null;
  remarks?: string | null;
  enteredBy?: string | null;
  enteredByName?: string | null;
  enteredAt?: string | null;
  verifiedBy?: string | null;
  verifiedByName?: string | null;
  verifiedAt?: string | null;
  resultStatus: "RESULT_ENTERED" | "VERIFIED";
}

export interface LabOrder {
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
  testName: string;
  testCode?: string | null;
  priority: LabPriority;
  status: LabStatus;
  orderedBy: string;
  orderedByName: string;
  orderedAt: string;
  createdAt: string;
  updatedAt: string;
  sample: LabSample | null;
  result: LabResult | null;
  history?: LabResult[];
}

export async function fetchLabOrders(
  token: string,
  filters?: { patientId?: string; status?: LabStatus; priority?: LabPriority; q?: string }
): Promise<{ orders: LabOrder[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.patientId) params.set("patientId", filters.patientId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.priority) params.set("priority", filters.priority);
  if (filters?.q) params.set("q", filters.q);

  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<{ orders: LabOrder[]; total: number }>(`/api/laboratory/orders${query}`, {
    headers: authHeaders(token),
  });
}

export async function fetchLabOrder(token: string, id: string): Promise<{ order: LabOrder; history: LabResult[] }> {
  return apiRequest<{ order: LabOrder; history: LabResult[] }>(`/api/laboratory/orders/${id}`, {
    headers: authHeaders(token),
  });
}

export async function collectLabSample(
  token: string,
  id: string,
  input: { sampleType: LabSampleType }
): Promise<{ order: LabOrder }> {
  return apiRequest<{ order: LabOrder }>(`/api/laboratory/orders/${id}/collect`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function submitLabResult(
  token: string,
  id: string,
  input: { resultValue: string; unit?: string; referenceRange?: string; remarks?: string }
): Promise<{ order: LabOrder }> {
  return apiRequest<{ order: LabOrder }>(`/api/laboratory/orders/${id}/result`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function verifyLabResult(token: string, id: string): Promise<{ order: LabOrder }> {
  return apiRequest<{ order: LabOrder }>(`/api/laboratory/orders/${id}/verify`, {
    method: "POST",
    headers: authHeaders(token),
  });
}
