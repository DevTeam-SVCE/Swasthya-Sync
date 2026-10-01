"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { FlaskConical, RefreshCw, Search } from "lucide-react";
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
  collectLabSample,
  fetchLabOrder,
  fetchLabOrders,
  submitLabResult,
  verifyLabResult,
  type LabOrder,
  type LabResult,
  type LabSampleType,
  type LabStatus,
} from "@/lib/laboratory";
import styles from "./page.module.css";

const LAB_STATUSES: { value: "ALL" | LabStatus; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ORDERED", label: "ORDERED" },
  { value: "SAMPLE_PENDING", label: "SAMPLE_PENDING" },
  { value: "COLLECTED", label: "COLLECTED" },
  { value: "PROCESSING", label: "PROCESSING" },
  { value: "RESULT_ENTERED", label: "RESULT_ENTERED" },
  { value: "VERIFIED", label: "VERIFIED" },
  { value: "COMPLETED", label: "COMPLETED" },
];

const LAB_PRIORITIES = [
  { value: "ALL", label: "All" },
  { value: "STAT", label: "STAT" },
  { value: "URGENT", label: "Urgent" },
  { value: "ROUTINE", label: "Routine" },
];

const SAMPLE_TYPES: { value: LabSampleType; label: string }[] = [
  { value: "Blood", label: "Blood" },
  { value: "Urine", label: "Urine" },
  { value: "Stool", label: "Stool" },
  { value: "Swab", label: "Swab" },
  { value: "Other", label: "Other" },
];

function statusVariant(status: LabStatus) {
  if (status === "ORDERED") return "primary";
  if (status === "COLLECTED") return "warning";
  if (status === "PROCESSING") return "info";
  if (status === "RESULT_ENTERED") return "purple";
  if (status === "VERIFIED" || status === "COMPLETED") return "success";
  return "default";
}

function priorityVariant(priority: LabOrder["priority"]) {
  if (priority === "STAT") return "danger";
  if (priority === "URGENT") return "warning";
  return "success";
}

export default function LaboratoryPage() {
  const { token } = useAuth();
  const { success, error: toastError } = useToast();
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | LabStatus>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | LabOrder["priority"]>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sampleType, setSampleType] = useState<LabSampleType>("Blood");
  const [resultForm, setResultForm] = useState({ resultValue: "", unit: "", referenceRange: "", remarks: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadOrders = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetchLabOrders(token, {
        status: statusFilter === "ALL" ? undefined : statusFilter,
        priority: priorityFilter === "ALL" ? undefined : priorityFilter,
        q: search.trim() || undefined,
      });
      setOrders(response.orders);
      if (!selectedId && response.orders.length > 0) setSelectedId(response.orders[0].id);
      if (selectedId && !response.orders.some((order) => order.id === selectedId)) setSelectedId(response.orders[0]?.id ?? null);
    } catch {
      toastError("Unable to load laboratory queue.", "Please check the backend and try again.");
    } finally {
      setLoading(false);
    }
  };

  const refreshSelected = async (id: string) => {
    if (!token || !id) return;
    try {
      const response = await fetchLabOrder(token, id);
      setOrders((current) => current.map((order) => (order.id === id ? { ...order, ...response.order, history: response.history } : order)));
    } catch {
      toastError("Unable to load order details.", "Please try again in a moment.");
    }
  };

  useEffect(() => {
    if (!token) return;

    let ignore = false;
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const response = await fetchLabOrders(token, {
          status: statusFilter === "ALL" ? undefined : statusFilter,
          priority: priorityFilter === "ALL" ? undefined : priorityFilter,
          q: search.trim() || undefined,
        });

        if (ignore) return;
        setOrders(response.orders);
        if (!selectedId && response.orders.length > 0) setSelectedId(response.orders[0].id);
        if (selectedId && !response.orders.some((order) => order.id === selectedId)) setSelectedId(response.orders[0]?.id ?? null);
      } catch {
        if (!ignore) {
          toastError("Unable to load laboratory queue.", "Please check the backend and try again.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    void fetchOrders();
    return () => {
      ignore = true;
    };
  }, [token, statusFilter, priorityFilter, search, selectedId, toastError]);

  const filteredOrders = useMemo<LabOrder[]>(() => orders, [orders]);
  const selectedOrder = filteredOrders.find((order) => order.id === selectedId) ?? null;
  const tableRows = useMemo(() => filteredOrders as Array<LabOrder & Record<string, unknown>>, [filteredOrders]);

  const handleCollectSample = async () => {
    if (!token || !selectedOrder) return;
    setSaving(true);
    try {
      await collectLabSample(token, selectedOrder.id, { sampleType });
      success("Sample collected.", `${selectedOrder.testName} has been logged for collection.`);
      await loadOrders();
      if (selectedOrder.id) await refreshSelected(selectedOrder.id);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to collect sample.";
      toastError("Sample collection failed.", message);
    } finally {
      setSaving(false);
    }
  };

  const handleResultSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedOrder) return;
    if (!resultForm.resultValue.trim()) {
      toastError("Result value is required.", "Enter the numeric or text result before saving.");
      return;
    }

    setSaving(true);
    try {
      await submitLabResult(token, selectedOrder.id, {
        resultValue: resultForm.resultValue,
        unit: resultForm.unit || undefined,
        referenceRange: resultForm.referenceRange || undefined,
        remarks: resultForm.remarks || undefined,
      });
      success("Result saved.", `${selectedOrder.testName} has a new laboratory result.`);
      setResultForm({ resultValue: "", unit: "", referenceRange: "", remarks: "" });
      await loadOrders();
      await refreshSelected(selectedOrder.id);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to save result.";
      toastError("Result could not be saved.", message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyResult = async () => {
    if (!token || !selectedOrder) return;
    setSaving(true);
    try {
      await verifyLabResult(token, selectedOrder.id);
      success("Result verified.", `${selectedOrder.testName} has been marked verified.`);
      await loadOrders();
      await refreshSelected(selectedOrder.id);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to verify result.";
      toastError("Verification failed.", message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Laboratory"
        subtitle="Basic laboratory work queue, sample collection, result entry, and verification."
        icon={<FlaskConical size={18} />}
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
              placeholder="Search patient / UHID / test"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              leftIcon={<Search size={15} />}
            />
          </div>
          <div className={styles.filters}>
            <Select
              label="Status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | LabStatus)}
              options={LAB_STATUSES}
            />
            <Select
              label="Priority"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as "ALL" | LabOrder["priority"])}
              options={LAB_PRIORITIES}
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
          { key: "testName", header: "Test", render: (_, row) => row.testName },
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
        data={tableRows}
        rowKey={(row) => row.id}
        onRowClick={(row) => setSelectedId(row.id)}
        loading={loading}
        emptyTitle="No lab orders found"
        emptyDescription="Orders created via CPOE will appear here automatically."
      />

      {selectedOrder && (
        <div className={styles.detailGrid}>
          <Card className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
              <div>
                <h2>{selectedOrder.patientName}</h2>
                <div className={styles.patientMeta}>{selectedOrder.uhid} · {selectedOrder.age} yrs · {selectedOrder.sex}</div>
              </div>
              <Badge variant={statusVariant(selectedOrder.status)} size="sm">{selectedOrder.status}</Badge>
            </div>

            <div className={styles.metaGrid}>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Patient</span><span className={styles.metaValue}>{selectedOrder.patientName}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>UHID</span><span className={styles.metaValue}>{selectedOrder.uhid}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Test</span><span className={styles.metaValue}>{selectedOrder.testName}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Test code</span><span className={styles.metaValue}>{selectedOrder.testCode || "—"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Ordered by</span><span className={styles.metaValue}>{selectedOrder.orderedByName}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Ordered date</span><span className={styles.metaValue}>{new Date(selectedOrder.orderedAt).toLocaleString("en-IN")}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Priority</span><span className={styles.metaValue}><Badge variant={priorityVariant(selectedOrder.priority)} size="sm">{selectedOrder.priority}</Badge></span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>CPOE no.</span><span className={styles.metaValue}>{selectedOrder.cpoeOrderNumber}</span></div>
            </div>

            <div className={styles.actionRow}>
              {selectedOrder.status === "ORDERED" || selectedOrder.status === "SAMPLE_PENDING" ? (
                <>
                  <Select label="Sample type" value={sampleType} onChange={(event) => setSampleType(event.target.value as LabSampleType)} options={SAMPLE_TYPES} />
                  <Button variant="primary" loading={saving} onClick={() => void handleCollectSample()}>Collect sample</Button>
                </>
              ) : null}
              {selectedOrder.status === "RESULT_ENTERED" ? (
                <Button variant="success" loading={saving} onClick={() => void handleVerifyResult()}>Verify result</Button>
              ) : null}
            </div>
          </Card>

          <Card className={styles.orderCard}>
            <div className={styles.summaryHeader}>
              <h3>Sample and result</h3>
            </div>

            <div className={styles.metaGrid}>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Sample type</span><span className={styles.metaValue}>{selectedOrder.sample?.sampleType || "Not collected"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Collection status</span><span className={styles.metaValue}>{selectedOrder.sample?.sampleStatus || "PENDING"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Collector</span><span className={styles.metaValue}>{selectedOrder.sample?.collectedByName || "—"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Collected at</span><span className={styles.metaValue}>{selectedOrder.sample?.collectedAt ? new Date(selectedOrder.sample.collectedAt).toLocaleString("en-IN") : "—"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Result</span><span className={styles.metaValue}>{selectedOrder.result?.resultValue || "—"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Unit</span><span className={styles.metaValue}>{selectedOrder.result?.unit || "—"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Reference range</span><span className={styles.metaValue}>{selectedOrder.result?.referenceRange || "—"}</span></div>
              <div className={styles.metaItem}><span className={styles.metaLabel}>Remarks</span><span className={styles.metaValue}>{selectedOrder.result?.remarks || "—"}</span></div>
            </div>
          </Card>

          <Card className={styles.formCard}>
            <h3>Enter result</h3>
            <form onSubmit={handleResultSubmit} className={styles.formGrid}>
              <div className={styles.fullWidth}>
                <Input label="Result / value" value={resultForm.resultValue} onChange={(event) => setResultForm((current) => ({ ...current, resultValue: event.target.value }))} placeholder="e.g. 110" />
              </div>
              <Input label="Unit" value={resultForm.unit} onChange={(event) => setResultForm((current) => ({ ...current, unit: event.target.value }))} placeholder="mg/dL" />
              <Input label="Reference range" value={resultForm.referenceRange} onChange={(event) => setResultForm((current) => ({ ...current, referenceRange: event.target.value }))} placeholder="70-100" />
              <div className={styles.fullWidth}>
                <Input label="Remarks" value={resultForm.remarks} onChange={(event) => setResultForm((current) => ({ ...current, remarks: event.target.value }))} placeholder="Fasting sample" />
              </div>
              <div className={styles.inlineActions}>
                <Button type="submit" variant="primary" loading={saving}>
                  Save result
                </Button>
              </div>
            </form>
          </Card>

          <Card className={styles.historyCard}>
            <h3>Result history</h3>
            {selectedOrder.history && selectedOrder.history.length > 0 ? (
              <div className={styles.historyList}>
                {selectedOrder.history.map((entry: LabResult) => (
                  <div key={entry.id} className={styles.historyItem}>
                    <strong>{entry.resultValue} {entry.unit ? entry.unit : ""}</strong>
                    <span className={styles.muted}>{entry.referenceRange || "No reference range"}</span>
                    <span>{entry.remarks || "No remarks"}</span>
                    <span className={styles.muted}>Entered by {entry.enteredByName || "—"} on {entry.enteredAt ? new Date(entry.enteredAt).toLocaleString("en-IN") : "—"}</span>
                    <span className={styles.muted}>Verified by {entry.verifiedByName || "—"} on {entry.verifiedAt ? new Date(entry.verifiedAt).toLocaleString("en-IN") : "—"}</span>
                    <Badge variant={entry.resultStatus === "VERIFIED" ? "success" : "primary"} size="sm">{entry.resultStatus}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.muted}>No results recorded yet.</div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
