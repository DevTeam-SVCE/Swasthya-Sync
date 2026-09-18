import {
  LayoutDashboard,
  Users,
  BedDouble,
  Stethoscope,
  FlaskConical,
  Scan,
  Pill,
  HeartPulse,
  Scissors,
  Droplets,
  Package,
  Receipt,
  TrendingUp,
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  FileText,
  Settings,
  Users2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  badge?: string;
  children?: NavItem[];
}

export interface NavGroup {
  groupLabel: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    groupLabel: "Overview",
    items: [
      {
        key: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    groupLabel: "Patient Administration",
    items: [
      {
        key: "patients",
        label: "Patients",
        href: "/patients",
        icon: Users,
      },
      {
        key: "appointments",
        label: "Appointments",
        href: "/appointments",
        icon: CalendarDays,
      },
      {
        key: "opd",
        label: "OPD Queue",
        href: "/opd",
        icon: ClipboardList,
      },
      {
        key: "ipd",
        label: "IPD / Beds",
        href: "/ipd",
        icon: BedDouble,
      },
      {
        key: "emergency",
        label: "Emergency",
        href: "/emergency",
        icon: AlertTriangle,
      },
    ],
  },
  {
    groupLabel: "Clinical",
    items: [
      {
        key: "cpoe",
        label: "CPOE",
        href: "/cpoe",
        icon: ClipboardList,
      },
      {
        key: "forms",
        label: "Patient Forms",
        href: "/forms",
        icon: FileText,
      },
      {
        key: "clinical-notes",
        label: "Clinical Notes",
        href: "/clinical-notes",
        icon: Stethoscope,
      },
      {
        key: "discharge",
        label: "Discharge Summary",
        href: "/discharge",
        icon: FileText,
      },
    ],
  },
  {
    groupLabel: "Diagnostics",
    items: [
      {
        key: "laboratory",
        label: "Laboratory",
        href: "/laboratory",
        icon: FlaskConical,
      },
      {
        key: "radiology",
        label: "Radiology",
        href: "/radiology",
        icon: Scan,
      },
    ],
  },
  {
    groupLabel: "Care Departments",
    items: [
      {
        key: "pharmacy",
        label: "Pharmacy",
        href: "/pharmacy",
        icon: Pill,
      },
      {
        key: "nursing",
        label: "Nursing",
        href: "/nursing",
        icon: HeartPulse,
      },
      {
        key: "ot",
        label: "Operation Theatre",
        href: "/ot",
        icon: Scissors,
      },
      {
        key: "blood-bank",
        label: "Blood Bank",
        href: "/blood-bank",
        icon: Droplets,
      },
    ],
  },
  {
    groupLabel: "Finance",
    items: [
      {
        key: "billing",
        label: "Billing",
        href: "/billing",
        icon: Receipt,
      },
      {
        key: "revenue-cycle",
        label: "Revenue Cycle",
        href: "/revenue-cycle",
        icon: TrendingUp,
      },
    ],
  },
  {
    groupLabel: "Operations",
    items: [
      {
        key: "inventory",
        label: "Inventory",
        href: "/inventory",
        icon: Package,
      },
      {
        key: "analytics",
        label: "Analytics & MIS",
        href: "/analytics",
        icon: TrendingUp,
      },
    ],
  },
  {
    groupLabel: "Administration",
    items: [
      {
        key: "staff",
        label: "Staff Management",
        href: "/staff",
        icon: Users2,
        adminOnly: true,
      },
      {
        key: "form-templates",
        label: "Form Templates",
        href: "/form-templates",
        icon: FileText,
        adminOnly: true,
      },
      {
        key: "audit-log",
        label: "Audit Log",
        href: "/audit-log",
        icon: ShieldCheck,
        adminOnly: true,
      },
      {
        key: "settings",
        label: "Settings",
        href: "/settings",
        icon: Settings,
      },
    ],
  },
];
