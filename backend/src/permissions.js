const MODULE_ROLES = {
  dashboard: ["ADMIN", "DOCTOR", "FRONT_DESK", "STAFF"],
  patients: ["ADMIN", "DOCTOR", "FRONT_DESK", "STAFF"],
  appointments: ["ADMIN", "DOCTOR", "FRONT_DESK", "STAFF"],
  opd_queue: ["ADMIN", "DOCTOR", "STAFF"],
  ipd: ["ADMIN", "DOCTOR", "STAFF"],
  emergency: ["ADMIN", "DOCTOR", "STAFF"],
  cpoe: ["ADMIN", "DOCTOR", "STAFF"],
  patient_forms: ["ADMIN", "DOCTOR", "FRONT_DESK", "STAFF"],
  clinical_notes: ["ADMIN", "DOCTOR", "STAFF"],
  discharge: ["ADMIN", "DOCTOR", "FRONT_DESK", "STAFF"],
  laboratory: ["ADMIN", "DOCTOR", "STAFF"],
  radiology: ["ADMIN", "DOCTOR", "STAFF"],
  pharmacy: ["ADMIN", "DOCTOR", "STAFF"],
  nursing: ["ADMIN", "DOCTOR", "STAFF"],
  operation_theatre: ["ADMIN", "DOCTOR", "STAFF"],
  blood_bank: ["ADMIN", "DOCTOR", "STAFF"],
  billing: ["ADMIN", "FRONT_DESK", "STAFF"],
  revenue_cycle: ["ADMIN", "STAFF"],
  inventory: ["ADMIN", "STAFF"],
  analytics: ["ADMIN", "STAFF"],
  staff_management: ["ADMIN"],
  form_templates: ["ADMIN"],
  audit_log: ["ADMIN"],
  settings: ["ADMIN", "STAFF"],
};

const API_MODULES = [
  ["/api/staff", "staff_management"],
  ["/api/patient-forms", "patient_forms"],
  ["/api/form-templates", "patient_forms"],
  ["/api/appointments", "appointments"],
  ["/api/patients", "patients"],
  ["/api/doctors", "patients"],
  ["/api/cpoe", "cpoe"],
  ["/api/discharge", "discharge"],
  ["/api/ipd", "ipd"],
  ["/api/emergency", "emergency"],
  ["/api/laboratory", "laboratory"],
  ["/api/radiology", "radiology"],
  ["/api/pharmacy", "pharmacy"],
  ["/api/nursing", "nursing"],
  ["/api/ot", "operation_theatre"],
  ["/api/blood-bank", "blood_bank"],
];

function normalizeRole(role) {
  const normalized = String(role || "").trim().replace(/[ -]+/g, "_").toUpperCase();
  if (["ADMIN", "DOCTOR", "FRONT_DESK", "STAFF"].includes(normalized)) return normalized;
  return null;
}

function canAccess(role, module, action = "view") {
  const normalizedRole = normalizeRole(role);
  if (!["view", "create", "edit", "delete"].includes(action)) return false;
  if (action === "delete") return normalizedRole === "ADMIN";
  if (normalizedRole === "ADMIN") return true;
  if (!normalizedRole || !MODULE_ROLES[module]?.includes(normalizedRole)) return false;
  if (module === "patients" && action === "create" && normalizedRole === "DOCTOR") return false;
  return true;
}

function permissionForApiRequest(method, pathname) {
  const route = API_MODULES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!route) return null;
  const normalizedMethod = String(method || "").toUpperCase();
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") return { module: route[1], action: "view" };
  if (normalizedMethod === "POST") return { module: route[1], action: "create" };
  if (normalizedMethod === "PUT" || normalizedMethod === "PATCH") return { module: route[1], action: "edit" };
  if (normalizedMethod === "DELETE") return { module: route[1], action: "delete" };
  return null;
}

module.exports = { MODULE_ROLES, normalizeRole, canAccess, permissionForApiRequest };
