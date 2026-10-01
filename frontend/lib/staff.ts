import { apiRequest, authHeaders } from "@/lib/api";

export type StaffRole = "ADMIN" | "DOCTOR" | "FRONT_DESK" | "STAFF";
export type StaffStatus = "ACTIVE" | "SUSPENDED";

export interface StaffMember extends Record<string, unknown> {
  id: string;
  userId: string | null;
  staffId: string | null;
  fullName: string;
  email: string | null;
  loginId: string | null;
  phone: string | null;
  role: StaffRole;
  designation: string | null;
  department: string | null;
  seniority: string | null;
  qualification: string | null;
  dateOfJoining: string | null;
  status: StaffStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StaffInput {
  fullName: string;
  staffId: string;
  email: string;
  phone: string;
  role: StaffRole;
  designation: string;
  department: string;
  seniority: string;
  qualification: string;
  dateOfJoining: string;
  password?: string;
  confirmPassword?: string;
}

export interface StaffProfileInput {
  fullName: string;
  staffId: string;
  email?: string;
  phone?: string;
  role: StaffRole;
  designation?: string;
  department?: string;
  seniority?: string;
  qualification?: string;
  dateOfJoining?: string;
}

export interface StaffLoginInput {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface StaffFilters {
  q?: string;
  role?: string;
  designation?: string;
  department?: string;
  status?: string;
}

export interface StaffOptions {
  roles: StaffRole[];
  statuses: StaffStatus[];
  seniorities: string[];
  departments: string[];
  designations: string[];
}

export interface StaffListResponse {
  staff: StaffMember[];
  total: number;
  stats: { admins: number; doctors: number; frontDesk: number; staff: number };
}

export async function fetchStaff(token: string, filters: StaffFilters = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) search.set(key, value);
  }
  const suffix = search.size ? `?${search.toString()}` : "";
  return apiRequest<StaffListResponse>(`/api/staff${suffix}`, { headers: authHeaders(token) });
}

export async function fetchStaffOptions(token: string) {
  return apiRequest<StaffOptions>("/api/staff/options", { headers: authHeaders(token) });
}

export async function createStaff(token: string, input: StaffInput) {
  return apiRequest<{ staff: StaffMember }>("/api/staff", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function updateStaff(token: string, id: string, input: StaffProfileInput) {
  return apiRequest<{ staff: StaffMember }>(`/api/staff/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function createStaffLogin(token: string, id: string, input: StaffLoginInput) {
  return apiRequest<{ staff: StaffMember }>(`/api/staff/${id}/login`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function updateStaffStatus(token: string, id: string, status: StaffStatus) {
  return apiRequest<{ staff: StaffMember }>(`/api/staff/${id}/status`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  });
}
