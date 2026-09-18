require("dotenv").config();

const bcrypt = require("bcrypt");
const cors = require("cors");
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");
const { query, pool, initializeDatabase } = require("./db");
const { createToken, publicUser, requireAuth, requireRole } = require("./auth");
const { DOCTORS, findDoctor } = require("./doctors");

const app = express();
const port = Number(process.env.PORT || 5000);
const formStorageRoot = path.resolve(__dirname, "..", "forms", "templates");

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000" }));
app.use(express.json({ limit: "32kb" }));

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

const CPOE_ORDER_CATEGORIES = ["Laboratory", "Radiology", "Medication", "Procedure", "Other"];
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
  b.id AS bed_id, b.bed_number, b.ward, b.room FROM ipd_admissions a
  JOIN patients p ON p.id = a.patient_id JOIN beds b ON b.id = a.bed_id`;

function publicBed(row) {
  return { id: row.id, bedNumber: row.bed_number, ward: row.ward, room: row.room, status: row.status, patientId: row.patient_id ?? null, patientName: row.patient_name ?? null, uhid: row.uhid ?? null, admissionNumber: row.admission_number ?? null };
}

function publicAdmission(row) {
  return { id: row.id, admissionNumber: row.admission_number, patientId: row.patient_id, patientName: row.patient_name, uhid: row.uhid, age: row.age, gender: row.gender, bedId: row.bed_id, bedNumber: row.bed_number, ward: row.ward, room: row.room, admissionDate: row.admission_date, status: row.status, dischargedAt: row.discharged_at };
}

app.get("/api/ipd/beds", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`SELECT b.*, a.admission_number, p.id AS patient_id, p.full_name AS patient_name, p.uhid FROM beds b LEFT JOIN ipd_admissions a ON a.bed_id = b.id AND a.status = 'ADMITTED' LEFT JOIN patients p ON p.id = a.patient_id WHERE b.hospital_id = $1 ORDER BY b.ward, b.bed_number`, [req.user.hospital_id]);
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
    const bed = await client.query("SELECT id FROM beds WHERE id = $1 AND hospital_id = $2 AND status = 'AVAILABLE' FOR UPDATE", [bedId, req.user.hospital_id]);
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
    const result = await query("SELECT status, COUNT(*)::int AS count FROM beds WHERE hospital_id = $1 GROUP BY status", [req.user.hospital_id]);
    const counts = Object.fromEntries(result.rows.map((row) => [row.status, row.count]));
    res.json({ total: (counts.AVAILABLE || 0) + (counts.OCCUPIED || 0), available: counts.AVAILABLE || 0, occupied: counts.OCCUPIED || 0 });
  } catch (error) { next(error); }
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
