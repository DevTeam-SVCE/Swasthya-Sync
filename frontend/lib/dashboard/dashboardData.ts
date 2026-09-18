import {
  Activity,
  Ambulance,
  BarChart3,
  BedDouble,
  CalendarDays,
  BellRing,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Droplets,
  FileBarChart,
  FileCheck2,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  Microscope,
  Package,
  Pill,
  Receipt,
  Scan,
  Scissors,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Truck,
  UserRound,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

export interface DashboardModule {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href?: string;
}

export interface DashboardModuleCategory {
  key: string;
  label: string;
  icon: LucideIcon;
  modules: DashboardModule[];
}

const moduleItem = (
  key: string,
  label: string,
  description: string,
  icon: LucideIcon,
  href?: string
): DashboardModule => ({ key, label, description, icon, href });

export const DASHBOARD_MODULE_CATEGORIES: DashboardModuleCategory[] = [
  {
    key: "patient-administration",
    label: "Patient Administration",
    icon: Users,
    modules: [
      moduleItem("registration", "Registration", "Create patient records", UserRound),
      moduleItem("opd", "OPD", "Manage outpatient visits", ClipboardList, "/opd"),
      moduleItem("ipd", "IPD", "Manage admissions and beds", BedDouble, "/ipd"),
      moduleItem("queue", "Queue", "View today's queue", Activity, "/opd"),
      moduleItem("qr-barcode", "QR / Barcode", "Coming in a later phase", Scan),
      moduleItem("merging", "Merging", "Coming in a later phase", Users),
      moduleItem("medical-records", "Medical Records", "Browse patient records", FileText, "/patients"),
    ],
  },
  {
    key: "clinical",
    label: "Clinical",
    icon: Stethoscope,
    modules: [
      moduleItem("doctors-workbench", "Doctors Workbench", "Coming in a later phase", Stethoscope),
      moduleItem("cpoe", "CPOE", "Create physician orders", ClipboardList, "/cpoe"),
      moduleItem("clinical-notes", "Clinical Notes", "Review clinical notes", FileText, "/clinical-notes"),
      moduleItem("discharge-summary", "Discharge Summary", "Prepare discharge summaries", FileCheck2, "/discharge"),
      moduleItem("patient-forms", "Patient Forms", "Browse real hospital form templates", ClipboardCheck, "/forms"),
    ],
  },
  {
    key: "patient-billing",
    label: "Patient Billing",
    icon: Receipt,
    modules: [
      moduleItem("opd-billing", "OPD Billing", "Review billing workspace", Receipt, "/billing"),
      moduleItem("ipd-billing", "IPD Billing", "Review billing workspace", WalletCards, "/billing"),
      moduleItem("payment-collection", "Payment Collection", "Review collected payments", CreditCard, "/billing"),
      moduleItem("gst-management", "GST Management", "Coming in a later phase", FileText),
    ],
  },
  {
    key: "revenue-cycle",
    label: "Revenue Cycle",
    icon: BarChart3,
    modules: [
      moduleItem("claims-processing", "Claims Processing", "Coming in a later phase", FileCheck2),
      moduleItem("claim-submission", "Claim Submission", "Coming in a later phase", FileText),
      moduleItem("medical-audit", "Medical Audit", "Coming in a later phase", ShieldCheck),
      moduleItem("alerts", "Alerts", "Coming in a later phase", BellRing),
    ],
  },
  {
    key: "radiology",
    label: "Radiology",
    icon: Scan,
    modules: [
      moduleItem("radiology-orders", "Radiology Orders", "Review imaging orders", ClipboardList, "/radiology"),
      moduleItem("report-management", "Report Management", "Review imaging reports", FileText, "/radiology"),
      moduleItem("pacs-integration", "PACS Integration", "Coming in a later phase", Scan),
    ],
  },
  {
    key: "laboratory",
    label: "Laboratory",
    icon: FlaskConical,
    modules: [
      moduleItem("lab-orders", "Lab Orders", "Review pending orders", ClipboardList, "/laboratory"),
      moduleItem("result-entry", "Result Entry", "Coming in a later phase", FileText),
      moduleItem("sample-collection", "Sample Collection", "Coming in a later phase", Syringe),
      moduleItem("lab-reports", "Lab Reports", "Review laboratory reports", FileBarChart, "/laboratory"),
    ],
  },
  {
    key: "nursing-management",
    label: "Nursing Management",
    icon: HeartPulse,
    modules: [
      moduleItem("nurse-station", "Nurse Station", "Open nursing workspace", HeartPulse, "/nursing"),
      moduleItem("medication-administration", "Medication Administration", "Coming in a later phase", Pill),
      moduleItem("vitals-monitoring", "Vitals Monitoring", "Coming in a later phase", Activity),
      moduleItem("ward-rounds", "Ward Rounds", "Coming in a later phase", ClipboardCheck),
    ],
  },
  {
    key: "operation-theatre",
    label: "Operation Theatre",
    icon: Scissors,
    modules: [
      moduleItem("ot-scheduling", "OT Scheduling", "Review theatre workspace", CalendarDays),
      moduleItem("ot-notes", "OT Notes", "Coming in a later phase", FileText),
      moduleItem("anaesthesia-notes", "Anaesthesia Notes", "Coming in a later phase", Stethoscope),
      moduleItem("ot-reports", "OT Reports", "Coming in a later phase", FileBarChart),
    ],
  },
  {
    key: "blood-bank",
    label: "Blood Bank",
    icon: Droplets,
    modules: [
      moduleItem("blood-inventory", "Blood Inventory", "Review blood bank workspace", Droplets, "/blood-bank"),
      moduleItem("donor-management", "Donor Management", "Coming in a later phase", Users),
      moduleItem("blood-requests", "Blood Requests", "Coming in a later phase", ClipboardList),
      moduleItem("blood-reports", "Reports", "Coming in a later phase", FileBarChart),
    ],
  },
  {
    key: "pharmacy",
    label: "Pharmacy",
    icon: Pill,
    modules: [
      moduleItem("drug-dispensing", "Drug Dispensing", "Review pharmacy workspace", Pill, "/pharmacy"),
      moduleItem("drug-inventory", "Drug Inventory", "Coming in a later phase", Package),
      moduleItem("pharmacy-billing", "Pharmacy Billing", "Coming in a later phase", Receipt),
      moduleItem("prescriptions", "Prescriptions", "Coming in a later phase", FileText),
    ],
  },
  {
    key: "inventory-management",
    label: "Inventory Management",
    icon: Package,
    modules: [
      moduleItem("stock-management", "Stock Management", "Review inventory workspace", Package, "/inventory"),
      moduleItem("purchase-orders", "Purchase Orders", "Coming in a later phase", ClipboardList),
      moduleItem("vendor-management", "Vendor Management", "Coming in a later phase", Truck),
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    icon: LayoutDashboard,
    modules: [
      moduleItem("mis-dashboard", "MIS Dashboard", "Review operational metrics", LayoutDashboard, "/analytics"),
      moduleItem("mis-reports", "MIS Reports", "Coming in a later phase", FileBarChart),
      moduleItem("revenue-analytics", "Revenue Analytics", "Review revenue trends", BarChart3, "/analytics"),
      moduleItem("operational-reports", "Operational Reports", "Coming in a later phase", Microscope),
    ],
  },
  {
    key: "emergency",
    label: "Emergency",
    icon: Ambulance,
    modules: [
      moduleItem("emergency-triage", "Emergency Triage", "Open emergency workspace", Ambulance, "/emergency"),
      moduleItem("ambulance-management", "Ambulance Management", "Coming in a later phase", Truck),
      moduleItem("critical-care", "Critical Care", "Coming in a later phase", HeartPulse),
    ],
  },
];
