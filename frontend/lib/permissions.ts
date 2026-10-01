import type { UserRole } from "@/types/auth";

export type PermissionAction = "view" | "create" | "edit" | "delete";
export type ModuleKey =
  | "dashboard" | "patients" | "appointments" | "opd_queue" | "ipd" | "emergency"
  | "cpoe" | "patient_forms" | "clinical_notes" | "discharge" | "laboratory"
  | "radiology" | "pharmacy" | "nursing" | "operation_theatre" | "blood_bank"
  | "billing" | "revenue_cycle" | "inventory" | "analytics" | "staff_management"
  | "form_templates" | "audit_log" | "settings";

const MODULE_ROLES: Record<ModuleKey, readonly UserRole[]> = {
  dashboard: ["admin", "doctor", "front_desk", "staff"],
  patients: ["admin", "doctor", "front_desk", "staff"],
  appointments: ["admin", "doctor", "front_desk", "staff"],
  opd_queue: ["admin", "doctor", "staff"],
  ipd: ["admin", "doctor", "staff"],
  emergency: ["admin", "doctor", "staff"],
  cpoe: ["admin", "doctor", "staff"],
  patient_forms: ["admin", "doctor", "front_desk", "staff"],
  clinical_notes: ["admin", "doctor", "staff"],
  discharge: ["admin", "doctor", "front_desk", "staff"],
  laboratory: ["admin", "doctor", "staff"],
  radiology: ["admin", "doctor", "staff"],
  pharmacy: ["admin", "doctor", "staff"],
  nursing: ["admin", "doctor", "staff"],
  operation_theatre: ["admin", "doctor", "staff"],
  blood_bank: ["admin", "doctor", "staff"],
  billing: ["admin", "front_desk", "staff"],
  revenue_cycle: ["admin", "staff"],
  inventory: ["admin", "staff"],
  analytics: ["admin", "staff"],
  staff_management: ["admin"],
  form_templates: ["admin"],
  audit_log: ["admin"],
  settings: ["admin", "staff"],
};

const ROUTE_PERMISSIONS: readonly [string, ModuleKey, PermissionAction?][] = [
  ["/patients/new", "patients", "create"],
  ["/dashboard", "dashboard"],
  ["/patients", "patients"],
  ["/appointments", "appointments"],
  ["/opd", "opd_queue"],
  ["/ipd", "ipd"],
  ["/emergency", "emergency"],
  ["/cpoe", "cpoe"],
  ["/forms", "patient_forms"],
  ["/clinical-notes", "clinical_notes"],
  ["/discharge", "discharge"],
  ["/laboratory", "laboratory"],
  ["/radiology", "radiology"],
  ["/pharmacy", "pharmacy"],
  ["/nursing", "nursing"],
  ["/ot", "operation_theatre"],
  ["/blood-bank", "blood_bank"],
  ["/billing", "billing"],
  ["/revenue-cycle", "revenue_cycle"],
  ["/inventory", "inventory"],
  ["/analytics", "analytics"],
  ["/staff", "staff_management"],
  ["/form-templates", "form_templates"],
  ["/audit-log", "audit_log"],
  ["/settings", "settings"],
];

export function normalizeUserRole(role: UserRole | string | null | undefined): UserRole | null {
  if (!role) return null;
  const normalized = role.toLowerCase().replaceAll("-", "_");
  if (normalized === "admin" || normalized === "doctor" || normalized === "front_desk" || normalized === "staff") return normalized;
  return null;
}

export function canAccessModule(
  role: UserRole | string | null | undefined,
  module: ModuleKey,
  action: PermissionAction = "view"
): boolean {
  const normalizedRole = normalizeUserRole(role);
  if (action === "delete") return normalizedRole === "admin";
  if (!normalizedRole || !MODULE_ROLES[module]?.includes(normalizedRole)) return false;
  if (module === "patients" && action === "create" && normalizedRole === "doctor") return false;
  return action === "view" || action === "create" || action === "edit";
}

export function permissionForPath(pathname: string): { module: ModuleKey; action: PermissionAction } | null {
  const match = ROUTE_PERMISSIONS.find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
  return match ? { module: match[1], action: match[2] ?? "view" } : null;
}

export function canAccessPath(role: UserRole | string | null | undefined, pathname: string): boolean {
  const permission = permissionForPath(pathname);
  return !permission || canAccessModule(role, permission.module, permission.action);
}

export function roleDisplayName(role: UserRole | string | null | undefined): string {
  switch (normalizeUserRole(role)) {
    case "admin": return "Administrator";
    case "doctor": return "Doctor";
    case "front_desk": return "Front Desk";
    case "staff": return "Staff";
    default: return "User";
  }
}