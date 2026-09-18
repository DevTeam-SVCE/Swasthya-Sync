export type { AuthUser, AuthState, LoginCredentials, LoginResponse, UserRole } from "./auth";

/* ── Common shared types ─────────────────────────────────── */

export type ApiStatus = "idle" | "loading" | "success" | "error";

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/* Documented patient statuses */
export type PatientStatus =
  | "Stable"
  | "Critical"
  | "Recovering"
  | "Under Obs"
  | "Serious";

/* Documented admission types */
export type AdmissionType =
  | "OPD"
  | "IPD"
  | "Emergency"
  | "Day Care"
  | "ICU Direct";

/* Documented bed statuses */
export type BedStatus =
  | "Available"
  | "Occupied"
  | "Maintenance"
  | "Reserved";

/* Documented triage levels */
export type TriageLevel = "Red" | "Orange" | "Yellow" | "Green";

/* Documented appointment statuses */
export type AppointmentStatus =
  | "Scheduled"
  | "Confirmed"
  | "Completed"
  | "Cancelled";

/* Documented invoice statuses */
export type InvoiceStatus = "Paid" | "Pending" | "Partial" | "Overdue";

/* Documented lab order priorities */
export type LabPriority = "STAT" | "URGENT" | "ROUTINE";

/* Documented lab order statuses */
export type LabOrderStatus =
  | "Pending"
  | "In Progress"
  | "Completed"
  | "Cancelled";

/* Documented payment methods */
export type PaymentMethod =
  | "Cash"
  | "Card"
  | "UPI"
  | "Insurance"
  | "Cheque"
  | "NEFT"
  | "CGHS"
  | "ECHS"
  | "ESI"
  | "Ayushman Bharat"
  | "Govt/Free";

/* Documented MLC types */
export type MLCType =
  | "None"
  | "Road Traffic Accident (RTA)"
  | "Assault"
  | "Poisoning"
  | "Burns"
  | "Sexual Assault"
  | "Suicide Attempt"
  | "Industrial Accident"
  | "Other MLC";
