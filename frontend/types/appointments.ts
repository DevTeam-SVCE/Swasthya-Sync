export const APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;
export type AppointmentStatus = typeof APPOINTMENT_STATUSES[number];

export interface Appointment {
  id: string;
  appointmentNumber: string;
  patientId: string;
  patientName: string;
  uhid: string;
  patientAge: number;
  patientGender: string;
  patientMobile: string;
  doctorId: string;
  doctorName: string;
  department: string;
  appointmentDate: string;
  slotTime: string;
  status: AppointmentStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentFilters {
  q?: string;
  date?: string;
  department?: string;
  doctorId?: string;
  status?: AppointmentStatus | "";
}

export interface AvailabilitySlot {
  time: string;
  available: boolean;
}
