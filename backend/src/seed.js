require("dotenv").config();

const bcrypt = require("bcrypt");
const { pool, query, initializeDatabase } = require("./db");

async function seed() {
  await initializeDatabase();
  const assignedHospital = await query(
    "SELECT hospital_id AS id FROM users WHERE email = $1 LIMIT 1",
    ["admin@swasthyasync.com"]
  );
  const existingHospital = await query("SELECT id FROM hospitals WHERE name = $1 ORDER BY created_at ASC LIMIT 1", ["City General Hospital"]);
  const hospital = assignedHospital.rows[0] ?? existingHospital.rows[0] ?? (await query("INSERT INTO hospitals (name) VALUES ($1) RETURNING id", ["City General Hospital"])).rows[0];
  let hospitalId = hospital.id;

  const users = [
    { name: "Dr. Arjun Mehta", email: "admin@swasthyasync.com", password: "admin123", role: "ADMIN" },
    { name: "Priya Sharma", email: "staff@swasthyasync.com", password: "staff123", role: "STAFF" },
  ];
  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    await query(
      `INSERT INTO users (hospital_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, active = TRUE`,
      [hospitalId, user.name, user.email, passwordHash, user.role]
    );
  }

  const patients = [
    ["CGH-2026-01001", "Rajesh Kumar", "IPD", 54, "1969-03-12", "Male", "B+", "9876543210", "Cardiology", "doc-001", "Critical", "General", "None", "Shortness of breath", "Insurance / TPA", "Star Health", "Medi Assist", "POL-4821", "2027-03-31"],
    ["CGH-2026-01002", "Meena Devi", "OPD", 38, "1987-08-21", "Female", "O+", "9876501234", "Gynaecology", "doc-003", "Stable", "General", "None", "Routine consultation", "UPI", null, null, null, null],
    ["CGH-2026-01003", "Aryan Singh", "Emergency", 8, "2017-11-05", "Male", "A+", "9876512345", "Paediatrics", "doc-002", "Recovering", "BPL", "Road Traffic Accident", "Minor injury after road accident", "Govt / Free", null, null, null, null],
  ];
  for (const patient of patients) {
    await query(
      `INSERT INTO patients (hospital_id, uhid, full_name, admission_type, age, date_of_birth, gender, blood_group, mobile, department, attending_doctor_id, initial_status, patient_category, mlc_type, chief_complaint, payment_type, insurance_company, tpa_name, policy_member_id, policy_validity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      ON CONFLICT (uhid) DO UPDATE SET hospital_id = EXCLUDED.hospital_id`,
      [hospitalId, ...patient]
    );
  }
  await query("SELECT setval('patient_uhid_seq', COALESCE((SELECT MAX(CAST(split_part(uhid, '-', 3) AS INTEGER)) FROM patients), 1000), true)");
  const beds = [
    ["GEN-01", "General Ward", "G-1"], ["GEN-02", "General Ward", "G-1"], ["GEN-03", "General Ward", "G-1"],
    ["ICU-01", "ICU", "ICU-1"], ["ICU-02", "ICU", "ICU-1"],
    ["CARD-01", "Cardiology", "C-1"], ["CARD-02", "Cardiology", "C-1"],
    ["MAT-01", "Maternity", "M-1"],
  ];
  for (const [bedNumber, ward, room] of beds) {
    await query(
      `INSERT INTO beds (hospital_id, bed_number, ward, room) VALUES ($1,$2,$3,$4)
       ON CONFLICT (hospital_id, bed_number) DO UPDATE SET ward = EXCLUDED.ward, room = EXCLUDED.room`,
      [hospitalId, bedNumber, ward, room]
    );
  }
  console.log("Seeded local admin and staff users.");
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());
