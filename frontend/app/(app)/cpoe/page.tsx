"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clock3, ClipboardList, RefreshCw, Search, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { fetchPatients } from "@/lib/patients";
import type { Patient } from "@/types/patients";
import {
  createCpoeOrder,
  fetchCpoeOrders,
  updateCpoeOrder,
  type CpoeOrder,
  type CpoeOrderCategory,
  type CpoeOrderPriority,
  type CpoeOrderStatus,
} from "@/lib/cpoe";
import styles from "./page.module.css";

const ORDER_CATEGORIES: { value: CpoeOrderCategory; label: string }[] = [
  { value: "Laboratory", label: "Laboratory" },
  { value: "Radiology", label: "Radiology" },
  { value: "Medication", label: "Medication" },
  { value: "Procedure", label: "Procedure" },
  { value: "Other", label: "Other" },
];

const ORDER_PRIORITIES: { value: CpoeOrderPriority; label: string }[] = [
  { value: "STAT", label: "STAT" },
  { value: "URGENT", label: "Urgent" },
  { value: "ROUTINE", label: "Routine" },
];

export default function CpoePage() {
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [orders, setOrders] = useState<CpoeOrder[]>([]);
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    category: "Laboratory" as CpoeOrderCategory,
    priority: "ROUTINE" as CpoeOrderPriority,
    orderItem: "",
    clinicalInstructions: "",
    notes: "",
  });

  const patientOrders = useMemo(
    () => (selectedPatient ? orders.filter((order) => order.patientId === selectedPatient.id) : orders),
    [orders, selectedPatient]
  );

  const loadOrders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetchCpoeOrders(token);
      setOrders(response.orders);
    } catch {
      setError("Unable to load CPOE orders.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const searchPatientsByName = async (value: string) => {
    if (!token || value.trim().length < 2) {
      setPatients([]);
      return;
    }
    setSearchingPatients(true);
    try {
      const response = await fetchPatients(token, value.trim());
      setPatients(response.patients.filter((patient) => patient.id !== selectedPatient?.id));
    } catch {
      setPatients([]);
    } finally {
      setSearchingPatients(false);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOrders();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadOrders]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !selectedPatient) {
      toastError("Select a patient before ordering.", "Use the patient lookup to choose the existing record.");
      return;
    }
    if (!form.orderItem.trim()) {
      toastError("Order item is required.", "Enter the requested investigation, medication, or procedure.");
      return;
    }

    try {
      setSubmitting(true);
      await createCpoeOrder(token, {
        patientId: selectedPatient.id,
        category: form.category,
        orderItem: form.orderItem,
        priority: form.priority,
        clinicalInstructions: form.clinicalInstructions || undefined,
        notes: form.notes || undefined,
      });
      success("CPOE order created.", `${selectedPatient.fullName} has a new ${form.category.toLowerCase()} order.`);
      setForm({ category: "Laboratory", priority: "ROUTINE", orderItem: "", clinicalInstructions: "", notes: "" });
      setSelectedPatient(null);
      setSearch("");
      setPatients([]);
      await loadOrders();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to create order.";
      toastError("Unable to save order.", message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (order: CpoeOrder, status: CpoeOrderStatus) => {
    if (!token) return;
    try {
      await updateCpoeOrder(token, order.id, { status });
      success("Order updated.", `${order.orderNumber} moved to ${status}.`);
      await loadOrders();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to update order.";
      toastError("Unable to update status.", message);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>CPOE</h1>
          <p className={styles.subtitle}>Computerised physician order entry for existing patient encounters.</p>
        </div>
        <Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => void loadOrders()}>
          Refresh orders
        </Button>
      </div>

      <div className={styles.grid}>
        <Card className={styles.panel} noPadding>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.sectionTitle}>New clinical order</h2>
              <p className={styles.sectionSubtitle}>Select a patient and create an order for the care team.</p>
            </div>
            <Badge variant="primary" size="sm" dot>
              {orders.length} total
            </Badge>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.searchWrap}>
              <Input
                label="Search patient"
                placeholder="Search by name, UHID, or mobile"
                value={search}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setSearch(nextValue);
                  void searchPatientsByName(nextValue);
                }}
                leftIcon={<Search size={15} />}
              />
              {searchingPatients && <p className={styles.muted}>Searching patients…</p>}
              {patients.length > 0 && (
                <div className={styles.searchResults}>
                  {patients.map((patient) => (
                    <button
                      key={patient.id}
                      type="button"
                      className={styles.resultItem}
                      onClick={() => {
                        setSelectedPatient(patient);
                        setSearch("");
                        setPatients([]);
                      }}
                    >
                      <span>
                        <strong>{patient.fullName}</strong>
                        <small>{patient.uhid}</small>
                      </span>
                      <span className={styles.muted}>{patient.department}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedPatient ? (
              <div className={styles.selectedPatient}>
                <div>
                  <strong>{selectedPatient.fullName}</strong>
                  <div className={styles.muted}>{selectedPatient.uhid} · {selectedPatient.age} yrs · {selectedPatient.gender}</div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedPatient(null)}>
                  Change patient
                </Button>
              </div>
            ) : (
              <div className={styles.emptyState}>No patient selected.</div>
            )}

            <div className={styles.formGrid}>
              <Select
                label="Order category"
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as CpoeOrderCategory }))}
                options={ORDER_CATEGORIES}
              />
              <Select
                label="Priority"
                value={form.priority}
                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as CpoeOrderPriority }))}
                options={ORDER_PRIORITIES}
              />
            </div>

            <Input
              label="Order item"
              value={form.orderItem}
              onChange={(event) => setForm((current) => ({ ...current, orderItem: event.target.value }))}
              placeholder="e.g. CBC with differential, X-ray chest AP, Metformin 500mg"
            />

            <Textarea
              label="Clinical instructions"
              value={form.clinicalInstructions}
              onChange={(event) => setForm((current) => ({ ...current, clinicalInstructions: event.target.value }))}
              placeholder="Instructions for the ordering clinician or downstream team."
              rows={3}
            />

            <Textarea
              label="Notes"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Additional notes, reasons, or follow-up details."
              rows={3}
            />

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actionsRow}>
              <Button type="submit" loading={submitting} leftIcon={<Stethoscope size={15} />}>
                Save order
              </Button>
            </div>
          </form>
        </Card>

        <Card className={styles.panel} noPadding>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Order history</h2>
              <p className={styles.sectionSubtitle}>Recent orders for the selected patient or all active entries.</p>
            </div>
            <Badge variant="info" size="sm">{patientOrders.length} shown</Badge>
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading orders…</div>
          ) : patientOrders.length === 0 ? (
            <div className={styles.emptyState}>No clinical orders found.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {patientOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <div className={styles.orderNumber}>{order.orderNumber}</div>
                        <div className={styles.meta}><ClipboardList size={12} /> {order.orderItem}</div>
                        {order.patientName && <div className={styles.meta}>{order.patientName}</div>}
                      </td>
                      <td>{order.category}</td>
                      <td>
                        <Badge variant={order.priority === "STAT" ? "danger" : order.priority === "URGENT" ? "warning" : "success"} size="sm">
                          {order.priority}
                        </Badge>
                      </td>
                      <td>
                        <Badge variant={order.status === "ORDERED" ? "primary" : order.status === "IN_PROGRESS" ? "info" : order.status === "COMPLETED" ? "success" : "danger"} size="sm">
                          {order.status}
                        </Badge>
                      </td>
                      <td>
                        <div className={styles.meta}><Clock3 size={12} /> {new Date(order.orderedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
                      </td>
                      <td>
                        <div className={styles.actionStack}>
                          <Button type="button" variant="secondary" size="sm" onClick={() => void updateStatus(order, "IN_PROGRESS")}>
                            Start
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => void updateStatus(order, "COMPLETED")}>
                            Complete
                          </Button>
                          <Link className={styles.link} href={`/patients/${order.patientId}`}>
                            Patient
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
