const { pool } = require("./db");

const DOCTOR_DESIGNATIONS = new Set([
  "DENTIST",
  "PEDIATRICIAN",
  "DUTY DOCTOR",
  "RMO",
  "RESIDENTS",
  "RESIDENT",
  "ORTHPEDICIAN",
  "GENERAL PHYSICIAN",
  "RADIOLOGIST",
  "GYNAECOLOGY",
]);

function normalizedDesignation(designation) {
  return String(designation || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function roleForDesignation(designation) {
  return DOCTOR_DESIGNATIONS.has(normalizedDesignation(designation)) ? "DOCTOR" : "STAFF";
}

function validDateOnly(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function buildImportReport(rows = []) {
  const ids = new Map();
  for (const row of rows) {
    if (!row.staffId) continue;
    ids.set(row.staffId, [...(ids.get(row.staffId) || []), row.sourceRow]);
  }
  const duplicates = [...ids.entries()].filter(([, sourceRows]) => sourceRows.length > 1)
    .map(([staffId, sourceRows]) => ({ staffId, sourceRows }));
  const roleCounts = { ADMIN: 0, DOCTOR: 0, FRONT_DESK: 0, STAFF: 0 };
  for (const row of rows) roleCounts[roleForDesignation(row.designation)] += 1;
  return {
    populatedRecords: rows.length,
    validRecords: rows.filter((row) => Boolean(row.fullName && row.staffId)).length,
    skippedRecords: rows.filter((row) => !row.fullName || !row.staffId).length,
    duplicateStaffIds: duplicates,
    missingStaffIds: rows.filter((row) => !row.staffId).length,
    missingNames: rows.filter((row) => !row.fullName).length,
    missingDesignations: rows.filter((row) => !row.designation).length,
    invalidDates: rows.filter((row) => row.dateOfJoining && !validDateOnly(row.dateOfJoining)).map((row) => ({ sourceRow: row.sourceRow, value: row.dateOfJoining })),
    missingDates: rows.filter((row) => !row.dateOfJoining).length,
    missingQualifications: rows.filter((row) => !row.qualification).length,
    roleCounts,
  };
}

async function importKmhStaff(hospitalId, sourceRows) {
  if (!hospitalId) throw new Error("An explicit hospital ID is required for staff import.");
  if (!Array.isArray(sourceRows) || sourceRows.length === 0) throw new Error("A non-empty staff JSON array is required.");

  const report = buildImportReport(sourceRows);
  if (report.duplicateStaffIds.length) throw new Error("Staff import stopped because duplicate Staff IDs were found.");
  const invalidRows = sourceRows.filter((row) => !row.fullName || !row.staffId || (row.dateOfJoining && !validDateOnly(row.dateOfJoining)));
  if (invalidRows.length) throw new Error(`Staff import stopped because source rows ${invalidRows.map((row) => row.sourceRow).join(", ")} are invalid.`);

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  try {
    await client.query("BEGIN");
    for (const row of sourceRows) {
      const sourceKey = `KMH-STAFF:${row.staffId}`;
      const existing = await client.query("SELECT id FROM staff_profiles WHERE hospital_id = $1 AND source_key = $2", [hospitalId, sourceKey]);
      const staffIdCollision = await client.query(
        "SELECT id FROM staff_profiles WHERE hospital_id = $1 AND staff_id = $2 AND source_key IS DISTINCT FROM $3 LIMIT 1",
        [hospitalId, row.staffId, sourceKey]
      );
      if (staffIdCollision.rows[0] && staffIdCollision.rows[0].id !== existing.rows[0]?.id) {
        throw new Error(`Staff ID at source row ${row.sourceRow} conflicts with an existing profile.`);
      }

      const values = [roleForDesignation(row.designation), row.fullName, row.staffId, row.designation || null, row.department || null, row.phone || null, row.seniority || null, row.qualification || null, row.dateOfJoining || null];
      if (existing.rows[0]) {
        await client.query(
          `UPDATE staff_profiles SET role = $1, full_name = $2, staff_id = $3, designation = $4,
             department = COALESCE($5, department), phone = COALESCE($6, phone), seniority = COALESCE($7, seniority),
             qualification = $8, date_of_joining = $9, updated_at = NOW()
           WHERE id = $10 AND hospital_id = $11`,
          [...values, existing.rows[0].id, hospitalId]
        );
        updated += 1;
      } else {
        await client.query(
          `INSERT INTO staff_profiles (hospital_id, source_key, full_name, role, staff_id, designation, department, phone, seniority, qualification, date_of_joining, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ACTIVE')`,
          [hospitalId, sourceKey, row.fullName, values[0], row.staffId, values[3], values[4], values[5], values[6], values[7], values[8]]
        );
        inserted += 1;
      }
    }

    const final = await client.query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE role = 'ADMIN')::int AS admins,
         COUNT(*) FILTER (WHERE role = 'DOCTOR')::int AS doctors,
         COUNT(*) FILTER (WHERE role = 'FRONT_DESK')::int AS front_desk,
         COUNT(*) FILTER (WHERE role = 'STAFF')::int AS staff,
         COUNT(*) FILTER (WHERE user_id IS NULL)::int AS without_login,
         COUNT(*) FILTER (WHERE source_key LIKE 'KMH-STAFF:%')::int AS imported_profiles
       FROM staff_profiles WHERE hospital_id = $1`,
      [hospitalId]
    );
    await client.query("COMMIT");
    return { ...report, importedRecords: sourceRows.length, insertedThisRun: inserted, updatedThisRun: updated, finalDatabaseCounts: final.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { DOCTOR_DESIGNATIONS, roleForDesignation, validDateOnly, buildImportReport, importKmhStaff };
