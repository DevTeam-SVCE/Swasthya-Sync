import { apiRequest, authHeaders } from "@/lib/api";
import type { Appointment, AppointmentFilters, AvailabilitySlot } from "@/types/appointments";

function queryString(filters: AppointmentFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchAppointments(token: string, filters: AppointmentFilters = {}) {
  return apiRequest<{ appointments: Appointment[]; total: number }>(`/api/appointments${queryString(filters)}`, { headers: authHeaders(token) });
}

export async function fetchAppointment(token: string, id: string) {
  return apiRequest<{ appointment: Appointment }>(`/api/appointments/${id}`, { headers: authHeaders(token) });
}

export async function fetchAvailability(token: string, doctorId: string, date: string) {
  return apiRequest<{ slots: AvailabilitySlot[] }>(`/api/appointments/availability?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`, { headers: authHeaders(token) });
}

export async function createAppointment(token: string, input: { patientId: string; doctorId: string; department: string; appointmentDate: string; slotTime: string }) {
  return apiRequest<{ appointment: Appointment }>("/api/appointments", { method: "POST", headers: authHeaders(token), body: JSON.stringify(input) });
}

export async function updateAppointmentStatus(token: string, id: string, status: Appointment["status"]) {
  return apiRequest<{ appointment: Appointment }>(`/api/appointments/${id}`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify({ status }) });
}
