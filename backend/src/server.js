require("dotenv").config();

const bcrypt = require("bcrypt");
const cors = require("cors");
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");
const { query, pool, initializeDatabase } = require("./db");
const { createToken, publicUser, requireAuth, requireRole, requirePermission } = require("./auth");
const { permissionForApiRequest } = require("./permissions");
const { DOCTORS, findDoctor } = require("./doctors");
const { router: staffRouter } = require("./staff");
const { router: settingsRouter, settingsAssetDirectory } = require("./settings");

const app = express();
const port = Number(process.env.PORT || 5000);
const formStorageRoot = path.resolve(__dirname, "..", "forms", "templates");

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000" }));
app.use(express.json({ limit: "256kb" }));
app.use("/uploads/settings", express.static(settingsAssetDirectory));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/auth/register", async (req, res, next) => {
  const { hospitalName, name, email, password, confirmPassword } = req.body || {};
  if (!hospitalName?.trim() || !name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ message: "Hospital name, name, email, and password are required." });
  }
  if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters." });
  if (password !== confirmPassword) return res.status(400).json({ message: "Passwords do not match." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT 1 FROM users WHERE email = $1", [email.trim().toLowerCase()]);
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "An account with this email already exists." });
    }
    const hospital = await client.query("INSERT INTO hospitals (name) VALUES ($1) RETURNING id, name", [hospitalName.trim()]);
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await client.query(
      `INSERT INTO users (hospital_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'ADMIN')
       RETURNING id, name, email, role, hospital_id`,
      [hospital.rows[0].id, name.trim(), email.trim().toLowerCase(), passwordHash]
    );
    await client.query("COMMIT");
    res.status(201).json({ user: publicUser({ ...user.rows[0], hospital_name: hospital.rows[0].name }) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  const { email, password } = req.body || {};
  if (!email?.trim() || !password) return res.status(400).json({ message: "Email and password are required." });
  try {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.active, u.hospital_id, h.name AS hospital_name
       FROM users u JOIN hospitals h ON h.id = u.hospital_id WHERE u.email = $1`,
      [email.trim().toLowerCase()]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    if (!user.active) return res.status(403).json({ message: "This account is inactive. Contact an administrator." });
    res.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
app.post("/api/auth/logout", requireAuth, (_req, res) => res.status(204).end());
app.get("/api/admin/check", requireAuth, requireRole("ADMIN"), (_req, res) => res.json({ allowed: true }));

app.use((req, res, next) => {
  const permission = permissionForApiRequest(req.method, req.path);
  if (!permission) return next();
  return requireAuth(req, res, () => requirePermission(permission.module, permission.action)(req, res, next));
});

app.use("/api/staff", staffRouter);
app.use("/api/settings", settingsRouter);

const PATIENT_ENUMS = {
  admissionType: ["OPD", "IPD", "Emergency", "Day Care", "ICU"],
  gender: ["Male", "Female", "Other", "Prefer not to say"],
  bloodGroup: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"],
  initialStatus: ["Stable", "Critical", "Recovering", "Under Obs", "Serious"],
  patientCategory: ["General", "BPL", "Senior Citizen", "Divyangjan", "VIP", "Staff"],
  mlcType: ["None", "Road Traffic Accident", "Assault", "Poisoning", "Burns", "Sexual Assault", "Suicide Attempt", "Industrial Accident", "Other MLC"],
  paymentType: ["Self Pay", "Cash", "UPI", "Insurance / TPA", "CGHS", "ECHS", "ESI", "Ayushman Bharat", "Govt / Free"],
};

function patientInputError(input) {
  const required = ["fullName", "admissionType", "age", "gender", "mobile", "department", "attendingDoctorId", "initialStatus", "patientCategory", "mlcType", "paymentType"];
  for (const field of required) {
    if (input[field] === undefined || input[field] === null || String(input[field]).trim() === "") return `${field} is required.`;
  }
  if (String(input.fullName).trim().length < 2) return "Full name must contain meaningful text.";
  if (!Number.isInteger(Number(input.age)) || Number(input.age) < 0 || Number(input.age) > 130) return "Age must be a reasonable positive number.";
  if (!/^\d{10}$/.test(String(input.mobile))) return "Mobile number must contain 10 digits.";
  if (input.aadhaar && !/^\d{4} \d{4} \d{4}$/.test(input.aadhaar)) return "Aadhaar must use XXXX XXXX XXXX format.";
  if (input.abhaId && !/^\d{14}$/.test(input.abhaId)) return "ABHA Health ID must contain 14 digits.";
  for (const [field, values] of Object.entries(PATIENT_ENUMS)) {
    if (input[field] && !values.includes(input[field])) return `Invalid ${field}.`;
  }
  if (!findDoctor(input.attendingDoctorId)) return "Select a registered attending doctor.";
  if (input.paymentType === "Insurance / TPA" && !input.insuranceCompany?.trim()) return "Insurance company is required for Insurance / TPA.";
  return null;
}

function publicPatient(row, includeSensitive = false) {
  return {
    id: row.id,
    uhid: row.uhid,
    fullName: row.full_name,
    admissionType: row.admission_type,
    age: row.age,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    bloodGroup: row.blood_group,
    mobile: row.mobile,
    ...(includeSensitive ? { aadhaar: row.aadhaar, abhaId: row.abha_id } : {}),
    address: row.address,
    guardianName: row.guardian_name,
    guardianRelation: row.guardian_relation,
    guardianPhone: row.guardian_phone,
    department: row.department,
    attendingDoctorId: row.attending_doctor_id,
    attendingDoctor: findDoctor(row.attending_doctor_id)?.name ?? "Registered doctor",
    initialStatus: row.initial_status,
    patientCategory: row.patient_category,
    mlcType: row.mlc_type,
    chiefComplaint: row.chief_complaint,
    paymentType: row.payment_type,
    insuranceCompany: row.insurance_company,
    tpaName: row.tpa_name,
    policyMemberId: row.policy_member_id,
    policyValidity: row.policy_validity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const patientSelect = `SELECT id, uhid, full_name, admission_type, age, date_of_birth, gender, blood_group,
  mobile, aadhaar, abha_id, address, guardian_name, guardian_relation, guardian_phone, department,
  attending_doctor_id, initial_status, patient_category, mlc_type, chief_complaint, payment_type,
  insurance_company, tpa_name, policy_member_id, policy_validity, created_at, updated_at FROM patients`;

app.get("/api/doctors", requireAuth, (_req, res) => res.json({ doctors: DOCTORS }));

const APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED"];
const SLOT_TIMES = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"];
const STATUS_TRANSITIONS = {
  SCHEDULED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function dateIsValid(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function publicAppointment(row) {
  return {
    id: row.id,
    appointmentNumber: row.appointment_number,
    patientId: row.patient_id,
    patientName: row.patient_name,
    uhid: row.uhid,
    patientAge: row.patient_age,
    patientGender: row.patient_gender,
    patientMobile: row.patient_mobile,
    doctorId: row.doctor_id,
    doctorName: findDoctor(row.doctor_id)?.name ?? "Registered doctor",
    department: row.department,
    appointmentDate: row.appointment_date,
    slotTime: String(row.slot_time).slice(0, 5),
    status: row.status,
    createdBy: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const appointmentSelect = `SELECT a.id, a.appointment_number, a.patient_id, a.doctor_id, a.department,
  a.appointment_date, a.slot_time, a.status, a.created_at, a.updated_at,
  p.full_name AS patient_name, p.uhid, p.age AS patient_age, p.gender AS patient_gender, p.mobile AS patient_mobile,
  u.name AS created_by_name FROM appointments a
  JOIN patients p ON p.id = a.patient_id JOIN users u ON u.id = a.created_by`;

app.get("/api/appointments/availability", requireAuth, async (req, res, next) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date || !dateIsValid(date)) return res.status(400).json({ message: "Select a valid doctor and appointment date." });
  if (!findDoctor(doctorId)) return res.status(404).json({ message: "Doctor not found." });
  try {
    const booked = await query("SELECT slot_time FROM appointments WHERE hospital_id = $1 AND doctor_id = $2 AND appointment_date = $3 AND status <> 'CANCELLED'", [req.user.hospital_id, doctorId, date]);
    const bookedSlots = new Set(booked.rows.map((row) => String(row.slot_time).slice(0, 5)));
    res.json({ slots: SLOT_TIMES.map((time) => ({ time, available: !bookedSlots.has(time) })) });
  } catch (error) { next(error); }
});

app.get("/api/appointments", requireAuth, async (req, res, next) => {
  const values = [req.user.hospital_id];
  const conditions = ["a.hospital_id = $1"];
  const filters = { date: "a.appointment_date", department: "a.department", doctorId: "a.doctor_id", status: "a.status" };
  for (const [param, column] of Object.entries(filters)) {
    if (req.query[param]) { values.push(req.query[param]); conditions.push(`${column} = $${values.length}`); }
  }
  if (req.query.q) {
    values.push(`%${req.query.q}%`);
    conditions.push(`(p.full_name ILIKE $${values.length} OR p.uhid ILIKE $${values.length} OR a.appointment_number ILIKE $${values.length})`);
  }
  try {
    const result = await query(`${appointmentSelect} WHERE ${conditions.join(" AND ")} ORDER BY a.appointment_date ASC, a.slot_time ASC LIMIT 200`, values);
    res.json({ appointments: result.rows.map(publicAppointment), total: result.rowCount });
  } catch (error) { next(error); }
});

app.get("/api/appointments/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${appointmentSelect} WHERE a.id = $1 AND a.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Appointment not found." });
    res.json({ appointment: publicAppointment(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/appointments", requireAuth, async (req, res, next) => {
  const { patientId, doctorId, department, appointmentDate, slotTime } = req.body || {};
  if (!patientId || !doctorId || !department || !appointmentDate || !slotTime) return res.status(400).json({ message: "Patient, department, doctor, date, and slot are required." });
  if (!dateIsValid(appointmentDate) || appointmentDate < new Date().toISOString().slice(0, 10)) return res.status(400).json({ message: "Appointment date must be today or a future date." });
  if (!SLOT_TIMES.includes(slotTime)) return res.status(400).json({ message: "Select a valid appointment slot." });
  const doctor = findDoctor(doctorId);
  if (!doctor) return res.status(404).json({ message: "Doctor not found." });
  if (doctor.department !== department) return res.status(400).json({ message: "Doctor does not belong to the selected department." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const patient = await client.query("SELECT id FROM patients WHERE id = $1 AND hospital_id = $2", [patientId, req.user.hospital_id]);
    if (!patient.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Patient not found." }); }
    const number = await client.query("SELECT nextval('appointment_number_seq') AS value");
    const appointmentNumber = `APT-${new Date().getFullYear()}-${String(number.rows[0].value).padStart(5, "0")}`;
    const result = await client.query(`INSERT INTO appointments (appointment_number, hospital_id, patient_id, doctor_id, department, appointment_date, slot_time, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [appointmentNumber, req.user.hospital_id, patientId, doctorId, department, appointmentDate, slotTime, req.user.id]);
    const appointment = await client.query(`${appointmentSelect} WHERE a.id = $1`, [result.rows[0].id]);
    await client.query("COMMIT");
    res.status(201).json({ appointment: publicAppointment(appointment.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ message: "Selected appointment slot is no longer available." });
    next(error);
  } finally { client.release(); }
});

app.put("/api/appointments/:id", requireAuth, async (req, res, next) => {
  const { status } = req.body || {};
  if (!APPOINTMENT_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid appointment status." });
  try {
    const current = await query("SELECT status FROM appointments WHERE id = $1 AND hospital_id = $2", [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) return res.status(404).json({ message: "Appointment not found." });
    if (!STATUS_TRANSITIONS[current.rows[0].status].includes(status)) return res.status(400).json({ message: `Cannot change ${current.rows[0].status} appointment to ${status}.` });
    await query("UPDATE appointments SET status = $1, updated_at = NOW() WHERE id = $2 AND hospital_id = $3", [status, req.params.id, req.user.hospital_id]);
    const updated = await query(`${appointmentSelect} WHERE a.id = $1 AND a.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    res.json({ appointment: publicAppointment(updated.rows[0]) });
  } catch (error) { next(error); }
});

app.get("/api/patients", requireAuth, async (req, res, next) => {
  const values = [req.user.hospital_id];
  const conditions = ["hospital_id = $1"];
  const filters = { q: "q", admissionType: "admission_type", department: "department", status: "initial_status", patientCategory: "patient_category", mlcType: "mlc_type" };
  for (const [param, column] of Object.entries(filters)) {
    if (req.query[param]) {
      values.push(param === "q" ? `%${req.query[param]}%` : req.query[param]);
      conditions.push(param === "q" ? `(full_name ILIKE $${values.length} OR uhid ILIKE $${values.length} OR mobile ILIKE $${values.length})` : `${column} = $${values.length}`);
    }
  }
  try {
    const result = await query(`${patientSelect} WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT 100`, values);
    res.json({ patients: result.rows.map((row) => publicPatient(row)), total: result.rowCount });
  } catch (error) { next(error); }
});

app.get("/api/patients/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${patientSelect} WHERE id = $1 AND hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Patient not found." });
    res.json({ patient: publicPatient(result.rows[0], true) });
  } catch (error) { next(error); }
});

app.post("/api/patients", requireAuth, async (req, res, next) => {
  const input = req.body || {};
  const validationError = patientInputError(input);
  if (validationError) return res.status(400).json({ message: validationError });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sequence = await client.query("SELECT nextval('patient_uhid_seq') AS value");
    const uhid = `CGH-${new Date().getFullYear()}-${String(sequence.rows[0].value).padStart(5, "0")}`;
    const result = await client.query(
      `INSERT INTO patients (hospital_id, uhid, full_name, admission_type, age, date_of_birth, gender, blood_group, mobile, aadhaar, abha_id, address, guardian_name, guardian_relation, guardian_phone, department, attending_doctor_id, initial_status, patient_category, mlc_type, chief_complaint, payment_type, insurance_company, tpa_name, policy_member_id, policy_validity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING *`,
      [req.user.hospital_id, uhid, input.fullName.trim(), input.admissionType, Number(input.age), input.dateOfBirth || null, input.gender, input.bloodGroup || "Unknown", input.mobile, input.aadhaar || null, input.abhaId || null, input.address || null, input.guardianName || null, input.guardianRelation || null, input.guardianPhone || null, input.department, input.attendingDoctorId, input.initialStatus, input.patientCategory, input.mlcType, input.chiefComplaint || null, input.paymentType, input.paymentType === "Insurance / TPA" ? input.insuranceCompany || null : null, input.paymentType === "Insurance / TPA" ? input.tpaName || null : null, input.paymentType === "Insurance / TPA" ? input.policyMemberId || null : null, input.paymentType === "Insurance / TPA" ? input.policyValidity || null : null]
    );
    await client.query("COMMIT");
    res.status(201).json({ patient: publicPatient(result.rows[0], true) });
  } catch (error) { await client.query("ROLLBACK"); next(error); } finally { client.release(); }
});

app.put("/api/patients/:id", requireAuth, async (req, res, next) => {
  const input = req.body || {};
  const validationError = patientInputError(input);
  if (validationError) return res.status(400).json({ message: validationError });
  try {
    const result = await query(
      `UPDATE patients SET full_name=$1, admission_type=$2, age=$3, date_of_birth=$4, gender=$5, blood_group=$6, mobile=$7, aadhaar=$8, abha_id=$9, address=$10, guardian_name=$11, guardian_relation=$12, guardian_phone=$13, department=$14, attending_doctor_id=$15, initial_status=$16, patient_category=$17, mlc_type=$18, chief_complaint=$19, payment_type=$20, insurance_company=$21, tpa_name=$22, policy_member_id=$23, policy_validity=$24, updated_at=NOW() WHERE id=$25 AND hospital_id=$26 RETURNING *`,
      [input.fullName.trim(), input.admissionType, Number(input.age), input.dateOfBirth || null, input.gender, input.bloodGroup || "Unknown", input.mobile, input.aadhaar || null, input.abhaId || null, input.address || null, input.guardianName || null, input.guardianRelation || null, input.guardianPhone || null, input.department, input.attendingDoctorId, input.initialStatus, input.patientCategory, input.mlcType, input.chiefComplaint || null, input.paymentType, input.paymentType === "Insurance / TPA" ? input.insuranceCompany || null : null, input.paymentType === "Insurance / TPA" ? input.tpaName || null : null, input.paymentType === "Insurance / TPA" ? input.policyMemberId || null : null, input.paymentType === "Insurance / TPA" ? input.policyValidity || null : null, req.params.id, req.user.hospital_id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Patient not found." });
    res.json({ patient: publicPatient(result.rows[0], true) });
  } catch (error) { next(error); }
});

const CPOE_ORDER_CATEGORIES = ["Laboratory", "Radiology", "Medication", "Procedure", "Blood Bank", "Other"];
const CPOE_ORDER_PRIORITIES = ["STAT", "URGENT", "ROUTINE"];
const CPOE_ORDER_STATUS = ["ORDERED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const CPOE_ORDER_TRANSITIONS = {
  ORDERED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function publicCpoeOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    hospitalId: row.hospital_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    uhid: row.uhid,
    orderingClinician: row.ordering_clinician,
    category: row.order_category,
    orderItem: row.order_item,
    priority: row.priority,
    clinicalInstructions: row.clinical_instructions,
    notes: row.notes,
    status: row.status,
    orderedAt: row.ordered_at,
    updatedAt: row.updated_at,
  };
}

const cpoeSelect = `SELECT o.id, o.order_number, o.hospital_id, o.patient_id, o.order_category, o.order_item, o.priority,
  o.clinical_instructions, o.notes, o.status, o.ordered_at, o.updated_at,
  p.full_name AS patient_name, p.uhid,
  u.name AS ordering_clinician
  FROM cpoe_orders o
  JOIN patients p ON p.id = o.patient_id
  JOIN users u ON u.id = o.ordered_by`;

app.get("/api/cpoe/orders", requireAuth, async (req, res, next) => {
  const values = [req.user.hospital_id];
  const conditions = ["o.hospital_id = $1"];

  if (req.query.patientId) {
    values.push(req.query.patientId);
    conditions.push(`o.patient_id = $${values.length}`);
  }
  if (req.query.status) {
    values.push(req.query.status);
    conditions.push(`o.status = $${values.length}`);
  }
  if (req.query.q) {
    values.push(`%${String(req.query.q)}%`);
    conditions.push(`(p.full_name ILIKE $${values.length} OR p.uhid ILIKE $${values.length} OR o.order_number ILIKE $${values.length} OR o.order_item ILIKE $${values.length})`);
  }

  try {
    const result = await query(`${cpoeSelect.replace(/FROM cpoe_orders o/g, "FROM cpoe_orders o")} WHERE ${conditions.join(" AND ")} ORDER BY o.ordered_at DESC LIMIT 200`, values);
    res.json({ orders: result.rows.map(publicCpoeOrder), total: result.rowCount });
  } catch (error) { next(error); }
});

app.get("/api/cpoe/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${cpoeSelect} WHERE o.id = $1 AND o.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!result.rows[0]) return res.status(404).json({ message: "CPOE order not found." });
    res.json({ order: publicCpoeOrder(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/cpoe/orders", requireAuth, async (req, res, next) => {
  const { patientId, category, orderItem, priority, clinicalInstructions, notes } = req.body || {};
  if (!patientId || !category || !orderItem || String(orderItem).trim() === "") {
    return res.status(400).json({ message: "Patient, order type, and order item are required." });
  }
  if (!CPOE_ORDER_CATEGORIES.includes(category)) return res.status(400).json({ message: "Invalid order category." });
  if (priority && !CPOE_ORDER_PRIORITIES.includes(priority)) return res.status(400).json({ message: "Invalid order priority." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const patient = await client.query("SELECT id FROM patients WHERE id = $1 AND hospital_id = $2", [patientId, req.user.hospital_id]);
    if (!patient.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Patient not found." }); }

    const sequence = await client.query("SELECT nextval('cpoe_order_number_seq') AS value");
    const orderNumber = `ORD-${new Date().getFullYear()}-${String(sequence.rows[0].value).padStart(5, "0")}`;

    const created = await client.query(
      `INSERT INTO cpoe_orders (order_number, hospital_id, patient_id, ordered_by, order_category, order_item, priority, clinical_instructions, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [orderNumber, req.user.hospital_id, patientId, req.user.id, category, String(orderItem).trim(), priority || "ROUTINE", clinicalInstructions ? String(clinicalInstructions).trim() : null, notes ? String(notes).trim() : null]
    );

    const result = await client.query(`${cpoeSelect} WHERE o.id = $1`, [created.rows[0].id]);
    await client.query("COMMIT");
    res.status(201).json({ order: publicCpoeOrder(result.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.put("/api/cpoe/orders/:id", requireAuth, async (req, res, next) => {
  const { status, priority, orderItem, category, clinicalInstructions, notes } = req.body || {};
  if (!status && !priority && !orderItem && !category && !clinicalInstructions && !notes) {
    return res.status(400).json({ message: "No order update provided." });
  }
  if (status && !CPOE_ORDER_STATUS.includes(status)) return res.status(400).json({ message: "Invalid order status." });
  if (priority && !CPOE_ORDER_PRIORITIES.includes(priority)) return res.status(400).json({ message: "Invalid order priority." });
  if (category && !CPOE_ORDER_CATEGORIES.includes(category)) return res.status(400).json({ message: "Invalid order category." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM cpoe_orders WHERE id = $1 AND hospital_id = $2 FOR UPDATE", [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "CPOE order not found." }); }

    const nextStatus = status || current.rows[0].status;
    if (status && !CPOE_ORDER_TRANSITIONS[current.rows[0].status].includes(status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Cannot move order from ${current.rows[0].status} to ${status}.` });
    }

    const updated = await client.query(
      `UPDATE cpoe_orders SET order_category = COALESCE($1, order_category), order_item = COALESCE($2, order_item), priority = COALESCE($3, priority), clinical_instructions = COALESCE($4, clinical_instructions), notes = COALESCE($5, notes), status = $6, updated_at = NOW() WHERE id = $7 AND hospital_id = $8 RETURNING *`,
      [category || null, orderItem ? String(orderItem).trim() : null, priority || null, clinicalInstructions !== undefined ? String(clinicalInstructions).trim() : null, notes !== undefined ? String(notes).trim() : null, nextStatus, req.params.id, req.user.hospital_id]
    );

    const result = await client.query(`${cpoeSelect} WHERE o.id = $1`, [updated.rows[0].id]);
    await client.query("COMMIT");
    res.json({ order: publicCpoeOrder(result.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

function templateMetadataFromFile(fileName) {
  const relativePath = path.relative(formStorageRoot, fileName).replaceAll(path.sep, "/");
  const parts = relativePath.split("/");
  const file = parts.pop();
  const category = parts[0] === "cura_forms" ? parts[1] : parts[0];
  const subcategory = parts[0] === "cura_forms" ? (parts.length > 2 ? parts[2] : null) : (parts.length > 1 ? parts[1] : null);
  return {
    name: file.replace(/\.pdf$/i, ""),
    category,
    subcategory,
    originalFilename: file,
    filePath: relativePath,
  };
}

async function syncFormTemplates() {
  if (!fs.existsSync(formStorageRoot)) return;
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) files.push(fullPath);
    }
  };
  visit(formStorageRoot);

  for (const file of files) {
    const metadata = templateMetadataFromFile(file);
    await query(
      `INSERT INTO form_templates (name, category, subcategory, original_filename, file_path)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (file_path) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category,
       subcategory = EXCLUDED.subcategory, original_filename = EXCLUDED.original_filename, updated_at = NOW()`,
      [metadata.name, metadata.category, metadata.subcategory, metadata.originalFilename, metadata.filePath]
    );
  }

  await query(
    `INSERT INTO discharge_templates (form_template_id)
     SELECT id FROM form_templates WHERE category = 'Discharge & End of Life'
     ON CONFLICT (form_template_id) DO NOTHING`
  );
}

function publicFormTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    originalFilename: row.original_filename,
    filePath: row.file_path,
    active: row.active,
    viewUrl: `/api/form-templates/${row.id}/file`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicPatientForm(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    uhid: row.uhid,
    templateId: row.template_id,
    templateName: row.template_name,
    category: row.category,
    subcategory: row.subcategory,
    createdBy: row.created_by_name,
    status: row.status,
    fieldData: row.field_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const patientFormSelect = `SELECT f.id, f.patient_id, f.template_id, f.created_by, f.status, f.field_data, f.created_at, f.updated_at,
  p.full_name AS patient_name, p.uhid, t.name AS template_name, t.category, t.subcategory, u.name AS created_by_name
  FROM patient_forms f JOIN patients p ON p.id = f.patient_id JOIN form_templates t ON t.id = f.template_id JOIN users u ON u.id = f.created_by`;

function publicDischargeSummary(row) {
  return {
    id: row.id,
    admissionId: row.admission_id,
    admissionNumber: row.admission_number,
    patientId: row.patient_id,
    patientName: row.patient_name,
    uhid: row.uhid,
    admissionDate: row.admission_date,
    status: row.status,
    diagnosis: row.diagnosis,
    clinicalSummary: row.clinical_summary,
    treatmentProcedure: row.treatment_procedure,
    dischargeCondition: row.discharge_condition,
    dischargeInstructions: row.discharge_instructions,
    followUp: row.follow_up,
    consultant: row.consultant,
    createdBy: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const dischargeSelect = `SELECT s.*, a.admission_number, a.admission_date, p.full_name AS patient_name, p.uhid,
  u.name AS created_by_name FROM discharge_summaries s
  JOIN ipd_admissions a ON a.id = s.admission_id JOIN patients p ON p.id = s.patient_id JOIN users u ON u.id = s.created_by`;

app.get("/api/form-templates", requireAuth, async (req, res, next) => {
  const values = [];
  const conditions = ["active = TRUE"];
  if (req.query.category) { values.push(req.query.category); conditions.push(`category = $${values.length}`); }
  if (req.query.subcategory) { values.push(req.query.subcategory); conditions.push(`subcategory = $${values.length}`); }
  if (req.query.q) { values.push(`%${String(req.query.q)}%`); conditions.push(`(name ILIKE $${values.length} OR original_filename ILIKE $${values.length})`); }
  try {
    const result = await query(`SELECT * FROM form_templates WHERE ${conditions.join(" AND ")} ORDER BY category, subcategory NULLS FIRST, name`, values);
    res.json({ templates: result.rows.map(publicFormTemplate), total: result.rowCount });
  } catch (error) { next(error); }
});

app.get("/api/form-templates/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM form_templates WHERE id = $1 AND active = TRUE", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Form template not found." });
    res.json({ template: publicFormTemplate(result.rows[0]) });
  } catch (error) { next(error); }
});

app.get("/api/form-templates/:id/file", requireAuth, async (req, res, next) => {
  try {
    const result = await query("SELECT file_path, original_filename FROM form_templates WHERE id = $1 AND active = TRUE", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Form template not found." });
    const filePath = path.resolve(formStorageRoot, result.rows[0].file_path);
    if (!filePath.startsWith(formStorageRoot + path.sep) || !fs.existsSync(filePath)) return res.status(404).json({ message: "Template file is unavailable." });
    res.type("application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${result.rows[0].original_filename.replaceAll('"', "")}"`);
    res.sendFile(filePath);
  } catch (error) { next(error); }
});

app.get("/api/patient-forms", requireAuth, async (req, res, next) => {
  const values = [req.user.hospital_id];
  const conditions = ["p.hospital_id = $1"];
  if (req.query.patientId) { values.push(req.query.patientId); conditions.push(`f.patient_id = $${values.length}`); }
  try {
    const result = await query(`${patientFormSelect} WHERE ${conditions.join(" AND ")} ORDER BY f.updated_at DESC LIMIT 200`, values);
    res.json({ forms: result.rows.map(publicPatientForm), total: result.rowCount });
  } catch (error) { next(error); }
});

app.get("/api/patient-forms/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${patientFormSelect} WHERE f.id = $1 AND p.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Patient form not found." });
    res.json({ form: publicPatientForm(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/patient-forms", requireAuth, async (req, res, next) => {
  const { patientId, templateId, fieldData, status } = req.body || {};
  if (!patientId || !templateId) return res.status(400).json({ message: "Patient and form template are required." });
  if (status && !["DRAFT", "COMPLETED"].includes(status)) return res.status(400).json({ message: "Invalid patient form status." });
  try {
    const patient = await query("SELECT id FROM patients WHERE id = $1 AND hospital_id = $2", [patientId, req.user.hospital_id]);
    if (!patient.rows[0]) return res.status(404).json({ message: "Patient not found." });
    const template = await query("SELECT id FROM form_templates WHERE id = $1 AND active = TRUE", [templateId]);
    if (!template.rows[0]) return res.status(404).json({ message: "Form template not found." });
    const created = await query("INSERT INTO patient_forms (patient_id, template_id, created_by, status, field_data) VALUES ($1,$2,$3,$4,$5) RETURNING id", [patientId, templateId, req.user.id, status || "DRAFT", fieldData || {}]);
    const result = await query(`${patientFormSelect} WHERE f.id = $1`, [created.rows[0].id]);
    res.status(201).json({ form: publicPatientForm(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put("/api/patient-forms/:id", requireAuth, async (req, res, next) => {
  const { fieldData, status } = req.body || {};
  if (fieldData === undefined && !status) return res.status(400).json({ message: "Form data or status is required." });
  if (status && !["DRAFT", "COMPLETED"].includes(status)) return res.status(400).json({ message: "Invalid patient form status." });
  try {
    const current = await query(`${patientFormSelect} WHERE f.id = $1 AND p.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) return res.status(404).json({ message: "Patient form not found." });
    await query("UPDATE patient_forms SET field_data = COALESCE($1, field_data), status = COALESCE($2, status), updated_at = NOW() WHERE id = $3", [fieldData === undefined ? null : fieldData, status || null, req.params.id]);
    const result = await query(`${patientFormSelect} WHERE f.id = $1`, [req.params.id]);
    res.json({ form: publicPatientForm(result.rows[0]) });
  } catch (error) { next(error); }
});

app.get("/api/discharge/templates", requireAuth, async (_req, res, next) => {
  try {
    const result = await query("SELECT t.* FROM form_templates t JOIN discharge_templates d ON d.form_template_id = t.id WHERE t.active = TRUE AND d.active = TRUE ORDER BY t.name");
    res.json({ templates: result.rows.map(publicFormTemplate), total: result.rowCount });
  } catch (error) { next(error); }
});

app.get("/api/discharge/admissions", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${ipdSelect} WHERE a.hospital_id = $1 ORDER BY a.admission_date DESC LIMIT 200`, [req.user.hospital_id]);
    res.json({ admissions: result.rows.map(publicAdmission), total: result.rowCount });
  } catch (error) { next(error); }
});

app.get("/api/discharge/summaries", requireAuth, async (req, res, next) => {
  const values = [req.user.hospital_id];
  const conditions = ["s.hospital_id = $1"];
  if (req.query.patientId) { values.push(req.query.patientId); conditions.push(`s.patient_id = $${values.length}`); }
  try {
    const result = await query(`${dischargeSelect} WHERE ${conditions.join(" AND ")} ORDER BY s.updated_at DESC`, values);
    res.json({ summaries: result.rows.map(publicDischargeSummary), total: result.rowCount });
  } catch (error) { next(error); }
});

app.get("/api/discharge/summaries/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${dischargeSelect} WHERE s.id = $1 AND s.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Discharge summary not found." });
    res.json({ summary: publicDischargeSummary(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/discharge/summaries", requireAuth, async (req, res, next) => {
  const { admissionId, diagnosis, clinicalSummary, treatmentProcedure, dischargeCondition, dischargeInstructions, followUp, consultant, status } = req.body || {};
  if (!admissionId) return res.status(400).json({ message: "IPD admission is required." });
  if (status && !["DRAFT", "COMPLETED"].includes(status)) return res.status(400).json({ message: "Invalid discharge summary status." });
  try {
    const admission = await query("SELECT id, patient_id FROM ipd_admissions WHERE id = $1 AND hospital_id = $2", [admissionId, req.user.hospital_id]);
    if (!admission.rows[0]) return res.status(404).json({ message: "IPD admission not found." });
    const created = await query(
      `INSERT INTO discharge_summaries (hospital_id, admission_id, patient_id, created_by, status, diagnosis, clinical_summary, treatment_procedure, discharge_condition, discharge_instructions, follow_up, consultant)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (admission_id) DO UPDATE SET status = EXCLUDED.status, diagnosis = EXCLUDED.diagnosis, clinical_summary = EXCLUDED.clinical_summary, treatment_procedure = EXCLUDED.treatment_procedure, discharge_condition = EXCLUDED.discharge_condition, discharge_instructions = EXCLUDED.discharge_instructions, follow_up = EXCLUDED.follow_up, consultant = EXCLUDED.consultant, updated_at = NOW()
       RETURNING id`,
      [req.user.hospital_id, admissionId, admission.rows[0].patient_id, req.user.id, status || "DRAFT", diagnosis || null, clinicalSummary || null, treatmentProcedure || null, dischargeCondition || null, dischargeInstructions || null, followUp || null, consultant || null]
    );
    const result = await query(`${dischargeSelect} WHERE s.id = $1`, [created.rows[0].id]);
    res.status(201).json({ summary: publicDischargeSummary(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put("/api/discharge/summaries/:id", requireAuth, async (req, res, next) => {
  const { diagnosis, clinicalSummary, treatmentProcedure, dischargeCondition, dischargeInstructions, followUp, consultant, status } = req.body || {};
  if (status && !["DRAFT", "COMPLETED"].includes(status)) return res.status(400).json({ message: "Invalid discharge summary status." });
  try {
    const existing = await query("SELECT id FROM discharge_summaries WHERE id = $1 AND hospital_id = $2", [req.params.id, req.user.hospital_id]);
    if (!existing.rows[0]) return res.status(404).json({ message: "Discharge summary not found." });
    await query(
      `UPDATE discharge_summaries SET diagnosis = COALESCE($1, diagnosis), clinical_summary = COALESCE($2, clinical_summary), treatment_procedure = COALESCE($3, treatment_procedure), discharge_condition = COALESCE($4, discharge_condition), discharge_instructions = COALESCE($5, discharge_instructions), follow_up = COALESCE($6, follow_up), consultant = COALESCE($7, consultant), status = COALESCE($8, status), updated_at = NOW() WHERE id = $9`,
      [diagnosis, clinicalSummary, treatmentProcedure, dischargeCondition, dischargeInstructions, followUp, consultant, status, req.params.id]
    );
    const result = await query(`${dischargeSelect} WHERE s.id = $1`, [req.params.id]);
    res.json({ summary: publicDischargeSummary(result.rows[0]) });
  } catch (error) { next(error); }
});

app.get("/api/discharge/summaries/:id/pdf", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${dischargeSelect} WHERE s.id = $1 AND s.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Discharge summary not found." });
    const summary = publicDischargeSummary(result.rows[0]);
    const document = new PDFDocument({ margin: 48 });
    res.type("application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="discharge-summary-${summary.uhid}.pdf"`);
    document.pipe(res);
    document.fontSize(18).text("SwasthyaSync HMS", { align: "center" });
    document.fontSize(14).text("Discharge Summary", { align: "center" }).moveDown();
    document.fontSize(10).text(`Patient: ${summary.patientName} (${summary.uhid})`);
    document.text(`Admission: ${summary.admissionNumber} | Admitted: ${new Date(summary.admissionDate).toLocaleDateString("en-IN")}`).moveDown();
    for (const [label, value] of [["Diagnosis", summary.diagnosis], ["Clinical Summary", summary.clinicalSummary], ["Treatment / Procedure", summary.treatmentProcedure], ["Discharge Condition", summary.dischargeCondition], ["Discharge Instructions", summary.dischargeInstructions], ["Follow-up", summary.followUp], ["Consultant", summary.consultant]]) {
      document.font("Helvetica-Bold").text(label);
      document.font("Helvetica").text(value || "Not provided").moveDown(0.6);
    }
    document.end();
  } catch (error) { next(error); }
});

const IPD_STATUSES = ["ADMITTED", "DISCHARGED"];
const ipdSelect = `SELECT a.id, a.admission_number, a.admission_date, a.status, a.discharged_at,
  p.id AS patient_id, p.uhid, p.full_name AS patient_name, p.age, p.gender,
  b.id AS bed_id, b.bed_number, b.floor, b.ward, b.room FROM ipd_admissions a
  JOIN patients p ON p.id = a.patient_id JOIN beds b ON b.id = a.bed_id`;

function publicBed(row) {
  return { id: row.id, bedNumber: row.bed_number, floor: row.floor || "Unassigned", ward: row.ward, room: row.room, status: row.status, patientId: row.patient_id ?? null, patientName: row.patient_name ?? null, uhid: row.uhid ?? null, admissionNumber: row.admission_number ?? null };
}

function publicAdmission(row) {
  return { id: row.id, admissionNumber: row.admission_number, patientId: row.patient_id, patientName: row.patient_name, uhid: row.uhid, age: row.age, gender: row.gender, bedId: row.bed_id, bedNumber: row.bed_number, floor: row.floor || "Unassigned", ward: row.ward, room: row.room, admissionDate: row.admission_date, status: row.status, dischargedAt: row.discharged_at };
}

app.post("/api/ipd/beds", requireAuth, async (req, res, next) => {
  const { bedNumberPrefix, bedCount, floor, ward, room } = req.body || {};
  const count = Number(bedCount);
  if (![floor, ward].every((value) => typeof value === "string" && value.trim())) {
    return res.status(400).json({ message: "Floor and ward are required." });
  }
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    return res.status(400).json({ message: "Bed quantity must be between 1 and 200." });
  }

  const requestedPrefix = typeof bedNumberPrefix === "string" && bedNumberPrefix.trim()
    ? bedNumberPrefix.trim().replace(/[^a-zA-Z0-9-]+/g, "").toUpperCase()
    : ward.trim().replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
  const prefix = requestedPrefix.slice(0, 24) || "BED";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beds = [];
    for (let suffix = 1; beds.length < count && suffix <= 99999; suffix += 1) {
      const bedNumber = `${prefix}-${String(suffix).padStart(3, "0")}`;
      const result = await client.query(
        "INSERT INTO beds (hospital_id, bed_number, floor, ward, room, active) VALUES ($1,$2,$3,$4,$5,TRUE) ON CONFLICT (hospital_id, bed_number) DO NOTHING RETURNING *",
        [req.user.hospital_id, bedNumber, floor.trim(), ward.trim(), typeof room === "string" ? room.trim() || null : null]
      );
      if (result.rows[0]) beds.push(publicBed(result.rows[0]));
    }
    if (beds.length !== count) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Unable to generate unique bed numbers for that prefix." });
    }
    await client.query("COMMIT");
    res.status(201).json({ beds, total: beds.length });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.put("/api/ipd/beds/:id", requireAuth, async (req, res, next) => {
  const { bedNumber, floor, ward, room } = req.body || {};
  if (![bedNumber, floor, ward].every((value) => typeof value === "string" && value.trim())) {
    return res.status(400).json({ message: "Bed number, floor, and ward are required." });
  }
  try {
    const result = await query(
      "UPDATE beds SET bed_number=$1, floor=$2, ward=$3, room=$4 WHERE id=$5 AND hospital_id=$6 RETURNING *",
      [bedNumber.trim(), floor.trim(), ward.trim(), typeof room === "string" ? room.trim() || null : null, req.params.id, req.user.hospital_id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Bed not found." });
    res.json({ bed: publicBed(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "That bed number already exists for this hospital." });
    next(error);
  }
});

app.get("/api/ipd/beds", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`SELECT b.*, a.admission_number, p.id AS patient_id, p.full_name AS patient_name, p.uhid FROM beds b LEFT JOIN ipd_admissions a ON a.bed_id = b.id AND a.status = 'ADMITTED' LEFT JOIN patients p ON p.id = a.patient_id WHERE b.hospital_id = $1 AND (b.active = TRUE OR a.id IS NOT NULL) ORDER BY b.floor, b.ward, b.room, b.bed_number`, [req.user.hospital_id]);
    res.json({ beds: result.rows.map(publicBed), total: result.rowCount });
  } catch (error) { next(error); }
});

app.get("/api/ipd/admissions", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${ipdSelect} WHERE a.hospital_id = $1 AND a.status = 'ADMITTED' ORDER BY a.admission_date DESC`, [req.user.hospital_id]);
    res.json({ admissions: result.rows.map(publicAdmission), total: result.rowCount });
  } catch (error) { next(error); }
});

app.get("/api/ipd/admissions/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${ipdSelect} WHERE a.id = $1 AND a.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!result.rows[0]) return res.status(404).json({ message: "IPD admission not found." });
    res.json({ admission: publicAdmission(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/ipd/admissions", requireAuth, async (req, res, next) => {
  const { patientId, bedId } = req.body || {};
  if (!patientId || !bedId) return res.status(400).json({ message: "Patient and bed are required." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const patient = await client.query("SELECT id FROM patients WHERE id = $1 AND hospital_id = $2", [patientId, req.user.hospital_id]);
    if (!patient.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Patient not found." }); }
    const bed = await client.query("SELECT id FROM beds WHERE id = $1 AND hospital_id = $2 AND status = 'AVAILABLE' AND active = TRUE FOR UPDATE", [bedId, req.user.hospital_id]);
    if (!bed.rows[0]) { await client.query("ROLLBACK"); return res.status(409).json({ message: "Selected bed is no longer available." }); }
    const number = await client.query("SELECT nextval('ipd_admission_number_seq') AS value");
    const admissionNumber = `IPD-${new Date().getFullYear()}-${String(number.rows[0].value).padStart(5, "0")}`;
    const admission = await client.query("INSERT INTO ipd_admissions (admission_number, hospital_id, patient_id, bed_id, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id", [admissionNumber, req.user.hospital_id, patientId, bedId, req.user.id]);
    await client.query("UPDATE beds SET status = 'OCCUPIED' WHERE id = $1", [bedId]);
    const result = await client.query(`${ipdSelect} WHERE a.id = $1`, [admission.rows[0].id]);
    await client.query("COMMIT");
    res.status(201).json({ admission: publicAdmission(result.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ message: "The patient or bed already has an active admission." });
    next(error);
  } finally { client.release(); }
});

app.put("/api/ipd/admissions/:id/discharge", requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT id, bed_id, status FROM ipd_admissions WHERE id = $1 AND hospital_id = $2 FOR UPDATE", [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "IPD admission not found." }); }
    if (current.rows[0].status !== "ADMITTED") { await client.query("ROLLBACK"); return res.status(400).json({ message: "This admission is already discharged." }); }
    await client.query("UPDATE ipd_admissions SET status = 'DISCHARGED', discharged_at = NOW(), updated_at = NOW() WHERE id = $1", [req.params.id]);
    await client.query("UPDATE beds SET status = 'AVAILABLE' WHERE id = $1", [current.rows[0].bed_id]);
    await client.query("COMMIT");
    res.json({ released: true });
  } catch (error) { await client.query("ROLLBACK"); next(error); } finally { client.release(); }
});

app.get("/api/ipd/overview", requireAuth, async (req, res, next) => {
  try {
    const result = await query("SELECT status, COUNT(*)::int AS count FROM beds WHERE hospital_id = $1 AND (active = TRUE OR status = 'OCCUPIED') GROUP BY status", [req.user.hospital_id]);
    const counts = Object.fromEntries(result.rows.map((row) => [row.status, row.count]));
    res.json({ total: (counts.AVAILABLE || 0) + (counts.OCCUPIED || 0), available: counts.AVAILABLE || 0, occupied: counts.OCCUPIED || 0 });
  } catch (error) { next(error); }
});

const nursingAdmissionSelect = `SELECT a.id AS admission_id, a.admission_number, a.admission_date, a.status AS admission_status,
  p.id AS patient_id, p.full_name AS patient_name, p.uhid, p.age, p.gender, p.blood_group, p.chief_complaint,
  p.department, p.attending_doctor_id, b.bed_number, b.ward, b.room
  FROM ipd_admissions a JOIN patients p ON p.id = a.patient_id JOIN beds b ON b.id = a.bed_id`;

async function getActiveNursingAdmission(admissionId, hospitalId) {
  const result = await query(`${nursingAdmissionSelect} WHERE a.id = $1 AND a.hospital_id = $2 AND a.status = 'ADMITTED'`, [admissionId, hospitalId]);
  return result.rows[0] || null;
}

function publicNursingAdmission(row) {
  return {
    id: row.admission_id,
    admissionNumber: row.admission_number,
    admissionDate: row.admission_date,
    status: row.admission_status,
    patientId: row.patient_id,
    patientName: row.patient_name,
    uhid: row.uhid,
    age: row.age,
    sex: row.gender,
    bloodGroup: row.blood_group,
    chiefComplaint: row.chief_complaint,
    department: row.department,
    attendingDoctor: findDoctor(row.attending_doctor_id)?.name || "Registered doctor",
    bedNumber: row.bed_number,
    ward: row.ward,
    room: row.room,
  };
}

function publicNursingEntry(row) {
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_match, character) => character.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

app.get("/api/nursing/admissions", requireAuth, async (req, res, next) => {
  const values = [req.user.hospital_id];
  const conditions = ["a.hospital_id = $1", "a.status = 'ADMITTED'"];
  if (req.query.ward) {
    values.push(String(req.query.ward));
    conditions.push(`b.ward = $${values.length}`);
  }
  if (req.query.q) {
    values.push(`%${String(req.query.q)}%`);
    conditions.push(`(p.full_name ILIKE $${values.length} OR p.uhid ILIKE $${values.length})`);
  }
  try {
    const result = await query(
      `${nursingAdmissionSelect} WHERE ${conditions.join(" AND ")} ORDER BY a.admission_date DESC LIMIT 200`,
      values
    );
    const admissions = result.rows.map(publicNursingAdmission);
    res.json({ admissions, total: admissions.length, wards: [...new Set(admissions.map((admission) => admission.ward))].sort() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/nursing/admissions/:id", requireAuth, async (req, res, next) => {
  try {
    const admission = await getActiveNursingAdmission(req.params.id, req.user.hospital_id);
    if (!admission) return res.status(404).json({ message: "Active IPD admission not found." });
    const [assessments, vitals, notes, tasks, intakeOutput, medications] = await Promise.all([
      query("SELECT n.*, u.name AS recorded_by_name FROM nursing_assessments n JOIN users u ON u.id = n.recorded_by WHERE n.admission_id = $1 AND n.patient_id = $2 AND n.hospital_id = $3 ORDER BY n.recorded_at DESC LIMIT 50", [admission.admission_id, admission.patient_id, req.user.hospital_id]),
      query("SELECT n.*, u.name AS recorded_by_name FROM nursing_vitals n JOIN users u ON u.id = n.recorded_by WHERE n.admission_id = $1 AND n.patient_id = $2 AND n.hospital_id = $3 ORDER BY n.recorded_at DESC LIMIT 50", [admission.admission_id, admission.patient_id, req.user.hospital_id]),
      query("SELECT n.*, u.name AS recorded_by_name FROM nursing_notes n JOIN users u ON u.id = n.recorded_by WHERE n.admission_id = $1 AND n.patient_id = $2 AND n.hospital_id = $3 ORDER BY n.recorded_at DESC LIMIT 50", [admission.admission_id, admission.patient_id, req.user.hospital_id]),
      query("SELECT t.*, creator.name AS created_by_name, completer.name AS completed_by_name FROM nursing_tasks t JOIN users creator ON creator.id = t.created_by LEFT JOIN users completer ON completer.id = t.completed_by WHERE t.admission_id = $1 AND t.patient_id = $2 AND t.hospital_id = $3 ORDER BY CASE t.status WHEN 'PENDING' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END, t.created_at DESC LIMIT 100", [admission.admission_id, admission.patient_id, req.user.hospital_id]),
      query("SELECT n.*, u.name AS recorded_by_name FROM nursing_io_entries n JOIN users u ON u.id = n.recorded_by WHERE n.admission_id = $1 AND n.patient_id = $2 AND n.hospital_id = $3 ORDER BY n.recorded_at DESC LIMIT 100", [admission.admission_id, admission.patient_id, req.user.hospital_id]),
      query(`SELECT c.id AS cpoe_order_id, c.order_number, c.order_item AS medication_name, c.clinical_instructions,
        c.priority, c.status AS cpoe_status, c.ordered_at, po.status AS pharmacy_status,
        po.dose, po.route, po.frequency, po.duration, po.quantity
        FROM cpoe_orders c LEFT JOIN pharmacy_orders po ON po.cpoe_order_id = c.id
        WHERE c.patient_id = $1 AND c.hospital_id = $2 AND c.order_category = 'Medication'
        ORDER BY c.ordered_at DESC LIMIT 50`, [admission.patient_id, req.user.hospital_id]),
    ]);
    res.json({
      admission: publicNursingAdmission(admission),
      assessments: assessments.rows.map(publicNursingEntry),
      vitals: vitals.rows.map(publicNursingEntry),
      notes: notes.rows.map(publicNursingEntry),
      tasks: tasks.rows.map(publicNursingEntry),
      intakeOutput: intakeOutput.rows.map(publicNursingEntry),
      medications: medications.rows.map(publicNursingEntry),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/nursing/admissions/:id/assessments", requireAuth, async (req, res, next) => {
  const fields = ["generalCondition", "consciousness", "painAssessment", "mobility", "nutrition", "skinObservations", "fallRiskObservations", "otherObservations", "remarks"];
  const values = fields.map((field) => req.body?.[field] == null ? null : String(req.body[field]).trim() || null);
  if (!values.some(Boolean)) return res.status(400).json({ message: "Enter at least one nursing assessment observation." });
  try {
    const admission = await getActiveNursingAdmission(req.params.id, req.user.hospital_id);
    if (!admission) return res.status(404).json({ message: "Active IPD admission not found." });
    const created = await query(
      `INSERT INTO nursing_assessments (hospital_id, admission_id, patient_id, general_condition, consciousness, pain_assessment, mobility, nutrition, skin_observations, fall_risk_observations, other_observations, remarks, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.hospital_id, admission.admission_id, admission.patient_id, ...values, req.user.id]
    );
    res.status(201).json({ assessment: publicNursingEntry(created.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/nursing/admissions/:id/vitals", requireAuth, async (req, res, next) => {
  const input = req.body || {};
  const numeric = (value) => value === undefined || value === null || value === "" ? null : Number(value);
  const temperature = numeric(input.temperature);
  const pulse = numeric(input.pulse);
  const respiratoryRate = numeric(input.respiratoryRate);
  const spo2 = numeric(input.spo2);
  const systolicBp = numeric(input.systolicBp);
  const diastolicBp = numeric(input.diastolicBp);
  const weight = numeric(input.weight);
  const values = [temperature, pulse, respiratoryRate, spo2, systolicBp, diastolicBp, weight];
  if (!values.some((value) => value !== null) || values.some((value) => value !== null && (!Number.isFinite(value) || value <= 0))) {
    return res.status(400).json({ message: "Enter at least one valid positive vital sign." });
  }
  if (temperature !== null && temperature > 50 || pulse !== null && pulse > 300 || respiratoryRate !== null && respiratoryRate > 100 || spo2 !== null && spo2 > 100 || systolicBp !== null && systolicBp > 300 || diastolicBp !== null && diastolicBp > 200 || weight !== null && weight > 500) {
    return res.status(400).json({ message: "One or more vital signs exceed the supported clinical entry range." });
  }
  if ((systolicBp === null) !== (diastolicBp === null)) return res.status(400).json({ message: "Enter both systolic and diastolic blood pressure." });
  if (pulse !== null && !Number.isInteger(pulse) || respiratoryRate !== null && !Number.isInteger(respiratoryRate) || systolicBp !== null && !Number.isInteger(systolicBp) || diastolicBp !== null && !Number.isInteger(diastolicBp)) {
    return res.status(400).json({ message: "Pulse, respiratory rate, and blood pressure must be whole numbers." });
  }
  try {
    const admission = await getActiveNursingAdmission(req.params.id, req.user.hospital_id);
    if (!admission) return res.status(404).json({ message: "Active IPD admission not found." });
    const created = await query(
      `INSERT INTO nursing_vitals (hospital_id, admission_id, patient_id, temperature, pulse, respiratory_rate, spo2, systolic_bp, diastolic_bp, weight, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.hospital_id, admission.admission_id, admission.patient_id, temperature, pulse, respiratoryRate, spo2, systolicBp, diastolicBp, weight, input.notes ? String(input.notes).trim() : null, req.user.id]
    );
    res.status(201).json({ vital: publicNursingEntry(created.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/nursing/admissions/:id/notes", requireAuth, async (req, res, next) => {
  const fields = ["observation", "intervention", "response", "remarks"];
  const values = fields.map((field) => req.body?.[field] == null ? null : String(req.body[field]).trim() || null);
  if (!values.some(Boolean)) return res.status(400).json({ message: "Enter an observation, intervention, response, or remark." });
  try {
    const admission = await getActiveNursingAdmission(req.params.id, req.user.hospital_id);
    if (!admission) return res.status(404).json({ message: "Active IPD admission not found." });
    const created = await query(
      `INSERT INTO nursing_notes (hospital_id, admission_id, patient_id, observation, intervention, response, remarks, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.hospital_id, admission.admission_id, admission.patient_id, ...values, req.user.id]
    );
    res.status(201).json({ note: publicNursingEntry(created.rows[0]) });
  } catch (error) {
    next(error);
  }
});

const NURSING_TASK_TYPES = ["Medication administration", "Vital-sign monitoring", "Patient repositioning", "Wound / skin care", "Intake / output monitoring", "Other"];
const NURSING_TASK_TRANSITIONS = { PENDING: ["IN_PROGRESS", "COMPLETED"], IN_PROGRESS: ["COMPLETED"], COMPLETED: [] };

app.post("/api/nursing/admissions/:id/tasks", requireAuth, async (req, res, next) => {
  const { taskType, description } = req.body || {};
  if (!NURSING_TASK_TYPES.includes(taskType)) return res.status(400).json({ message: "Select a valid nursing task type." });
  if (!description || !String(description).trim()) return res.status(400).json({ message: "Task description is required." });
  try {
    const admission = await getActiveNursingAdmission(req.params.id, req.user.hospital_id);
    if (!admission) return res.status(404).json({ message: "Active IPD admission not found." });
    const created = await query(
      `INSERT INTO nursing_tasks (hospital_id, admission_id, patient_id, task_type, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.hospital_id, admission.admission_id, admission.patient_id, taskType, String(description).trim(), req.user.id]
    );
    res.status(201).json({ task: publicNursingEntry(created.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/nursing/admissions/:admissionId/tasks/:taskId", requireAuth, async (req, res, next) => {
  const { status } = req.body || {};
  if (!Object.hasOwn(NURSING_TASK_TRANSITIONS, status)) return res.status(400).json({ message: "Invalid nursing task status." });
  try {
    const current = await query(
      `SELECT t.* FROM nursing_tasks t JOIN ipd_admissions a ON a.id = t.admission_id
      WHERE t.id = $1 AND t.admission_id = $2 AND t.patient_id = a.patient_id AND t.hospital_id = $3 AND a.hospital_id = $3 AND a.status = 'ADMITTED'`,
      [req.params.taskId, req.params.admissionId, req.user.hospital_id]
    );
    if (!current.rows[0]) return res.status(404).json({ message: "Nursing task not found for this active admission." });
    if (!NURSING_TASK_TRANSITIONS[current.rows[0].status].includes(status)) {
      return res.status(400).json({ message: `Invalid task transition from ${current.rows[0].status} to ${status}.` });
    }
    const updated = await query(
      `UPDATE nursing_tasks SET status = $1, completed_by = CASE WHEN $1 = 'COMPLETED' THEN $2 ELSE completed_by END,
       completed_at = CASE WHEN $1 = 'COMPLETED' THEN NOW() ELSE completed_at END, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, req.user.id, current.rows[0].id]
    );
    res.json({ task: publicNursingEntry(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

const NURSING_IO_TYPES = { INTAKE: ["Oral", "IV", "Other intake"], OUTPUT: ["Urine", "Drain", "Other output"] };

app.post("/api/nursing/admissions/:id/intake-output", requireAuth, async (req, res, next) => {
  const { direction, entryType, amount, unit, notes } = req.body || {};
  const numericAmount = Number(amount);
  if (!Object.hasOwn(NURSING_IO_TYPES, direction) || !NURSING_IO_TYPES[direction].includes(entryType)) return res.status(400).json({ message: "Select a valid intake/output type." });
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ message: "Amount must be a positive number." });
  if (!unit || !String(unit).trim()) return res.status(400).json({ message: "Unit is required." });
  try {
    const admission = await getActiveNursingAdmission(req.params.id, req.user.hospital_id);
    if (!admission) return res.status(404).json({ message: "Active IPD admission not found." });
    const created = await query(
      `INSERT INTO nursing_io_entries (hospital_id, admission_id, patient_id, direction, entry_type, amount, unit, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.hospital_id, admission.admission_id, admission.patient_id, direction, entryType, numericAmount, String(unit).trim(), notes ? String(notes).trim() : null, req.user.id]
    );
    res.status(201).json({ entry: publicNursingEntry(created.rows[0]) });
  } catch (error) {
    next(error);
  }
});

const OT_STATUSES = ["SCHEDULED", "PREPARATION", "IN_PROGRESS", "COMPLETED", "CANCELLED", "POSTPONED"];
const OT_TRANSITIONS = {
  SCHEDULED: ["PREPARATION", "CANCELLED", "POSTPONED"],
  PREPARATION: ["IN_PROGRESS", "CANCELLED", "POSTPONED"],
  IN_PROGRESS: ["COMPLETED"],
  POSTPONED: ["SCHEDULED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
const OT_CHECKLIST_ITEMS = [
  "patientIdentityConfirmed", "consentAvailable", "procedureConfirmed", "siteVerified",
  "investigationsReviewed", "anaesthesiaAssessmentAvailable", "allergiesReviewed",
  "equipmentConfirmed", "bloodAvailable", "preoperativePreparationCompleted",
];
const OT_CASE_SELECT = `SELECT oc.*, p.full_name AS patient_name, p.uhid, p.age, p.gender, p.blood_group, p.chief_complaint,
  p.department, p.attending_doctor_id, a.admission_number, a.status AS admission_status,
  b.bed_number, b.ward, b.room, t.name AS theatre_name, c.order_number AS cpoe_order_number,
  creator.name AS created_by_name
  FROM ot_cases oc JOIN patients p ON p.id = oc.patient_id
  JOIN ot_theatres t ON t.id = oc.theatre_id
  LEFT JOIN ipd_admissions a ON a.id = oc.admission_id
  LEFT JOIN beds b ON b.id = a.bed_id
  LEFT JOIN cpoe_orders c ON c.id = oc.cpoe_order_id
  JOIN users creator ON creator.id = oc.created_by`;

async function getOtCase(caseId, hospitalId) {
  const result = await query(`${OT_CASE_SELECT} WHERE oc.id = $1 AND oc.hospital_id = $2`, [caseId, hospitalId]);
  return result.rows[0] || null;
}

function publicOtCase(row) {
  return {
    id: row.id,
    hospitalId: row.hospital_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    uhid: row.uhid,
    age: row.age,
    sex: row.gender,
    bloodGroup: row.blood_group,
    chiefComplaint: row.chief_complaint,
    department: row.department,
    attendingDoctor: findDoctor(row.attending_doctor_id)?.name || "Registered doctor",
    admissionId: row.admission_id,
    admissionNumber: row.admission_number,
    admissionStatus: row.admission_status,
    bedNumber: row.bed_number,
    ward: row.ward,
    room: row.room,
    cpoeOrderId: row.cpoe_order_id,
    cpoeOrderNumber: row.cpoe_order_number,
    theatreId: row.theatre_id,
    theatreName: row.theatre_name,
    procedureName: row.procedure_name,
    surgeon: row.surgeon,
    anaesthetist: row.anaesthetist,
    anaesthesiaType: row.anaesthesia_type,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    priority: row.priority,
    status: row.status,
    clinicalIndication: row.clinical_indication,
    clinicalInstructions: row.clinical_instructions,
    checklist: row.checklist || {},
    actualProcedure: row.actual_procedure,
    actualStartAt: row.actual_start_at,
    actualEndAt: row.actual_end_at,
    operativeSurgeon: row.operative_surgeon,
    operativeAnaesthetist: row.operative_anaesthetist,
    findings: row.findings,
    procedureNotes: row.procedure_notes,
    complications: row.complications,
    estimatedBloodLossMl: row.estimated_blood_loss_ml,
    specimens: row.specimens,
    operativeRemarks: row.operative_remarks,
    recoveryStatus: row.recovery_status,
    postoperativeInstructions: row.postoperative_instructions,
    followUpInstructions: row.follow_up_instructions,
    postoperativeComplications: row.postoperative_complications,
    postoperativeRemarks: row.postoperative_remarks,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

async function ensureDefaultOtTheatres(hospitalId) {
  await query(
    `INSERT INTO ot_theatres (hospital_id, name)
     SELECT $1, names.name FROM unnest(ARRAY['OT-1', 'OT-2', 'OT-3']::TEXT[]) AS names(name)
     ON CONFLICT (hospital_id, name) DO NOTHING`,
    [hospitalId]
  );
}

async function otScheduleConflict(client, { hospitalId, theatreId, scheduledAt, durationMinutes, excludeId }) {
  const result = await client.query(
    `SELECT id FROM ot_cases
     WHERE hospital_id = $1 AND theatre_id = $2 AND status IN ('SCHEDULED', 'PREPARATION', 'IN_PROGRESS')
       AND ($4::UUID IS NULL OR id <> $4)
       AND scheduled_at < ($3::TIMESTAMPTZ + ($5::INTEGER * INTERVAL '1 minute'))
       AND ($3::TIMESTAMPTZ) < (scheduled_at + (duration_minutes * INTERVAL '1 minute'))
     LIMIT 1`,
    [hospitalId, theatreId, scheduledAt, excludeId || null, durationMinutes]
  );
  return Boolean(result.rows[0]);
}

app.get("/api/ot/theatres", requireAuth, async (req, res, next) => {
  try {
    await ensureDefaultOtTheatres(req.user.hospital_id);
    const result = await query("SELECT id, name, active FROM ot_theatres WHERE hospital_id = $1 AND active = TRUE ORDER BY name", [req.user.hospital_id]);
    res.json({ theatres: result.rows.map((row) => ({ id: row.id, name: row.name, active: row.active })), total: result.rowCount });
  } catch (error) {
    next(error);
  }
});

app.get("/api/ot/procedure-orders", requireAuth, async (req, res, next) => {
  try {
    const values = [req.user.hospital_id];
    let patientCondition = "";
    if (req.query.patientId) {
      values.push(req.query.patientId);
      patientCondition = ` AND c.patient_id = $${values.length}`;
    }
    const result = await query(
      `SELECT c.id, c.order_number, c.patient_id, p.full_name AS patient_name, p.uhid, c.order_item,
        c.priority, c.clinical_instructions, c.notes, c.ordered_at
       FROM cpoe_orders c JOIN patients p ON p.id = c.patient_id
       WHERE c.hospital_id = $1 AND c.order_category = 'Procedure'
         AND NOT EXISTS (SELECT 1 FROM ot_cases oc WHERE oc.cpoe_order_id = c.id)${patientCondition}
       ORDER BY c.ordered_at DESC LIMIT 200`,
      values
    );
    res.json({ orders: result.rows.map((row) => ({
      id: row.id, orderNumber: row.order_number, patientId: row.patient_id, patientName: row.patient_name,
      uhid: row.uhid, procedureName: row.order_item, priority: row.priority,
      clinicalInstructions: row.clinical_instructions, notes: row.notes, orderedAt: row.ordered_at,
    })), total: result.rowCount });
  } catch (error) {
    next(error);
  }
});

app.get("/api/ot/cases", requireAuth, async (req, res, next) => {
  const values = [req.user.hospital_id];
  const conditions = ["oc.hospital_id = $1"];
  if (req.query.status) {
    if (!OT_STATUSES.includes(req.query.status)) return res.status(400).json({ message: "Invalid OT case status." });
    values.push(req.query.status);
    conditions.push(`oc.status = $${values.length}`);
  }
  if (req.query.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))) return res.status(400).json({ message: "Date must use YYYY-MM-DD format." });
    values.push(req.query.date);
    conditions.push(`oc.scheduled_at::date = $${values.length}::date`);
  }
  if (req.query.q) {
    values.push(`%${String(req.query.q)}%`);
    conditions.push(`(p.full_name ILIKE $${values.length} OR p.uhid ILIKE $${values.length} OR oc.procedure_name ILIKE $${values.length} OR oc.surgeon ILIKE $${values.length} OR t.name ILIKE $${values.length} OR c.order_number ILIKE $${values.length})`);
  }
  try {
    const result = await query(`${OT_CASE_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY oc.scheduled_at DESC LIMIT 300`, values);
    const cases = result.rows.map(publicOtCase);
    res.json({ cases, total: cases.length });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ot/cases", requireAuth, async (req, res, next) => {
  const input = req.body || {};
  const { patientId, admissionId, cpoeOrderId, procedureName, surgeon, anaesthetist, theatreId, scheduledAt, durationMinutes, priority, anaesthesiaType, clinicalIndication, clinicalInstructions } = input;
  const duration = durationMinutes === undefined || durationMinutes === "" ? 60 : Number(durationMinutes);
  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
  if (!patientId || !procedureName?.trim() || !surgeon?.trim() || !anaesthetist?.trim() || !theatreId || !scheduledAt) {
    return res.status(400).json({ message: "Patient, procedure, surgeon, anaesthetist, theatre, and scheduled date/time are required." });
  }
  if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) return res.status(400).json({ message: "Enter a valid scheduled date and time." });
  if (!Number.isInteger(duration) || duration < 15 || duration > 1440) return res.status(400).json({ message: "Duration must be between 15 minutes and 24 hours." });
  if (priority && !["STAT", "URGENT", "ROUTINE"].includes(priority)) return res.status(400).json({ message: "Invalid OT priority." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${req.user.hospital_id}:${theatreId}`]);
    const patient = await client.query("SELECT id FROM patients WHERE id = $1 AND hospital_id = $2", [patientId, req.user.hospital_id]);
    if (!patient.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Patient not found." }); }
    const theatre = await client.query("SELECT id FROM ot_theatres WHERE id = $1 AND hospital_id = $2 AND active = TRUE", [theatreId, req.user.hospital_id]);
    if (!theatre.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "OT theatre not found." }); }
    if (admissionId) {
      const admission = await client.query("SELECT id FROM ipd_admissions WHERE id = $1 AND patient_id = $2 AND hospital_id = $3 AND status = 'ADMITTED'", [admissionId, patientId, req.user.hospital_id]);
      if (!admission.rows[0]) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Admission must be active and belong to the selected patient." }); }
    }
    let sourceOrder = null;
    if (cpoeOrderId) {
      const cpoe = await client.query("SELECT id, patient_id, order_item, priority, clinical_instructions, notes FROM cpoe_orders WHERE id = $1 AND hospital_id = $2 AND order_category = 'Procedure'", [cpoeOrderId, req.user.hospital_id]);
      if (!cpoe.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "CPOE procedure order not found." }); }
      if (cpoe.rows[0].patient_id !== patientId) { await client.query("ROLLBACK"); return res.status(400).json({ message: "CPOE procedure order belongs to a different patient." }); }
      sourceOrder = cpoe.rows[0];
    }
    if (await otScheduleConflict(client, { hospitalId: req.user.hospital_id, theatreId, scheduledAt: scheduledDate, durationMinutes: duration })) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This theatre already has a case scheduled during that time." });
    }
    const created = await client.query(
      `INSERT INTO ot_cases (hospital_id, patient_id, admission_id, cpoe_order_id, theatre_id, procedure_name, surgeon, anaesthetist, anaesthesia_type, scheduled_at, duration_minutes, priority, clinical_indication, clinical_instructions, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [req.user.hospital_id, patientId, admissionId || null, cpoeOrderId || null, theatreId, String(procedureName).trim(), String(surgeon).trim(), String(anaesthetist).trim(), anaesthesiaType ? String(anaesthesiaType).trim() : null, scheduledDate, duration, priority || sourceOrder?.priority || "ROUTINE", clinicalIndication ? String(clinicalIndication).trim() : null, clinicalInstructions ? String(clinicalInstructions).trim() : sourceOrder?.clinical_instructions || sourceOrder?.notes || null, req.user.id]
    );
    const result = await client.query(`${OT_CASE_SELECT} WHERE oc.id = $1 AND oc.hospital_id = $2`, [created.rows[0].id, req.user.hospital_id]);
    await client.query("COMMIT");
    res.status(201).json({ otCase: publicOtCase(result.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ message: "This CPOE procedure order already has an OT case." });
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/ot/cases/:id", requireAuth, async (req, res, next) => {
  try {
    const row = await getOtCase(req.params.id, req.user.hospital_id);
    if (!row) return res.status(404).json({ message: "OT case not found." });
    const notes = await query("SELECT n.id, n.ot_case_id, n.note_type, n.note_text, n.created_at, n.created_by, u.name AS author_name FROM ot_case_notes n JOIN users u ON u.id = n.created_by WHERE n.ot_case_id = $1 AND n.hospital_id = $2 ORDER BY n.created_at DESC", [row.id, req.user.hospital_id]);
    res.json({ otCase: publicOtCase(row), notes: notes.rows.map((note) => ({ id: note.id, otCaseId: note.ot_case_id, noteType: note.note_type, noteText: note.note_text, createdAt: note.created_at, createdBy: note.created_by, authorName: note.author_name })) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/ot/cases/:id/status", requireAuth, async (req, res, next) => {
  const { status, scheduledAt, theatreId } = req.body || {};
  if (!OT_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid OT case status." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM ot_cases WHERE id = $1 AND hospital_id = $2 FOR UPDATE", [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "OT case not found." }); }
    const existing = current.rows[0];
    if (!OT_TRANSITIONS[existing.status]?.includes(status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Invalid OT status transition from ${existing.status} to ${status}.` });
    }
    const nextTheatreId = theatreId || existing.theatre_id;
    const nextScheduledAt = scheduledAt ? new Date(scheduledAt) : existing.scheduled_at;
    if (!nextScheduledAt || Number.isNaN(nextScheduledAt.getTime())) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Enter a valid scheduled date and time." }); }
    if (theatreId) {
      const theatre = await client.query("SELECT id FROM ot_theatres WHERE id = $1 AND hospital_id = $2 AND active = TRUE", [theatreId, req.user.hospital_id]);
      if (!theatre.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "OT theatre not found." }); }
    }
    if (status === "SCHEDULED" || nextTheatreId !== existing.theatre_id || nextScheduledAt.getTime() !== new Date(existing.scheduled_at).getTime()) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${req.user.hospital_id}:${nextTheatreId}`]);
      if (await otScheduleConflict(client, { hospitalId: req.user.hospital_id, theatreId: nextTheatreId, scheduledAt: nextScheduledAt, durationMinutes: existing.duration_minutes, excludeId: existing.id })) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "This theatre already has a case scheduled during that time." });
      }
    }
    await client.query(
      `UPDATE ot_cases SET status = $1, scheduled_at = $2, theatre_id = $3,
       actual_start_at = CASE WHEN $1 = 'IN_PROGRESS' THEN COALESCE(actual_start_at, NOW()) ELSE actual_start_at END,
       completed_at = CASE WHEN $1 = 'COMPLETED' THEN NOW() ELSE completed_at END, updated_at = NOW()
       WHERE id = $4`,
      [status, nextScheduledAt, nextTheatreId, existing.id]
    );
    const updated = await client.query(`${OT_CASE_SELECT} WHERE oc.id = $1 AND oc.hospital_id = $2`, [existing.id, req.user.hospital_id]);
    await client.query("COMMIT");
    res.json({ otCase: publicOtCase(updated.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.put("/api/ot/cases/:id/checklist", requireAuth, async (req, res, next) => {
  const checklist = req.body?.checklist;
  if (!checklist || typeof checklist !== "object" || Array.isArray(checklist) || Object.keys(checklist).some((key) => !OT_CHECKLIST_ITEMS.includes(key)) || Object.values(checklist).some((value) => typeof value !== "boolean")) {
    return res.status(400).json({ message: "Checklist must contain valid boolean pre-operative items." });
  }
  try {
    const updated = await query(
      "UPDATE ot_cases SET checklist = checklist || $1::jsonb, updated_at = NOW() WHERE id = $2 AND hospital_id = $3 AND status IN ('SCHEDULED', 'PREPARATION') RETURNING id",
      [JSON.stringify(checklist), req.params.id, req.user.hospital_id]
    );
    if (!updated.rows[0]) {
      const existing = await query("SELECT id FROM ot_cases WHERE id = $1 AND hospital_id = $2", [req.params.id, req.user.hospital_id]);
      return existing.rows[0] ? res.status(400).json({ message: "The pre-operative checklist is locked after the case starts." }) : res.status(404).json({ message: "OT case not found." });
    }
    const otCase = await getOtCase(req.params.id, req.user.hospital_id);
    res.json({ otCase: publicOtCase(otCase) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ot/cases/:id/notes", requireAuth, async (req, res, next) => {
  const { noteType, noteText } = req.body || {};
  if (!["PRE_OPERATIVE", "INTRA_OPERATIVE", "POST_OPERATIVE"].includes(noteType)) return res.status(400).json({ message: "Select a valid OT note type." });
  if (!noteText || !String(noteText).trim()) return res.status(400).json({ message: "Note text is required." });
  try {
    const existing = await query("SELECT id FROM ot_cases WHERE id = $1 AND hospital_id = $2", [req.params.id, req.user.hospital_id]);
    if (!existing.rows[0]) return res.status(404).json({ message: "OT case not found." });
    const created = await query(
      "INSERT INTO ot_case_notes (hospital_id, ot_case_id, note_type, note_text, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, ot_case_id, note_type, note_text, created_at, created_by",
      [req.user.hospital_id, req.params.id, noteType, String(noteText).trim(), req.user.id]
    );
    const author = await query("SELECT name FROM users WHERE id = $1", [req.user.id]);
    const note = created.rows[0];
    res.status(201).json({ note: { id: note.id, otCaseId: note.ot_case_id, noteType: note.note_type, noteText: note.note_text, createdAt: note.created_at, createdBy: note.created_by, authorName: author.rows[0]?.name || null } });
  } catch (error) {
    next(error);
  }
});

app.put("/api/ot/cases/:id/operative-details", requireAuth, async (req, res, next) => {
  const input = req.body || {};
  const bloodLoss = input.estimatedBloodLossMl == null || input.estimatedBloodLossMl === "" ? null : Number(input.estimatedBloodLossMl);
  if (bloodLoss !== null && (!Number.isFinite(bloodLoss) || bloodLoss < 0)) return res.status(400).json({ message: "Estimated blood loss must be a non-negative number." });
  if (input.actualStartAt && Number.isNaN(new Date(input.actualStartAt).getTime()) || input.actualEndAt && Number.isNaN(new Date(input.actualEndAt).getTime())) return res.status(400).json({ message: "Enter valid operative start and end times." });
  if (input.actualStartAt && input.actualEndAt && new Date(input.actualEndAt) < new Date(input.actualStartAt)) return res.status(400).json({ message: "Operative end time cannot be earlier than start time." });
  try {
    const result = await query(
      `UPDATE ot_cases SET actual_procedure = COALESCE($1, actual_procedure), actual_start_at = COALESCE($2, actual_start_at),
       actual_end_at = COALESCE($3, actual_end_at), operative_surgeon = COALESCE($4, operative_surgeon), operative_anaesthetist = COALESCE($5, operative_anaesthetist),
       findings = COALESCE($6, findings), procedure_notes = COALESCE($7, procedure_notes), complications = COALESCE($8, complications),
       estimated_blood_loss_ml = COALESCE($9, estimated_blood_loss_ml), specimens = COALESCE($10, specimens), operative_remarks = COALESCE($11, operative_remarks), updated_at = NOW()
       WHERE id = $12 AND hospital_id = $13 AND status = 'IN_PROGRESS' RETURNING id`,
      [input.actualProcedure?.trim() || null, input.actualStartAt ? new Date(input.actualStartAt) : null, input.actualEndAt ? new Date(input.actualEndAt) : null,
        input.operativeSurgeon?.trim() || null, input.operativeAnaesthetist?.trim() || null, input.findings?.trim() || null, input.procedureNotes?.trim() || null,
        input.complications?.trim() || null, bloodLoss, input.specimens?.trim() || null, input.operativeRemarks?.trim() || null, req.params.id, req.user.hospital_id]
    );
    if (!result.rows[0]) {
      const existing = await query("SELECT id, status FROM ot_cases WHERE id = $1 AND hospital_id = $2", [req.params.id, req.user.hospital_id]);
      return existing.rows[0] ? res.status(400).json({ message: "Operative details can only be edited while the case is IN_PROGRESS." }) : res.status(404).json({ message: "OT case not found." });
    }
    res.json({ otCase: publicOtCase(await getOtCase(req.params.id, req.user.hospital_id)) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/ot/cases/:id/postoperative", requireAuth, async (req, res, next) => {
  const input = req.body || {};
  try {
    const result = await query(
      `UPDATE ot_cases SET recovery_status = COALESCE($1, recovery_status), postoperative_instructions = COALESCE($2, postoperative_instructions),
       follow_up_instructions = COALESCE($3, follow_up_instructions), postoperative_complications = COALESCE($4, postoperative_complications),
       postoperative_remarks = COALESCE($5, postoperative_remarks), updated_at = NOW()
       WHERE id = $6 AND hospital_id = $7 AND status = 'COMPLETED' RETURNING id`,
      [input.recoveryStatus?.trim() || null, input.postoperativeInstructions?.trim() || null, input.followUpInstructions?.trim() || null,
        input.postoperativeComplications?.trim() || null, input.postoperativeRemarks?.trim() || null, req.params.id, req.user.hospital_id]
    );
    if (!result.rows[0]) {
      const existing = await query("SELECT id, status FROM ot_cases WHERE id = $1 AND hospital_id = $2", [req.params.id, req.user.hospital_id]);
      return existing.rows[0] ? res.status(400).json({ message: "Post-operative information can only be edited after completion." }) : res.status(404).json({ message: "OT case not found." });
    }
    res.json({ otCase: publicOtCase(await getOtCase(req.params.id, req.user.hospital_id)) });
  } catch (error) {
    next(error);
  }
});

const TRIAGE_LEVELS = ["Red", "Orange", "Yellow", "Green"];
const EMERGENCY_STATUS = ["Waiting", "In Treatment", "Transferred", "Discharged"];
const emergencySelect = `SELECT e.id, e.patient_id, e.hospital_id, e.triage_level, e.status, e.arrival_time,
  e.complaint, e.notes, e.created_at, e.updated_at,
  p.full_name AS patient_name, p.uhid, p.age, p.gender, p.department, p.mlc_type
  FROM emergency_encounters e
  JOIN patients p ON p.id = e.patient_id`;

function publicEmergencyEncounter(row) {
  return {
    id: row.id,
    hospitalId: row.hospital_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    uhid: row.uhid,
    age: row.age,
    gender: row.gender,
    department: row.department,
    mlcType: row.mlc_type,
    arrivalTime: row.arrival_time,
    triageLevel: row.triage_level,
    status: row.status,
    complaint: row.complaint,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

app.get("/api/emergency/queue", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${emergencySelect} WHERE e.hospital_id = $1 ORDER BY CASE e.triage_level WHEN 'Red' THEN 1 WHEN 'Orange' THEN 2 WHEN 'Yellow' THEN 3 ELSE 4 END, e.arrival_time ASC`, [req.user.hospital_id]);
    res.json({ encounters: result.rows.map(publicEmergencyEncounter), total: result.rowCount });
  } catch (error) { next(error); }
});

app.get("/api/emergency/encounters", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${emergencySelect} WHERE e.hospital_id = $1 ORDER BY e.arrival_time DESC LIMIT 200`, [req.user.hospital_id]);
    res.json({ encounters: result.rows.map(publicEmergencyEncounter), total: result.rowCount });
  } catch (error) { next(error); }
});

app.get("/api/emergency/encounters/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${emergencySelect} WHERE e.id = $1 AND e.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Emergency encounter not found." });
    res.json({ encounter: publicEmergencyEncounter(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/emergency/encounters", requireAuth, async (req, res, next) => {
  const { patientId, triageLevel, status, complaint, notes, arrivalTime } = req.body || {};
  if (!patientId || !triageLevel || !complaint || String(complaint).trim() === "") {
    return res.status(400).json({ message: "Patient, triage level, and complaint are required." });
  }
  if (!TRIAGE_LEVELS.includes(triageLevel)) return res.status(400).json({ message: "Invalid triage level." });
  if (status && !EMERGENCY_STATUS.includes(status)) return res.status(400).json({ message: "Invalid emergency status." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const patient = await client.query("SELECT id, hospital_id FROM patients WHERE id = $1 AND hospital_id = $2", [patientId, req.user.hospital_id]);
    if (!patient.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Patient not found." }); }

    const active = await client.query("SELECT id FROM emergency_encounters WHERE patient_id = $1 AND hospital_id = $2 AND status <> 'Discharged' FOR UPDATE", [patientId, req.user.hospital_id]);
    if (active.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ message: "This patient already has an active emergency encounter." }); }

    const created = await client.query(
      `INSERT INTO emergency_encounters (hospital_id, patient_id, created_by, triage_level, status, arrival_time, complaint, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.hospital_id, patientId, req.user.id, triageLevel, status || "Waiting", arrivalTime || new Date().toISOString(), String(complaint).trim(), notes ? String(notes).trim() : null]
    );

    const result = await client.query(`${emergencySelect} WHERE e.id = $1`, [created.rows[0].id]);
    await client.query("COMMIT");
    res.status(201).json({ encounter: publicEmergencyEncounter(result.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.put("/api/emergency/encounters/:id", requireAuth, async (req, res, next) => {
  const { triageLevel, status, complaint, notes } = req.body || {};
  if (!triageLevel && !status && !complaint && !notes) return res.status(400).json({ message: "No emergency update provided." });
  if (triageLevel && !TRIAGE_LEVELS.includes(triageLevel)) return res.status(400).json({ message: "Invalid triage level." });
  if (status && !EMERGENCY_STATUS.includes(status)) return res.status(400).json({ message: "Invalid emergency status." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT id, status, triage_level FROM emergency_encounters WHERE id = $1 AND hospital_id = $2 FOR UPDATE", [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Emergency encounter not found." }); }

    if (status && current.rows[0].status === "Discharged" && status !== "Discharged") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "A discharged emergency encounter cannot be reopened." });
    }

    const nextTriageLevel = triageLevel || current.rows[0].triage_level;
    const nextStatus = status || current.rows[0].status;
    const nextComplaint = complaint ? String(complaint).trim() : null;
    const nextNotes = notes !== undefined ? String(notes).trim() : null;

    const result = await client.query(
      `UPDATE emergency_encounters SET triage_level = $1, status = $2, complaint = COALESCE($3, complaint), notes = $4, updated_at = NOW() WHERE id = $5 AND hospital_id = $6 RETURNING *`,
      [nextTriageLevel, nextStatus, nextComplaint, nextNotes !== null ? nextNotes : undefined, req.params.id, req.user.hospital_id]
    );

    const updated = await client.query(`${emergencySelect} WHERE e.id = $1`, [result.rows[0].id]);
    await client.query("COMMIT");
    res.json({ encounter: publicEmergencyEncounter(updated.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

const LAB_ORDER_STATUSES = ["ORDERED", "SAMPLE_PENDING", "COLLECTED", "PROCESSING", "RESULT_ENTERED", "VERIFIED", "COMPLETED"];
const LAB_SAMPLE_TYPES = ["Blood", "Urine", "Stool", "Swab", "Other"];
const LAB_STATUS_TRANSITIONS = {
  ORDERED: ["SAMPLE_PENDING", "COLLECTED"],
  SAMPLE_PENDING: ["COLLECTED"],
  COLLECTED: ["PROCESSING"],
  PROCESSING: ["RESULT_ENTERED"],
  RESULT_ENTERED: ["VERIFIED"],
  VERIFIED: ["COMPLETED"],
  COMPLETED: [],
};

function getLabStatusTransitionError(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus) return "Status change is required.";
  if (!LAB_ORDER_STATUSES.includes(nextStatus)) return "Invalid laboratory status.";
  if (!LAB_STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
    return `Invalid status transition from ${currentStatus} to ${nextStatus}.`;
  }
  return null;
}

function publicLabSample(row) {
  return {
    id: row.id,
    labOrderId: row.lab_order_id,
    sampleType: row.sample_type,
    sampleStatus: row.sample_status,
    collectedBy: row.collected_by,
    collectedByName: row.collected_by_name || null,
    collectedAt: row.collected_at,
  };
}

function publicLabResult(row) {
  return {
    id: row.id,
    labOrderId: row.lab_order_id,
    resultValue: row.result_value,
    unit: row.unit,
    referenceRange: row.reference_range,
    remarks: row.remarks,
    enteredBy: row.entered_by,
    enteredByName: row.entered_by_name || null,
    enteredAt: row.entered_at,
    verifiedBy: row.verified_by,
    verifiedByName: row.verified_by_name || null,
    verifiedAt: row.verified_at,
    resultStatus: row.result_status,
  };
}

function publicLabOrder(row, sample = null, result = null) {
  return {
    id: row.id,
    hospitalId: row.hospital_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    uhid: row.uhid,
    age: row.age,
    sex: row.gender,
    department: row.department,
    cpoeOrderId: row.cpoe_order_id,
    cpoeOrderNumber: row.cpoe_order_number,
    testName: row.test_name,
    testCode: row.test_code,
    priority: row.priority,
    status: row.status,
    orderedBy: row.ordered_by,
    orderedByName: row.ordered_by_name,
    orderedAt: row.ordered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sample: sample ? publicLabSample(sample) : null,
    result: result ? publicLabResult(result) : null,
  };
}

async function ensureLabOrderForCpoeOrder(client, cpoeRow) {
  const existing = await client.query("SELECT * FROM lab_orders WHERE cpoe_order_id = $1 FOR UPDATE", [cpoeRow.id]);
  if (existing.rowCount) {
    const current = existing.rows[0];
    const updated = await client.query(
      `UPDATE lab_orders SET test_name = $1, test_code = COALESCE($2, test_code), priority = $3, status = COALESCE($4, status), ordered_by = $5, ordered_at = $6, updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [cpoeRow.order_item, null, cpoeRow.priority, current.status || "ORDERED", cpoeRow.ordered_by, cpoeRow.ordered_at, current.id]
    );
    return updated.rows[0];
  }

  const created = await client.query(
    `INSERT INTO lab_orders (hospital_id, patient_id, cpoe_order_id, test_name, test_code, priority, status, ordered_by, ordered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [cpoeRow.hospital_id, cpoeRow.patient_id, cpoeRow.id, cpoeRow.order_item, null, cpoeRow.priority, "ORDERED", cpoeRow.ordered_by, cpoeRow.ordered_at]
  );

  return created.rows[0];
}

const labOrderSelect = `SELECT lo.id, lo.hospital_id, lo.patient_id, lo.cpoe_order_id, lo.test_name, lo.test_code, lo.priority, lo.status,
  lo.ordered_by, lo.ordered_at, lo.created_at, lo.updated_at,
  p.full_name AS patient_name, p.uhid, p.age, p.gender, p.department,
  u.name AS ordered_by_name, c.order_number AS cpoe_order_number, c.status AS cpoe_status
  FROM lab_orders lo
  JOIN patients p ON p.id = lo.patient_id
  JOIN cpoe_orders c ON c.id = lo.cpoe_order_id
  JOIN users u ON u.id = lo.ordered_by`;

app.get("/api/laboratory/orders", requireAuth, async (req, res, next) => {
  const values = [req.user.hospital_id];
  const conditions = ["lo.hospital_id = $1"];
  if (req.query.patientId) { values.push(req.query.patientId); conditions.push(`lo.patient_id = $${values.length}`); }
  if (req.query.status) { values.push(req.query.status); conditions.push(`lo.status = $${values.length}`); }
  if (req.query.priority) { values.push(req.query.priority); conditions.push(`lo.priority = $${values.length}`); }
  if (req.query.q) {
    values.push(`%${String(req.query.q)}%`);
    conditions.push(`(p.full_name ILIKE $${values.length} OR p.uhid ILIKE $${values.length} OR lo.test_name ILIKE $${values.length})`);
  }

  try {
    const cpoeOrders = await query(
      `SELECT * FROM cpoe_orders WHERE hospital_id = $1 AND order_category = 'Laboratory' ORDER BY ordered_at DESC LIMIT 200`,
      [req.user.hospital_id]
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const cpoeOrder of cpoeOrders.rows) {
        await ensureLabOrderForCpoeOrder(client, cpoeOrder);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const result = await query(`${labOrderSelect} WHERE ${conditions.join(" AND ")} ORDER BY lo.ordered_at DESC LIMIT 200`, values);
    const orderIds = result.rows.map((row) => row.id);
    const samples = orderIds.length ? await query("SELECT s.*, u.name AS collected_by_name FROM lab_samples s LEFT JOIN users u ON u.id = s.collected_by WHERE s.lab_order_id = ANY($1)", [orderIds]) : { rows: [] };
    const results = orderIds.length ? await query("SELECT r.*, u.name AS entered_by_name, v.name AS verified_by_name FROM lab_results r LEFT JOIN users u ON u.id = r.entered_by LEFT JOIN users v ON v.id = r.verified_by WHERE r.lab_order_id = ANY($1) ORDER BY r.entered_at DESC", [orderIds]) : { rows: [] };

    const sampleByOrder = new Map(samples.rows.map((row) => [row.lab_order_id, row]));
    const resultByOrder = new Map();
    for (const row of results.rows) {
      if (!resultByOrder.has(row.lab_order_id)) resultByOrder.set(row.lab_order_id, row);
    }

    const orders = result.rows.map((row) => publicLabOrder(row, sampleByOrder.get(row.id) ?? null, resultByOrder.get(row.id) ?? null));
    res.json({ orders, total: orders.length });
  } catch (error) {
    next(error);
  }
});

app.get("/api/laboratory/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const orderResult = await query(`${labOrderSelect} WHERE lo.id = $1 AND lo.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!orderResult.rows[0]) return res.status(404).json({ message: "Laboratory order not found." });

    const sampleResult = await query(`SELECT s.*, u.name AS collected_by_name FROM lab_samples s LEFT JOIN users u ON u.id = s.collected_by WHERE s.lab_order_id = $1`, [orderResult.rows[0].id]);
    const resultRows = await query(`SELECT r.*, u.name AS entered_by_name, v.name AS verified_by_name FROM lab_results r LEFT JOIN users u ON u.id = r.entered_by LEFT JOIN users v ON v.id = r.verified_by WHERE r.lab_order_id = $1 ORDER BY r.entered_at DESC`, [orderResult.rows[0].id]);

    const order = publicLabOrder(orderResult.rows[0], sampleResult.rows[0] || null, resultRows.rows[0] || null);
    res.json({ order, history: resultRows.rows.map(publicLabResult) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/laboratory/orders/:id/collect", requireAuth, async (req, res, next) => {
  const { sampleType } = req.body || {};
  if (!sampleType || !LAB_SAMPLE_TYPES.includes(sampleType)) return res.status(400).json({ message: "Select a valid sample type." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`SELECT * FROM lab_orders WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [req.params.id, req.user.hospital_id]);
    if (!existing.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Laboratory order not found." }); }

    const labOrder = existing.rows[0];
    const currentStatus = labOrder.status;
    if (!LAB_STATUS_TRANSITIONS[currentStatus]?.includes("COLLECTED")) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Invalid status transition from ${currentStatus} to COLLECTED.` });
    }

    const sample = await client.query(
      `INSERT INTO lab_samples (lab_order_id, sample_type, sample_status, collected_by, collected_at)
       VALUES ($1, $2, 'COLLECTED', $3, NOW())
       ON CONFLICT (lab_order_id) DO UPDATE SET sample_type = EXCLUDED.sample_type, sample_status = 'COLLECTED', collected_by = EXCLUDED.collected_by, collected_at = NOW(), updated_at = NOW()
       RETURNING *`,
      [labOrder.id, sampleType, req.user.id]
    );

    const updated = await client.query(
      `UPDATE lab_orders SET status = 'COLLECTED', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [labOrder.id]
    );

    const refreshed = await client.query(`${labOrderSelect} WHERE lo.id = $1`, [updated.rows[0].id]);
    await client.query("COMMIT");
    res.status(201).json({ order: publicLabOrder(refreshed.rows[0], sample.rows[0] || null, null) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/laboratory/orders/:id/result", requireAuth, async (req, res, next) => {
  const { resultValue, unit, referenceRange, remarks } = req.body || {};
  if (resultValue === undefined || resultValue === null || String(resultValue).trim() === "") {
    return res.status(400).json({ message: "Result value is required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT * FROM lab_orders WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Laboratory order not found." }); }

    if (!(["COLLECTED", "PROCESSING", "RESULT_ENTERED"].includes(current.rows[0].status))) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Invalid status transition from ${current.rows[0].status} to RESULT_ENTERED.` });
    }

    const inserted = await client.query(
      `INSERT INTO lab_results (lab_order_id, result_value, unit, reference_range, remarks, entered_by, result_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'RESULT_ENTERED')
       RETURNING *`,
      [current.rows[0].id, String(resultValue).trim(), unit ? String(unit).trim() : null, referenceRange ? String(referenceRange).trim() : null, remarks ? String(remarks).trim() : null, req.user.id]
    );

    const updated = await client.query(
      `UPDATE lab_orders SET status = 'RESULT_ENTERED', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [current.rows[0].id]
    );

    const refreshedOrder = await client.query(`${labOrderSelect} WHERE lo.id = $1`, [updated.rows[0].id]);
    const sample = await client.query(`SELECT s.*, u.name AS collected_by_name FROM lab_samples s LEFT JOIN users u ON u.id = s.collected_by WHERE s.lab_order_id = $1`, [updated.rows[0].id]);
    await client.query("COMMIT");
    res.status(201).json({ order: publicLabOrder(refreshedOrder.rows[0], sample.rows[0] || null, inserted.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/laboratory/orders/:id/verify", requireAuth, async (req, res, next) => {
  if (req.user.role !== "ADMIN") return res.status(403).json({ message: "Only administrators can verify laboratory results." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT * FROM lab_orders WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Laboratory order not found." }); }

    if (current.rows[0].status !== "RESULT_ENTERED") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Invalid status transition from ${current.rows[0].status} to VERIFIED.` });
    }

    const result = await client.query(
      `UPDATE lab_results SET result_status = 'VERIFIED', verified_by = $1, verified_at = NOW(), updated_at = NOW()
       WHERE lab_order_id = $2 AND result_status = 'RESULT_ENTERED'
       RETURNING *`,
      [req.user.id, current.rows[0].id]
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "No result is available to verify for this order." });
    }

    const updated = await client.query(
      `UPDATE lab_orders SET status = 'VERIFIED', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [current.rows[0].id]
    );
    const refreshed = await client.query(`${labOrderSelect} WHERE lo.id = $1`, [updated.rows[0].id]);
    const sample = await client.query(`SELECT s.*, u.name AS collected_by_name FROM lab_samples s LEFT JOIN users u ON u.id = s.collected_by WHERE s.lab_order_id = $1`, [updated.rows[0].id]);
    await client.query("COMMIT");
    res.json({ order: publicLabOrder(refreshed.rows[0], sample.rows[0] || null, result.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.patch("/api/laboratory/orders/:id/status", requireAuth, async (req, res, next) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ message: "Status is required." });

  try {
    const existing = await query(`SELECT * FROM lab_orders WHERE id = $1 AND hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!existing.rows[0]) return res.status(404).json({ message: "Laboratory order not found." });

    const message = getLabStatusTransitionError(existing.rows[0].status, status);
    if (message) return res.status(400).json({ message });

    const updated = await query(
      `UPDATE lab_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND hospital_id = $3 RETURNING *`,
      [status, req.params.id, req.user.hospital_id]
    );
    const order = await query(`${labOrderSelect} WHERE lo.id = $1`, [updated.rows[0].id]);
    const sample = await query(`SELECT s.*, u.name AS collected_by_name FROM lab_samples s LEFT JOIN users u ON u.id = s.collected_by WHERE s.lab_order_id = $1`, [updated.rows[0].id]);
    const result = await query(`SELECT r.*, u.name AS entered_by_name, v.name AS verified_by_name FROM lab_results r LEFT JOIN users u ON u.id = r.entered_by LEFT JOIN users v ON v.id = r.verified_by WHERE r.lab_order_id = $1 ORDER BY r.entered_at DESC LIMIT 1`, [updated.rows[0].id]);
    res.json({ order: publicLabOrder(order.rows[0], sample.rows[0] || null, result.rows[0] || null) });
  } catch (error) {
    next(error);
  }
});

const RADIOLOGY_ORDER_STATUSES = ["ORDERED", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "VERIFIED"];
const RADIOLOGY_STATUS_TRANSITIONS = {
  ORDERED: ["SCHEDULED", "IN_PROGRESS"],
  SCHEDULED: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: ["VERIFIED"],
  VERIFIED: [],
};

function radiologyMetadata(cpoeRow) {
  const segments = (cpoeRow.clinical_instructions || "").split("|").map((segment) => segment.trim()).filter(Boolean);
  const value = (label) => segments.find((segment) => new RegExp(`^${label}\\s*:\\s*`, "i").test(segment))?.replace(new RegExp(`^${label}\\s*:\\s*`, "i"), "").trim() || null;
  const hasRadiologyMetadata = segments.some((segment) => /^(Modality|Body part|Clinical indication|Instructions)\s*:/i.test(segment));
  const clinicalInstructions = segments
    .filter((segment) => !/^(Modality|Body part|Clinical indication)\s*:/i.test(segment))
    .map((segment) => segment.replace(/^Instructions\s*:\s*/i, "").trim())
    .filter(Boolean)
    .join(" | ");
  return {
    modality: value("Modality"),
    bodyPart: value("Body part"),
    clinicalIndication: value("Clinical indication"),
    clinicalInstructions: hasRadiologyMetadata ? clinicalInstructions || null : cpoeRow.clinical_instructions || null,
  };
}

async function ensureRadiologyOrderForCpoeOrder(client, cpoeRow) {
  const existing = await client.query("SELECT * FROM radiology_orders WHERE cpoe_order_id = $1 FOR UPDATE", [cpoeRow.id]);
  const metadata = radiologyMetadata(cpoeRow);
  if (existing.rowCount) {
    const current = existing.rows[0];
    const updated = await client.query(
      `UPDATE radiology_orders SET examination_name = $1, modality = COALESCE($2, modality), body_part = COALESCE($3, body_part),
       clinical_indication = COALESCE($4, clinical_indication), clinical_instructions = $5, priority = $6, ordered_by = $7, ordered_at = $8, updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [cpoeRow.order_item, metadata.modality, metadata.bodyPart, metadata.clinicalIndication, metadata.clinicalInstructions, cpoeRow.priority || "ROUTINE", cpoeRow.ordered_by, cpoeRow.ordered_at, current.id]
    );
    return updated.rows[0];
  }

  const created = await client.query(
    `INSERT INTO radiology_orders (hospital_id, patient_id, cpoe_order_id, examination_name, modality, body_part, clinical_indication, clinical_instructions, priority, status, ordered_by, ordered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ORDERED', $10, $11) RETURNING *`,
    [cpoeRow.hospital_id, cpoeRow.patient_id, cpoeRow.id, cpoeRow.order_item, metadata.modality, metadata.bodyPart, metadata.clinicalIndication, metadata.clinicalInstructions, cpoeRow.priority || "ROUTINE", cpoeRow.ordered_by, cpoeRow.ordered_at]
  );
  return created.rows[0];
}

const radiologyOrderSelect = `SELECT ro.*, c.notes, p.full_name AS patient_name, p.uhid, p.age, p.gender, p.department,
  ordering.name AS ordered_by_name, performer.name AS performed_by_name, completer.name AS completed_by_name,
  verifier.name AS verified_by_name, c.order_number AS cpoe_order_number
  FROM radiology_orders ro
  JOIN patients p ON p.id = ro.patient_id
  JOIN cpoe_orders c ON c.id = ro.cpoe_order_id
  JOIN users ordering ON ordering.id = ro.ordered_by
  LEFT JOIN users performer ON performer.id = ro.performed_by
  LEFT JOIN users completer ON completer.id = ro.completed_by
  LEFT JOIN users verifier ON verifier.id = ro.verified_by`;

function publicRadiologyOrder(row) {
  return {
    id: row.id,
    hospitalId: row.hospital_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    uhid: row.uhid,
    age: row.age,
    sex: row.gender,
    department: row.department,
    cpoeOrderId: row.cpoe_order_id,
    cpoeOrderNumber: row.cpoe_order_number,
    examinationName: row.examination_name,
    modality: row.modality,
    bodyPart: row.body_part,
    clinicalIndication: row.clinical_indication,
    clinicalInstructions: row.clinical_instructions,
    notes: row.notes,
    priority: row.priority,
    status: row.status,
    orderedBy: row.ordered_by,
    orderedByName: row.ordered_by_name,
    orderedAt: row.ordered_at,
    scheduledAt: row.scheduled_at,
    performedAt: row.performed_at,
    performedBy: row.performed_by,
    performedByName: row.performed_by_name,
    findings: row.findings,
    impression: row.impression,
    remarks: row.remarks,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    completedByName: row.completed_by_name,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    verifiedByName: row.verified_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

app.get("/api/radiology/orders", requireAuth, async (req, res, next) => {
  const values = [req.user.hospital_id];
  const conditions = ["ro.hospital_id = $1", "c.order_category = 'Radiology'"];
  if (req.query.patientId) { values.push(req.query.patientId); conditions.push(`ro.patient_id = $${values.length}`); }
  if (req.query.status) {
    if (!RADIOLOGY_ORDER_STATUSES.includes(req.query.status)) return res.status(400).json({ message: "Invalid radiology status." });
    values.push(req.query.status); conditions.push(`ro.status = $${values.length}`);
  }
  if (req.query.priority) {
    if (!["STAT", "URGENT", "ROUTINE"].includes(req.query.priority)) return res.status(400).json({ message: "Invalid radiology priority." });
    values.push(req.query.priority); conditions.push(`ro.priority = $${values.length}`);
  }
  if (req.query.q) {
    values.push(`%${String(req.query.q)}%`);
    conditions.push(`(p.full_name ILIKE $${values.length} OR p.uhid ILIKE $${values.length} OR ro.examination_name ILIKE $${values.length} OR ro.modality ILIKE $${values.length} OR ro.body_part ILIKE $${values.length} OR c.order_number ILIKE $${values.length})`);
  }

  try {
    const cpoeOrders = await query("SELECT * FROM cpoe_orders WHERE hospital_id = $1 AND order_category = 'Radiology' ORDER BY ordered_at DESC LIMIT 200", [req.user.hospital_id]);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const cpoeOrder of cpoeOrders.rows) await ensureRadiologyOrderForCpoeOrder(client, cpoeOrder);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const result = await query(`${radiologyOrderSelect} WHERE ${conditions.join(" AND ")} ORDER BY ro.ordered_at DESC LIMIT 200`, values);
    const orders = result.rows.map(publicRadiologyOrder);
    res.json({ orders, total: orders.length });
  } catch (error) {
    next(error);
  }
});

app.get("/api/radiology/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${radiologyOrderSelect} WHERE ro.id = $1 AND ro.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Radiology order not found." });
    res.json({ order: publicRadiologyOrder(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/radiology/orders/:id/schedule", requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM radiology_orders WHERE id = $1 AND hospital_id = $2 FOR UPDATE", [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Radiology order not found." }); }
    if (current.rows[0].status !== "ORDERED") { await client.query("ROLLBACK"); return res.status(400).json({ message: `Invalid status transition from ${current.rows[0].status} to SCHEDULED.` }); }
    await client.query("UPDATE radiology_orders SET status = 'SCHEDULED', scheduled_at = NOW(), updated_at = NOW() WHERE id = $1", [current.rows[0].id]);
    const updated = await client.query(`${radiologyOrderSelect} WHERE ro.id = $1`, [current.rows[0].id]);
    await client.query("COMMIT");
    res.json({ order: publicRadiologyOrder(updated.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/radiology/orders/:id/start", requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM radiology_orders WHERE id = $1 AND hospital_id = $2 FOR UPDATE", [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Radiology order not found." }); }
    if (!RADIOLOGY_STATUS_TRANSITIONS[current.rows[0].status]?.includes("IN_PROGRESS")) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Invalid status transition from ${current.rows[0].status} to IN_PROGRESS.` });
    }
    await client.query("UPDATE radiology_orders SET status = 'IN_PROGRESS', performed_at = NOW(), performed_by = $1, updated_at = NOW() WHERE id = $2", [req.user.id, current.rows[0].id]);
    const updated = await client.query(`${radiologyOrderSelect} WHERE ro.id = $1`, [current.rows[0].id]);
    await client.query("COMMIT");
    res.json({ order: publicRadiologyOrder(updated.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.put("/api/radiology/orders/:id/report", requireAuth, async (req, res, next) => {
  const { findings, impression, remarks } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM radiology_orders WHERE id = $1 AND hospital_id = $2 FOR UPDATE", [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Radiology order not found." }); }
    if (current.rows[0].status !== "IN_PROGRESS") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Reports can only be edited while an examination is IN_PROGRESS (current status: ${current.rows[0].status}).` });
    }
    const updatedRow = await client.query(
      "UPDATE radiology_orders SET findings = $1, impression = $2, remarks = $3, updated_at = NOW() WHERE id = $4 RETURNING id",
      [findings == null ? null : String(findings).trim() || null, impression == null ? null : String(impression).trim() || null, remarks == null ? null : String(remarks).trim() || null, current.rows[0].id]
    );
    const updated = await client.query(`${radiologyOrderSelect} WHERE ro.id = $1`, [updatedRow.rows[0].id]);
    await client.query("COMMIT");
    res.json({ order: publicRadiologyOrder(updated.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/radiology/orders/:id/complete", requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM radiology_orders WHERE id = $1 AND hospital_id = $2 FOR UPDATE", [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Radiology order not found." }); }
    const order = current.rows[0];
    if (!RADIOLOGY_STATUS_TRANSITIONS[order.status]?.includes("COMPLETED")) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Invalid status transition from ${order.status} to COMPLETED.` });
    }
    if (!order.findings?.trim() || !order.impression?.trim()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Findings and impression are required before completing the report." });
    }
    await client.query("UPDATE radiology_orders SET status = 'COMPLETED', completed_at = NOW(), completed_by = $1, updated_at = NOW() WHERE id = $2", [req.user.id, order.id]);
    const updated = await client.query(`${radiologyOrderSelect} WHERE ro.id = $1`, [order.id]);
    await client.query("COMMIT");
    res.json({ order: publicRadiologyOrder(updated.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/radiology/orders/:id/verify", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM radiology_orders WHERE id = $1 AND hospital_id = $2 FOR UPDATE", [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Radiology order not found." }); }
    const order = current.rows[0];
    if (!RADIOLOGY_STATUS_TRANSITIONS[order.status]?.includes("VERIFIED")) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Invalid status transition from ${order.status} to VERIFIED.` });
    }
    if (!order.findings?.trim() || !order.impression?.trim()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "A completed findings and impression report is required for verification." });
    }
    await client.query("UPDATE radiology_orders SET status = 'VERIFIED', verified_at = NOW(), verified_by = $1, updated_at = NOW() WHERE id = $2", [req.user.id, order.id]);
    const updated = await client.query(`${radiologyOrderSelect} WHERE ro.id = $1`, [order.id]);
    await client.query("COMMIT");
    res.json({ order: publicRadiologyOrder(updated.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

const PHARMACY_ORDER_STATUSES = ["ORDERED", "DISPENSING", "DISPENSED", "CANCELLED"];
const PHARMACY_STATUS_TRANSITIONS = {
  ORDERED: ["DISPENSED", "CANCELLED"],
  DISPENSING: ["DISPENSED", "CANCELLED"],
  DISPENSED: [],
  CANCELLED: [],
};

function getPharmacyStatusTransitionError(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus) return "Status change is required.";
  if (!PHARMACY_ORDER_STATUSES.includes(nextStatus)) return "Invalid pharmacy status.";
  if (!PHARMACY_STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
    return `Invalid status transition from ${currentStatus} to ${nextStatus}.`;
  }
  return null;
}

function extractMedicationMetadataFromCpoeOrder(cpoeRow) {
  const text = [cpoeRow.order_item, cpoeRow.clinical_instructions, cpoeRow.notes].filter(Boolean).join(" | ");
  const medicationName = cpoeRow.order_item ? String(cpoeRow.order_item).trim() : "Medication";
  const lookup = (label) => {
    const match = text.match(new RegExp(`${label}\\s*[:\\-]?\\s*([^|]+)`, "i"));
    return match ? match[1].trim() : null;
  };

  return {
    medicationName,
    dose: lookup("Dose") || null,
    route: lookup("Route") || null,
    frequency: lookup("Frequency") || null,
    duration: lookup("Duration") || null,
    quantity: lookup("Quantity") || null,
  };
}

function publicPharmacyOrder(row) {
  return {
    id: row.id,
    hospitalId: row.hospital_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    uhid: row.uhid,
    age: row.age,
    sex: row.gender,
    department: row.department,
    cpoeOrderId: row.cpoe_order_id,
    cpoeOrderNumber: row.cpoe_order_number,
    medicationName: row.medication_name,
    dose: row.dose,
    route: row.route,
    frequency: row.frequency,
    duration: row.duration,
    quantity: row.quantity,
    priority: row.priority,
    status: row.status,
    orderedBy: row.ordered_by,
    orderedByName: row.ordered_by_name,
    orderedAt: row.ordered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dispensedBy: row.dispensed_by,
    dispensedByName: row.dispensed_by_name || null,
    dispensedAt: row.dispensed_at,
    quantityDispensed: row.quantity_dispensed,
    remarks: row.remarks,
  };
}

async function ensurePharmacyOrderForCpoeOrder(client, cpoeRow) {
  const existing = await client.query("SELECT * FROM pharmacy_orders WHERE cpoe_order_id = $1 FOR UPDATE", [cpoeRow.id]);
  const metadata = extractMedicationMetadataFromCpoeOrder(cpoeRow);

  if (existing.rowCount) {
    const current = existing.rows[0];
    const updated = await client.query(
      `UPDATE pharmacy_orders SET medication_name = $1, dose = COALESCE($2, dose), route = COALESCE($3, route), frequency = COALESCE($4, frequency), duration = COALESCE($5, duration), quantity = COALESCE($6, quantity), priority = $7, status = $8, ordered_by = $9, ordered_at = $10, updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [metadata.medicationName, metadata.dose, metadata.route, metadata.frequency, metadata.duration, metadata.quantity, cpoeRow.priority || "ROUTINE", current.status || "ORDERED", cpoeRow.ordered_by, cpoeRow.ordered_at, current.id]
    );
    return updated.rows[0];
  }

  const created = await client.query(
    `INSERT INTO pharmacy_orders (hospital_id, patient_id, cpoe_order_id, medication_name, dose, route, frequency, duration, quantity, priority, status, ordered_by, ordered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [cpoeRow.hospital_id, cpoeRow.patient_id, cpoeRow.id, metadata.medicationName, metadata.dose, metadata.route, metadata.frequency, metadata.duration, metadata.quantity, cpoeRow.priority || "ROUTINE", "ORDERED", cpoeRow.ordered_by, cpoeRow.ordered_at]
  );

  return created.rows[0];
}

const pharmacyOrderSelect = `SELECT po.id, po.hospital_id, po.patient_id, po.cpoe_order_id, po.medication_name, po.dose, po.route, po.frequency, po.duration, po.quantity,
  po.priority, po.status, po.ordered_by, po.ordered_at, po.created_at, po.updated_at, po.dispensed_by, po.dispensed_at, po.quantity_dispensed, po.remarks,
  p.full_name AS patient_name, p.uhid, p.age, p.gender, p.department,
  u.name AS ordered_by_name, d.name AS dispensed_by_name, c.order_number AS cpoe_order_number
  FROM pharmacy_orders po
  JOIN patients p ON p.id = po.patient_id
  JOIN cpoe_orders c ON c.id = po.cpoe_order_id
  JOIN users u ON u.id = po.ordered_by
  LEFT JOIN users d ON d.id = po.dispensed_by`;

app.get("/api/pharmacy/orders", requireAuth, async (req, res, next) => {
  const values = [req.user.hospital_id];
  const conditions = ["po.hospital_id = $1"];

  if (req.query.patientId) {
    values.push(req.query.patientId);
    conditions.push(`po.patient_id = $${values.length}`);
  }
  if (req.query.status) {
    values.push(req.query.status);
    conditions.push(`po.status = $${values.length}`);
  }
  if (req.query.priority) {
    values.push(req.query.priority);
    conditions.push(`po.priority = $${values.length}`);
  }
  if (req.query.q) {
    values.push(`%${String(req.query.q)}%`);
    conditions.push(`(p.full_name ILIKE $${values.length} OR p.uhid ILIKE $${values.length} OR po.medication_name ILIKE $${values.length} OR c.order_number ILIKE $${values.length})`);
  }

  try {
    const cpoeOrders = await query(
      `SELECT * FROM cpoe_orders WHERE hospital_id = $1 AND order_category = 'Medication' ORDER BY ordered_at DESC LIMIT 200`,
      [req.user.hospital_id]
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const cpoeOrder of cpoeOrders.rows) {
        await ensurePharmacyOrderForCpoeOrder(client, cpoeOrder);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const result = await query(`${pharmacyOrderSelect.replace(/FROM pharmacy_orders po/g, "FROM pharmacy_orders po")} WHERE ${conditions.join(" AND ")} ORDER BY po.ordered_at DESC LIMIT 200`, values);
    res.json({ orders: result.rows.map(publicPharmacyOrder), total: result.rowCount });
  } catch (error) {
    next(error);
  }
});

app.get("/api/pharmacy/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${pharmacyOrderSelect} WHERE po.id = $1 AND po.hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Pharmacy order not found." });
    res.json({ order: publicPharmacyOrder(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/pharmacy/orders/:id/dispense", requireAuth, async (req, res, next) => {
  const quantityDispensed = req.body?.quantityDispensed ?? req.body?.quantity;
  const remarks = req.body?.remarks ? String(req.body.remarks).trim() : null;
  const normalizedQuantity = Number(String(quantityDispensed ?? "").match(/(\d+(?:\.\d+)?)/)?.[1] ?? NaN);

  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
    return res.status(400).json({ message: "A valid quantity is required for dispensing." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT * FROM pharmacy_orders WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [req.params.id, req.user.hospital_id]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Pharmacy order not found." }); }

    if (current.rows[0].status === "DISPENSED") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This medication order has already been dispensed." });
    }

    if (!PHARMACY_STATUS_TRANSITIONS[current.rows[0].status]?.includes("DISPENSED")) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Invalid status transition from ${current.rows[0].status} to DISPENSED.` });
    }

    const updated = await client.query(
      `UPDATE pharmacy_orders SET status = 'DISPENSED', dispensed_by = $1, dispensed_at = NOW(), quantity_dispensed = $2, remarks = COALESCE($3, remarks), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [req.user.id, normalizedQuantity, remarks, current.rows[0].id]
    );

    const refreshed = await client.query(`${pharmacyOrderSelect} WHERE po.id = $1`, [updated.rows[0].id]);
    await client.query("COMMIT");
    res.json({ order: publicPharmacyOrder(refreshed.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.patch("/api/pharmacy/orders/:id/status", requireAuth, async (req, res, next) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ message: "Status is required." });

  try {
    const existing = await query(`SELECT * FROM pharmacy_orders WHERE id = $1 AND hospital_id = $2`, [req.params.id, req.user.hospital_id]);
    if (!existing.rows[0]) return res.status(404).json({ message: "Pharmacy order not found." });

    const message = getPharmacyStatusTransitionError(existing.rows[0].status, status);
    if (message) return res.status(400).json({ message });

    const updated = await query(
      `UPDATE pharmacy_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND hospital_id = $3 RETURNING *`,
      [status, req.params.id, req.user.hospital_id]
    );
    const order = await query(`${pharmacyOrderSelect} WHERE po.id = $1`, [updated.rows[0].id]);
    res.json({ order: publicPharmacyOrder(order.rows[0]) });
  } catch (error) {
    next(error);
  }
});

const BLOOD_BANK_STATUSES = ["ORDERED", "REQUESTED", "PROCESSING", "ISSUED", "COMPLETED", "CANCELLED"];
const BLOOD_BANK_TRANSITIONS = {
  ORDERED: ["REQUESTED", "CANCELLED"],
  REQUESTED: ["PROCESSING", "ISSUED", "CANCELLED"],
  PROCESSING: ["ISSUED", "CANCELLED"],
  ISSUED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

function bloodBankMetadata(cpoeRow) {
  const segments = (cpoeRow.clinical_instructions || "").split("|").map((segment) => segment.trim()).filter(Boolean);
  const value = (label) => segments.find((segment) => new RegExp(`^${label}\\s*:\\s*`, "i").test(segment))
    ?.replace(new RegExp(`^${label}\\s*:\\s*`, "i"), "").trim() || null;
  const quantityValue = value("Quantity");
  const quantity = quantityValue && /^\d+$/.test(quantityValue) ? Number(quantityValue) : null;
  const clinicalIndication = value("Clinical indication");
  const clinicalInstructions = segments
    .filter((segment) => !/^(Blood group|Quantity|Clinical indication)\s*:/i.test(segment))
    .map((segment) => segment.replace(/^Instructions\s*:\s*/i, "").trim())
    .filter(Boolean)
    .join(" | ");
  return { bloodGroup: value("Blood group"), quantity, clinicalIndication, clinicalInstructions: clinicalInstructions || null };
}

async function ensureBloodBankOrderForCpoeOrder(client, cpoeRow) {
  const metadata = bloodBankMetadata(cpoeRow);
  if (!metadata.bloodGroup || !metadata.quantity || !cpoeRow.order_item?.trim()) {
    throw new Error(`CPOE Blood Bank order ${cpoeRow.order_number} is missing valid blood group, component, or quantity metadata.`);
  }
  const existing = await client.query("SELECT id FROM blood_bank_orders WHERE cpoe_order_id = $1 FOR UPDATE", [cpoeRow.id]);
  if (existing.rows[0]) {
    const updated = await client.query(
      `UPDATE blood_bank_orders SET blood_group = $1, component = $2, quantity = $3, priority = $4,
       clinical_indication = $5, clinical_instructions = $6, ordered_by = $7, ordered_at = $8, updated_at = NOW()
       WHERE id = $9 RETURNING id`,
      [metadata.bloodGroup, cpoeRow.order_item.trim(), metadata.quantity, cpoeRow.priority || "ROUTINE", metadata.clinicalIndication, metadata.clinicalInstructions, cpoeRow.ordered_by, cpoeRow.ordered_at, existing.rows[0].id]
    );
    return updated.rows[0];
  }
  const created = await client.query(
    `INSERT INTO blood_bank_orders (hospital_id, patient_id, cpoe_order_id, blood_group, component, quantity, priority, clinical_indication, clinical_instructions, ordered_by, ordered_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [cpoeRow.hospital_id, cpoeRow.patient_id, cpoeRow.id, metadata.bloodGroup, cpoeRow.order_item.trim(), metadata.quantity, cpoeRow.priority || "ROUTINE", metadata.clinicalIndication, metadata.clinicalInstructions, cpoeRow.ordered_by, cpoeRow.ordered_at]
  );
  return created.rows[0];
}

const bloodBankOrderSelect = `SELECT bo.*, p.full_name AS patient_name, p.uhid, p.age, p.gender,
  c.order_number AS cpoe_order_number, c.notes, ordering.name AS ordered_by_name,
  requester.name AS requested_by_name, processor.name AS processing_by_name,
  issuer.name AS issued_by_name, completer.name AS completed_by_name, canceller.name AS cancelled_by_name
  FROM blood_bank_orders bo JOIN patients p ON p.id = bo.patient_id
  JOIN cpoe_orders c ON c.id = bo.cpoe_order_id
  JOIN users ordering ON ordering.id = bo.ordered_by
  LEFT JOIN users requester ON requester.id = bo.requested_by
  LEFT JOIN users processor ON processor.id = bo.processing_by
  LEFT JOIN users issuer ON issuer.id = bo.issued_by
  LEFT JOIN users completer ON completer.id = bo.completed_by
  LEFT JOIN users canceller ON canceller.id = bo.cancelled_by`;

function publicBloodBankOrder(row) {
  return {
    id: row.id,
    hospitalId: row.hospital_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    uhid: row.uhid,
    age: row.age,
    sex: row.gender,
    cpoeOrderId: row.cpoe_order_id,
    cpoeOrderNumber: row.cpoe_order_number,
    bloodGroup: row.blood_group,
    component: row.component,
    quantity: row.quantity,
    priority: row.priority,
    status: row.status,
    clinicalIndication: row.clinical_indication,
    clinicalInstructions: row.clinical_instructions,
    notes: row.notes,
    orderedBy: row.ordered_by,
    orderedByName: row.ordered_by_name,
    orderedAt: row.ordered_at,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    requestedAt: row.requested_at,
    processingBy: row.processing_by,
    processingByName: row.processing_by_name,
    processingAt: row.processing_at,
    issuedBy: row.issued_by,
    issuedByName: row.issued_by_name,
    issuedAt: row.issued_at,
    completedBy: row.completed_by,
    completedByName: row.completed_by_name,
    completedAt: row.completed_at,
    cancelledBy: row.cancelled_by,
    cancelledByName: row.cancelled_by_name,
    cancelledAt: row.cancelled_at,
    updatedAt: row.updated_at,
  };
}

app.get("/api/blood-bank/orders", requireAuth, async (req, res, next) => {
  const values = [req.user.hospital_id];
  const conditions = ["bo.hospital_id = $1", "c.order_category = 'Blood Bank'"];
  if (req.query.patientId) { values.push(req.query.patientId); conditions.push(`bo.patient_id = $${values.length}`); }
  if (req.query.status) {
    if (!BLOOD_BANK_STATUSES.includes(req.query.status)) return res.status(400).json({ message: "Invalid blood-bank status." });
    values.push(req.query.status); conditions.push(`bo.status = $${values.length}`);
  }
  if (req.query.priority) {
    if (!["STAT", "URGENT", "ROUTINE"].includes(req.query.priority)) return res.status(400).json({ message: "Invalid blood-bank priority." });
    values.push(req.query.priority); conditions.push(`bo.priority = $${values.length}`);
  }
  if (req.query.q) {
    values.push(`%${String(req.query.q)}%`);
    conditions.push(`(p.full_name ILIKE $${values.length} OR p.uhid ILIKE $${values.length} OR bo.blood_group ILIKE $${values.length} OR bo.component ILIKE $${values.length} OR c.order_number ILIKE $${values.length})`);
  }
  try {
    const cpoeOrders = await query("SELECT * FROM cpoe_orders WHERE hospital_id = $1 AND order_category = 'Blood Bank' ORDER BY ordered_at DESC LIMIT 200", [req.user.hospital_id]);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const cpoeOrder of cpoeOrders.rows) await ensureBloodBankOrderForCpoeOrder(client, cpoeOrder);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const result = await query(`${bloodBankOrderSelect} WHERE ${conditions.join(" AND ")} ORDER BY bo.ordered_at DESC LIMIT 200`, values);
    const orders = result.rows.map(publicBloodBankOrder);
    res.json({ orders, total: orders.length });
  } catch (error) {
    next(error);
  }
});

app.get("/api/blood-bank/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`${bloodBankOrderSelect} WHERE bo.id = $1 AND bo.hospital_id = $2 AND c.order_category = 'Blood Bank'`, [req.params.id, req.user.hospital_id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Blood-bank request not found." });
    res.json({ order: publicBloodBankOrder(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/blood-bank/orders/:id/status", requireAuth, async (req, res, next) => {
  const { status } = req.body || {};
  if (!BLOOD_BANK_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid blood-bank status." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT bo.* FROM blood_bank_orders bo JOIN cpoe_orders c ON c.id = bo.cpoe_order_id
       WHERE bo.id = $1 AND bo.hospital_id = $2 AND c.hospital_id = $2 AND c.order_category = 'Blood Bank' FOR UPDATE OF bo`,
      [req.params.id, req.user.hospital_id]
    );
    if (!current.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Blood-bank request not found." }); }
    const existing = current.rows[0];
    if (!BLOOD_BANK_TRANSITIONS[existing.status]?.includes(status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Invalid blood-bank status transition from ${existing.status} to ${status}.` });
    }
    await client.query(
      `UPDATE blood_bank_orders SET status = $1,
       requested_by = CASE WHEN $1 = 'REQUESTED' THEN $2 ELSE requested_by END,
       requested_at = CASE WHEN $1 = 'REQUESTED' THEN NOW() ELSE requested_at END,
       processing_by = CASE WHEN $1 = 'PROCESSING' THEN $2 ELSE processing_by END,
       processing_at = CASE WHEN $1 = 'PROCESSING' THEN NOW() ELSE processing_at END,
       issued_by = CASE WHEN $1 = 'ISSUED' THEN $2 ELSE issued_by END,
       issued_at = CASE WHEN $1 = 'ISSUED' THEN NOW() ELSE issued_at END,
       completed_by = CASE WHEN $1 = 'COMPLETED' THEN $2 ELSE completed_by END,
       completed_at = CASE WHEN $1 = 'COMPLETED' THEN NOW() ELSE completed_at END,
       cancelled_by = CASE WHEN $1 = 'CANCELLED' THEN $2 ELSE cancelled_by END,
       cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN NOW() ELSE cancelled_at END,
       updated_at = NOW() WHERE id = $3`,
      [status, req.user.id, existing.id]
    );
    const updated = await client.query(`${bloodBankOrderSelect} WHERE bo.id = $1 AND bo.hospital_id = $2`, [existing.id, req.user.hospital_id]);
    await client.query("COMMIT");
    res.json({ order: publicBloodBankOrder(updated.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "The server could not complete the request." });
});

initializeDatabase()
  .then(() => syncFormTemplates())
  .then(() => app.listen(port, () => console.log(`SwasthyaSync API listening on http://localhost:${port}`)))
  .catch((error) => {
    console.error("Unable to initialize PostgreSQL:", error.message);
    process.exitCode = 1;
  });

process.on("SIGTERM", () => pool.end());
