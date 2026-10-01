"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  { value: "Blood Bank", label: "Blood Bank" },
  { value: "Other", label: "Other" },
];

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const BLOOD_COMPONENTS = ["Whole blood", "Red blood cells", "Platelets", "Fresh frozen plasma", "Cryoprecipitate"];

function createInitialOrderForm() {
  return {
    category: "Laboratory" as CpoeOrderCategory,
    priority: "ROUTINE" as CpoeOrderPriority,
    orderItem: "",
    medicationName: "",
    modality: "",
    bodyPart: "",
    clinicalIndication: "",
    bloodGroup: "",
    bloodComponent: "",
    bloodQuantity: "",
    dose: "",
    route: "",
    frequency: "",
    duration: "",
    quantity: "",
    clinicalInstructions: "",
    notes: "",
  };
}

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
  const [form, setForm] = useState(createInitialOrderForm);
  const patientSearchRequestId = useRef(0);

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
    const requestId = ++patientSearchRequestId.current;
    if (!token || value.trim().length < 2) {
      setPatients([]);
      return;
    }
    setSearchingPatients(true);
    try {
      const response = await fetchPatients(token, value.trim());
      if (requestId === patientSearchRequestId.current) {
        setPatients(response.patients.filter((patient) => patient.id !== selectedPatient?.id));
      }
    } catch {
      if (requestId === patientSearchRequestId.current) setPatients([]);
    } finally {
      if (requestId === patientSearchRequestId.current) setSearchingPatients(false);
    }
  };

  const resetOrderDraft = () => {
    patientSearchRequestId.current += 1;
    setForm(createInitialOrderForm());
    setSelectedPatient(null);
    setSearch("");
    setPatients([]);
    setSearchingPatients(false);
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOrders();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadOrders]);

  const handleRefreshOrders = () => {
    resetOrderDraft();
    void loadOrders();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !selectedPatient) {
      toastError("Select a patient before ordering.", "Use the patient lookup to choose the existing record.");
      return;
    }

    const isMedicationOrder = form.category === "Medication";
    const isRadiologyOrder = form.category === "Radiology";
    const isBloodBankOrder = form.category === "Blood Bank";
    const medicationName = isMedicationOrder ? form.medicationName.trim() : form.orderItem.trim();
    const orderItem = isMedicationOrder ? medicationName : isBloodBankOrder ? form.bloodComponent.trim() : form.orderItem.trim();

    if (isMedicationOrder && !medicationName) {
      toastError("Medication name is required.", "Enter the medication before saving the prescription.");
      return;
    }

    if (!isMedicationOrder && !isBloodBankOrder && !form.orderItem.trim()) {
      toastError("Order item is required.", "Enter the requested investigation, medication, or procedure.");
      return;
    }

    if (isBloodBankOrder && (!form.bloodGroup || !form.bloodComponent || !Number.isInteger(Number(form.bloodQuantity)) || Number(form.bloodQuantity) <= 0)) {
      toastError("Blood request details are required.", "Select the blood group and component, and enter a positive whole-number quantity.");
      return;
    }

    const medicationMeta = isMedicationOrder
      ? [
          ["Dose", form.dose],
          ["Route", form.route],
          ["Frequency", form.frequency],
          ["Duration", form.duration],
          ["Quantity", form.quantity],
        ]
          .filter(([, value]) => value && value.trim())
          .map(([label, value]) => `${label}: ${value?.trim()}`)
          .join(" | ")
      : "";
    const radiologyMeta = isRadiologyOrder
      ? [
          ["Modality", form.modality],
          ["Body part", form.bodyPart],
          ["Clinical indication", form.clinicalIndication],
          ["Instructions", form.clinicalInstructions],
        ]
          .filter(([, value]) => value && value.trim())
          .map(([label, value]) => `${label}: ${value?.trim()}`)
          .join(" | ")
      : "";
    const bloodBankMeta = isBloodBankOrder
      ? [
          ["Blood group", form.bloodGroup],
          ["Quantity", form.bloodQuantity],
          ["Clinical indication", form.clinicalIndication],
          ["Instructions", form.clinicalInstructions],
        ]
          .filter(([, value]) => value && value.trim())
          .map(([label, value]) => `${label}: ${value?.trim()}`)
          .join(" | ")
      : "";

    try {
      setSubmitting(true);
      await createCpoeOrder(token, {
        patientId: selectedPatient.id,
        category: form.category,
        orderItem,
        priority: form.priority,
        clinicalInstructions: isMedicationOrder
          ? medicationMeta || form.clinicalInstructions || undefined
          : isRadiologyOrder
            ? radiologyMeta || undefined
            : isBloodBankOrder
              ? bloodBankMeta || undefined
              : form.clinicalInstructions || undefined,
        notes: form.notes || undefined,
      });
      success("CPOE order created.", `${selectedPatient.fullName} has a new ${form.category.toLowerCase()} order.`);
      resetOrderDraft();
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
        <Button variant="secondary" loading={loading} leftIcon={<RefreshCw size={15} />} onClick={() => void handleRefreshOrders()}>
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

            {form.category === "Medication" ? (
              <>
                <Input
                  label="Medication name"
                  value={form.medicationName}
                  onChange={(event) => setForm((current) => ({ ...current, medicationName: event.target.value }))}
                  placeholder="e.g. Metformin 500mg"
                />

                <div className={styles.formGrid}>
                  <Input
                    label="Dose"
                    value={form.dose}
                    onChange={(event) => setForm((current) => ({ ...current, dose: event.target.value }))}
                    placeholder="e.g. 500mg"
                  />
                  <Input
                    label="Route"
                    value={form.route}
                    onChange={(event) => setForm((current) => ({ ...current, route: event.target.value }))}
                    placeholder="e.g. Oral"
                  />
                  <Input
                    label="Frequency"
                    value={form.frequency}
                    onChange={(event) => setForm((current) => ({ ...current, frequency: event.target.value }))}
                    placeholder="e.g. BID"
                  />
                  <Input
                    label="Duration"
                    value={form.duration}
                    onChange={(event) => setForm((current) => ({ ...current, duration: event.target.value }))}
                    placeholder="e.g. 5 days"
                  />
                  <Input
                    label="Quantity"
                    value={form.quantity}
                    onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                    placeholder="e.g. 10 tablets"
                  />
                </div>
              </>
            ) : form.category === "Blood Bank" ? (
              <>
                <div className={styles.formGrid}>
                  <Select label="Patient blood group requested" required value={form.bloodGroup} onChange={(event) => setForm((current) => ({ ...current, bloodGroup: event.target.value }))} options={[{ value: "", label: "Select blood group" }, ...BLOOD_GROUPS.map((group) => ({ value: group, label: group }))]} />
                  <Select label="Blood component / product" required value={form.bloodComponent} onChange={(event) => setForm((current) => ({ ...current, bloodComponent: event.target.value }))} options={[{ value: "", label: "Select component" }, ...BLOOD_COMPONENTS.map((component) => ({ value: component, label: component }))]} />
                </div>
                <Input type="number" min="1" step="1" label="Quantity (units)" required value={form.bloodQuantity} onChange={(event) => setForm((current) => ({ ...current, bloodQuantity: event.target.value }))} placeholder="e.g. 2" />
                <Textarea label="Clinical indication" value={form.clinicalIndication} onChange={(event) => setForm((current) => ({ ...current, clinicalIndication: event.target.value }))} placeholder="Reason for blood product request." rows={2} />
              </>
            ) : (
              <Input
                label={form.category === "Laboratory" ? "Test / Investigation" : "Order item"}
                value={form.orderItem}
                onChange={(event) => setForm((current) => ({ ...current, orderItem: event.target.value }))}
                placeholder={form.category === "Laboratory" ? "e.g. CBC with differential" : "e.g. Procedure or other clinical order"}
              />
            )}

            {form.category === "Radiology" && (
              <Textarea
                label="Clinical indication / reason"
                value={form.clinicalIndication}
                onChange={(event) => setForm((current) => ({ ...current, clinicalIndication: event.target.value }))}
                placeholder="e.g. Persistent cough; evaluate for chest infection."
                rows={3}
              />
            )}

            <Textarea
              label={form.category === "Medication" ? "Medication instructions" : form.category === "Radiology" ? "Radiology instructions" : form.category === "Blood Bank" ? "Blood bank instructions" : "Clinical instructions"}
              value={form.clinicalInstructions}
              onChange={(event) => setForm((current) => ({ ...current, clinicalInstructions: event.target.value }))}
              placeholder={form.category === "Medication" ? "Additional administration notes or instructions." : "Instructions for the ordering clinician or downstream team."}
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
