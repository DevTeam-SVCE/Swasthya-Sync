import { useState, useEffect, useCallback } from 'react'
import { Plus, Check, Star, X, Loader, Save, Pencil, Trash2, CalendarCheck } from 'lucide-react'
import { api } from '../api'

// Offered once when a hospital has no packages yet
const STARTER_PACKAGES = [
  { name: 'Comprehensive Master Health Checkup', category: 'Health Checkup', price: 4999, popular: true, services: ['Complete Blood Count (CBC)', 'Lipid Profile', 'Liver Function Test', 'Kidney Function Test', 'ECG', 'Chest X-Ray', 'Physician Consultation'] },
  { name: 'Cardiac Care Package', category: 'Specialized', price: 3500, popular: false, services: ['ECG', 'ECHO Cardiography', 'TMT (Treadmill Test)', 'Cardiologist Consultation', 'Lipid Profile'] },
  { name: 'Maternal Health Package', category: 'Maternity', price: 15000, popular: true, services: ['Antenatal Screenings', 'USG Scans', 'Obstetrician Consultations (9 Months)', 'Nutrition Counseling'] },
]
const CATEGORIES = ['Health Checkup', 'Specialized', 'Maternity', 'Surgical', 'Senior Citizen', 'Other']
const BOOKING_STATUS = {
  Booked:    { bg: 'rgba(245,158,11,0.1)', color: '#b45309' },
  Completed: { bg: 'rgba(16,185,129,0.1)', color: '#059669' },
  Cancelled: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626' },
}

function PackageModal({ pkg, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: pkg?.name || '', category: pkg?.category || CATEGORIES[0], price: pkg?.price ?? '',
    services: (pkg?.services || []).join('\n'), popular: !!pkg?.popular,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    const services = form.services.split('\n').map(s => s.trim()).filter(Boolean)
    if (!form.name.trim() || !(Number(form.price) > 0) || !services.length) {
      alert('Name, a price above 0 and at least one service are required'); return
    }
    setSaving(true)
    try {
      const data = { name: form.name.trim(), category: form.category, price: Number(form.price), services, popular: form.popular }
      onSaved(pkg ? await api.updateHealthPackage(pkg.id, data) : await api.createHealthPackage(data))
      onClose()
    } catch (e) { alert('Save failed: ' + e.message) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <h4 style={{ fontWeight: 700, color: 'var(--gray-900)' }}>{pkg ? 'Edit Package' : 'Create Package'}</h4>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Package Name *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-input form-select" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Price (₹) *</label>
              <input className="form-input" type="number" min="1" value={form.price} onChange={e => set('price', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Included Services * (one per line)</label>
            <textarea className="form-input" rows={6} value={form.services} onChange={e => set('services', e.target.value)} style={{ resize: 'vertical' }} placeholder={'Complete Blood Count (CBC)\nLipid Profile\nECG'} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.popular} onChange={e => set('popular', e.target.checked)} /> Mark as popular
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader size={14} className="spin" /> : <Save size={14} />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

function BookModal({ pkg, onClose, onBooked }) {
  const [patients, setPatients] = useState([])
  const [form, setForm] = useState({ patient_id: '', booking_date: new Date().toLocaleDateString('en-CA'), createBill: true })
  const [saving, setSaving] = useState(false)
  useEffect(() => { api.getPatients().then(setPatients).catch(() => {}) }, [])

  const book = async () => {
    if (!form.patient_id) { alert('Select a patient'); return }
    setSaving(true)
    try {
      // Raise the bill first so the booking can point at it
      const bill = form.createBill
        ? await api.createBilling({ patient_id: form.patient_id, total_amount: Number(pkg.price), paid_amount: 0, type: 'Health Package', notes: pkg.name })
        : null
      const booking = await api.createPackageBooking({
        package_id: pkg.id, package_name: pkg.name, patient_id: form.patient_id,
        booking_date: form.booking_date, amount: Number(pkg.price), billing_id: bill?.id || null,
      })
      onBooked({ ...booking, patient_name: patients.find(p => p.id === form.patient_id)?.name })
      onClose()
    } catch (e) { alert('Booking failed: ' + e.message) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div>
            <h4 style={{ fontWeight: 700, color: 'var(--gray-900)' }}>Book Package</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)', marginTop: 2 }}>{pkg.name} · ₹{Number(pkg.price).toLocaleString('en-IN')}</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Patient *</label>
            <select className="form-input form-select" value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))}>
              <option value="">Select patient…</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Appointment Date</label>
            <input className="form-input" type="date" value={form.booking_date} onChange={e => setForm(f => ({ ...f, booking_date: e.target.value }))} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.createBill} onChange={e => setForm(f => ({ ...f, createBill: e.target.checked }))} />
            Raise a bill for ₹{Number(pkg.price).toLocaleString('en-IN')} in Billing
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={book} disabled={saving}>
            {saving ? <Loader size={14} className="spin" /> : <CalendarCheck size={14} />} Book
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HealthPackages() {
  const [packages, setPackages] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(undefined) // undefined: closed, null: new, object: edit
  const [booking, setBooking] = useState(null)
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    return Promise.all([api.getHealthPackages(), api.getPackageBookings()])
      .then(([pk, bk]) => { setPackages(pk.filter(p => p.is_active)); setBookings(bk) })
      .catch(e => alert('Could not load packages: ' + e.message))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const seed = async () => {
    setSeeding(true)
    try { for (const p of STARTER_PACKAGES) await api.createHealthPackage(p); await load() }
    catch (e) { alert('Failed: ' + e.message) } finally { setSeeding(false) }
  }

  const saved = (p) => setPackages(prev => prev.some(x => x.id === p.id) ? prev.map(x => x.id === p.id ? p : x) : [...prev, p])

  // Packages with bookings are retired (hidden) rather than deleted, so booking history keeps its link
  const remove = async (p) => {
    if (!window.confirm(`Remove "${p.name}"? Existing bookings are kept.`)) return
    try {
      if (bookings.some(b => b.package_id === p.id)) await api.updateHealthPackage(p.id, { is_active: false })
      else await api.deleteHealthPackage(p.id)
      setPackages(prev => prev.filter(x => x.id !== p.id))
    } catch (e) { alert('Failed: ' + e.message) }
  }

  const setBookingStatus = async (b, status) => {
    try {
      const u = await api.updatePackageBooking(b.id, { status })
      setBookings(prev => prev.map(x => x.id === b.id ? { ...x, ...u } : x))
    } catch (e) { alert('Failed: ' + e.message) }
  }

  return (
    <div className="animate-fadeInUp">
      <div className="page-header">
        <div>
          <h1 className="page-title">Health Packages</h1>
          <p className="page-subtitle">Standardized health checkup and specialized care packages</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing(null)}><Plus size={15} /> Create Package</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}><Loader size={22} className="spin" style={{ display: 'inline-block' }} /></div>
      ) : packages.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>No packages yet</div>
          <div style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>Create your own, or start with three common packages you can edit.</div>
          <button className="btn btn-secondary" onClick={seed} disabled={seeding}>
            {seeding ? <Loader size={14} className="spin" /> : <Plus size={14} />} Add starter packages
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {packages.map(p => (
            <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {p.popular && (
                <div style={{ position: 'absolute', top: -10, right: 20, background: 'var(--primary-600)', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: 999, display: 'flex', alignItems: 'center', gap: '0.25rem', boxShadow: '0 4px 10px rgba(79,70,229,0.3)' }}>
                  <Star size={10} fill="#fff" /> POPULAR
                </div>
              )}
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--gray-100)', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, background: 'var(--gray-100)', color: 'var(--gray-600)', padding: '0.2rem 0.6rem', borderRadius: 999, textTransform: 'uppercase' }}>{p.category}</span>
                  <div style={{ display: 'flex', gap: '0.125rem' }}>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => setEditing(p)}><Pencil size={13} /></button>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Remove" style={{ color: '#dc2626' }} onClick={() => remove(p)}><Trash2 size={13} /></button>
                  </div>
                </div>
                <h3 style={{ fontWeight: 800, color: 'var(--gray-900)', marginTop: '1rem', fontSize: '1.25rem', lineHeight: 1.3 }}>{p.name}</h3>
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(p.services || []).map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
                      <Check size={14} color="var(--primary-500)" style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ lineHeight: 1.4 }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: '1.25rem 1.5rem', background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Package Fee</div>
                  <div style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--primary-700)' }}>₹{Number(p.price).toLocaleString('en-IN')}</div>
                </div>
                <button className="btn btn-secondary btn-sm" style={{ fontWeight: 700 }} onClick={() => setBooking(p)}>Book Package</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {bookings.length > 0 && (
        <div className="card" style={{ marginTop: '2rem' }}>
          <div className="card-header"><h5 style={{ fontWeight: 700, color: 'var(--gray-900)' }}>Bookings</h5></div>
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Patient</th><th>Package</th><th>Amount</th><th>Bill</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {bookings.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontSize: '0.85rem' }}>{b.booking_date ? new Date(b.booking_date).toLocaleDateString('en-IN') : '—'}</td>
                    <td><div style={{ fontWeight: 600 }}>{b.patient_name}</div><div style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>{b.patient_id}</div></td>
                    <td>{b.package_name}</td>
                    <td style={{ fontWeight: 700 }}>₹{Number(b.amount).toLocaleString('en-IN')}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{b.billing_id || '—'}</td>
                    <td><span style={{ ...BOOKING_STATUS[b.status], fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 999 }}>{b.status}</span></td>
                    <td>
                      {b.status === 'Booked' && (
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setBookingStatus(b, 'Completed')}>Complete</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => setBookingStatus(b, 'Cancelled')}>Cancel</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing !== undefined && <PackageModal pkg={editing} onClose={() => setEditing(undefined)} onSaved={saved} />}
      {booking && <BookModal pkg={booking} onClose={() => setBooking(null)} onBooked={b => setBookings(prev => [b, ...prev])} />}
    </div>
  )
}
