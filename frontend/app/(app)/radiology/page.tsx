"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { RefreshCw, Scan, Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import {
  completeRadiologyOrder,
  fetchRadiologyOrder,
  fetchRadiologyOrders,
  saveRadiologyReport,
  scheduleRadiologyOrder,
  startRadiologyOrder,
  verifyRadiologyOrder,
  type RadiologyOrder,
  type RadiologyStatus,
} from "@/lib/radiology";
import styles from "./page.module.css";

const STATUSES: { value: "ALL" | RadiologyStatus; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "ORDERED", label: "ORDERED" },
  { value: "SCHEDULED", label: "SCHEDULED" },
  { value: "IN_PROGRESS", label: "IN_PROGRESS" },
  { value: "COMPLETED", label: "COMPLETED" },
  { value: "VERIFIED", label: "VERIFIED" },
];

const PRIORITIES = [
  { value: "ALL", label: "All priorities" },
  { value: "STAT", label: "STAT" },
  { value: "URGENT", label: "URGENT" },
  { value: "ROUTINE", label: "ROUTINE" },
];

function statusVariant(status: RadiologyStatus) {
  if (status === "ORDERED") return "primary";
  if (status === "SCHEDULED") return "info";
  if (status === "IN_PROGRESS") return "warning";
  if (status === "COMPLETED" || status === "VERIFIED") return "success";
  return "default";
}

function priorityVariant(priority: RadiologyOrder["priority"]) {
  if (priority === "STAT") return "danger";
  if (priority === "URGENT") return "warning";
  return "success";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-IN") : "—";
}

export default function RadiologyPage() {
  const { token, user } = useAuth();
  const { success, error: toastError } = useToast();
  const [orders, setOrders] = useState<RadiologyOrder[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | RadiologyStatus>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | RadiologyOrder["priority"]>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [report, setReport] = useState({ findings: "", impression: "", remarks: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedId) ?? null, [orders, selectedId]);
  const tableRows = useMemo(() => orders as Array<RadiologyOrder & Record<string, unknown>>, [orders]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetchRadiologyOrders(token, {
          q: search.trim() || undefined,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          priority: priorityFilter === "ALL" ? undefined : priorityFilter,
        });
        if (!active) return;
        setOrders(response.orders);
        setSelectedId((current) => current && response.orders.some((order) => order.id === current)
          ? current
          : response.orders[0]?.id ?? null);
      } catch (requestError) {
        if (!active) return;
        const message = requestError instanceof Error ? requestError.message : "Unable to load the Radiology queue.";
        toastError("Radiology queue unavailable.", message);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [token, search, statusFilter, priorityFilter, refreshVersion, toastError]);

  useEffect(() => {
    if (!token || !selectedId) return;
    let active = true;
    void fetchRadiologyOrder(token, selectedId).then(({ order }) => {
      if (active) setOrders((current) => current.map((item) => item.id === order.id ? order : item));
    }).catch((requestError: unknown) => {
      if (!active) return;
      const message = requestError instanceof Error ? requestError.message : "Unable to load order details.";
      toastError("Order details unavailable.", message);
    });
    return () => { active = false; };
  }, [token, selectedId, toastError]);

  useEffect(() => {
    if (!selectedOrder) {
      setReport({ findings: "", impression: "", remarks: "" });
      return;
    }
    setReport({
      findings: selectedOrder.findings || "",
      impression: selectedOrder.impression || "",
      remarks: selectedOrder.remarks || "",
    });
  }, [selectedOrder?.id, selectedOrder?.findings, selectedOrder?.impression, selectedOrder?.remarks]);

  const applyOrder = (order: RadiologyOrder) => {
    setOrders((current) => current.map((item) => item.id === order.id ? order : item));
    setSelectedId(order.id);
  };

  const runAction = async (
    action: (accessToken: string, id: string) => Promise<{ order: RadiologyOrder }>,
    message: string
  ) => {
    if (!token || !selectedOrder) return;
    setSaving(true);
    try {
      const response = await action(token, selectedOrder.id);
      applyOrder(response.order);
      success(message, `${response.order.examinationName} is now ${response.order.status}.`);
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "Please try again.";
      toastError(message, detail);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedOrder) return;
    setSaving(true);
    try {
      const response = await saveRadiologyReport(token, selectedOrder.id, report);
      applyOrder(response.order);
      success("Report saved.", "Your report remains associated with this examination.");
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "Please try again.";
      toastError("Report could not be saved.", detail);
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!report.findings.trim() || !report.impression.trim()) {
      toastError("Report is incomplete.", "Enter both findings and impression before completing the examination.");
      return;
    }
    if (!token || !selectedOrder) return;
    setSaving(true);
    try {
      const saved = await saveRadiologyReport(token, selectedOrder.id, report);
      const completed = await completeRadiologyOrder(token, saved.order.id);
      applyOrder(completed.order);
      success("Report completed.", `${completed.order.examinationName} is now COMPLETED.`);
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "Please try again.";
      toastError("Report could not be completed.", detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Radiology"
        subtitle="Radiology work queue, examination processing, report entry, and verification."
        icon={<Scan size={18} />}
        accent="info"
        actions={<Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => setRefreshVersion((version) => version + 1)}>Refresh queue</Button>}
      />

      <Card noPadding>
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <Input
              label="Search"
              placeholder="Patient / UHID / examination / modality"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              leftIcon={<Search size={15} />}
            />
          </div>
          <div className={styles.filters}>
            <Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | RadiologyStatus)} options={STATUSES} />
            <Select label="Priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)} options={PRIORITIES} />
          </div>
        </div>
      </Card>

      <DataTable
        columns={[
          { key: "patientName", header: "Patient", render: (_, row) => <><strong>{row.patientName}</strong><br /><span className={styles.muted}>{row.uhid}</span></> },
          { key: "uhid", header: "UHID" },
          { key: "cpoeOrderNumber", header: "CPOE ref." },
          { key: "examinationName", header: "Examination", render: (_, row) => <><strong>{row.examinationName}</strong><br /><span className={styles.muted}>{[row.modality, row.bodyPart].filter(Boolean).join(" · ") || "Modality / region not specified"}</span></> },
          { key: "priority", header: "Priority", render: (_, row) => <Badge variant={priorityVariant(row.priority)} size="sm">{row.priority}</Badge> },
          { key: "status", header: "Status", render: (_, row) => <Badge variant={statusVariant(row.status)} size="sm">{row.status}</Badge> },
          { key: "orderedAt", header: "Order date", render: (_, row) => formatDate(row.orderedAt) },
          { key: "action", header: "Action", render: (_, row) => <Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id); }}>Open</Button> },
        ]}
        data={tableRows}
        rowKey={(row) => row.id}
        onRowClick={(row) => setSelectedId(row.id)}
        loading={loading}
        emptyTitle="No Radiology orders found"
        emptyDescription="Radiology orders created through CPOE appear here."
      />

      {selectedOrder && (
        <div className={styles.detailGrid}>
          <Card className={styles.detailCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>{selectedOrder.patientName}</h2>
                <p className={styles.patientMeta}>{selectedOrder.uhid} · {selectedOrder.age} yrs · {selectedOrder.sex} · {selectedOrder.department}</p>
              </div>
              <Badge variant={statusVariant(selectedOrder.status)} size="sm">{selectedOrder.status}</Badge>
            </div>
            <div className={styles.metaGrid}>
              <Meta label="Examination" value={selectedOrder.examinationName} />
              <Meta label="Modality" value={selectedOrder.modality} />
              <Meta label="Body part / region" value={selectedOrder.bodyPart} />
              <Meta label="Clinical indication" value={selectedOrder.clinicalIndication} />
              <Meta label="Priority" value={selectedOrder.priority} />
              <Meta label="CPOE reference" value={selectedOrder.cpoeOrderNumber} />
              <Meta label="Ordered by" value={selectedOrder.orderedByName} />
              <Meta label="Order date" value={formatDate(selectedOrder.orderedAt)} />
              <Meta label="Performed by / at" value={selectedOrder.performedAt ? `${selectedOrder.performedByName || "—"} · ${formatDate(selectedOrder.performedAt)}` : "Not started"} />
              <Meta label="Completed by / at" value={selectedOrder.completedAt ? `${selectedOrder.completedByName || "—"} · ${formatDate(selectedOrder.completedAt)}` : "—"} />
              <Meta label="Verified by / at" value={selectedOrder.verifiedAt ? `${selectedOrder.verifiedByName || "—"} · ${formatDate(selectedOrder.verifiedAt)}` : "—"} />
            </div>
            {selectedOrder.clinicalInstructions && <p className={styles.instructions}><strong>Instructions:</strong> {selectedOrder.clinicalInstructions}</p>}
            {selectedOrder.notes && <p className={styles.instructions}><strong>Notes:</strong> {selectedOrder.notes}</p>}
            <div className={styles.actionRow}>
              {selectedOrder.status === "ORDERED" && <Button variant="secondary" loading={saving} onClick={() => void runAction(scheduleRadiologyOrder, "Examination scheduled.")}>Schedule</Button>}
              {(selectedOrder.status === "ORDERED" || selectedOrder.status === "SCHEDULED") && <Button variant="primary" loading={saving} onClick={() => void runAction(startRadiologyOrder, "Examination started.")}>Start examination</Button>}
              {selectedOrder.status === "COMPLETED" && user?.role === "admin" && <Button variant="success" loading={saving} onClick={() => void runAction(verifyRadiologyOrder, "Report verified.")}>Verify report</Button>}
              {selectedOrder.status === "COMPLETED" && user?.role !== "admin" && <span className={styles.muted}>Administrator verification required.</span>}
            </div>
          </Card>

          <Card className={styles.reportCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Radiology report</h2>
                <p className={styles.muted}>{selectedOrder.status === "IN_PROGRESS" ? "Draft changes are saved to this examination." : selectedOrder.status === "VERIFIED" ? "Verified report · read only" : "Report content and completion details."}</p>
              </div>
            </div>
            {selectedOrder.status === "IN_PROGRESS" ? (
              <form className={styles.reportForm} onSubmit={handleSaveReport}>
                <Textarea label="Findings" value={report.findings} onChange={(event) => setReport((current) => ({ ...current, findings: event.target.value }))} rows={5} />
                <Textarea label="Impression / conclusion" value={report.impression} onChange={(event) => setReport((current) => ({ ...current, impression: event.target.value }))} rows={3} />
                <Textarea label="Remarks" value={report.remarks} onChange={(event) => setReport((current) => ({ ...current, remarks: event.target.value }))} rows={2} />
                <div className={styles.actionRow}>
                  <Button type="submit" variant="secondary" loading={saving}>Save report</Button>
                  <Button type="button" variant="primary" loading={saving} onClick={() => void handleComplete()}>Complete report</Button>
                </div>
              </form>
            ) : (
              <div className={styles.reportReadOnly}>
                <ReportText label="Findings" value={selectedOrder.findings} />
                <ReportText label="Impression / conclusion" value={selectedOrder.impression} />
                <ReportText label="Remarks" value={selectedOrder.remarks} />
                {selectedOrder.status === "ORDERED" || selectedOrder.status === "SCHEDULED" ? <p className={styles.muted}>Start the examination to enter a report.</p> : null}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return <div className={styles.metaItem}><span className={styles.metaLabel}>{label}</span><span className={styles.metaValue}>{value || "—"}</span></div>;
}

function ReportText({ label, value }: { label: string; value?: string | null }) {
  return <div className={styles.reportText}><strong>{label}</strong><p>{value || "Not entered"}</p></div>;
}
