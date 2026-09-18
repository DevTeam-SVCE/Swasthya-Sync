export const ADMISSION_TYPES = ["OPD", "IPD", "Emergency", "Day Care", "ICU"] as const;
export const GENDERS = ["Male", "Female", "Other", "Prefer not to say"] as const;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"] as const;
export const INITIAL_STATUSES = ["Stable", "Critical", "Recovering", "Under Obs", "Serious"] as const;
export const PATIENT_CATEGORIES = ["General", "BPL", "Senior Citizen", "Divyangjan", "VIP", "Staff"] as const;
export const MLC_TYPES = ["None", "Road Traffic Accident", "Assault", "Poisoning", "Burns", "Sexual Assault", "Suicide Attempt", "Industrial Accident", "Other MLC"] as const;
export const PAYMENT_TYPES = ["Self Pay", "Cash", "UPI", "Insurance / TPA", "CGHS", "ECHS", "ESI", "Ayushman Bharat", "Govt / Free"] as const;

export const DEPARTMENTS = [
  "General Medicine", "ICU", "Cardiology", "Neurology", "Orthopaedics", "Paediatrics", "General Surgery", "Dermatology", "ENT", "Ophthalmology", "Gynaecology", "Psychiatry", "Pulmonology", "Nephrology", "Gastroenterology", "Oncology", "Urology", "Radiology", "Emergency", "Anaesthesiology", "Dentistry", "Endocrinology", "Rheumatology", "Haematology", "Infectious Disease", "Neonatology", "Pathology", "Plastic Surgery", "Physiotherapy", "Nuclear Medicine", "Pain Medicine", "Nutrition & Dietetics", "Medical Records", "Preventive Medicine",
] as const;

export interface PatientFormData {
  fullName: string;
  admissionType: string;
  age: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  mobile: string;
  aadhaar: string;
  abhaId: string;
  address: string;
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  department: string;
  attendingDoctorId: string;
  initialStatus: string;
  patientCategory: string;
  mlcType: string;
  chiefComplaint: string;
  paymentType: string;
  insuranceCompany: string;
  tpaName: string;
  policyMemberId: string;
  policyValidity: string;
}

export interface Patient extends Omit<PatientFormData, "age"> {
  id: string;
  uhid: string;
  age: number;
  attendingDoctor: string;
  createdAt: string;
  updatedAt: string;
}

export interface Doctor {
  id: string;
  name: string;
  department: string;
}

export interface PatientListResponse {
  patients: Patient[];
  total: number;
}
