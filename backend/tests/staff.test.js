const test = require("node:test");
const assert = require("node:assert/strict");
const { validateStaffInput, publicStaff, filtersForRequest } = require("../src/staff");

const validStaff = {
  fullName: "Example Staff Member",
  staffId: "TEST-001",
  email: "example@example.test",
  phone: "+1 555 010 1000",
  role: "STAFF",
  designation: "Lab Technician",
  department: "Laboratory",
  seniority: "Senior",
  qualification: "DMLT",
  dateOfJoining: "2024-03-12",
  password: "example-password-123",
  confirmPassword: "example-password-123",
};

test("staff validation supports every account role and optional profile fields", () => {
  assert.equal(validateStaffInput(validStaff, { creating: true }), null);
  assert.equal(validateStaffInput({ ...validStaff, role: "DOCTOR", designation: "PEDIATRICIAN" }, { creating: true }), null);
  assert.equal(validateStaffInput({ ...validStaff, role: "FRONT_DESK" }, { creating: true }), null);
  assert.equal(validateStaffInput({ ...validStaff, seniority: "" }, { creating: true }), null);
  assert.equal(validateStaffInput({ ...validStaff, email: "", password: undefined, confirmPassword: undefined }), null);
});

test("staff profiles validate and expose doctor experience and working schedule", () => {
  assert.equal(validateStaffInput({
    ...validStaff,
    role: "DOCTOR",
    experienceYears: "12",
    workingSchedule: "Mon-Fri, 9AM-5PM",
  }, { creating: true }), null);
  assert.match(validateStaffInput({ ...validStaff, experienceYears: "12.5" }, { creating: true }), /whole number/);
  assert.match(validateStaffInput({ ...validStaff, experienceYears: "81" }, { creating: true }), /between 0 and 80/);
  assert.match(validateStaffInput({ ...validStaff, workingSchedule: "x".repeat(161) }, { creating: true }), /160 characters or fewer/);

  const publicRecord = publicStaff({
    profile_id: "a1b2c3d4-1234-1234-1234-123456789012",
    user_id: "b1b2c3d4-1234-1234-1234-123456789012",
    staff_id: "DOC-001",
    full_name: "Example Doctor",
    email: "doctor@example.test",
    role: "DOCTOR",
    status: "ACTIVE",
    account_active: true,
    experience_years: 12,
    working_schedule: "Mon-Fri, 9AM-5PM",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(publicRecord.experienceYears, 12);
  assert.equal(publicRecord.workingSchedule, "Mon-Fri, 9AM-5PM");
});

test("staff validation rejects malformed values and unknown roles", () => {
  assert.match(validateStaffInput({ ...validStaff, role: "LAB_TECHNICIAN" }, { creating: true }), /Role must be/);
  assert.match(validateStaffInput({ ...validStaff, phone: "bad phone!" }, { creating: true }), /valid phone/);
  assert.match(validateStaffInput({ ...validStaff, dateOfJoining: "2024-02-30" }, { creating: true }), /valid date/);
  assert.match(validateStaffInput({ ...validStaff, password: "short" }, { creating: true }), /at least 8/);
  assert.match(validateStaffInput({ ...validStaff, confirmPassword: "different" }, { creating: true }), /Passwords do not match/);
});

test("public staff records omit credentials and support profiles without logins", () => {
  const publicRecord = publicStaff({
    profile_id: "a1b2c3d4-1234-1234-1234-123456789012",
    user_id: null,
    staff_id: "TEST-001",
    full_name: "Example Staff Member",
    email: null,
    role: "STAFF",
    status: "ACTIVE",
    account_active: null,
    password_hash: "must-not-escape",
    phone: "5550101000",
    date_of_joining: "2024-03-12",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(publicRecord.role, "STAFF");
  assert.equal(publicRecord.loginId, null);
  assert.equal(publicRecord.userId, null);
  assert.equal(publicRecord.status, "ACTIVE");
  assert.equal("password" in publicRecord, false);
  assert.equal("password_hash" in publicRecord, false);
});

test("staff list filters parameterize search and profile filters", () => {
  const filtered = filtersForRequest({
    user: { hospital_id: "hospital-id" },
    query: { q: "Example%", role: "STAFF", designation: "Lab Technician", department: "Laboratory", status: "ACTIVE" },
  });
  assert.equal(filtered.error, undefined);
  assert.deepEqual(filtered.values, ["hospital-id", "%Example%%", "STAFF", "lab technician", "laboratory", true]);
  assert.match(filtered.conditions.join(" "), /p\.role = \$3/);
  assert.doesNotMatch(filtered.conditions.join(" "), /Example/);
});
