import { useState, useEffect, useCallback } from 'react'
import { Droplet, Plus, AlertCircle, Heart, CheckCircle, Loader, X, Trash2 } from 'lucide-react'
import { api } from '../api'

const BLOOD_GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']

export default function BloodBank() {
  const [inventory, setInventory] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const [showDonorModal, setShowDonorModal] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [admittedPatients, setAdmittedPatients] = useState([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [stock, reqs, beds] = await Promise.all([api.getBloodStock(), api.getBloodRequests(), api.getBeds()])
      setInventory(stock)
      const occupied = beds.filter(b => b.status === 'occupied')
      setAdmittedPatients(occupied)
      const wardOf = Object.fromEntries(beds.filter(b => b.patient_id).map(b => [b.patient_id, b.ward]))
      setRequests(reqs.map(r => ({ ...r, ward: wardOf[r.patient_id] || '—' })))
    } catch (e) {
      alert('Could not load blood bank: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleRegisterDonor = async (form) => {
    try {
      await api.createBloodDonation({ donor_name: form.donorName, blood_group: form.group, units: Number(form.units) })
      setShowDonorModal(false)
      loadData()
    } catch (e) { alert("Failed: " + e.message) }
  }

  const handleNewRequest = async (form) => {
    try {
      await api.createBloodRequest({
        patient_id: form.patient_id, blood_group: form.group, units: Number(form.units),
        product_type: form.type, priority: form.priority, status: 'Pending',
      })
      setShowRequestModal(false)
      loadData()
    } catch (e) { alert("Failed: " + e.message) }
  }

  // Each step updates the same request; issuing deducts stock on the server in one transaction
  const processRequest = async (req, action) => {
    try {
      if (action === 'Issue') await api.issueBloodRequest(req.id)
      else if (action === 'Cancel') {
        if (!window.confirm(`Cancel the ${req.blood_group} request for ${req.patient_name}?`)) return
        await api.updateBloodRequest(req.id, { status: 'Cancelled' })
      } else await api.updateBloodRequest(req.id, { status: 'Cross-Matching' })
      loadData()
    } catch (e) { alert("Failed to process: " + e.message) }
  }

  const deleteRequest = async (req) => {
    if (!window.confirm(`Delete request REQ-${req.id}? This cannot be undone.`)) return
    try { await api.deleteBloodRequest(req.id); loadData() } catch (e) { alert('Delete failed: ' + e.message) }
  }

  return (
    <div className="animate-fadeInUp">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Blood Bank & Transfusion</h1>
          <p className="page-subtitle">Live stock tracking, donations, and ward requisitions</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => setShowDonorModal(true)}><Heart size={14} /> Register Donation</button>
          <button className="btn btn-primary" onClick={() => setShowRequestModal(true)}><Plus size={14} /> New Transfusion Req</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem', background: 'linear-gradient(to right, #7f1d1d, #b91c1c)', color: '#fff', boxShadow: '0 10px 15px -3px rgba(185,28,28,0.3)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Droplet size={18} /> Live Inventory Status
        </h3>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}><Loader className="spin" color="#fff" /></div>
        ) : (
          <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
            {inventory.map(inv => {
              const stock = Number(inv.units)
              const isCritical = stock < 5
              return (
                <div key={inv.id} style={{ 
                  background: 'rgba(255,255,255,0.1)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', minWidth: '110px',
                  border: `2px solid rgba(255,255,255,${isCritical ? '0.8' : '0.1'})`,
                  boxShadow: isCritical ? '0 0 15px rgba(255,255,255,0.3)' : 'none',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: '0.2rem', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{inv.blood_group}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{stock} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Units</span></div>
                  {isCritical && <div style={{ fontSize: '0.7rem', background: '#fff', color: '#b91c1c', padding: '0.15rem 0.4rem', borderRadius: 4, marginTop: '0.5rem', display: 'inline-block', fontWeight: 800 }}>CRITICAL</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header border-b">
          <h3 className="card-title">Active Transfusion Requests</h3>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date / Req ID</th>
                <th>Patient / Location</th>
                <th>Blood Needs</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && requests.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}><Loader className="spin" /></td></tr> : null}
              {!loading && requests.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-400)' }}>No active transfusion requests</td></tr> : null}
              {requests.map(r => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{new Date(r.created_at).toLocaleDateString()}</div>
                    <div style={{ fontWeight: 700, color: 'var(--primary-700)', fontSize: '0.75rem' }}>REQ-{r.id}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.patient_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Loc: {r.ward}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800 }}>
                      <span style={{ color: '#b91c1c', fontSize: '1.1rem' }}>{r.blood_group}</span>
                      <span style={{ color: 'var(--gray-400)' }}>•</span>
                      <span>{r.units} Unit(s)</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', fontWeight: 600, marginTop: 2 }}>{r.product_type}</div>
                  </td>
                  <td>
                    {r.priority === 'STAT' || r.priority === 'Urgent' ? <span style={{ color: '#dc2626', fontWeight: 800, fontSize: '0.75rem' }}><AlertCircle size={10} style={{display:'inline'}}/> {r.priority}</span> : <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{r.priority}</span>}
                  </td>
                  <td>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                      background: r.status === 'Issued' ? 'rgba(16,185,129,0.1)' : r.status === 'Cross-Matching' ? 'rgba(59,130,246,0.1)' : r.status === 'Cancelled' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                      color: r.status === 'Issued' ? '#059669' : r.status === 'Cross-Matching' ? '#1d4ed8' : r.status === 'Cancelled' ? '#dc2626' : '#b45309'
                    }}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      {r.status === 'Pending' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => processRequest(r, 'Cross-Match')}>Start Cross-Match</button>
                      )}
                      {r.status === 'Cross-Matching' && (
                        <button className="btn btn-primary btn-sm" style={{ background: '#10b981', borderColor: '#10b981' }} onClick={() => processRequest(r, 'Issue')}>Issue Blood</button>
                      )}
                      {r.status === 'Issued' && (
                        <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}><CheckCircle size={14} style={{display:'inline', marginBottom:-2}}/> Completed</span>
                      )}
                      {(r.status === 'Pending' || r.status === 'Cross-Matching') && (
                        <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => processRequest(r, 'Cancel')}>Cancel</button>
                      )}
                      {(r.status === 'Pending' || r.status === 'Cancelled') && (
                        <button className="btn btn-ghost btn-sm btn-icon" title="Delete request" style={{ color: '#dc2626' }} onClick={() => deleteRequest(r)}><Trash2 size={13} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DONOR MODAL */}
      {showDonorModal && <DonorModal onClose={() => setShowDonorModal(false)} onSave={handleRegisterDonor} />}
      {/* REQUEST MODAL */}
      {showRequestModal && <RequestModal admittedPatients={admittedPatients} onClose={() => setShowRequestModal(false)} onSave={handleNewRequest} />}
    </div>
  )
}

function DonorModal({ onClose, onSave }) {
  const [form, setForm] = useState({ donorName: '', group: 'O+', units: 1 })
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header"><h4>Register Blood Donation</h4><button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16}/></button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Donor Name (Optional)</label>
            <input className="form-input" placeholder="e.g. Volunteer" value={form.donorName} onChange={e => setForm({...form, donorName: e.target.value})} />
          </div>
          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Blood Group</label>
              <select className="form-input form-select" value={form.group} onChange={e => setForm({...form, group: e.target.value})}>
                {BLOOD_GROUPS.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Units Donated</label>
              <input type="number" min="1" className="form-input" value={form.units} onChange={e => setForm({...form, units: e.target.value})} />
            </div>
          </div>
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onSave(form)}>Add to Inventory</button></div>
      </div>
    </div>
  )
}

function RequestModal({ admittedPatients, onClose, onSave }) {
  const [form, setForm] = useState({ patient_id: '', group: 'O+', units: 1, type: 'PRBC (Packed Red Blood Cells)', priority: 'Routine' })
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header"><h4>New Transfusion Request</h4><button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16}/></button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Select Patient (Admitted)</label>
            <select className="form-input form-select" value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})}>
              <option value="">-- Select Patient --</option>
              {admittedPatients.map(p => <option key={p.patient_id} value={p.patient_id}>{p.patient_name} ({p.ward})</option>)}
            </select>
          </div>
          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Blood Group Needed</label>
              <select className="form-input form-select" value={form.group} onChange={e => setForm({...form, group: e.target.value})}>
                {BLOOD_GROUPS.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Units Required</label>
              <input type="number" min="1" className="form-input" value={form.units} onChange={e => setForm({...form, units: e.target.value})} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Blood Product Type</label>
            <select className="form-input form-select" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
              {['PRBC (Packed Red Blood Cells)', 'Whole Blood', 'Platelets', 'Fresh Frozen Plasma (FFP)', 'Cryoprecipitate'].map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Priority</label>
            <select className="form-input form-select" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
              <option value="Routine">Routine (Within 24 Hrs)</option>
              <option value="Urgent">Urgent (Within 4 Hrs)</option>
              <option value="STAT">STAT (Immediate/Emergency)</option>
            </select>
          </div>
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => {
          if (!form.patient_id) return alert("Please select a patient")
          onSave(form)
        }}>Submit Request</button></div>
      </div>
    </div>
  )
}
