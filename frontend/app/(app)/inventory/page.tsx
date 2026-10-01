"use client";

import { Download, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import styles from "./page.module.css";

const columns = [
  ["Item code", "Unique stock identifier"],
  ["Item name", "Medicine, supply, or equipment name"],
  ["Category", "Medicine / Consumable / Equipment"],
  ["Unit", "Tablet, vial, box, piece, etc."],
  ["Current stock", "Usable quantity on hand"],
  ["Reorder level", "Minimum quantity before replenishment"],
  ["Batch number", "Manufacturer batch or lot"],
  ["Expiry date", "Required for dated stock"],
  ["Vendor", "Supplier name or code"],
  ["Storage location", "Store, rack, or refrigerator"],
];

function downloadTemplate() {
  const headers = ["item_code", "item_name", "category", "unit", "current_stock", "reorder_level", "batch_number", "expiry_date", "vendor", "storage_location"];
  const blob = new Blob([`${headers.join(",")}\r\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "hospital-stock-register-template.csv";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function InventoryPage() {
  return (
    <main className={styles.page}>
      <PageHeader title="Inventory Management" subtitle="Prepare a consistent stock register for medicines, consumables, and equipment." accent="primary" actions={<Button type="button" leftIcon={<Download size={15} />} onClick={downloadTemplate}>Download CSV template</Button>} />
      <section className={styles.notice}>
        <PackageCheck size={18} aria-hidden="true" />
        <div><strong>Inventory register setup</strong><p>This workspace is a template. Stock levels are not connected to saved inventory records yet.</p></div>
      </section>
      <section className={styles.grid}>
        <div className={styles.register}>
          <div className={styles.sectionHeader}><div><h2>Stock register fields</h2><p>Use these columns to prepare your hospital inventory list.</p></div><span className={styles.fieldCount}>{columns.length} fields</span></div>
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Field</th><th>What to record</th></tr></thead><tbody>{columns.map(([field, description]) => <tr key={field}><td>{field}</td><td>{description}</td></tr>)}</tbody></table></div>
        </div>
        <aside className={styles.side}>
          <section className={styles.sideSection}><h2>Recommended stock groups</h2><ul><li>Medicines and pharmacy stock</li><li>Medical consumables</li><li>Laboratory and radiology supplies</li><li>Equipment and reusable assets</li><li>Cleaning and general supplies</li></ul></section>
          <section className={styles.sideSection}><h2>Routine checks</h2><ul><li>Review items at or below reorder level.</li><li>Review batch expiry dates before issuing stock.</li><li>Separate expired or quarantined stock from usable stock.</li><li>Record unit and storage location consistently.</li></ul></section>
          <p className={styles.disclaimer}>The downloaded file contains headers only; it includes no sample stock or patient data.</p>
        </aside>
      </section>
      <section className={styles.emptyRegister}><div><h2>No stock records connected</h2><p>Once an inventory API is available, this area can show searchable stock, expiry, vendor, and reorder information.</p></div><Button type="button" variant="secondary" leftIcon={<Download size={15} />} onClick={downloadTemplate}>Get blank register</Button></section>
    </main>
  );
}
