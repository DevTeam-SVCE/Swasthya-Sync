"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Pill, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { DataTable } from "@/components/ui/DataTable";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import {
  dispensePharmacyOrder,
  fetchPharmacyOrders,
  type PharmacyOrder,
  type PharmacyOrderStatus,
} from "@/lib/pharmacy";
import styles from "./page.module.css";

const PHARMACY_STATUSES: { value: "ALL" | PharmacyOrderStatus; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ORDERED", label: "ORDERED" },
  { value: "DISPENSING", label: "DISPENSING" },
  { value: "DISPENSED", label: "DISPENSED" },
  { value: "CANCELLED", label: "CANCELLED" },
];

const PHARMACY_PRIORITIES = [
  { value: "ALL", label: "All" },
  { value: "STAT", label: "STAT" },
  { value: "URGENT", label: "Urgent" },
  { value: "ROUTINE", label: "Routine" },
];

function parseDispenseQuantity(value: string | number | null | undefined): number | null {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function statusVariant(status: PharmacyOrderStatus) {
  if (status === "ORDERED") return "primary";
  if (status === "DISPENSING") return "warning";
  if (status === "DISPENSED") return "success";
  if (status === "CANCELLED") return "danger";
  return "default";
}

function priorityVariant(priority: PharmacyOrder["priority"]) {
  if (priority === "STAT") return "danger";
  if (priority === "URGENT") return "warning";
  return "success";
}

export default function PharmacyPage() {
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | PharmacyOrderStatus>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | PharmacyOrder["priority"]>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadOrders = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetchPharmacyOrders(token, {
        status: statusFilter === "ALL" ? undefined : statusFilter,
        priority: priorityFilter === "ALL" ? undefined : priorityFilter,
        q: search.trim() || undefined,
      });
      setOrders(response.orders);
      if (!selectedId && response.orders.length > 0) setSelectedId(response.orders[0].id);
      if (selectedId && !response.orders.some((order) => order.id === selectedId)) setSelectedId(response.orders[0]?.id ?? null);
    } catch {
      toastError("Unable to load pharmacy queue.", "Please check the backend and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void loadOrders();
  }, [token, statusFilter, priorityFilter, search]);

  const filteredOrders = useMemo<PharmacyOrder[]>(() => orders, [orders]);
  const selectedOrder = filteredOrders.find((order) => order.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedOrder) return;
    const parsedDefault = parseDispenseQuantity(selectedOrder.quantityDispensed ?? selectedOrder.quantity);
    setQuantity(parsedDefault ? String(parsedDefault) : "1");
    setRemarks(selectedOrder.remarks ?? "");
  }, [selectedOrder]);

  const handleDispense = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedOrder) return;

    const parsed = parseDispenseQuantity(quantity);
    if (parsed === null) {
      toastError("Valid quantity required.", "Quantity dispensed must be greater than zero.");
      return;
    }

    setSaving(true);
    try {
      await dispensePharmacyOrder(token, selectedOrder.id, { quantityDispensed: parsed, remarks: remarks || undefined });
      success("Medication dispensed.", `${selectedOrder.medicationName} has been marked as dispensed.`);
      setQuantity("1");
      setRemarks("");
      await loadOrders();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to dispense medication.";
      toastError("Dispense failed.", message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Pharmacy"
        subtitle="Medication queue, review, and dispensing workflow for CPOE orders."
        icon={<Pill size={18} />}
        accent="info"
        actions={
          <Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => void loadOrders()}>
            Refresh queue
          </Button>
        }
      />

      <Card noPadding>
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <Input
              label="Search"
              placeholder="Patient / UHID / medication / order"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              leftIcon={<Search size={15} />}
            />
          </div>
          <div className={styles.filters}>
            <Select
              label="Status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | PharmacyOrderStatus)}
              options={PHARMACY_STATUSES}
            />
            <Select
              label="Priority"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as "ALL" | PharmacyOrder["priority"])}
              options={PHARMACY_PRIORITIES}
            />
          </div>
        </div>
      </Card>

      <DataTable
        columns={[
          { key: "patient", header: "Patient", render: (_, row) => (
            <div>
              <strong>{row.patientName}</strong><br />
              <span className={styles.muted}>{row.uhid}</span>
            </div>
          )},
          { key: "uhid", header: "UHID", render: (_, row) => row.uhid },
          { key: "medicationName", header: "Medication", render: (_, row) => row.medicationName },
          { key: "dose", header: "Dose", render: (_, row) => row.dose || "—" },
          { key: "frequency", header: "Frequency", render: (_, row) => row.frequency || "—" },
          { key: "priority", header: "Priority", render: (_, row) => (
            <Badge variant={priorityVariant(row.priority)} size="sm">{row.priority}</Badge>
          )},
          { key: "status", header: "Status", render: (_, row) => (
            <Badge variant={statusVariant(row.status)} size="sm">{row.status}</Badge>
          )},
          { key: "action", header: "Action", render: (_, row) => (
            <Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id); }}>
              Open
            </Button>
          )},
        ]}
        data={filteredOrders as Array<PharmacyOrder & Record<string, unknown>>}
        rowKey={(row) => row.id}
        onRowClick={(row) => setSelectedId(row.id)}
        loading={loading}
        emptyTitle="No medication orders found"
        emptyDescription="Orders created through CPOE will appear here automatically."
      />

      {selectedOrder && (
        <div className={styles.detailGrid}>
          <Card className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
              <div>
                <h2>{selectedOrder.patientName}</h2>
                <div className={styles.muted}>{selectedOrder.uhid} · {selectedOrder.age} yrs · {selectedOrder.sex}</div>
              </div>
              <Badge variant={statusVariant(selectedOrder.status)} size="sm">{selectedOrder.status}</Badge>
            </div>

            <div className={styles.metaGrid}>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Medication</span><span className={styles.metaValue}>{selectedOrder.medicationName}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Dose</span><span className={styles.metaValue}>{selectedOrder.dose || "—"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Route</span><span className={styles.metaValue}>{selectedOrder.route || "—"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Frequency</span><span className={styles.metaValue}>{selectedOrder.frequency || "—"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Duration</span><span className={styles.metaValue}>{selectedOrder.duration || "—"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Quantity</span><span className={styles.metaValue}>{selectedOrder.quantity || "—"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Priority</span><span className={styles.metaValue}><Badge variant={priorityVariant(selectedOrder.priority)} size="sm">{selectedOrder.priority}</Badge></span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>CPOE order</span><span className={styles.metaValue}>{selectedOrder.cpoeOrderNumber}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Prescribed by</span><span className={styles.metaValue}>{selectedOrder.orderedByName}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Order date</span><span className={styles.metaValue}>{new Date(selectedOrder.orderedAt).toLocaleString("en-IN")}</span></div>
            </div>
          </Card>

          <Card className={styles.orderCard}>
            <h3>Dispense medication</h3>
            <form onSubmit={handleDispense} className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <Input
                  label="Quantity dispensed"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  placeholder="1"
                />
              </div>
              <div className={styles.metaItem}>
                <Input
                  label="Remarks"
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Optional remarks"
                />
              </div>
              <div className={styles.inlineActions}>
                <Button type="submit" variant="primary" loading={saving} disabled={selectedOrder.status === "DISPENSED" || selectedOrder.status === "CANCELLED"}>
                  Dispense
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
