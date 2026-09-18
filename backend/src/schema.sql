CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_hospital_id_idx ON users(hospital_id);

CREATE SEQUENCE IF NOT EXISTS patient_uhid_seq START 1001;

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  uhid TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  admission_type TEXT NOT NULL CHECK (admission_type IN ('OPD', 'IPD', 'Emergency', 'Day Care', 'ICU')),
  age INTEGER NOT NULL CHECK (age >= 0 AND age <= 130),
  date_of_birth DATE,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
  blood_group TEXT CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown')),
  mobile TEXT NOT NULL,
  aadhaar TEXT,
  abha_id TEXT,
  address TEXT,
  guardian_name TEXT,
  guardian_relation TEXT,
  guardian_phone TEXT,
  department TEXT NOT NULL,
  attending_doctor_id TEXT NOT NULL,
  initial_status TEXT NOT NULL CHECK (initial_status IN ('Stable', 'Critical', 'Recovering', 'Under Obs', 'Serious')),
  patient_category TEXT NOT NULL CHECK (patient_category IN ('General', 'BPL', 'Senior Citizen', 'Divyangjan', 'VIP', 'Staff')),
  mlc_type TEXT NOT NULL CHECK (mlc_type IN ('None', 'Road Traffic Accident', 'Assault', 'Poisoning', 'Burns', 'Sexual Assault', 'Suicide Attempt', 'Industrial Accident', 'Other MLC')),
  chief_complaint TEXT,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('Self Pay', 'Cash', 'UPI', 'Insurance / TPA', 'CGHS', 'ECHS', 'ESI', 'Ayushman Bharat', 'Govt / Free')),
  insurance_company TEXT,
  tpa_name TEXT,
  policy_member_id TEXT,
  policy_validity DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS patients_hospital_id_idx ON patients(hospital_id);
CREATE INDEX IF NOT EXISTS patients_uhid_idx ON patients(uhid);
CREATE INDEX IF NOT EXISTS patients_name_idx ON patients USING gin(to_tsvector('simple', full_name));

CREATE TABLE IF NOT EXISTS emergency_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  triage_level TEXT NOT NULL CHECK (triage_level IN ('Red', 'Orange', 'Yellow', 'Green')),
  status TEXT NOT NULL DEFAULT 'Waiting' CHECK (status IN ('Waiting', 'In Treatment', 'Transferred', 'Discharged')),
  arrival_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  complaint TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS emergency_hospital_queue_idx ON emergency_encounters(hospital_id, arrival_time);
CREATE INDEX IF NOT EXISTS emergency_patient_active_idx ON emergency_encounters(patient_id) WHERE status <> 'Discharged';

CREATE SEQUENCE IF NOT EXISTS cpoe_order_number_seq START 1001;

CREATE TABLE IF NOT EXISTS cpoe_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  ordered_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_category TEXT NOT NULL CHECK (order_category IN ('Laboratory', 'Radiology', 'Medication', 'Procedure', 'Other')),
  order_item TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('STAT', 'URGENT', 'ROUTINE')),
  clinical_instructions TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ORDERED' CHECK (status IN ('ORDERED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cpoe_hospital_order_idx ON cpoe_orders(hospital_id, ordered_at DESC);
CREATE INDEX IF NOT EXISTS cpoe_patient_order_idx ON cpoe_orders(patient_id, ordered_at DESC);

CREATE SEQUENCE IF NOT EXISTS ipd_admission_number_seq START 1001;

CREATE TABLE IF NOT EXISTS beds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  bed_number TEXT NOT NULL,
  ward TEXT NOT NULL,
  room TEXT,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, bed_number)
);

CREATE TABLE IF NOT EXISTS ipd_admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_number TEXT NOT NULL UNIQUE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  bed_id UUID NOT NULL REFERENCES beds(id) ON DELETE RESTRICT,
  admission_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'ADMITTED' CHECK (status IN ('ADMITTED', 'DISCHARGED')),
  discharged_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ipd_active_bed_unique_idx ON ipd_admissions(bed_id) WHERE status = 'ADMITTED';
CREATE UNIQUE INDEX IF NOT EXISTS ipd_active_patient_unique_idx ON ipd_admissions(patient_id) WHERE status = 'ADMITTED';
CREATE INDEX IF NOT EXISTS beds_hospital_status_idx ON beds(hospital_id, status);
CREATE INDEX IF NOT EXISTS ipd_hospital_status_idx ON ipd_admissions(hospital_id, status);

CREATE SEQUENCE IF NOT EXISTS appointment_number_seq START 1001;

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_number TEXT NOT NULL UNIQUE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id TEXT NOT NULL,
  department TEXT NOT NULL,
  appointment_date DATE NOT NULL,
  slot_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appointments_hospital_date_idx ON appointments(hospital_id, appointment_date);
CREATE INDEX IF NOT EXISTS appointments_patient_idx ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS appointments_doctor_date_idx ON appointments(doctor_id, appointment_date);
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_hospital_id_doctor_id_appointment_date_slot_ti_key;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_hospital_id_doctor_id_appointment_date_slot_time_key;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot_unique_idx ON appointments(hospital_id, doctor_id, appointment_date, slot_time) WHERE status <> 'CANCELLED';

CREATE TABLE IF NOT EXISTS form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  original_filename TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS form_templates_category_idx ON form_templates(category, subcategory);
CREATE INDEX IF NOT EXISTS form_templates_name_idx ON form_templates USING gin(to_tsvector('simple', name));

CREATE TABLE IF NOT EXISTS patient_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  template_id UUID NOT NULL REFERENCES form_templates(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED')),
  field_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS patient_forms_patient_idx ON patient_forms(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS discharge_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_template_id UUID NOT NULL UNIQUE REFERENCES form_templates(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discharge_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES ipd_admissions(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED')),
  diagnosis TEXT,
  clinical_summary TEXT,
  treatment_procedure TEXT,
  discharge_condition TEXT,
  discharge_instructions TEXT,
  follow_up TEXT,
  consultant TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (admission_id)
);

CREATE INDEX IF NOT EXISTS discharge_summaries_hospital_idx ON discharge_summaries(hospital_id, updated_at DESC);
