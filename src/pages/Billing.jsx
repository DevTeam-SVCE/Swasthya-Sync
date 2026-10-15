import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, Receipt, X, CheckCircle, Download, Loader, Activity, ShieldCheck, ArrowRight, CreditCard, Stethoscope, FileText, Calculator, Pill, FlaskConical, Trash2, Pencil, Ban } from 'lucide-react'
import { api } from '../api'

const STATUS_STYLES = {
  Paid: { bg: 'rgba(16,185,129,0.1)', color: '#059669', label: 'Paid' },
  Pending: { bg: 'rgba(245,158,11,0.1)', color: '#b45309', label: 'Pending' },
  Partial: { bg: 'rgba(99,102,241,0.1)', color: '#4338ca', label: 'Partial' },
  Overdue: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626', label: 'Overdue' },
  Cancelled: { bg: 'var(--gray-100)', color: 'var(--gray-500)', label: 'Cancelled' },
}

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Net Banking', 'Cheque', 'Insurance']

function BillModal({ bill, onClose, onUpdated, onDeleted }) {
  const total = Number(bill.total_amount) || 0
  const paid = Number(bill.paid_amount) || 0
  const balance = total - paid
  const cancelled = bill.status === 'Cancelled'
  const [mode, setMode] = useState(null) // 'pay' | 'edit' | 'cancel'
  const [pay, setPay] = useState({ amount: balance, payment_method: bill.payment_method || 'Cash' })
  const [edit, setEdit] = useState({ total_amount: total, type: bill.type || '' })
  const [cancel, setCancel] = useState({ reason: '', refund_amount: paid })
  const [busy, setBusy] = useState(false)

  const run = async (fn) => {
    setBusy(true)
    try { await fn() } catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  const keepJoins = u => ({ ...bill, ...u })
  const recordPayment = () => run(async () => {
    onUpdated(keepJoins(await api.recordPayment(bill.id, { amount: Number(pay.amount), payment_method: pay.payment_method })))
    setMode(null)
  })
  const saveEdit = () => run(async () => {
    onUpdated(keepJoins(await api.updateBilling(bill.id, { total_amount: Number(edit.total_amount), type: edit.type })))
    setMode(null)
  })
  const cancelBill = () => run(async () => {
    onUpdated(keepJoins(await api.cancelBilling(bill.id, { reason: cancel.reason, refund_amount: Number(cancel.refund_amount) || 0 })))
    setMode(null)
  })
  const deleteBill = () => {
    if (!window.confirm(`Delete invoice ${bill.id}? This cannot be undone.`)) return
    run(async () => { await api.deleteBilling(bill.id); onDeleted(bill.id); onClose() })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h4 style={{ color: 'var(--gray-900)', fontWeight: 700 }}>Invoice {bill.id}</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)', marginTop: 2 }}>
              {bill.created_at ? new Date(bill.created_at).toLocaleDateString('en-IN') : '—'} · {bill.type}
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', padding: '1.25rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-xl)', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--gray-900)' }}>{bill.patient_name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{bill.patient_id}</div>
              {bill.payment_method && <div style={{ fontSize: '0.8rem', color: 'var(--primary-600)', marginTop: '0.25rem', fontWeight: 600 }}>Payment: {bill.payment_method}</div>}
              {cancelled && (
                <div style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '0.5rem' }}>
                  Cancelled: {bill.cancel_reason}{Number(bill.refunded_amount) > 0 && ` · Refunded Rs ${Number(bill.refunded_amount).toLocaleString()}`}
                </div>
              )}
            </div>
            <span style={{ background: STATUS_STYLES[bill.status]?.bg, color: STATUS_STYLES[bill.status]?.color, fontSize: '0.875rem', fontWeight: 700, padding: '0.375rem 0.875rem', borderRadius: 999, alignSelf: 'flex-start' }}>
              {STATUS_STYLES[bill.status]?.label || bill.status}
            </span>
          </div>
          <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.625rem', maxWidth: 320, marginLeft: 'auto' }}>
            {[
              ['Total Amount', `Rs ${total.toLocaleString()}`],
              ['Amount Paid', `Rs ${paid.toLocaleString()}`],
              ['Balance Due', `Rs ${(cancelled ? 0 : balance).toLocaleString()}`],
            ].map(([label, val], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: i === 2 && balance > 0 && !cancelled ? '#dc2626' : 'var(--gray-600)' }}>
                <span>{label}</span><span style={{ fontWeight: i === 2 ? 800 : 600 }}>{val}</span>
              </div>
            ))}
          </div>

          {mode === 'pay' && (
            <div className="grid grid-2" style={{ gap: '1rem', marginTop: '1.25rem', padding: '1rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)' }}>
              <div className="form-group">
                <label className="form-label">Amount received (max Rs {balance.toLocaleString()})</label>
                <input className="form-input" type="number" min="1" max={balance} value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Method</label>
                <select className="form-input form-select" value={pay.payment_method} onChange={e => setPay(p => ({ ...p, payment_method: e.target.value }))}>
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
          )}
          {mode === 'edit' && (
            <div className="grid grid-2" style={{ gap: '1rem', marginTop: '1.25rem', padding: '1rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)' }}>
              <div className="form-group">
                <label className="form-label">Total amount (Rs)</label>
                <input className="form-input" type="number" min={paid || 1} value={edit.total_amount} onChange={e => setEdit(p => ({ ...p, total_amount: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Bill type</label>
                <input className="form-input" value={edit.type} onChange={e => setEdit(p => ({ ...p, type: e.target.value }))} />
              </div>
            </div>
          )}
          {mode === 'cancel' && (
            <div className="grid grid-2" style={{ gap: '1rem', marginTop: '1.25rem', padding: '1rem', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)' }}>
              <div className="form-group" style={{ gridColumn: paid > 0 ? 'auto' : '1 / -1' }}>
                <label className="form-label">Reason for cancellation *</label>
                <input className="form-input" value={cancel.reason} onChange={e => setCancel(c => ({ ...c, reason: e.target.value }))} placeholder="e.g. Billed to wrong patient" />
              </div>
              {paid > 0 && (
                <div className="form-group">
                  <label className="form-label">Refund to patient (max Rs {paid.toLocaleString()})</label>
                  <input className="form-input" type="number" min="0" max={paid} value={cancel.refund_amount} onChange={e => setCancel(c => ({ ...c, refund_amount: e.target.value }))} />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          {!mode && !cancelled && (
            <>
              {paid === 0
                ? <button className="btn btn-ghost" style={{ color: '#dc2626', marginRight: 'auto' }} onClick={deleteBill} disabled={busy}><Trash2 size={14} /> Delete</button>
                : <button className="btn btn-ghost" style={{ color: '#dc2626', marginRight: 'auto' }} onClick={() => setMode('cancel')}><Ban size={14} /> Cancel / Refund</button>}
              <button className="btn btn-secondary" onClick={() => setMode('edit')}><Pencil size={14} /> Edit</button>
              {balance > 0 && (
                <button className="btn btn-teal" onClick={() => setMode('pay')}>
                  <CreditCard size={14} /> Record Payment
                </button>
              )}
            </>
          )}
          {!mode && cancelled && <button className="btn btn-secondary" onClick={onClose}>Close</button>}
          {mode && <button className="btn btn-secondary" onClick={() => setMode(null)} disabled={busy}>Back</button>}
          {mode === 'pay' && <button className="btn btn-teal" onClick={recordPayment} disabled={busy || !(Number(pay.amount) > 0)}>{busy ? <Loader size={14} className="spin" /> : <CheckCircle size={14} />} Save Payment</button>}
          {mode === 'edit' && <button className="btn btn-primary" onClick={saveEdit} disabled={busy}>{busy ? <Loader size={14} className="spin" /> : <CheckCircle size={14} />} Save</button>}
          {mode === 'cancel' && <button className="btn btn-danger" style={{ background: '#dc2626', color: '#fff' }} onClick={cancelBill} disabled={busy || !cancel.reason.trim()}>{busy ? <Loader size={14} className="spin" /> : <Ban size={14} />} Cancel Bill</button>}
        </div>
      </div>
    </div>
  )
}

function NewBillModal({ patients, onClose, onSave }) {
  const [form, setForm] = useState({ patient_id: '', total_amount: '', paid_amount: '', payment_method: 'Cash', type: 'OPD' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const h = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.patient_id || !form.total_amount) { setError('Patient and total amount are required.'); return }
    setSaving(true); setError(null)
    try {
      const bill = await api.createBilling({ ...form, total_amount: parseFloat(form.total_amount), paid_amount: parseFloat(form.paid_amount) || 0 })
      onSave(bill); onClose()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <h4 style={{ color: 'var(--gray-900)', fontWeight: 700 }}>Generate Invoice</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)', marginTop: 2 }}>Create a billing record for a patient</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && <div style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', padding: '0.75rem 1rem', borderRadius: 'var(--radius-lg)', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Patient*</label>
              <select className="form-input form-select" value={form.patient_id} onChange={e => h('patient_id', e.target.value)}>
                <option value="">Select patient</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Billing Type</label>
              <select className="form-input form-select" value={form.type} onChange={e => h('type', e.target.value)}>
                <option>OPD</option><option>IPD</option><option>Lab</option><option>Pharmacy</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Total Amount (Rs)*</label>
              <input className="form-input" type="number" placeholder="e.g. 5000" value={form.total_amount} onChange={e => h('total_amount', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Amount Paid (Rs)</label>
              <input className="form-input" type="number" placeholder="e.g. 2500" value={form.paid_amount} onChange={e => h('paid_amount', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <select className="form-input form-select" value={form.payment_method} onChange={e => h('payment_method', e.target.value)}>
                {['Cash', 'Card', 'UPI', 'Insurance', 'Cheque', 'NEFT'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader size={14} className="spin" /> : <Plus size={14} />} Generate Invoice
          </button>
        </div>
      </div>
    </div>
  )
}


export default function Billing() {
  const [bills, setBills] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedBill, setSelectedBill] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState('op') // 'op' or 'ip'
  const [selectedIpBillPatient, setSelectedIpBillPatient] = useState(null)

  // IP Discharge Queue (Actual Admitted Patients)
  const [ipQueue, setIpQueue] = useState([])

  const IP_STEPS = [
    'Discharge Advised',
    'Clinical Summary',
    'Pharmacy Clearance',
    'Laboratory Clearance',
    'Final Billing',
    'Settle & Vacate'
  ]

  const advanceIpWorkflow = async (bedId, currentStep) => {
    if (currentStep >= IP_STEPS.length - 1) return
    try {
      const next = currentStep + 1
      const updated = await api.updateDischargeStep(bedId, { step: next, status: IP_STEPS[next] })
      setIpQueue(prev => prev.map(p => p.bed_id === bedId ? { ...p, step: updated.discharge_step, status: updated.discharge_status } : p))
    } catch (e) { alert('Update failed: ' + e.message) }
  }

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = {}
      if (statusFilter !== 'All') params.status = statusFilter
      if (search) params.search = search
      const data = await api.getBilling(params)
      setBills(data)


    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [search, statusFilter])

  useEffect(() => {
    const t = setTimeout(fetchData, 300)
    return () => clearTimeout(t)
  }, [fetchData])

  useEffect(() => {
    api.getPatients().then(setPatients).catch(() => { })
  }, [])

  const handleSave = (bill) => setBills(b => [bill, ...b])

  const handleUpdated = (updated) => {
    setBills(b => b.map(bill => bill.id === updated.id ? updated : bill))
    setSelectedBill(updated)
  }

  // Collected money counts partial payments too; cancelled bills are excluded
  const totalRevenue = bills.filter(b => b.status !== 'Cancelled').reduce((s, b) => s + Number(b.paid_amount || 0) - Number(b.refunded_amount || 0), 0)
  const totalPending = bills.filter(b => b.status === 'Pending' || b.status === 'Partial').reduce((s, b) => s + Number(b.total_amount || 0) - Number(b.paid_amount || 0), 0)

  return (
    <>
    <div className="animate-fadeInUp">
      <div className="page-header">
        <div>
          <h1 className="page-title">OP Billing</h1>
          <p className="page-subtitle">Manage outpatient invoices and payment collection</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={15} /> Generate Invoice</button>
      </div>

      <div className="grid grid-4" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Invoices', val: bills.length, color: 'var(--gray-700)', bg: 'var(--gray-50)' },
          { label: 'Revenue Collected', val: `Rs ${(totalRevenue / 100000).toFixed(1)}L`, color: '#059669', bg: 'rgba(16,185,129,0.06)' },
          { label: 'Pending Amount', val: `Rs ${(totalPending / 100000).toFixed(1)}L`, color: '#b45309', bg: 'rgba(245,158,11,0.06)' },
          { label: 'Partial Payments', val: bills.filter(b => b.status === 'Partial').length, color: '#4338ca', bg: 'rgba(99,102,241,0.06)' },
        ].map((s, i) => (
          <div key={i} style={{ background: s.bg, borderRadius: 'var(--radius-xl)', padding: '1.25rem', border: '1px solid rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 900, color: s.color, letterSpacing: '-0.04em', lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', marginTop: '0.375rem', fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input className="form-input" style={{ paddingLeft: '2.25rem' }} placeholder="Search by patient or invoice ID..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['All', 'Paid', 'Pending', 'Partial'].map(f => (
            <button key={f} className={`btn btn-sm ${statusFilter === f ? 'btn-primary' : 'btn-secondary'}`}
              style={{ textTransform: 'capitalize' }} onClick={() => setStatusFilter(f)}>
              {STATUS_STYLES[f]?.label || f}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.06)', color: '#dc2626', borderRadius: 'var(--radius-lg)', marginBottom: '1.25rem', fontSize: '0.875rem' }}>⚠ {error}</div>}

      <div className="card">
        <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
          <table className="data-table">
            <thead>
              <tr><th>Invoice</th><th>Patient</th><th>Type</th><th>Total (Rs)</th><th>Paid (Rs)</th><th>Balance (Rs)</th><th>Payment</th><th>Date</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)' }}>
                  <Loader size={20} className="spin" style={{ display: 'inline-block' }} />
                </td></tr>
              ) : bills.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)' }}>No invoices found</td></tr>
              ) : bills.map(bill => {
                const total = Number(bill.total_amount) || 0
                const paid = Number(bill.paid_amount) || 0
                const balance = total - paid
                return (
                  <tr key={bill.id}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--primary-600)', fontWeight: 600 }}>{bill.id}</span></td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-800)' }}>{bill.patient_name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>{bill.patient_id}</div>
                    </td>
                    <td>
                      <span style={{ background: bill.type === 'IPD' ? 'var(--primary-50)' : 'rgba(13,148,136,0.08)', color: bill.type === 'IPD' ? 'var(--primary-700)' : 'var(--accent-teal)', fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 999 }}>{bill.type}</span>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--gray-900)', fontSize: '0.9rem' }}>{total.toLocaleString()}</td>
                    <td style={{ fontWeight: 600, color: '#059669', fontSize: '0.875rem' }}>{paid.toLocaleString()}</td>
                    <td style={{ fontWeight: balance > 0 ? 700 : 400, color: balance > 0 ? '#dc2626' : 'var(--gray-400)', fontSize: '0.875rem' }}>{balance.toLocaleString()}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{bill.payment_method || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>
                      {bill.created_at ? new Date(bill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td><span style={{ background: STATUS_STYLES[bill.status]?.bg, color: STATUS_STYLES[bill.status]?.color, fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 999 }}>{STATUS_STYLES[bill.status]?.label || bill.status}</span></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" style={{ padding: '0.3rem 0.625rem', fontSize: '0.75rem' }} onClick={() => setSelectedBill(bill)}>
                        <Receipt size={12} /> View
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </div>

    </div>
    {selectedBill && <BillModal key={selectedBill.id + selectedBill.status + selectedBill.paid_amount} bill={selectedBill} onClose={() => setSelectedBill(null)}
      onUpdated={handleUpdated} onDeleted={id => setBills(b => b.filter(x => x.id !== id))} />}
    {showModal && <NewBillModal patients={patients} onClose={() => setShowModal(false)} onSave={handleSave} />}
    </>
  )
}
