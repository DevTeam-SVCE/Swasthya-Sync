import { apiRequest, authHeaders } from "@/lib/api";

export interface FormTemplate {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  originalFilename: string;
  filePath: string;
  active: boolean;
  viewUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientForm {
  id: string;
  patientId: string;
  patientName: string;
  uhid: string;
  templateId: string;
  templateName: string;
  category: string;
  subcategory: string | null;
  createdBy: string;
  status: "DRAFT" | "COMPLETED";
  fieldData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export async function fetchFormTemplates(token: string, filters?: { category?: string; subcategory?: string; q?: string }) {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.subcategory) params.set("subcategory", filters.subcategory);
  if (filters?.q) params.set("q", filters.q);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<{ templates: FormTemplate[]; total: number }>(`/api/form-templates${query}`, { headers: authHeaders(token) });
}

export async function fetchFormTemplate(token: string, id: string) {
  return apiRequest<{ template: FormTemplate }>(`/api/form-templates/${id}`, { headers: authHeaders(token) });
}

export async function fetchPatientForms(token: string, patientId?: string) {
  const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";
  return apiRequest<{ forms: PatientForm[]; total: number }>(`/api/patient-forms${query}`, { headers: authHeaders(token) });
}

export async function fetchPatientForm(token: string, id: string) {
  return apiRequest<{ form: PatientForm }>(`/api/patient-forms/${id}`, { headers: authHeaders(token) });
}

export async function createPatientForm(token: string, input: { patientId: string; templateId: string; fieldData?: Record<string, unknown>; status?: "DRAFT" | "COMPLETED" }) {
  return apiRequest<{ form: PatientForm }>("/api/patient-forms", { method: "POST", headers: authHeaders(token), body: JSON.stringify(input) });
}

export async function updatePatientForm(token: string, id: string, input: { fieldData?: Record<string, unknown>; status?: "DRAFT" | "COMPLETED" }) {
  return apiRequest<{ form: PatientForm }>(`/api/patient-forms/${id}`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(input) });
}
