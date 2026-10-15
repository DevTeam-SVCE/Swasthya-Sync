import { useState, useEffect } from 'react'
import { Clock, CheckCircle, Plus, X, Loader, Trash2, Pencil } from 'lucide-react'
import { api } from '../api'

const THEATRES = ['OT-01 (General)', 'OT-02 (Ortho)', 'OT-03 (Cardiac)', 'OT-04 (Neuro)', 'Cath Lab']

const today = () => new Date().toLocaleDateString('en-CA')

function ScheduleModal({ patients, doctors, surgery, onClose, onSave }) {
  const [form, setForm] = useState(surgery
    ? { patient_id: surgery.patient_id, procedure: surgery.procedure_name, surgeon: surgery.surgeon || '', ot: surgery.theatre || THEATRES[0], date: surgery.scheduled_date || today(), time: surgery.scheduled_time || '08:00', notes: surgery.notes || '' }
    : { patient_id: '', procedure: '', surgeon: '', ot: THEATRES[0], date: today(), time: '08:00', notes: '' })
  const [saving, setSaving] = useState(false)
  const h = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.patient_id || !form.procedure.trim() || !form.surgeon) {
      alert("Please fill all required fields (Patient, Procedure, Surgeon).")
      return
    }
    const payload = {
      patient_id: form.patient_id, procedure_name: form.procedure.trim(), surgeon: form.surgeon,
      theatre: form.ot, scheduled_date: form.date, scheduled_time: form.time, notes: form.notes,
    }
    setSaving(true)
    try {
      onSave(surgery ? await api.updateSurgery(surgery.id, payload) : await api.createSurgery(payload))
      onClose()
    } catch (e) { alert('Could not save: ' + e.message) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <h4 style={{ fontWeight: 700, color: 'var(--gray-900)' }}>{surgery ? 'Edit Surgery' : 'Schedule Surgery'}</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>Book an available Operation Theatre</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Patient *</label>
            <select className="form-input form-select" value={form.patient_id} disabled={!!surgery} onChange={e => h('patient_id', e.target.value)}>
              <option value="">Select patient...</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Procedure Name *</label>
            <input className="form-input" value={form.procedure} onChange={e => h('procedure', e.target.value)} placeholder="e.g. Appendectomy"/>
          </div>
          <div className="form-group">
            <label className="form-label">Primary Surgeon *</label>
            <select className="form-input form-select" value={form.surgeon} onChange={e => h('surgeon', e.target.value)}>
              <option value="">Select Doctor...</option>
              {doctors.map(d => <option key={d.id} value={d.name}>Dr. {d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Operation Theatre</label>
            <select className="form-input form-select" value={form.ot} onChange={e => h('ot', e.target.value)}>
              {THEATRES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={form.date} onChange={e => h('date', e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Time</label>
              <input className="form-input" type="time" value={form.time} onChange={e => h('time', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={2} value={form.notes} onChange={e => h('notes', e.target.value)} placeholder="Anaesthesia plan, implants, special instructions…" style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? <Loader size={14} className="spin" /> : <CheckCircle size={14} />} {surgery ? 'Save' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OperationTheatre() {
  const [surgeries, setSurgeries] = useState([])
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [dateFilter, setDateFilter] = useState(today())

  // Advance the workflow: clear PAC → start → complete. Each step is saved.
  const handleUpdate = async (s) => {
    const patch = s.pac_status === 'Pending' ? { pac_status: 'Cleared' }
      : s.status === 'Scheduled' ? { status: 'In Progress' }
      : s.status === 'In Progress' ? { status: 'Completed' } : null
    if (!patch) return
    setBusyId(s.id)
    try {
      const updated = await api.updateSurgery(s.id, patch)
      setSurgeries(prev => prev.map(x => x.id === s.id ? { ...x, ...updated } : x))
    } catch (e) { alert('Update failed: ' + e.message) } finally { setBusyId(null) }
  }

  const handleCancel = async (s) => {
    if (!window.confirm(`Cancel ${s.procedure_name} for ${s.patient_name}?`)) return
    setBusyId(s.id)
    try {
      const updated = await api.updateSurgery(s.id, { status: 'Cancelled' })
      setSurgeries(prev => prev.map(x => x.id === s.id ? { ...x, ...updated } : x))
    } catch (e) { alert('Cancel failed: ' + e.message) } finally { setBusyId(null) }
  }

  const handleDelete = async (s) => {
    if (!window.confirm(`Delete the booking ${s.procedure_name} for ${s.patient_name}? This cannot be undone.`)) return
    setBusyId(s.id)
    try {
      await api.deleteSurgery(s.id)
      setSurgeries(prev => prev.filter(x => x.id !== s.id))
    } catch (e) { alert('Delete failed: ' + e.message) } finally { setBusyId(null) }
  }

  const handleSaved = (saved) => {
    const p = patients.find(pt => pt.id === saved.patient_id)
    const row = { ...saved, patient_name: p?.name }
    setSurgeries(prev => prev.some(x => x.id === row.id) ? prev.map(x => x.id === row.id ? { ...x, ...row } : x) : [row, ...prev])
  }

  useEffect(() => {
    Promise.all([api.getPatients(), api.getDoctors(), api.getSurgeries()])
      .then(([pts, docs, surgs]) => { setPatients(pts); setDoctors(docs); setSurgeries(surgs) })
      .catch(e => alert('Could not load OT schedule: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  const shown = surgeries.filter(s => !dateFilter || s.scheduled_date === dateFilter)

  return (
    <div className="animate-fadeInUp">
      <div className="page-header">
        <div>
          <h1 className="page-title">Operation Theatre</h1>
          <p className="page-subtitle">NABH Compliant OT Scheduling & PAC Workflow</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input className="form-input" type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ width: 160 }} title="Show surgeries on this date" />
          {dateFilter && <button className="btn btn-ghost btn-sm" onClick={() => setDateFilter('')}>All dates</button>}
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true) }}>
            <Plus size={15} /> Schedule Surgery
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: dateFilter === today() ? 'Scheduled Today' : 'Scheduled', val: shown.filter(s => s.status !== 'Cancelled').length, color: 'var(--gray-800)', bg: 'var(--gray-50)' },
          { label: 'In Progress', val: shown.filter(s => s.status === 'In Progress').length, color: '#4338ca', bg: 'rgba(99,102,241,0.08)' },
          { label: 'PAC Pending', val: shown.filter(s => s.pac_status === 'Pending' && s.status === 'Scheduled').length, color: '#b45309', bg: 'rgba(245,158,11,0.08)' },
          { label: 'Completed', val: shown.filter(s => s.status === 'Completed').length, color: '#059669', bg: 'rgba(16,185,129,0.08)' }
        ].map((s, i) => (
          <div key={i} style={{ background: s.bg, borderRadius: 'var(--radius-xl)', padding: '1.25rem', border: '1px solid var(--gray-200)' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', fontWeight: 600, marginTop: '0.3rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Surgery ID</th>
                <th>Patient Details</th>
                <th>Procedure</th>
                <th>Theatre / Time</th>
                <th>Surgeon</th>
                <th>PAC Status</th>
                <th>Current Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Loading OT Schedule...</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-400)' }}>No surgeries scheduled{dateFilter ? ' on this date' : ''}</td></tr>
              ) : (
                shown.map(s => (
                  <tr key={s.id} style={{ opacity: s.status === 'Cancelled' ? 0.55 : 1 }}>
                    <td style={{ fontWeight: 700, color: 'var(--primary-700)', fontSize: '0.85rem' }}>SURG-{s.id}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{s.patient_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{s.patient_id}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.procedure_name}</td>
                    <td>
                      <div style={{ fontSize: '0.85rem', color: 'var(--gray-800)', fontWeight: 600 }}>{s.theatre}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}><Clock size={11} style={{ display:'inline', marginBottom: -1 }}/> {s.scheduled_date ? new Date(s.scheduled_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''} {s.scheduled_time}</div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>Dr. {s.surgeon}</td>
                    <td>
                      <span className={`badge ${s.pac_status === 'Cleared' ? 'badge-success' : 'badge-warning'}`}>
                        {s.pac_status}
                      </span>
                    </td>
                    <td>
                      <span style={{ 
                        padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                        background: s.status === 'In Progress' ? 'rgba(99,102,241,0.1)' : s.status === 'Completed' ? 'rgba(16,185,129,0.1)' : s.status === 'Cancelled' ? 'rgba(239,68,68,0.1)' : 'var(--gray-100)',
                        color: s.status === 'In Progress' ? '#4338ca' : s.status === 'Completed' ? '#059669' : s.status === 'Cancelled' ? '#dc2626' : 'var(--gray-600)'
                      }}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        {s.status !== 'Cancelled' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => handleUpdate(s)} disabled={s.status === 'Completed' || busyId === s.id}>
                            {s.status === 'Completed' ? 'Done' : s.pac_status === 'Pending' ? 'Clear PAC' : s.status === 'Scheduled' ? 'Start Surgery' : 'Complete'}
                          </button>
                        )}
                        {s.status === 'Scheduled' && (
                          <>
                            <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => { setEditing(s); setShowModal(true) }}><Pencil size={13} /></button>
                            <button className="btn btn-ghost btn-sm" title="Cancel surgery" style={{ color: '#dc2626', fontSize: '0.72rem' }} onClick={() => handleCancel(s)} disabled={busyId === s.id}>Cancel</button>
                          </>
                        )}
                        {(s.status === 'Scheduled' || s.status === 'Cancelled') && (
                          <button className="btn btn-ghost btn-sm btn-icon" title="Delete booking" style={{ color: '#dc2626' }} onClick={() => handleDelete(s)} disabled={busyId === s.id}><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showModal && <ScheduleModal patients={patients} doctors={doctors} surgery={editing} onClose={() => { setShowModal(false); setEditing(null) }} onSave={handleSaved} />}
    </div>
  )
}
