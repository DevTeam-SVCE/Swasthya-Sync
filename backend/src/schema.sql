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

ALTER TABLE cpoe_orders DROP CONSTRAINT IF EXISTS cpoe_orders_order_category_check;
ALTER TABLE cpoe_orders ADD CONSTRAINT cpoe_orders_order_category_check
  CHECK (order_category IN ('Laboratory', 'Radiology', 'Medication', 'Procedure', 'Blood Bank', 'Other'));

CREATE TABLE IF NOT EXISTS lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  cpoe_order_id UUID NOT NULL UNIQUE REFERENCES cpoe_orders(id) ON DELETE RESTRICT,
  test_name TEXT NOT NULL,
  test_code TEXT,
  priority TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('STAT', 'URGENT', 'ROUTINE')),
  status TEXT NOT NULL DEFAULT 'ORDERED' CHECK (status IN ('ORDERED', 'SAMPLE_PENDING', 'COLLECTED', 'PROCESSING', 'RESULT_ENTERED', 'VERIFIED', 'COMPLETED')),
  ordered_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lab_hospital_status_idx ON lab_orders(hospital_id, status, ordered_at DESC);
CREATE INDEX IF NOT EXISTS lab_patient_status_idx ON lab_orders(patient_id, ordered_at DESC);

CREATE TABLE IF NOT EXISTS lab_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_order_id UUID NOT NULL UNIQUE REFERENCES lab_orders(id) ON DELETE CASCADE,
  sample_type TEXT NOT NULL CHECK (sample_type IN ('Blood', 'Urine', 'Stool', 'Swab', 'Other')),
  sample_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (sample_status IN ('PENDING', 'COLLECTED')),
  collected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lab_samples_collection_idx ON lab_samples(sample_status, collected_at DESC);

CREATE TABLE IF NOT EXISTS lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  result_value TEXT NOT NULL,
  unit TEXT,
  reference_range TEXT,
  remarks TEXT,
  entered_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  result_status TEXT NOT NULL DEFAULT 'RESULT_ENTERED' CHECK (result_status IN ('RESULT_ENTERED', 'VERIFIED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lab_results_order_idx ON lab_results(lab_order_id, entered_at DESC);

CREATE TABLE IF NOT EXISTS pharmacy_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  cpoe_order_id UUID NOT NULL UNIQUE REFERENCES cpoe_orders(id) ON DELETE RESTRICT,
  medication_name TEXT NOT NULL,
  dose TEXT,
  route TEXT,
  frequency TEXT,
  duration TEXT,
  quantity TEXT,
  priority TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('STAT', 'URGENT', 'ROUTINE')),
  status TEXT NOT NULL DEFAULT 'ORDERED' CHECK (status IN ('ORDERED', 'DISPENSING', 'DISPENSED', 'CANCELLED')),
  ordered_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispensed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  dispensed_at TIMESTAMPTZ,
  quantity_dispensed NUMERIC(10,2),
  remarks TEXT
);

CREATE INDEX IF NOT EXISTS pharmacy_hospital_status_idx ON pharmacy_orders(hospital_id, status, ordered_at DESC);
CREATE INDEX IF NOT EXISTS pharmacy_patient_status_idx ON pharmacy_orders(patient_id, ordered_at DESC);

CREATE TABLE IF NOT EXISTS blood_bank_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  cpoe_order_id UUID NOT NULL UNIQUE REFERENCES cpoe_orders(id) ON DELETE RESTRICT,
  blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  component TEXT NOT NULL CHECK (component IN ('Whole blood', 'Red blood cells', 'Platelets', 'Fresh frozen plasma', 'Cryoprecipitate')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  priority TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('STAT', 'URGENT', 'ROUTINE')),
  status TEXT NOT NULL DEFAULT 'ORDERED' CHECK (status IN ('ORDERED', 'REQUESTED', 'PROCESSING', 'ISSUED', 'COMPLETED', 'CANCELLED')),
  clinical_indication TEXT,
  clinical_instructions TEXT,
  ordered_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ,
  processing_by UUID REFERENCES users(id) ON DELETE SET NULL,
  processing_at TIMESTAMPTZ,
  issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blood_bank_hospital_status_idx ON blood_bank_orders(hospital_id, status, ordered_at DESC);
CREATE INDEX IF NOT EXISTS blood_bank_patient_order_idx ON blood_bank_orders(patient_id, ordered_at DESC);

CREATE TABLE IF NOT EXISTS radiology_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  cpoe_order_id UUID NOT NULL UNIQUE REFERENCES cpoe_orders(id) ON DELETE RESTRICT,
  examination_name TEXT NOT NULL,
  modality TEXT,
  body_part TEXT,
  clinical_indication TEXT,
  clinical_instructions TEXT,
  priority TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('STAT', 'URGENT', 'ROUTINE')),
  status TEXT NOT NULL DEFAULT 'ORDERED' CHECK (status IN ('ORDERED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED')),
  ordered_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ,
  performed_at TIMESTAMPTZ,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  findings TEXT,
  impression TEXT,
  remarks TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS clinical_indication TEXT;

CREATE INDEX IF NOT EXISTS radiology_hospital_status_idx ON radiology_orders(hospital_id, status, ordered_at DESC);
CREATE INDEX IF NOT EXISTS radiology_patient_order_idx ON radiology_orders(patient_id, ordered_at DESC);

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

CREATE TABLE IF NOT EXISTS nursing_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES ipd_admissions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  general_condition TEXT,
  consciousness TEXT,
  pain_assessment TEXT,
  mobility TEXT,
  nutrition TEXT,
  skin_observations TEXT,
  fall_risk_observations TEXT,
  other_observations TEXT,
  remarks TEXT,
  recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nursing_assessment_admission_idx ON nursing_assessments(admission_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS nursing_vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES ipd_admissions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  temperature NUMERIC(5,2),
  pulse INTEGER,
  respiratory_rate INTEGER,
  spo2 NUMERIC(5,2),
  systolic_bp INTEGER,
  diastolic_bp INTEGER,
  weight NUMERIC(6,2),
  notes TEXT,
  recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((systolic_bp IS NULL AND diastolic_bp IS NULL) OR (systolic_bp IS NOT NULL AND diastolic_bp IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS nursing_vitals_admission_idx ON nursing_vitals(admission_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS nursing_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES ipd_admissions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  observation TEXT,
  intervention TEXT,
  response TEXT,
  remarks TEXT,
  recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (observation IS NOT NULL OR intervention IS NOT NULL OR response IS NOT NULL OR remarks IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS nursing_notes_admission_idx ON nursing_notes(admission_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS nursing_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES ipd_admissions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  task_type TEXT NOT NULL CHECK (task_type IN ('Medication administration', 'Vital-sign monitoring', 'Patient repositioning', 'Wound / skin care', 'Intake / output monitoring', 'Other')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS nursing_tasks_admission_idx ON nursing_tasks(admission_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS nursing_io_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES ipd_admissions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('INTAKE', 'OUTPUT')),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('Oral', 'IV', 'Other intake', 'Urine', 'Drain', 'Other output')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  unit TEXT NOT NULL,
  notes TEXT,
  recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nursing_io_admission_idx ON nursing_io_entries(admission_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS ot_theatres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, name)
);

CREATE TABLE IF NOT EXISTS ot_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  admission_id UUID REFERENCES ipd_admissions(id) ON DELETE SET NULL,
  cpoe_order_id UUID UNIQUE REFERENCES cpoe_orders(id) ON DELETE RESTRICT,
  theatre_id UUID NOT NULL REFERENCES ot_theatres(id) ON DELETE RESTRICT,
  procedure_name TEXT NOT NULL,
  surgeon TEXT NOT NULL,
  anaesthetist TEXT NOT NULL,
  anaesthesia_type TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 1440),
  priority TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('STAT', 'URGENT', 'ROUTINE')),
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'PREPARATION', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED')),
  clinical_indication TEXT,
  clinical_instructions TEXT,
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  actual_procedure TEXT,
  actual_start_at TIMESTAMPTZ,
  actual_end_at TIMESTAMPTZ,
  operative_surgeon TEXT,
  operative_anaesthetist TEXT,
  findings TEXT,
  procedure_notes TEXT,
  complications TEXT,
  estimated_blood_loss_ml NUMERIC(10,2),
  specimens TEXT,
  operative_remarks TEXT,
  recovery_status TEXT,
  postoperative_instructions TEXT,
  follow_up_instructions TEXT,
  postoperative_complications TEXT,
  postoperative_remarks TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at >= actual_start_at),
  CHECK (estimated_blood_loss_ml IS NULL OR estimated_blood_loss_ml >= 0)
);

CREATE INDEX IF NOT EXISTS ot_cases_hospital_status_time_idx ON ot_cases(hospital_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS ot_cases_patient_time_idx ON ot_cases(patient_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS ot_cases_theatre_time_idx ON ot_cases(theatre_id, scheduled_at) WHERE status IN ('SCHEDULED', 'PREPARATION', 'IN_PROGRESS');

CREATE TABLE IF NOT EXISTS ot_case_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  ot_case_id UUID NOT NULL REFERENCES ot_cases(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL CHECK (note_type IN ('PRE_OPERATIVE', 'INTRA_OPERATIVE', 'POST_OPERATIVE')),
  note_text TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ot_case_notes_case_idx ON ot_case_notes(ot_case_id, created_at DESC);

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
