import type { AuthUser } from "@/types/auth";

/* ── Demo users ──────────────────────────────────────────── */
export const DEMO_USERS: (AuthUser & { password: string })[] = [
  {
    id: "usr_001",
    name: "Dr. Arjun Mehta",
    email: "admin@swasthyasync.com",
    password: "admin123",
    role: "admin",
    hospitalName: "City General Hospital",
    hospitalId: "hosp_001",
    department: "Administration",
    designation: "Hospital Administrator",
    avatarInitials: "AM",
  },
  {
    id: "usr_002",
    name: "Priya Sharma",
    email: "staff@swasthyasync.com",
    password: "staff123",
    role: "staff",
    hospitalName: "City General Hospital",
    hospitalId: "hosp_001",
    department: "General Medicine",
    designation: "Senior Nurse",
    avatarInitials: "PS",
  },
];

/* ── Demo KPI data (Dashboard) ───────────────────────────── */
export const DEMO_KPI = {
  totalPatients:    { value: 2847, trend: "+12%", trendUp: true },
  bedOccupancy:     { value: "73%", detail: "146/200 beds", trend: "+5%", trendUp: true },
  pendingNotes:     { value: 23,   trend: "-8%",  trendUp: false },
  todayOPD:         { value: 184,  trend: "+22%", trendUp: true },
  revenueMonth:     { value: "₹18.4L", trend: "+9%", trendUp: true },
  pendingLabTests:  { value: 41,   trend: null,   trendUp: null },
  criticalPatients: { value: 7,    trend: null,   trendUp: null },
  todayRevenue:     { value: "₹84,200", trend: "+15%", trendUp: true },
};

/* ── Demo revenue chart data ─────────────────────────────── */
export const DEMO_REVENUE_CHART = [
  { month: "Jan", opd: 420000, ipd: 890000, pharmacy: 210000 },
  { month: "Feb", opd: 380000, ipd: 820000, pharmacy: 195000 },
  { month: "Mar", opd: 510000, ipd: 960000, pharmacy: 240000 },
  { month: "Apr", opd: 475000, ipd: 910000, pharmacy: 225000 },
  { month: "May", opd: 530000, ipd: 1020000, pharmacy: 260000 },
  { month: "Jun", opd: 490000, ipd: 980000, pharmacy: 245000 },
  { month: "Jul", opd: 560000, ipd: 1100000, pharmacy: 275000 },
  { month: "Aug", opd: 520000, ipd: 1050000, pharmacy: 255000 },
  { month: "Sep", opd: 580000, ipd: 1150000, pharmacy: 290000 },
];

/* ── Demo bed occupancy by ward ──────────────────────────── */
export const DEMO_BED_BY_WARD = [
  { ward: "General",  occupied: 42, total: 60 },
  { ward: "ICU",      occupied: 12, total: 15 },
  { ward: "Cardiology", occupied: 18, total: 25 },
  { ward: "Neuro",    occupied: 14, total: 20 },
  { ward: "Maternity", occupied: 22, total: 30 },
  { ward: "Paeds",    occupied: 16, total: 20 },
  { ward: "Ortho",    occupied: 22, total: 30 },
];

/* ── Demo recent patients ────────────────────────────────── */
export const DEMO_RECENT_PATIENTS = [
  {
    uhid: "CGH-2024-4821",
    name: "Rajesh Kumar",
    age: 54,
    gender: "Male",
    admissionType: "IPD",
    department: "Cardiology",
    doctor: "Dr. Sneha Patel",
    status: "Critical",
    admittedOn: "2024-09-10",
  },
  {
    uhid: "CGH-2024-4820",
    name: "Meena Devi",
    age: 38,
    gender: "Female",
    admissionType: "OPD",
    department: "Gynaecology",
    doctor: "Dr. Kavita Nair",
    status: "Stable",
    admittedOn: "2024-09-11",
  },
  {
    uhid: "CGH-2024-4819",
    name: "Aryan Singh",
    age: 8,
    gender: "Male",
    admissionType: "Emergency",
    department: "Paediatrics",
    doctor: "Dr. Rahul Gupta",
    status: "Recovering",
    admittedOn: "2024-09-11",
  },
  {
    uhid: "CGH-2024-4818",
    name: "Sunita Verma",
    age: 67,
    gender: "Female",
    admissionType: "IPD",
    department: "Neurology",
    doctor: "Dr. Amit Joshi",
    status: "Stable",
    admittedOn: "2024-09-09",
  },
  {
    uhid: "CGH-2024-4817",
    name: "Mohammed Iqbal",
    age: 45,
    gender: "Male",
    admissionType: "OPD",
    department: "General Medicine",
    doctor: "Dr. Priya Singh",
    status: "Stable",
    admittedOn: "2024-09-11",
  },
];

/* ── Demo pending lab tests ──────────────────────────────── */
export const DEMO_PENDING_LABS = [
  { id: "LAB-9012", patient: "Rajesh Kumar", test: "Troponin I/T", priority: "STAT",    ordered: "2h ago" },
  { id: "LAB-9011", patient: "Aryan Singh",  test: "CBC + ESR",    priority: "URGENT",  ordered: "3h ago" },
  { id: "LAB-9010", patient: "Fatima Begum", test: "LFT",          priority: "ROUTINE", ordered: "5h ago" },
  { id: "LAB-9009", patient: "Vikram Rao",   test: "HbA1c",        priority: "ROUTINE", ordered: "6h ago" },
];

/* ── Demo OPD queue ──────────────────────────────────────── */
export const DEMO_OPD_QUEUE = [
  { token: "T-001", name: "Savita Mishra",   dept: "General Medicine", doctor: "Dr. Priya Singh",  wait: "5 min",  status: "Confirmed" },
  { token: "T-002", name: "Ganesh Patil",    dept: "Orthopaedics",     doctor: "Dr. Ravi Mehta",   wait: "12 min", status: "Scheduled" },
  { token: "T-003", name: "Lakshmi Iyer",    dept: "Cardiology",       doctor: "Dr. Sneha Patel",  wait: "20 min", status: "Scheduled" },
  { token: "T-004", name: "Deepak Chauhan",  dept: "Dermatology",      doctor: "Dr. Nisha Roy",    wait: "28 min", status: "Scheduled" },
];

/* ── Demo alert items ────────────────────────────────────── */
export const DEMO_ALERTS = [
  { id: "a1", type: "critical",  message: "Patient Rajesh Kumar (Bed 12-B) — SpO₂ dropped to 88%", time: "2 min ago" },
  { id: "a2", type: "warning",   message: "ICU capacity at 80% — 12/15 beds occupied", time: "15 min ago" },
  { id: "a3", type: "info",      message: "Lab report for CGH-2024-4821 ready for review", time: "32 min ago" },
  { id: "a4", type: "warning",   message: "Pharmacy low stock: Amlodipine 5mg — 12 strips remaining", time: "1h ago" },
];
