const test = require("node:test");
const assert = require("node:assert/strict");
const { roleForDesignation, buildImportReport } = require("../src/kmh-staff-import");

const sampleRows = [
  { sourceRow: 2, fullName: "Example Doctor", staffId: "TEST-DOC-1", designation: "DENTIST", qualification: "BDS", dateOfJoining: "2024-01-15" },
  { sourceRow: 3, fullName: "Example Staff", staffId: "TEST-STAFF-1", designation: "Lab Technician", qualification: null, dateOfJoining: null },
];

test("staff import report validates synthetic rows without bundled personnel data", () => {
  const report = buildImportReport(sampleRows);
  assert.equal(report.populatedRecords, 2);
  assert.equal(report.validRecords, 2);
  assert.equal(report.skippedRecords, 0);
  assert.deepEqual(report.duplicateStaffIds, []);
  assert.equal(report.missingDesignations, 0);
  assert.equal(report.missingDates, 1);
  assert.equal(report.missingQualifications, 1);
  assert.deepEqual(report.roleCounts, { ADMIN: 0, DOCTOR: 1, FRONT_DESK: 0, STAFF: 1 });
});

test("designations map to broad account roles without changing designation data", () => {
  assert.equal(roleForDesignation("Dentist"), "DOCTOR");
  assert.equal(roleForDesignation("GYNAECOLOGY"), "DOCTOR");
  assert.equal(roleForDesignation("Lab Technician"), "STAFF");
  assert.equal(roleForDesignation("ADMINISTRATOR"), "STAFF");
});

test("import report detects duplicate staff IDs and invalid dates", () => {
  const report = buildImportReport([
    ...sampleRows,
    { sourceRow: 5, fullName: "Duplicate", staffId: "TEST-STAFF-1", designation: "STAFF NURSE", dateOfJoining: "2024-02-30" },
  ]);
  assert.equal(report.duplicateStaffIds.length, 1);
  assert.deepEqual(report.invalidDates, [{ sourceRow: 5, value: "2024-02-30" }]);
});
