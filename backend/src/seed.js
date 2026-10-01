require("dotenv").config();

const bcrypt = require("bcrypt");
const { pool, query, initializeDatabase } = require("./db");

const bedInventory = [
  ["GROUND FLOOR", null, "OPD", 10, "GF-OPD"],
  ["GROUND FLOOR", null, "X-RAY", 1, "GF-XRAY"],
  ["GROUND FLOOR", null, "ECHO/USG", 1, "GF-ECHO"],
  ["GROUND FLOOR", null, "CT ROOM", 1, "GF-CT"],
  ["GROUND FLOOR", null, "EMERGENCY ROOM", 7, "GF-ER"],
  ["1ST FLOOR", "101", "NR OFFICE", 2, "1F-101"],
  ["1ST FLOOR", "102", "PHYSIOTHERAPY", 3, "1F-102"],
  ["1ST FLOOR", "103", "PHYSIOTHERAPY", 3, "1F-103"],
  ["1ST FLOOR", "104", "DIALYSIS", 5, "1F-104"],
  ["1ST FLOOR", "105", "DIALYSIS", 5, "1F-105"],
  ["1ST FLOOR", "106", "HOUSE KEEPING OFFICE", 3, "1F-106"],
  ["1ST FLOOR", "107", "ADMIN", 3, "1F-107"],
  ["1ST FLOOR", "108", "GUARD ROOM", 3, "1F-108"],
  ["1ST FLOOR", null, "MEDICAL DIRECTOR OFFICE", 2, "1F-MDO"],
  ["1ST FLOOR", "109", "NS OFFICE", 1, "1F-109"],
  ["1ST FLOOR", "110", "MEDICAL DOCTOR ROOM", 1, "1F-110"],
  ["1ST FLOOR", "111", "STORE", 4, "1F-111"],
  ["1ST FLOOR", "112", "IMT ROOM", 2, "1F-112"],
  ["2ND FLOOR WARD", "201", "GENERAL WARD MALE", 4, "2F-201"],
  ["2ND FLOOR WARD", "202", "SEMI PRIVATE & PRIVATE", 5, "2F-202"],
  ["2ND FLOOR WARD", "203", "SEMI PRIVATE & PRIVATE", 5, "2F-203"],
  ["2ND FLOOR WARD", "204", "SEMI PRIVATE & PRIVATE", 5, "2F-204"],
  ["2ND FLOOR WARD", "205", "SEMI PRIVATE & PRIVATE", 5, "2F-205"],
  ["2ND FLOOR WARD", "206", "GENERAL WARD - FEMALE", 4, "2F-206"],
  ["2ND FLOOR WARD", "207", "SEMI PRIVATE ROOM", 2, "2F-207"],
  ["2ND FLOOR WARD", "208", "GENERAL WARD - MALE", 5, "2F-208"],
  ["2ND FLOOR WARD", "209", "DELUX ROOM", 1, "2F-209"],
  ["2ND FLOOR WARD", "210", "DELUX ROOM", 1, "2F-210"],
  ["2ND FLOOR WARD", "211", "SEMI PRIVATE & PRIVATE", 4, "2F-211"],
  ["2ND FLOOR WARD", "212", "SEMI PRIVATE & PRIVATE", 2, "2F-212"],
  ["3RD FLOOR", "301", "GENERAL WARD MALE", 4, "3F-301"],
  ["3RD FLOOR", "302", "SEMI PRIVATE & PRIVATE", 5, "3F-302"],
  ["3RD FLOOR", "303", "SEMI PRIVATE & PRIVATE", 5, "3F-303"],
  ["3RD FLOOR", "304", "SEMI PRIVATE & PRIVATE", 5, "3F-304"],
  ["3RD FLOOR", "305", "SEMI PRIVATE & PRIVATE", 5, "3F-305"],
  ["3RD FLOOR", "306", "GENERAL WARD - FEMALE", 4, "3F-306"],
  ["3RD FLOOR", "307", "SEMI PRIVATE ROOM", 2, "3F-307"],
  ["3RD FLOOR", "308", "GENERAL WARD - MALE", 5, "3F-308"],
  ["3RD FLOOR", "309", "DELUX ROOM", 1, "3F-309"],
  ["3RD FLOOR", "310", "DELUX ROOM", 1, "3F-310"],
  ["3RD FLOOR", "311", "SEMI PRIVATE & PRIVATE", 4, "3F-311"],
  ["3RD FLOOR", "312", "SEMI PRIVATE & PRIVATE", 4, "3F-312"],
  ["4TH FLOOR", "401", "CATH LAB", 2, "4F-401"],
  ["4TH FLOOR", "402", "CATH LAB", 2, "4F-402"],
  ["4TH FLOOR", "403", "CATH LAB RECOVERY BEDS", 5, "4F-403"],
  ["4TH FLOOR", "404", "SEMI PRIVATE & PRIVATE", 5, "4F-404"],
  ["4TH FLOOR", "405", "SEMI PRIVATE & PRIVATE", 5, "4F-405"],
  ["4TH FLOOR", "406", "GENERAL WARD - FEMALE", 4, "4F-406"],
  ["4TH FLOOR", "407", "SEMI PRIVATE ROOM", 2, "4F-407"],
  ["4TH FLOOR", "408", "GENERAL WARD - MALE", 5, "4F-408"],
  ["4TH FLOOR", "409", "DELUX ROOM", 1, "4F-409"],
  ["4TH FLOOR", "410", "DELUX ROOM", 1, "4F-410"],
  ["4TH FLOOR", "411", "SEMI PRIVATE & PRIVATE", 4, "4F-411"],
  ["4TH FLOOR", "412", "SEMI PRIVATE & PRIVATE", 2, "4F-412"],
  ["5TH FLOOR", "ICU", "ICU", 11, "5F-ICU"],
  ["5TH FLOOR", "ISOLATION", "ISOLATION", 4, "5F-ISO"],
  ["5TH FLOOR", null, "LABOUR ROOM", 3, "5F-LABOUR"],
  ["5TH FLOOR", null, "LABOUR ROOM POST NATAL W", 2, "5F-POSTNATAL"],
  ["5TH FLOOR", null, "NICU", 5, "5F-NICU"],
  ["5TH FLOOR", null, "OT RECOVERY", 4, "5F-OT"],
];

const floorBeds = bedInventory.flatMap(([floor, room, ward, count, prefix]) =>
  Array.from({ length: count }, (_, index) => ({
    floor,
    room,
    ward,
    bedNumber: `${prefix}-${String(index + 1).padStart(2, "0")}`,
  }))
);

async function seed() {
  await initializeDatabase();
  const assignedHospital = await query(
    "SELECT hospital_id AS id FROM users WHERE email = $1 LIMIT 1",
    ["admin@swasthyasync.com"]
  );
  const existingHospital = await query("SELECT id FROM hospitals WHERE name = $1 ORDER BY created_at ASC LIMIT 1", ["Cura Hospitals"]);
  const hospital = assignedHospital.rows[0] ?? existingHospital.rows[0] ?? (await query("INSERT INTO hospitals (name) VALUES ($1) RETURNING id", ["Cura Hospitals"])).rows[0];
  let hospitalId = hospital.id;

  const users = [
    { name: "Dr. Arjun Mehta", email: "admin@swasthyasync.com", password: "admin123", role: "ADMIN" },
    { name: "Priya Sharma", email: "staff@swasthyasync.com", password: "staff123", role: "STAFF" },
  ];
  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    const savedUser = await query(
      `INSERT INTO users (hospital_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, active = TRUE
       RETURNING id`,
      [hospitalId, user.name, user.email, passwordHash, user.role]
    );
    await query(
      `INSERT INTO staff_profiles (user_id, hospital_id, full_name, role, staff_id, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       ON CONFLICT (user_id) DO UPDATE
       SET hospital_id = EXCLUDED.hospital_id, full_name = EXCLUDED.full_name, role = EXCLUDED.role, updated_at = NOW()`,
      [savedUser.rows[0].id, hospitalId, user.name, user.role, `SEED-${user.role}`]
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
  for (const bed of floorBeds) {
    await query(
      `INSERT INTO beds (hospital_id, bed_number, floor, ward, room, active)
       VALUES ($1,$2,$3,$4,$5,TRUE)
       ON CONFLICT (hospital_id, bed_number) DO UPDATE
       SET floor = EXCLUDED.floor, ward = EXCLUDED.ward, room = EXCLUDED.room, active = TRUE`,
      [hospitalId, bed.bedNumber, bed.floor, bed.ward, bed.room]
    );
  }
  console.log(`Seeded local admin and staff users with ${beds.length} legacy beds and ${floorBeds.length} floor beds.`);
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());
