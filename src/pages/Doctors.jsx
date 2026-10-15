import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, Plus, Star, Phone, X, Calendar, Loader, Pencil, Trash2, Save, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react'
import { api } from '../api'
import { readSheet, mapDoctorRows, downloadDoctorTemplate, IMPORT_COLUMNS } from '../utils/doctorImport'
import { DEPARTMENTS, splitDepartments, joinDepartments, mergeDepartments } from '../utils/departments'
import MultiSelectCombo from '../components/MultiSelectCombo'

const STATUS_STYLES = {
  'available': { bg: 'rgba(16,185,129,0.1)', color: '#059669', label: 'Available', dot: '#059669' },
  'in-consultation': { bg: 'rgba(99,102,241,0.1)', color: '#4338ca', label: 'In Consultation', dot: '#6366f1' },
  'on-leave': { bg: 'rgba(239,68,68,0.1)', color: '#dc2626', label: 'On Leave', dot: '#ef4444' },
}

const STATUS_LABEL = { 'available': 'Available', 'in-consultation': 'In Consultation', 'on-leave': 'On Leave' }

// Bulk-add doctors (e.g. historical records) from a CSV / Excel sheet
function BulkDoctorImport({ onClose, onSave }) {
  const [fileName, setFileName] = useState(null)
  const [rows, setRows] = useState([])
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  const handleFile = async (file) => {
    if (!file) return
    setReading(true); setError(null); setRows([]); setFileName(file.name)
    try {
      const [sheet, existing] = await Promise.all([readSheet(file), api.getDoctors()])
      const { rows: mapped, missing } = mapDoctorRows(sheet, existing)
      if (missing.length) throw new Error(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template to see the expected headings.`)
      if (!mapped.length) throw new Error('The file has no doctor rows below the header.')
      setRows(mapped)
    } catch (e) { setError(e.message); setFileName(null) } finally { setReading(false) }
  }

  const valid = rows.filter(r => !r.errors.length && !r.duplicate)
  const invalid = rows.filter(r => r.errors.length).length
  const dupes = rows.filter(r => r.duplicate).length

  const handleImport = async () => {
    setImporting(true); setError(null)
    try {
      const { created } = await api.bulkCreateDoctors(valid.map(r => r.data))
      created.slice().reverse().forEach(onSave)
      onClose()
    } catch (e) { setError(e.message) } finally { setImporting(false) }
  }

  return (
    <>
      <div className="modal-body">
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239,68,68,0.08)', color: '#dc2626', padding: '0.75rem 1rem', borderRadius: 'var(--radius-lg)', marginBottom: '1rem', fontSize: '0.875rem' }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />{error}
          </div>
        )}
        <div
          onClick={() => !reading && !importing && fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (!importing) handleFile(e.dataTransfer.files[0]) }}
          style={{
            border: `2px dashed ${dragOver ? 'var(--primary-500)' : 'var(--gray-200)'}`, borderRadius: 'var(--radius-xl)',
            padding: rows.length ? '1rem' : '2rem', textAlign: 'center', cursor: 'pointer',
            background: dragOver ? 'var(--primary-50)' : 'var(--gray-50)', transition: 'all 200ms', marginBottom: '1rem',
          }}
        >
          <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }}
            onChange={e => { handleFile(e.target.files[0]); e.target.value = '' }} />
          {reading ? (
            <div style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}><Loader size={16} className="spin" style={{ display: 'inline-block', verticalAlign: 'middle' }} /> Reading {fileName}...</div>
          ) : fileName && rows.length ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--gray-700)' }}>
              <FileSpreadsheet size={18} color="#059669" /><strong>{fileName}</strong>
              <span style={{ color: 'var(--gray-400)' }}>· click or drop to choose another file</span>
            </div>
          ) : (
            <div>
              <FileSpreadsheet size={32} color="var(--primary-500)" style={{ marginBottom: '0.5rem' }} />
              <div style={{ fontWeight: 600, color: 'var(--gray-700)', marginBottom: '0.25rem' }}>Drag & drop an Excel or CSV file</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--gray-400)' }}>or click to browse · .xlsx or .csv · first row must be the column headings</div>
            </div>
          )}
        </div>

        {!rows.length && (
          <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', lineHeight: 1.6 }}>
            <div style={{ marginBottom: '0.375rem' }}>
              Columns: {IMPORT_COLUMNS.map(c => c.label + (c.required ? '*' : '')).join(', ')}.
              For several departments, separate them with commas (e.g. "Cardiology, General Medicine"). Status can be Available / In Consultation / On Leave; Doctor Type can be In House / Visiting (blank = In House).
            </div>
            <button className="btn btn-secondary btn-sm" onClick={downloadDoctorTemplate}><Download size={13} /> Download template</button>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8125rem', marginBottom: '0.625rem', flexWrap: 'wrap' }}>
              <span style={{ color: '#059669', fontWeight: 600 }}>{valid.length} ready to import</span>
              {dupes > 0 && <span style={{ color: '#b45309', fontWeight: 600 }}>{dupes} already exist — will be skipped</span>}
              {invalid > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>{invalid} with errors — will be skipped</span>}
            </div>
            <div style={{ maxHeight: 340, overflow: 'auto', border: '1px solid var(--gray-100)', borderRadius: 'var(--radius-lg)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', textAlign: 'left', position: 'sticky', top: 0 }}>
                    {['Row', 'Name', 'Department', 'Qualification', 'Exp', 'Phone', 'Status', 'Type', 'Result'].map(h => (
                      <th key={h} style={{ padding: '0.5rem 0.625rem', fontWeight: 600, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const bad = r.errors.length > 0
                    return (
                      <tr key={r.line} style={{ borderTop: '1px solid var(--gray-100)', background: bad ? 'rgba(239,68,68,0.04)' : r.duplicate ? 'rgba(245,158,11,0.05)' : 'transparent' }}>
                        <td style={{ padding: '0.5rem 0.625rem', color: 'var(--gray-400)' }}>{r.line}</td>
                        <td style={{ padding: '0.5rem 0.625rem', fontWeight: 600, color: 'var(--gray-800)' }}>{r.data.name || '—'}</td>
                        <td style={{ padding: '0.5rem 0.625rem' }}>{r.data.department || '—'}</td>
                        <td style={{ padding: '0.5rem 0.625rem' }}>{r.data.qualification || '—'}</td>
                        <td style={{ padding: '0.5rem 0.625rem' }}>{bad ? '' : r.data.experience}</td>
                        <td style={{ padding: '0.5rem 0.625rem' }}>{r.data.phone || '—'}</td>
                        <td style={{ padding: '0.5rem 0.625rem', whiteSpace: 'nowrap' }}>{STATUS_LABEL[r.data.status] || r.data.status}</td>
                        <td style={{ padding: '0.5rem 0.625rem', whiteSpace: 'nowrap' }}>{r.data.doctor_type === 'visiting' ? 'Visiting' : r.data.doctor_type === 'in-house' ? 'In House' : r.data.doctor_type}</td>
                        <td style={{ padding: '0.5rem 0.625rem', minWidth: 160 }}>
                          {bad ? <span style={{ color: '#dc2626' }}>{r.errors.join('; ')}</span>
                            : r.duplicate ? <span style={{ color: '#b45309' }}>{r.duplicate}</span>
                            : <span style={{ color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={13} /> Ready</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={importing}>Cancel</button>
        <button className="btn btn-primary" onClick={handleImport} disabled={importing || reading || !valid.length}>
          {importing ? <Loader size={14} className="spin" /> : <Upload size={14} />} Import {valid.length ? `${valid.length} Doctor${valid.length > 1 ? 's' : ''}` : 'Doctors'}
        </button>
      </div>
    </>
  )
}

// Add a doctor, or edit one when `doctor` is given
function AddDoctorModal({ doctor, departments = [], onClose, onSave }) {
  const [form, setForm] = useState(doctor
    ? { ...Object.fromEntries(['name', 'department', 'qualification', 'experience', 'rating', 'status', 'schedule', 'phone', 'email'].map(k => [k, doctor[k] ?? ''])), doctor_type: doctor.doctor_type || 'in-house' }
    : {
      name: '', department: '', qualification: '', experience: '', rating: '5.0',
      status: 'available', schedule: '', phone: '', email: '', doctor_type: 'in-house',
    })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('single') // 'single' | 'bulk' — bulk import only when adding

  const handle = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name.trim() || !splitDepartments(form.department).length) { setError('Name and at least one Department are required.'); return }
    setSaving(true); setError(null)
    try {
      const data = { ...form, experience: form.experience === '' ? 0 : Number(form.experience) }
      const doc = doctor ? await api.updateDoctor(doctor.id, data) : await api.createDoctor(data)
      onSave(doc); onClose()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h4 style={{ color: 'var(--gray-900)', fontWeight: 700 }}>{doctor ? 'Edit Doctor' : 'Add New Doctor'}</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)', marginTop: 2 }}>{doctor ? doctor.id : mode === 'bulk' ? 'Import many doctors at once from an Excel / CSV file' : "Fill in the doctor's details"}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {!doctor && (
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                <button className={`btn btn-sm ${mode === 'single' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('single')}><Plus size={13} /> Single</button>
                <button className={`btn btn-sm ${mode === 'bulk' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('bulk')}><FileSpreadsheet size={13} /> Bulk Import</button>
              </div>
            )}
            <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        {mode === 'bulk' ? <BulkDoctorImport onClose={onClose} onSave={onSave} /> : <>
        <div className="modal-body">
          {error && <div style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', padding: '0.75rem 1rem', borderRadius: 'var(--radius-lg)', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>}
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            {[
              ['name', 'Full Name*', 'text', 'e.g. Dr. Anjali Sharma'],
              ['department', 'Department(s)*', 'text', ''],
              ['qualification', 'Qualification', 'text', 'e.g. MBBS, MD'],
              ['experience', 'Experience (years)', 'number', 'e.g. 10'],
              ['phone', 'Phone', 'tel', 'e.g. 98765 10010'],
              ['email', 'Email', 'email', 'e.g. a.sharma@dscribe.in'],
              ['schedule', 'Working Schedule', 'text', 'e.g. Mon–Fri, 9AM–5PM'],
            ].map(([key, label, type, ph]) => key === 'department' ? (
              <div key={key} className="form-group">
                <label className="form-label">{label}</label>
                <MultiSelectCombo
                  options={mergeDepartments(DEPARTMENTS, departments)}
                  value={splitDepartments(form.department)}
                  onChange={list => handle('department', joinDepartments(list))}
                  placeholder="Search or select departments..."
                />
              </div>
            ) : (
              <div key={key} className="form-group">
                <label className="form-label">{label}</label>
                <input className="form-input" type={type} placeholder={ph} value={form[key]} onChange={e => handle(key, e.target.value)} />
              </div>
            ))}
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input form-select" value={form.status} onChange={e => handle('status', e.target.value)}>
                <option value="available">Available</option>
                <option value="in-consultation">In Consultation</option>
                <option value="on-leave">On Leave</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Doctor Type</label>
              <select className="form-input form-select" value={form.doctor_type} onChange={e => handle('doctor_type', e.target.value)}>
                <option value="in-house">In House</option>
                <option value="visiting">Visiting</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader size={14} className="spin" /> : doctor ? <Save size={14} /> : <Plus size={14} />} {doctor ? 'Save Changes' : 'Add Doctor'}
          </button>
        </div>
        </>}
      </div>
    </div>
  )
}

function DoctorModal({ doc, onClose, onEdit, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const handleDelete = async () => {
    if (!window.confirm(`Delete ${doc.name}? This cannot be undone.`)) return
    setDeleting(true)
    try { await api.deleteDoctor(doc.id); onDeleted(doc.id); onClose() }
    catch (e) { alert(e.message) } finally { setDeleting(false) }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h4 style={{ color: 'var(--gray-900)', fontWeight: 700 }}>Doctor Profile</h4>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem', padding: '1.25rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-xl)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-500), var(--accent-teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
              {doc.name.split(' ').slice(1).map(n => n[0]).join('')}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)', marginBottom: '0.25rem' }}>{doc.name}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginBottom: '0.5rem' }}>{doc.department} · {doc.qualification}</div>
              <span style={{ background: STATUS_STYLES[doc.status]?.bg, color: STATUS_STYLES[doc.status]?.color, fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 999 }}>
                {STATUS_STYLES[doc.status]?.label}
              </span>
            </div>
          </div>
          {[
            ['Employee ID', doc.id],
            ['Doctor Type', doc.doctor_type === 'visiting' ? 'Visiting' : 'In House'],
            ['Experience', `${doc.experience} years`],
            ['Total Patients', doc.patient_count],
            ['Rating', `${doc.rating} / 5.0`],
            ['Working Schedule', doc.schedule],
            ['Phone', doc.phone],
            ['Email', doc.email],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', padding: '0.75rem 0', borderBottom: '1px solid var(--gray-100)' }}>
              <span style={{ width: 140, fontSize: '0.8rem', color: 'var(--gray-400)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--gray-700)', fontWeight: 500 }}>{val || '—'}</span>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" style={{ color: '#dc2626', marginRight: 'auto' }} onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader size={14} className="spin" /> : <Trash2 size={14} />} Delete
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => onEdit(doc)}><Pencil size={14} /> Edit</button>
        </div>
      </div>
    </div>
  )
}

export default function Doctors() {
  const [doctors, setDoctors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [deptFilter, setDeptFilter] = useState('All')
  const [departments, setDepartments] = useState([])
  const [selected, setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true); setError(null)
      api.getDoctors({ search, status: statusFilter, dept: deptFilter })
        .then(d => setDoctors(d))
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [search, statusFilter, deptFilter])

  // Department dropdown lists every department in use (case-insensitive, unaffected by the other filters)
  const [deptVersion, setDeptVersion] = useState(0)
  useEffect(() => {
    api.getDoctors().then(all => {
      setDepartments(mergeDepartments(all.flatMap(d => splitDepartments(d.department))))
    }).catch(() => {})
  }, [deptVersion])

  const refreshDepartments = () => setDeptVersion(v => v + 1)

  const handleSave = (doc) => { refreshDepartments(); setDoctors(prev => prev.some(d => d.id === doc.id) ? prev.map(d => d.id === doc.id ? doc : d) : [doc, ...prev]) }

  return (
    <div className="animate-fadeInUp">
      <div className="page-header">
        <div>
          <h1 className="page-title">Doctors</h1>
          <p className="page-subtitle">{loading ? '…' : `${doctors.length}`} medical practitioners currently on staff</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Doctor</button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-3" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Available Now', val: doctors.filter(d => d.status === 'available').length, color: '#059669', bg: 'rgba(16,185,129,0.06)' },
          { label: 'In Consultation', val: doctors.filter(d => d.status === 'in-consultation').length, color: '#4338ca', bg: 'rgba(99,102,241,0.08)' },
          { label: 'On Leave', val: doctors.filter(d => d.status === 'on-leave').length, color: '#dc2626', bg: 'rgba(239,68,68,0.06)' },
        ].map((s, i) => (
          <div key={i} style={{ background: s.bg, borderRadius: 'var(--radius-xl)', padding: '1.25rem', border: '1px solid rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: s.color, letterSpacing: '-0.04em', lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', marginTop: '0.375rem', fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input className="form-input" style={{ paddingLeft: '2.25rem' }} placeholder="Search by name or department..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-input form-select" style={{ width: 220 }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)} title="Filter by department">
          <option value="All">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['All', 'available', 'in-consultation', 'on-leave'].map(f => (
            <button key={f} className={`btn btn-sm ${statusFilter === f ? 'btn-primary' : 'btn-secondary'}`}
              style={{ textTransform: 'capitalize' }} onClick={() => setStatusFilter(f)}>
              {STATUS_STYLES[f]?.label || 'All'}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.06)', color: '#dc2626', borderRadius: 'var(--radius-lg)', marginBottom: '1.25rem', fontSize: '0.875rem' }}>⚠ {error}</div>}

      {/* Doctors Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--gray-400)' }}><Loader size={24} className="spin" style={{ display: 'inline-block' }} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {doctors.map(doc => (
            <div key={doc.id} className="card card-hoverable" style={{ cursor: 'pointer', padding: '1.5rem' }} onClick={() => setSelected(doc)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.125rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                  <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-500), var(--accent-teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 800, color: '#fff', flexShrink: 0, position: 'relative' }}>
                    {doc.name.split(' ').slice(1).map(n => n[0]).join('')}
                    <span style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', background: STATUS_STYLES[doc.status]?.dot, border: '2px solid #fff' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--gray-900)', marginBottom: '0.15rem' }}>{doc.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{doc.department}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Star size={12} fill="#f59e0b" color="#f59e0b" />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--gray-700)' }}>{doc.rating}</span>
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: '1rem', fontStyle: 'italic' }}>{doc.qualification}</div>
              <div className="divider" />
              <div style={{ display: 'flex', gap: '1.5rem', padding: '0.5rem 0' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)', letterSpacing: '-0.03em' }}>{doc.patient_count}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>Patients</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)', letterSpacing: '-0.03em' }}>{doc.experience}y</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>Experience</div>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <span style={{ background: STATUS_STYLES[doc.status]?.bg, color: STATUS_STYLES[doc.status]?.color, fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {STATUS_STYLES[doc.status]?.label}
                  </span>
                </div>
              </div>
              <div className="divider" />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                  <Phone size={12} /> Call
                </button>
                <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                  <Calendar size={12} /> Schedule
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Portalled to <body> so the overlay covers the viewport and the dialog stays centred,
          whatever the page wrapper's animation / scroll position */}
      {createPortal(<>
        {selected && <DoctorModal doc={selected} onClose={() => setSelected(null)}
          onEdit={d => { setSelected(null); setEditing(d) }}
          onDeleted={id => { refreshDepartments(); setDoctors(prev => prev.filter(d => d.id !== id)) }} />}
        {showAdd && <AddDoctorModal departments={departments} onClose={() => setShowAdd(false)} onSave={handleSave} />}
        {editing && <AddDoctorModal doctor={editing} departments={departments} onClose={() => setEditing(null)} onSave={handleSave} />}
      </>, document.body)}
    </div>
  )
}
