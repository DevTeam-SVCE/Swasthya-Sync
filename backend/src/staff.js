const bcrypt = require("bcrypt");
const express = require("express");
const { pool, query } = require("./db");
const { requireAuth, requirePermission } = require("./auth");
const {
  STAFF_ROLES,
  STAFF_STATUSES,
  STAFF_SENIORITIES,
  STAFF_DEPARTMENTS,
  STAFF_DESIGNATIONS,
} = require("./staff-options");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9\s().-]{7,24}$/;
const roleSet = new Set(STAFF_ROLES);
const senioritySet = new Set(STAFF_SENIORITIES.map((item) => item.toLowerCase()));

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function validateStaffInput(input, { creating = false, loginOnly = false } = {}) {
  if (loginOnly) {
    if (!emailPattern.test(cleanText(input?.email)) || cleanText(input.email).length > 254) return "Enter a valid email address.";
    if (typeof input.password !== "string" || input.password.length < 8) return "Password must be at least 8 characters.";
    if (input.password !== input.confirmPassword) return "Passwords do not match.";
    return null;
  }
  if (!cleanText(input?.fullName)) return "Full name is required.";
  if (cleanText(input.fullName).length > 160) return "Full name must be 160 characters or fewer.";
  if (!roleSet.has(cleanText(input.role).toUpperCase())) return "Role must be ADMIN, DOCTOR, FRONT_DESK, or STAFF.";
  if (input.staffId && cleanText(input.staffId).length > 64) return "Staff ID must be 64 characters or fewer.";
  if (input.phone && (!phonePattern.test(cleanText(input.phone)) || cleanText(input.phone).replace(/\D/g, "").length < 7)) return "Enter a valid phone number.";
  if (input.email && (!emailPattern.test(cleanText(input.email)) || cleanText(input.email).length > 254)) return "Enter a valid email address.";
  if (input.designation && cleanText(input.designation).length > 160) return "Designation must be 160 characters or fewer.";
  if (input.department && cleanText(input.department).length > 120) return "Department must be 120 characters or fewer.";
  if (input.qualification && cleanText(input.qualification).length > 200) return "Qualification must be 200 characters or fewer.";
  if (input.seniority && !senioritySet.has(cleanText(input.seniority).toLowerCase())) return "Select a supported seniority level.";
  if (input.dateOfJoining && !validDate(input.dateOfJoining)) return "Date of joining must be a valid date in YYYY-MM-DD format.";
  if (creating) {
    if (!emailPattern.test(cleanText(input.email)) || cleanText(input.email).length > 254) return "Enter a valid email address.";
    if (typeof input.password !== "string" || input.password.length < 8) return "Password must be at least 8 characters.";
    if (input.password !== input.confirmPassword) return "Passwords do not match.";
  }
  return null;
}

function publicStaff(row) {
  return {
    id: row.profile_id,
    userId: row.user_id,
    staffId: row.staff_id,
    fullName: row.full_name,
    email: row.email,
    loginId: row.email,
    phone: row.phone,
    role: row.role,
    designation: row.designation,
    department: row.department,
    seniority: row.seniority,
    qualification: row.qualification,
    dateOfJoining: row.date_of_joining,
    status: row.user_id ? (row.account_active ? "ACTIVE" : "SUSPENDED") : row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const staffSelect = `SELECT p.id AS profile_id, p.user_id, p.staff_id, p.full_name, p.role,
  p.phone, p.designation, p.department, p.seniority, p.qualification,
  p.date_of_joining::text AS date_of_joining, p.status, p.created_at, p.updated_at,
  u.email, u.active AS account_active
  FROM staff_profiles p LEFT JOIN users u ON u.id = p.user_id`;

function filtersForRequest(req) {
  const values = [req.user.hospital_id];
  const conditions = ["p.hospital_id = $1"];
  const add = (expression, value) => {
    values.push(value);
    conditions.push(expression.replace("?", `$${values.length}`));
  };

  const search = cleanText(req.query.q);
  if (search) {
    values.push(`%${search}%`);
    const parameter = `$${values.length}`;
    conditions.push(`(p.full_name ILIKE ${parameter} OR p.staff_id ILIKE ${parameter} OR u.email ILIKE ${parameter} OR p.phone ILIKE ${parameter} OR p.designation ILIKE ${parameter})`);
  }

  const role = cleanText(req.query.role).toUpperCase();
  if (role) {
    if (!roleSet.has(role)) return { error: "Role filter must be ADMIN, DOCTOR, FRONT_DESK, or STAFF." };
    add("p.role = ?", role);
  }

  const designation = cleanText(req.query.designation);
  if (designation) add("lower(p.designation) = ?", designation.toLowerCase());

  const department = cleanText(req.query.department);
  if (department) add("lower(p.department) = ?", department.toLowerCase());

  const status = cleanText(req.query.status).toUpperCase();
  if (status) {
    if (!STAFF_STATUSES.includes(status)) return { error: "Status filter must be ACTIVE or SUSPENDED." };
    add("(CASE WHEN p.user_id IS NOT NULL THEN u.active ELSE p.status = 'ACTIVE' END) = ?", status === "ACTIVE");
  }

  return { values, conditions };
}

async function ensureNotLastActiveAdmin(client, hospitalId, userId) {
  const activeAdmins = await client.query(
    `SELECT p.id FROM staff_profiles p JOIN users u ON u.id = p.user_id
     WHERE p.hospital_id = $1 AND p.role = 'ADMIN' AND p.status = 'ACTIVE' AND u.active = TRUE FOR UPDATE OF u`,
    [hospitalId]
  );
  const target = await client.query("SELECT id FROM staff_profiles WHERE user_id = $1", [userId]);
  if (activeAdmins.rowCount <= 1 && activeAdmins.rows[0]?.id === target.rows[0]?.id) {
    return "The hospital must retain at least one active administrator.";
  }
  return null;
}

router.get("/options", requireAuth, requirePermission("staff_management", "view"), async (req, res, next) => {
  try {
    const [designations, departments] = await Promise.all([
      query("SELECT designation FROM (SELECT DISTINCT designation FROM staff_profiles WHERE hospital_id = $1 AND designation IS NOT NULL) valueset ORDER BY lower(designation), designation", [req.user.hospital_id]),
      query("SELECT department FROM (SELECT DISTINCT department FROM staff_profiles WHERE hospital_id = $1 AND department IS NOT NULL) valueset ORDER BY lower(department), department", [req.user.hospital_id]),
    ]);
    res.json({
      roles: STAFF_ROLES,
      statuses: STAFF_STATUSES,
      seniorities: STAFF_SENIORITIES,
      departments: [...new Set([...STAFF_DEPARTMENTS, ...departments.rows.map((row) => row.department)])],
      designations: [...new Set([...STAFF_DESIGNATIONS, ...designations.rows.map((row) => row.designation)])],
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", requireAuth, requirePermission("staff_management", "view"), async (req, res, next) => {
  const filters = filtersForRequest(req);
  if (filters.error) return res.status(400).json({ message: filters.error });

  try {
    const [rows, count, stats] = await Promise.all([
      query(`${staffSelect} WHERE ${filters.conditions.join(" AND ")} ORDER BY p.full_name ASC`, filters.values),
      query(`SELECT COUNT(*)::int AS total FROM staff_profiles p LEFT JOIN users u ON u.id = p.user_id WHERE ${filters.conditions.join(" AND ")}`, filters.values),
      query(
        `SELECT COUNT(*) FILTER (WHERE role = 'ADMIN')::int AS admins,
          COUNT(*) FILTER (WHERE role = 'DOCTOR')::int AS doctors,
          COUNT(*) FILTER (WHERE role = 'FRONT_DESK')::int AS front_desk,
          COUNT(*) FILTER (WHERE role = 'STAFF')::int AS staff
         FROM staff_profiles WHERE hospital_id = $1`,
        [req.user.hospital_id]
      ),
    ]);
    res.json({
      staff: rows.rows.map(publicStaff),
      total: count.rows[0].total,
      stats: { admins: stats.rows[0].admins, doctors: stats.rows[0].doctors, frontDesk: stats.rows[0].front_desk, staff: stats.rows[0].staff },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireAuth, requirePermission("staff_management", "view"), async (req, res, next) => {
  try {
    const result = await query(`${staffSelect} WHERE p.id = $1 AND p.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Staff account not found." });
    res.json({ staff: publicStaff(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, requirePermission("staff_management", "create"), async (req, res, next) => {
  const input = req.body || {};
  const validationError = validateStaffInput(input, { creating: true });
  if (validationError) return res.status(400).json({ message: validationError });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await client.query(
      `INSERT INTO users (hospital_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.hospital_id, cleanText(input.fullName), cleanText(input.email).toLowerCase(), passwordHash, cleanText(input.role).toUpperCase()]
    );
    await client.query(
      `INSERT INTO staff_profiles (user_id, hospital_id, full_name, role, staff_id, phone, designation, department, seniority, qualification, date_of_joining, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACTIVE')`,
      [user.rows[0].id, req.user.hospital_id, cleanText(input.fullName), cleanText(input.role).toUpperCase(), cleanText(input.staffId) || null, cleanText(input.phone) || null, cleanText(input.designation) || null, cleanText(input.department) || null, cleanText(input.seniority) || null, cleanText(input.qualification) || null, cleanText(input.dateOfJoining) || null]
    );
    const result = await client.query(`${staffSelect} WHERE p.user_id = $1 AND p.hospital_id = $2`, [user.rows[0].id, req.user.hospital_id]);
    await client.query("COMMIT");
    res.status(201).json({ staff: publicStaff(result.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ message: "Email or Staff ID is already in use." });
    next(error);
  } finally {
    client.release();
  }
});

router.post("/:id/login", requireAuth, requirePermission("staff_management", "create"), async (req, res, next) => {
  const validationError = validateStaffInput(req.body || {}, { loginOnly: true });
  if (validationError) return res.status(400).json({ message: validationError });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT id, hospital_id, user_id, full_name, role, status FROM staff_profiles WHERE id = $1 AND hospital_id = $2 FOR UPDATE",
      [req.params.id, req.user.hospital_id]
    );
    const profile = result.rows[0];
    if (!profile) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Staff profile not found." });
    }
    if (profile.user_id) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This staff profile already has a login." });
    }
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const user = await client.query(
      `INSERT INTO users (hospital_id, name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [profile.hospital_id, profile.full_name, cleanText(req.body.email).toLowerCase(), passwordHash, profile.role, profile.status === "ACTIVE"]
    );
    await client.query("UPDATE staff_profiles SET user_id = $1, updated_at = NOW() WHERE id = $2", [user.rows[0].id, profile.id]);
    const linked = await client.query(`${staffSelect} WHERE p.id = $1 AND p.hospital_id = $2`, [profile.id, profile.hospital_id]);
    await client.query("COMMIT");
    res.status(201).json({ staff: publicStaff(linked.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ message: "Email/Login ID or Staff ID is already in use." });
    next(error);
  } finally {
    client.release();
  }
});

router.put("/:id", requireAuth, requirePermission("staff_management", "edit"), async (req, res, next) => {
  const input = req.body || {};
  const validationError = validateStaffInput(input);
  if (validationError) return res.status(400).json({ message: validationError });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT p.id, p.user_id, p.role, p.status, u.active AS account_active
       FROM staff_profiles p LEFT JOIN users u ON u.id = p.user_id
       WHERE p.id = $1 AND p.hospital_id = $2 FOR UPDATE OF p`,
      [req.params.id, req.user.hospital_id]
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Staff profile not found." });
    }
    const nextRole = cleanText(input.role).toUpperCase();
    if (current.user_id && current.role === "ADMIN" && current.status === "ACTIVE" && current.account_active && nextRole !== "ADMIN") {
      const lastAdminError = await ensureNotLastActiveAdmin(client, req.user.hospital_id, current.user_id);
      if (lastAdminError) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: lastAdminError });
      }
    }
    if (current.user_id) {
      const userValues = [cleanText(input.fullName), nextRole, current.user_id, req.user.hospital_id];
      const emailUpdate = cleanText(input.email);
      if (emailUpdate) {
        if (!emailPattern.test(emailUpdate) || emailUpdate.length > 254) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Enter a valid email address." });
        }
        userValues.splice(2, 0, emailUpdate.toLowerCase());
        await client.query("UPDATE users SET name = $1, role = $2, email = $3, updated_at = NOW() WHERE id = $4 AND hospital_id = $5", userValues);
      } else {
        await client.query("UPDATE users SET name = $1, role = $2, updated_at = NOW() WHERE id = $3 AND hospital_id = $4", userValues);
      }
    }
    await client.query(
      `UPDATE staff_profiles SET full_name = $1, role = $2, staff_id = $3, phone = $4,
        designation = $5, department = $6, seniority = $7, qualification = $8,
        date_of_joining = $9, updated_at = NOW() WHERE id = $10 AND hospital_id = $11`,
      [cleanText(input.fullName), nextRole, cleanText(input.staffId) || null, cleanText(input.phone) || null, cleanText(input.designation) || null, cleanText(input.department) || null, cleanText(input.seniority) || null, cleanText(input.qualification) || null, cleanText(input.dateOfJoining) || null, req.params.id, req.user.hospital_id]
    );
    const result = await client.query(`${staffSelect} WHERE p.id = $1 AND p.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    await client.query("COMMIT");
    res.json({ staff: publicStaff(result.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ message: "Email or Staff ID is already in use." });
    next(error);
  } finally {
    client.release();
  }
});

router.patch("/:id/status", requireAuth, requirePermission("staff_management", "edit"), async (req, res, next) => {
  const status = cleanText(req.body?.status).toUpperCase();
  if (!STAFF_STATUSES.includes(status)) return res.status(400).json({ message: "Status must be ACTIVE or SUSPENDED." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT p.id, p.user_id, p.role, p.status, u.active AS account_active
       FROM staff_profiles p LEFT JOIN users u ON u.id = p.user_id
       WHERE p.id = $1 AND p.hospital_id = $2 FOR UPDATE OF p`,
      [req.params.id, req.user.hospital_id]
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Staff profile not found." });
    }
    if (current.user_id && current.role === "ADMIN" && current.status === "ACTIVE" && current.account_active && status === "SUSPENDED") {
      const lastAdminError = await ensureNotLastActiveAdmin(client, req.user.hospital_id, current.user_id);
      if (lastAdminError) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: lastAdminError });
      }
    }
    await client.query("UPDATE staff_profiles SET status = $1, updated_at = NOW() WHERE id = $2 AND hospital_id = $3", [status, req.params.id, req.user.hospital_id]);
    if (current.user_id) await client.query("UPDATE users SET active = $1, updated_at = NOW() WHERE id = $2", [status === "ACTIVE", current.user_id]);
    const result = await client.query(`${staffSelect} WHERE p.id = $1 AND p.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    await client.query("COMMIT");
    res.json({ staff: publicStaff(result.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

module.exports = { router, validateStaffInput, publicStaff, filtersForRequest };
