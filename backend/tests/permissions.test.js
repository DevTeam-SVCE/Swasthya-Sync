const test = require("node:test");
const assert = require("node:assert/strict");
const { MODULE_ROLES, canAccess, normalizeRole, permissionForApiRequest } = require("../src/permissions");

test("ADMIN can access every configured module and action", () => {
  for (const module of Object.keys(MODULE_ROLES)) {
    for (const action of ["view", "create", "edit", "delete"]) {
      assert.equal(canAccess("ADMIN", module, action), true, `ADMIN ${action} on ${module}`);
    }
  }
});

test("legacy STAFF access is preserved and remains distinct from FRONT_DESK", () => {
  assert.equal(normalizeRole("STAFF"), "STAFF");
  assert.equal(canAccess("STAFF", "ipd", "view"), true);
  assert.equal(canAccess("STAFF", "laboratory", "edit"), true);
  assert.equal(canAccess("FRONT_DESK", "patients", "view"), true);
  assert.equal(canAccess("FRONT_DESK", "billing", "view"), true);
  assert.equal(canAccess("FRONT_DESK", "ipd", "view"), false);
  assert.equal(canAccess("FRONT_DESK", "staff_management", "view"), false);
});

test("STAFF can view Settings but cannot change or upload configuration", () => {
  assert.equal(canAccess("STAFF", "settings", "view"), true);
  assert.equal(canAccess("STAFF", "settings", "create"), false);
  assert.equal(canAccess("STAFF", "settings", "edit"), false);
  assert.equal(canAccess("STAFF", "settings", "delete"), false);
  assert.equal(canAccess("ADMIN", "settings", "edit"), true);
});

test("DOCTOR retains clinical access without patient creation or deletion", () => {
  assert.equal(canAccess("DOCTOR", "laboratory", "view"), true);
  assert.equal(canAccess("DOCTOR", "cpoe", "create"), true);
  assert.equal(canAccess("DOCTOR", "patients", "create"), false);
  assert.equal(canAccess("DOCTOR", "ipd", "delete"), false);
});

test("delete access and invalid roles/actions are denied", () => {
  assert.equal(canAccess("STAFF", "patients", "delete"), false);
  assert.equal(canAccess("unknown", "patients", "view"), false);
  assert.equal(canAccess("ADMIN", "patients", "unknown"), false);
});

test("API permission lookup covers current clinical routes and staff endpoints", () => {
  assert.deepEqual(permissionForApiRequest("POST", "/api/laboratory/orders/123/result"), { module: "laboratory", action: "create" });
  assert.deepEqual(permissionForApiRequest("PATCH", "/api/blood-bank/orders/123/status"), { module: "blood_bank", action: "edit" });
  assert.deepEqual(permissionForApiRequest("POST", "/api/staff/123/login"), { module: "staff_management", action: "create" });
  assert.deepEqual(permissionForApiRequest("GET", "/api/settings"), { module: "settings", action: "view" });
  assert.deepEqual(permissionForApiRequest("PUT", "/api/settings"), { module: "settings", action: "edit" });
  assert.deepEqual(permissionForApiRequest("POST", "/api/settings/assets/logo"), { module: "settings", action: "create" });
  assert.equal(permissionForApiRequest("GET", "/api/auth/me"), null);
});
