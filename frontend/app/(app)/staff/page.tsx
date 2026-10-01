"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BriefcaseBusiness, Check, KeyRound, Pencil, Plus, RefreshCw, Search, ShieldCheck, Stethoscope, UserRound, UserRoundX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/context/AuthContext";
import {
  createStaff,
  createStaffLogin,
  fetchStaff,
  fetchStaffOptions,
  updateStaff,
  updateStaffStatus,
  type StaffFilters,
  type StaffInput,
  type StaffLoginInput,
  type StaffMember,
  type StaffOptions,
  type StaffProfileInput,
  type StaffRole,
} from "@/lib/staff";
import styles from "./page.module.css";

const blankInput: StaffInput = {
  fullName: "",
  staffId: "",
  email: "",
  phone: "",
  role: "STAFF",
  designation: "",
  department: "",
  seniority: "",
  qualification: "",
  dateOfJoining: "",
  password: "",
  confirmPassword: "",
};

const emptyStats = { admins: 0, doctors: 0, frontDesk: 0, staff: 0 };
const emptyOptions: StaffOptions = { roles: ["ADMIN", "DOCTOR", "FRONT_DESK", "STAFF"], statuses: ["ACTIVE", "SUSPENDED"], seniorities: [], departments: [], designations: [] };

function roleLabel(role: StaffRole) {
  if (role === "ADMIN") return "Admin";
  if (role === "DOCTOR") return "Doctor";
  if (role === "FRONT_DESK") return "Front Desk";
  return "Staff";
}

function formatJoiningDate(value: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "—";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export default function StaffManagementPage() {
  const { token } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [stats, setStats] = useState(emptyStats);
  const [total, setTotal] = useState(0);
  const [options, setOptions] = useState<StaffOptions>(emptyOptions);
  const [draftFilters, setDraftFilters] = useState<StaffFilters>({ q: "", role: "", designation: "", department: "", status: "" });
  const [filters, setFilters] = useState<StaffFilters>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<StaffInput>(blankInput);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [loginFor, setLoginFor] = useState<StaffMember | null>(null);
  const [loginForm, setLoginForm] = useState<StaffLoginInput>({ email: "", password: "", confirmPassword: "" });
  const [loginSaving, setLoginSaving] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (!token) return;
    let active = true;
    void fetchStaffOptions(token).then((result) => {
      if (active) setOptions(result);
    }).catch(() => {
      if (active) setError("Unable to load staff form options.");
    });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void fetchStaff(token, filters).then((result) => {
      if (active) {
        setStaff(result.staff);
        setStats(result.stats);
        setTotal(result.total);
        setError("");
      }
    }).catch(() => {
      if (active) setError("Unable to load staff records. Check the backend connection and try again.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token, filters]);

  const refresh = () => {
    setLoading(true);
    setFilters((current) => ({ ...current }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(blankInput);
    setFormError("");
    setDrawerOpen(true);
  };

  const openEdit = (member: StaffMember) => {
    setEditing(member);
    setForm({
      fullName: member.fullName,
      staffId: member.staffId ?? "",
      email: member.email ?? "",
      phone: member.phone ?? "",
      role: member.role,
      designation: member.designation ?? "",
      department: member.department ?? "",
      seniority: member.seniority ?? "",
      qualification: member.qualification ?? "",
      dateOfJoining: member.dateOfJoining ?? "",
    });
    setFormError("");
    setDrawerOpen(true);
  };

  const openCreateLogin = (member: StaffMember) => {
    setLoginFor(member);
    setLoginForm({ email: "", password: "", confirmPassword: "" });
    setLoginError("");
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !loginFor) return;
    setLoginSaving(true);
    setLoginError("");
    try {
      await createStaffLogin(token, loginFor.id, loginForm);
      setLoginFor(null);
      setNotice(`Login created for ${loginFor.fullName}.`);
      refresh();
    } catch (cause) {
      setLoginError(cause instanceof Error ? cause.message : "Unable to create this login.");
    } finally {
      setLoginSaving(false);
    }
  };

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setFilters({ ...draftFilters });
  };

  const submitStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setFormError("");
    try {
      if (editing) await updateStaff(token, editing.id, form as StaffProfileInput);
      else await createStaff(token, form);
      setDrawerOpen(false);
      setNotice(editing ? "Staff record updated." : "Staff login created.");
      refresh();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Unable to save staff record.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (member: StaffMember) => {
    if (!token) return;
    setBusyId(member.id);
    setError("");
    try {
      await updateStaffStatus(token, member.id, member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE");
      setNotice(member.status === "ACTIVE" ? "Staff account suspended." : "Staff account activated.");
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update staff status.");
    } finally {
      setBusyId("");
    }
  };

  const columns: DataTableColumn<StaffMember>[] = [
    {
      key: "fullName",
      header: "Staff Member",
      sortable: true,
      render: (_value, member) => <div className={styles.memberCell}><span className={styles.avatar}>{member.fullName.slice(0, 1).toUpperCase()}</span><span className={styles.memberText}><strong>{member.fullName}</strong><span>{member.loginId || "Login: Not created"}</span></span></div>,
    },
    { key: "staffId", header: "Staff ID", sortable: true },
    { key: "role", header: "Role", render: (value) => <Badge variant={value === "ADMIN" ? "primary" : value === "DOCTOR" ? "info" : value === "FRONT_DESK" ? "warning" : "default"} size="sm">{roleLabel(value as StaffRole)}</Badge> },
    { key: "designation", header: "Designation", sortable: true },
    { key: "department", header: "Department", sortable: true },
    { key: "qualification", header: "Qualification" },
    { key: "phone", header: "Phone", render: (value) => value ? <a className={styles.phoneLink} href={`tel:${String(value)}`}>{String(value)}</a> : "—" },
    { key: "dateOfJoining", header: "Date of Joining", render: (_value, member) => formatJoiningDate(member.dateOfJoining) },
    { key: "status", header: "Status", render: (value) => <Badge variant={value === "ACTIVE" ? "success" : "danger"} size="sm" dot>{String(value)}</Badge> },
    {
      key: "actions",
      header: "Actions",
      render: (_value, member) => <div className={styles.rowActions}>
        {!member.userId && <Button type="button" variant="ghost" size="sm" aria-label={`Create login for ${member.fullName}`} title="Create Staff Login" onClick={() => openCreateLogin(member)}><KeyRound size={15} /></Button>}
        <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${member.fullName}`} title="Edit staff" onClick={() => openEdit(member)}><Pencil size={15} /></Button>
        <Button type="button" variant="ghost" size="sm" aria-label={`${member.status === "ACTIVE" ? "Suspend" : "Activate"} ${member.fullName}`} title={member.status === "ACTIVE" ? "Suspend account" : "Activate account"} loading={busyId === member.id} onClick={() => void toggleStatus(member)}>{member.status === "ACTIVE" ? <UserRoundX size={15} /> : <Check size={15} />}</Button>
      </div>,
    },
  ];

  const statsCards = [
    { label: "Doctors", value: stats.doctors, icon: Stethoscope, tone: "blue" },
    { label: "Front Desk", value: stats.frontDesk, icon: UserRound, tone: "amber" },
    { label: "Staff", value: stats.staff, icon: BriefcaseBusiness, tone: "green" },
    { label: "Admin", value: stats.admins, icon: ShieldCheck, tone: "amber" },
  ];
  const roleOptions = options.roles.map((role) => ({ value: role, label: roleLabel(role) }));
  const statusOptions = options.statuses.map((status) => ({ value: status, label: status === "ACTIVE" ? "Active" : "Suspended" }));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Administration</p><h1 className={styles.title}>Staff Management</h1><p className={styles.subtitle}>Manage hospital staff information and login accounts.</p></div>
        <Button leftIcon={<Plus size={16} />} onClick={openCreate}>Create Staff Login</Button>
      </header>

      {notice && <div className={styles.notice} role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}
      {error && <div className={styles.error} role="alert"><span>{error}</span><Button variant="secondary" size="sm" leftIcon={<RefreshCw size={14} />} onClick={() => { setError(""); refresh(); }}>Retry</Button></div>}

      <section className={styles.statsGrid} aria-label="Staff account statistics">
        {statsCards.map(({ label, value, icon: Icon, tone }) => <Card key={label} className={styles.statCard}><span className={`${styles.statIcon} ${styles[`statIcon_${tone}`]}`}><Icon size={18} /></span><span className={styles.statCopy}><span>{label}</span><strong>{loading ? "—" : value.toLocaleString("en-IN")}</strong></span></Card>)}
      </section>

      <Card className={styles.directory} noPadding>
        <div className={styles.directoryHeader}><div><h2>Staff directory</h2><p>{loading ? "Loading records…" : `${total.toLocaleString("en-IN")} accounts`}</p></div><Button variant="secondary" size="sm" leftIcon={<RefreshCw size={14} />} loading={loading} onClick={refresh}>Refresh</Button></div>
        <form className={styles.filters} onSubmit={applyFilters}>
          <Input label="Search" placeholder="Search by name, Staff ID, Login ID, email, or phone" value={draftFilters.q ?? ""} onChange={(event) => setDraftFilters((current) => ({ ...current, q: event.target.value }))} leftIcon={<Search size={15} />} />
          <Select label="Main role" value={draftFilters.role ?? ""} onChange={(event) => setDraftFilters((current) => ({ ...current, role: event.target.value }))} options={[{ value: "", label: "All roles" }, ...roleOptions]} />
          <Select label="Designation" value={draftFilters.designation ?? ""} onChange={(event) => setDraftFilters((current) => ({ ...current, designation: event.target.value }))} options={[{ value: "", label: "All designations" }, ...options.designations.map((value) => ({ value, label: value }))]} />
          <Select label="Department" value={draftFilters.department ?? ""} onChange={(event) => setDraftFilters((current) => ({ ...current, department: event.target.value }))} options={[{ value: "", label: "All departments" }, ...options.departments.map((value) => ({ value, label: value }))]} />
          <Select label="Status" value={draftFilters.status ?? ""} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))} options={[{ value: "", label: "All statuses" }, ...statusOptions]} />
          <Button type="submit" leftIcon={<Search size={15} />}>Apply</Button>
        </form>
        {staff.length === 0 && !loading && !error ? <div className={styles.empty}><EmptyState title={total === 0 ? "No staff members found." : "No matching staff members."} description={total === 0 ? "Create a login account and add its hospital staff information." : "Try changing the search or filters."} icon={<UserRound size={24} />} action={total === 0 ? <Button leftIcon={<Plus size={15} />} onClick={openCreate}>Create Staff Login</Button> : undefined} /></div> : <div className={styles.tableWrap}><DataTable columns={columns} data={staff} loading={loading} rowKey={(member) => member.id} emptyTitle="No staff members found." /></div>}
      </Card>

      <StaffDrawer open={drawerOpen} editing={editing} form={form} options={options} saving={saving} error={formError} onClose={() => setDrawerOpen(false)} onChange={setForm} onSubmit={submitStaff} />
      <Drawer open={!!loginFor} onClose={() => setLoginFor(null)} title="Create Staff Login" subtitle={loginFor ? `Link a login to ${loginFor.fullName} (${loginFor.staffId || "no Staff ID"}).` : undefined} placement="right" size="md" footer={<div className={styles.drawerFooter}><Button variant="secondary" onClick={() => setLoginFor(null)} disabled={loginSaving}>Cancel</Button><Button type="submit" form="staff-login-form" loading={loginSaving}>Create login</Button></div>}>
        <form id="staff-login-form" className={styles.form} onSubmit={submitLogin}>
          {loginError && <div className={styles.formError} role="alert">{loginError}</div>}
          <Input label="Email / Login ID" type="email" autoComplete="email" required value={loginForm.email} onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))} />
          <Input label="Password" type="password" autoComplete="new-password" minLength={8} required value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} />
          <Input label="Confirm Password" type="password" autoComplete="new-password" minLength={8} required value={loginForm.confirmPassword} onChange={(event) => setLoginForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
          <p className={styles.loginHint}>This links the new account to the existing staff profile. Passwords are hashed and cannot be viewed later.</p>
        </form>
      </Drawer>
    </div>
  );
}

function StaffDrawer({
  open,
  editing,
  form,
  options,
  saving,
  error,
  onClose,
  onChange,
  onSubmit,
}: {
  open: boolean;
  editing: StaffMember | null;
  form: StaffInput;
  options: StaffOptions;
  saving: boolean;
  error: string;
  onClose: () => void;
  onChange: (value: StaffInput | ((current: StaffInput) => StaffInput)) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const roleOptions = options.roles.map((role) => ({ value: role, label: roleLabel(role) }));
  return <Drawer open={open} onClose={onClose} title={editing ? "Edit staff member" : "Create Staff Login"} subtitle={editing ? "Update account and staff information." : "Create an account that can sign in with the existing hospital login."} placement="right" size="xl" footer={<div className={styles.drawerFooter}><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" form="staff-form" loading={saving}>{editing ? "Save changes" : "Create login"}</Button></div>}>
    <form id="staff-form" className={styles.form} onSubmit={onSubmit}>
      {error && <div className={styles.formError} role="alert">{error}</div>}
      <div className={styles.formGrid}>
        <Input label="Full Name" autoComplete="name" maxLength={160} required value={form.fullName} onChange={(event) => onChange((current) => ({ ...current, fullName: event.target.value }))} />
        <Input label="Staff ID" maxLength={64} required={!editing} value={form.staffId} onChange={(event) => onChange((current) => ({ ...current, staffId: event.target.value }))} />
        {(!editing || editing.userId) && <Input label="Email / Login ID" type="email" autoComplete="email" required={!editing} value={form.email} onChange={(event) => onChange((current) => ({ ...current, email: event.target.value }))} />}
        <Input label="Phone" type="tel" autoComplete="tel" required={!editing} value={form.phone} onChange={(event) => onChange((current) => ({ ...current, phone: event.target.value }))} />
        <Select label="Main Role" required value={form.role} options={roleOptions} onChange={(event) => onChange((current) => ({ ...current, role: event.target.value as StaffRole }))} />
        <Select label="Designation" required={!editing} value={form.designation} options={[{ value: "", label: "Not assigned" }, ...options.designations.map((value) => ({ value, label: value }))]} onChange={(event) => onChange((current) => ({ ...current, designation: event.target.value }))} />
        <Select label="Department" required={!editing} value={form.department} options={[{ value: "", label: "Not assigned" }, ...options.departments.map((value) => ({ value, label: value }))]} onChange={(event) => onChange((current) => ({ ...current, department: event.target.value }))} />
        <Select label="Seniority" value={form.seniority} options={[{ value: "", label: "Not specified" }, ...options.seniorities.map((value) => ({ value, label: value }))]} onChange={(event) => onChange((current) => ({ ...current, seniority: event.target.value }))} />
        <Input label="Qualification" maxLength={200} required={!editing} value={form.qualification} onChange={(event) => onChange((current) => ({ ...current, qualification: event.target.value }))} />
        <Input label="Date of Joining" type="date" required={!editing} value={form.dateOfJoining} onChange={(event) => onChange((current) => ({ ...current, dateOfJoining: event.target.value }))} />
        {!editing && <>
          <Input label="Password" type="password" autoComplete="new-password" minLength={8} required value={form.password ?? ""} onChange={(event) => onChange((current) => ({ ...current, password: event.target.value }))} />
          <Input label="Confirm Password" type="password" autoComplete="new-password" minLength={8} required value={form.confirmPassword ?? ""} onChange={(event) => onChange((current) => ({ ...current, confirmPassword: event.target.value }))} />
        </>}
      </div>
      <p className={styles.loginHint}>Email is the login ID. Passwords are securely hashed and cannot be viewed after creation.</p>
    </form>
  </Drawer>;
}
