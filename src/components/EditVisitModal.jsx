import { useState } from 'react'
import { X, Save, Loader } from 'lucide-react'
import { api } from '../api'

// Edit / reschedule an OPD visit or appointment
export default function EditVisitModal({ visit, doctors, onClose, onSaved }) {
  const [form, setForm] = useState({
    doctor_id: visit.doctor_id || '', department: visit.department || '',
    visit_date: visit.visit_date ? String(visit.visit_date).slice(0, 10) : '',
    visit_type: visit.visit_type || '', symptoms: visit.symptoms || '', fee: visit.fee ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.visit_date) { setError('Visit date is required'); return }
    setSaving(true); setError(null)
    try {
      const updated = await api.updateOPD(visit.id, { ...form, fee: form.fee === '' ? 0 : Number(form.fee) })
      onSaved({ ...visit, ...updated, doctor_name: doctors.find(d => d.id === updated.doctor_id)?.name ?? visit.doctor_name })
      onClose()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <div>
            <h4 style={{ color: 'var(--gray-900)', fontWeight: 700 }}>Edit Visit</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)', marginTop: 2 }}>{visit.patient_name} · Token {visit.token}</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && <div style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-lg)', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>}
          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Doctor</label>
              <select className="form-input form-select" value={form.doctor_id} onChange={e => {
                const d = doctors.find(x => x.id === e.target.value)
                setForm(f => ({ ...f, doctor_id: e.target.value, department: d?.department || f.department }))
              }}>
                <option value="">Unassigned</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.name} — {d.department}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Department</label>
              <input className="form-input" value={form.department} onChange={e => set('department', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Visit Date</label>
              <input className="form-input" type="date" value={form.visit_date} onChange={e => set('visit_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Visit Type</label>
              <input className="form-input" value={form.visit_type} onChange={e => set('visit_type', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fee (₹)</label>
              <input className="form-input" type="number" min="0" value={form.fee} onChange={e => set('fee', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Symptoms / Reason</label>
              <textarea className="form-input" rows={3} value={form.symptoms} onChange={e => set('symptoms', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader size={14} className="spin" /> : <Save size={14} />} Save
          </button>
        </div>
      </div>
    </div>
  )
}
