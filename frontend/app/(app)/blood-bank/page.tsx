"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Droplets, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { fetchBloodBankOrders, updateBloodBankOrderStatus, type BloodBankOrder, type BloodBankPriority, type BloodBankStatus } from "@/lib/blood-bank";
import styles from "./page.module.css";

const STATUS_OPTIONS: { value: "ALL" | BloodBankStatus; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "ORDERED", label: "ORDERED" },
  { value: "REQUESTED", label: "REQUESTED" },
  { value: "PROCESSING", label: "PROCESSING" },
  { value: "ISSUED", label: "ISSUED" },
  { value: "COMPLETED", label: "COMPLETED" },
  { value: "CANCELLED", label: "CANCELLED" },
];

const PRIORITY_OPTIONS = [
  { value: "ALL", label: "All priorities" },
  { value: "STAT", label: "STAT" },
  { value: "URGENT", label: "URGENT" },
  { value: "ROUTINE", label: "ROUTINE" },
];

function statusVariant(status: BloodBankStatus) {
  if (status === "ORDERED") return "primary";
  if (status === "REQUESTED") return "warning";
  if (status === "PROCESSING") return "info";
  if (status === "ISSUED" || status === "COMPLETED") return "success";
  return "danger";
}

function priorityVariant(priority: BloodBankPriority) {
  if (priority === "STAT") return "danger";
  if (priority === "URGENT") return "warning";
  return "success";
}

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-IN") : "—";
}

export default function BloodBankPage() {
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [orders, setOrders] = useState<BloodBankOrder[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | BloodBankStatus>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | BloodBankPriority>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetchBloodBankOrders(token, {
        q: search.trim() || undefined,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        priority: priorityFilter === "ALL" ? undefined : priorityFilter,
      });
      setOrders(response.orders);
      setSelectedId((current) => current && response.orders.some((order) => order.id === current)
        ? current
        : response.orders[0]?.id ?? null);
    } catch (requestError) {
      toastError("Unable to load Blood Bank queue.", requestError instanceof Error ? requestError.message : "Please check the backend and retry.");
    } finally {
      setLoading(false);
    }
  }, [token, search, statusFilter, priorityFilter, toastError]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedId) ?? null, [orders, selectedId]);
  const rows = useMemo(() => orders as Array<BloodBankOrder & Record<string, unknown>>, [orders]);

  const transition = async (status: BloodBankStatus) => {
    if (!token || !selectedOrder) return;
    const orderId = selectedOrder.id;
    setSaving(true);
    try {
      const response = await updateBloodBankOrderStatus(token, orderId, status);
      setOrders((current) => current.map((order) => order.id === orderId ? response.order : order));
      success("Blood request updated.", `Request is now ${response.order.status}.`);
    } catch (requestError) {
      toastError("Unable to update blood request.", requestError instanceof Error ? requestError.message : "Please retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Blood Bank"
        subtitle="CPOE blood-product requests and issue status."
        icon={<Droplets size={18} />}
        accent="danger"
        actions={<Button variant="secondary" loading={loading} leftIcon={<RefreshCw size={15} />} onClick={() => void loadOrders()}>Refresh queue</Button>}
      />

      <Card noPadding>
        <div className={styles.toolbar}>
          <div className={styles.search}><Input label="Search" placeholder="Patient / UHID / component / order" value={search} onChange={(event) => setSearch(event.target.value)} leftIcon={<Search size={15} />} /></div>
          <div className={styles.filters}>
            <Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | BloodBankStatus)} options={STATUS_OPTIONS} />
            <Select label="Priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as "ALL" | BloodBankPriority)} options={PRIORITY_OPTIONS} />
          </div>
        </div>
      </Card>

      <DataTable
        columns={[
          { key: "patientName", header: "Patient", render: (_, row) => <><strong>{row.patientName}</strong><br /><span className={styles.muted}>{row.uhid}</span></> },
          { key: "bloodGroup", header: "Blood group" },
          { key: "component", header: "Component" },
          { key: "quantity", header: "Quantity", render: (_, row) => `${row.quantity} unit${row.quantity === 1 ? "" : "s"}` },
          { key: "priority", header: "Priority", render: (_, row) => <Badge variant={priorityVariant(row.priority)} size="sm">{row.priority}</Badge> },
          { key: "status", header: "Status", render: (_, row) => <Badge variant={statusVariant(row.status)} size="sm">{row.status}</Badge> },
          { key: "orderedAt", header: "Requested", render: (_, row) => dateTime(row.orderedAt) },
          { key: "action", header: "Action", render: (_, row) => <Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id); }}>Open</Button> },
        ]}
        data={rows}
        rowKey={(row) => row.id}
        onRowClick={(row) => setSelectedId(row.id)}
        loading={loading}
        emptyTitle="No blood requests found"
        emptyDescription="Blood Bank orders created through CPOE appear here."
      />

      {selectedOrder && (
        <div className={styles.detailGrid}>
          <Card className={styles.detailCard}>
            <div className={styles.detailHeader}>
              <div><h2>{selectedOrder.patientName}</h2><p>{selectedOrder.uhid} · {selectedOrder.age} yrs · {selectedOrder.sex}</p></div>
              <Badge variant={statusVariant(selectedOrder.status)} size="sm">{selectedOrder.status}</Badge>
            </div>
            <div className={styles.details}>
              <Fact label="Blood group" value={selectedOrder.bloodGroup} />
              <Fact label="Component" value={selectedOrder.component} />
              <Fact label="Quantity" value={`${selectedOrder.quantity} unit${selectedOrder.quantity === 1 ? "" : "s"}`} />
              <Fact label="Priority" value={selectedOrder.priority} />
              <Fact label="CPOE order" value={selectedOrder.cpoeOrderNumber} />
              <Fact label="Ordering clinician" value={selectedOrder.orderedByName} />
              <Fact label="Order date" value={dateTime(selectedOrder.orderedAt)} />
              <Fact label="Clinical indication" value={selectedOrder.clinicalIndication} />
            </div>
            {selectedOrder.clinicalInstructions && <p className={styles.instructions}><strong>Instructions:</strong> {selectedOrder.clinicalInstructions}</p>}
            {selectedOrder.notes && <p className={styles.instructions}><strong>Notes:</strong> {selectedOrder.notes}</p>}
            <div className={styles.timeline}>
              {selectedOrder.requestedAt && <Fact label="Requested" value={`${selectedOrder.requestedByName || "Staff"} · ${dateTime(selectedOrder.requestedAt)}`} />}
              {selectedOrder.processingAt && <Fact label="Processing" value={`${selectedOrder.processingByName || "Staff"} · ${dateTime(selectedOrder.processingAt)}`} />}
              {selectedOrder.issuedAt && <Fact label="Issued" value={`${selectedOrder.issuedByName || "Staff"} · ${dateTime(selectedOrder.issuedAt)}`} />}
              {selectedOrder.completedAt && <Fact label="Completed" value={`${selectedOrder.completedByName || "Staff"} · ${dateTime(selectedOrder.completedAt)}`} />}
            </div>
            <div className={styles.actions}>
              {selectedOrder.status === "ORDERED" && <Button disabled={saving} onClick={() => void transition("REQUESTED")}>Request blood</Button>}
              {selectedOrder.status === "REQUESTED" && <Button disabled={saving} onClick={() => void transition("PROCESSING")}>Start processing</Button>}
              {(selectedOrder.status === "REQUESTED" || selectedOrder.status === "PROCESSING") && <Button variant="success" disabled={saving} onClick={() => void transition("ISSUED")}>Issue component</Button>}
              {selectedOrder.status === "ISSUED" && <Button variant="success" disabled={saving} onClick={() => void transition("COMPLETED")}>Complete request</Button>}
              {(selectedOrder.status === "ORDERED" || selectedOrder.status === "REQUESTED" || selectedOrder.status === "PROCESSING") && <Button variant="ghost" disabled={saving} onClick={() => void transition("CANCELLED")}>Cancel request</Button>}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return <div className={styles.fact}><span>{label}</span><strong>{value || "—"}</strong></div>;
}
