import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { api, BASE_URL, SERVER_URL } from '../api'
import { analyzeTemplate, loadPdfjs } from '../utils/formLayout'
import TemplateEditModal from '../components/TemplateEditModal'
import {
  Upload, Search, Trash2, FileText, Plus, Tag, Eye, X,
  CheckCircle, AlertCircle, Loader, FolderOpen, Pencil
} from 'lucide-react'

const CATEGORIES = ['General', 'Consent', 'Assessment', 'Discharge', 'Nursing', 'ICU', 'OT', 'Emergency']

const CATEGORY_COLORS = {
  General: { bg: 'var(--gray-100)', color: 'var(--gray-600)' },
  Consent: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626' },
  Assessment: { bg: 'rgba(99,102,241,0.1)', color: '#4338ca' },
  Discharge: { bg: 'rgba(16,185,129,0.1)', color: '#059669' },
  Nursing: { bg: 'rgba(245,158,11,0.1)', color: '#b45309' },
  ICU: { bg: 'rgba(239,68,68,0.12)', color: '#b91c1c' },
  OT: { bg: 'rgba(13,148,136,0.1)', color: '#0d9488' },
  Emergency: { bg: 'rgba(239,68,68,0.15)', color: '#dc2626' },
}

const fileKey = (name, size) => `${name}|${size}`

const STATUS_TEXT = {
  ready: { color: 'var(--gray-400)' },
  uploading: { color: 'var(--primary-500)' },
  done: { color: '#059669' },
  duplicate: { color: '#b45309' },
  error: { color: '#dc2626' },
}

function UploadModal({ onClose, onUploaded, token }) {
  const [items, setItems] = useState([]) // { id, file, name, category, status, message }
  const [description, setDescription] = useState('')
  const [existing, setExisting] = useState(new Map()) // file_name|file_size -> template name
  const [uploading, setUploading] = useState(false)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()
  const nextId = useRef(0)

  // Load every template once so files that were already uploaded get flagged as soon as they're picked.
  // The server makes the final call by comparing file contents.
  useEffect(() => {
    api.getFormTemplates()
      .then(list => setExisting(new Map(list.map(t => [fileKey(t.file_name, t.file_size), t.name]))))
      .catch(() => {})
  }, [])

  const update = (id, patch) => setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  const remove = (id) => setItems(prev => prev.filter(it => it.id !== id))

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    const rejected = []
    const added = []
    const seen = new Set(items.map(it => fileKey(it.file.name, it.file.size)))
    for (const f of files) {
      if (f.type !== 'application/pdf') { rejected.push(`${f.name}: only PDF files are supported`); continue }
      if (f.size > 50 * 1024 * 1024) { rejected.push(`${f.name}: must be under 50MB`); continue }
      const key = fileKey(f.name, f.size)
      if (seen.has(key)) continue // same file picked twice in this batch
      seen.add(key)
      const prior = existing.get(key)
      added.push({
        id: nextId.current++, file: f, name: f.name.replace(/\.pdf$/i, ''), category: 'General',
        status: prior ? 'duplicate' : 'ready',
        message: prior ? `Already uploaded as "${prior}"` : null,
      })
    }
    setItems(prev => [...prev, ...added])
    setError(rejected.length ? rejected.join(' · ') : null)
    setFinished(false)
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const uploadOne = async (it) => {
    const fd = new FormData()
    fd.append('pdf', it.file)
    fd.append('name', it.name.trim())
    fd.append('description', description)
    fd.append('category', it.category)
    const res = await fetch(`${BASE_URL}/forms/templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 409) { update(it.id, { status: 'duplicate', message: data.error }); return false }
    if (!res.ok) throw new Error(data.error || 'Upload failed')
    const template = data
    // Scan the form for blanks and empty header space so patient details and the
    // hospital logo land in the right places. If this fails, the form viewer scans it
    // on first open instead — the upload itself has already succeeded.
    update(it.id, { message: 'Scanning layout...' })
    try {
      const pdfjsLib = await loadPdfjs()
      const pdfDoc = await pdfjsLib.getDocument({ data: await it.file.arrayBuffer() }).promise
      const layout = await analyzeTemplate(pdfDoc, {
        onProgress: ({ page, pages }) => update(it.id, { message: `Reading page ${page} of ${pages}...` }),
      })
      const saved = await api.saveFormTemplateLayout(template.id, { layout, page_count: pdfDoc.numPages })
      template.layout = layout
      template.page_count = saved.page_count
      pdfDoc.destroy()
    } catch (err) {
      console.warn('[FormTemplates] layout scan failed — will scan on first open', err)
    }
    onUploaded(template)
    update(it.id, { status: 'done', message: 'Uploaded' })
    return true
  }

  const pending = items.filter(it => it.status === 'ready' || it.status === 'error')
  const counts = { duplicate: items.filter(it => it.status === 'duplicate').length }

  const handleSubmit = async () => {
    if (!pending.length) { setError(items.length ? 'Nothing new to upload.' : 'Please select at least one PDF file.'); return }
    if (pending.some(it => !it.name.trim())) { setError('Every form needs a name.'); return }
    setUploading(true); setError(null)
    let allOk = counts.duplicate === 0
    for (const it of pending) {
      update(it.id, { status: 'uploading', message: 'Uploading...' })
      try { if (!await uploadOne(it)) allOk = false } catch (e) { allOk = false; update(it.id, { status: 'error', message: e.message }) }
    }
    setUploading(false)
    // Close straight away when everything went through; otherwise leave the results on screen
    if (allOk) onClose()
    else setFinished(true)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !uploading && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <h4 style={{ color: 'var(--gray-900)', fontWeight: 700 }}>Upload Form Templates</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)', marginTop: 2 }}>Upload one or more hospital PDF forms to make them available for patients</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={uploading}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239,68,68,0.08)', color: '#dc2626', padding: '0.75rem 1rem', borderRadius: 'var(--radius-lg)', marginBottom: '1rem', fontSize: '0.875rem' }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />{error}
            </div>
          )}

          {/* Drop Zone */}
          <div
            onClick={() => !uploading && fileRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => uploading ? e.preventDefault() : handleDrop(e)}
            style={{
              border: `2px dashed ${dragOver ? 'var(--primary-500)' : 'var(--gray-200)'}`,
              borderRadius: 'var(--radius-xl)',
              padding: items.length ? '1.25rem' : '2.5rem',
              textAlign: 'center',
              cursor: uploading ? 'default' : 'pointer',
              background: dragOver ? 'var(--primary-50)' : 'var(--gray-50)',
              transition: 'all 200ms',
              marginBottom: '1.25rem',
            }}
          >
            <input ref={fileRef} type="file" multiple accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
            {items.length ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--gray-600)', fontSize: '0.875rem' }}>
                <Plus size={16} /> Add more PDFs
              </div>
            ) : (
              <div>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                  <Upload size={24} color="var(--primary-500)" />
                </div>
                <div style={{ fontWeight: 600, color: 'var(--gray-700)', marginBottom: '0.375rem' }}>Drag & drop your PDFs here</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-400)' }}>or click to browse · select several at once · Max 50MB each</div>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1.25rem', maxHeight: 360, overflowY: 'auto' }}>
              {items.map(it => {
                const locked = uploading || it.status === 'done' || it.status === 'duplicate' || it.status === 'uploading'
                return (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--gray-100)', background: it.status === 'duplicate' ? 'rgba(245,158,11,0.06)' : 'transparent' }}>
                    <div style={{ flexShrink: 0 }}>
                      {it.status === 'done' ? <CheckCircle size={18} color="#10b981" />
                        : it.status === 'uploading' ? <Loader size={18} className="spin" color="var(--primary-500)" />
                        : it.status === 'duplicate' || it.status === 'error' ? <AlertCircle size={18} color={STATUS_TEXT[it.status].color} />
                        : <FileText size={18} color="var(--gray-400)" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input className="form-input" style={{ padding: '0.375rem 0.625rem', fontSize: '0.875rem' }} placeholder="Form name" value={it.name} disabled={locked} onChange={e => update(it.id, { name: e.target.value })} />
                      <div style={{ fontSize: '0.75rem', marginTop: 4, display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--gray-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{it.file.name} · {(it.file.size / 1024).toFixed(1)} KB</span>
                        {it.message && <span style={{ color: STATUS_TEXT[it.status].color, fontWeight: 600 }}>· {it.message}</span>}
                      </div>
                    </div>
                    <select className="form-input form-select" style={{ width: 140, padding: '0.375rem 0.625rem', fontSize: '0.8125rem' }} value={it.category} disabled={locked} onChange={e => update(it.id, { category: e.target.value })}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-icon" title="Remove" disabled={uploading || it.status === 'uploading'} onClick={() => remove(it.id)}><X size={15} /></button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Description{items.length > 1 ? ' (applied to all)' : ''}</label>
            <input className="form-input" placeholder="Brief description of the form..." value={description} disabled={uploading} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          {counts.duplicate > 0 && (
            <span style={{ marginRight: 'auto', fontSize: '0.8125rem', color: '#b45309' }}>
              {counts.duplicate} already uploaded — skipped
            </span>
          )}
          <button className="btn btn-secondary" onClick={onClose} disabled={uploading}>{finished ? 'Close' : 'Cancel'}</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={uploading || !pending.length}>
            {uploading ? <><Loader size={14} className="spin" /> Uploading...</> : <><Upload size={14} /> Upload {pending.length > 1 ? `${pending.length} Forms` : 'Form'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FormTemplates() {
  const { token, isAdmin } = useAuth() // upload / edit / delete are admin-only on the server
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showModal, setShowModal] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [editing, setEditing] = useState(null)

  const saveEdit = async (data) => {
    const updated = await api.updateFormTemplate(editing.id, data)
    setTemplates(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
  }

  const fetchTemplates = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = {}
      if (categoryFilter !== 'All') params.category = categoryFilter
      if (search) params.search = search
      const url = new URLSearchParams(params)
      const res = await fetch(`${BASE_URL}/forms/templates?${url}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load templates')
      setTemplates(data)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [search, categoryFilter, token])

  useEffect(() => {
    const t = setTimeout(fetchTemplates, 300)
    return () => clearTimeout(t)
  }, [fetchTemplates])

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this form template? All patient form instances will also be deleted.')) return
    setDeleting(id)
    try {
      await api.deleteFormTemplate(id)
      setTemplates(t => t.filter(x => x.id !== id))
    } catch (e) { alert('Delete failed: ' + e.message) } finally { setDeleting(null) }
  }

  return (
    <>
    <div className="animate-fadeInUp">
      <div className="page-header">
        <div>
          <h1 className="page-title">Form Templates</h1>
          <p className="page-subtitle">Upload and manage hospital PDF forms for patient use</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Upload size={15} /> Upload Form
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-4" style={{ gap: '1rem', marginBottom: '1.75rem' }}>
        {[
          { label: 'Total Forms', val: templates.length, color: 'var(--gray-700)', bg: 'var(--gray-50)' },
          { label: 'Consent Forms', val: templates.filter(t => t.category === 'Consent').length, color: '#dc2626', bg: 'rgba(239,68,68,0.06)' },
          { label: 'Assessment Forms', val: templates.filter(t => t.category === 'Assessment').length, color: '#4338ca', bg: 'rgba(99,102,241,0.06)' },
          { label: 'Nursing Forms', val: templates.filter(t => t.category === 'Nursing').length, color: '#b45309', bg: 'rgba(245,158,11,0.06)' },
        ].map((s, i) => (
          <div key={i} style={{ background: s.bg, borderRadius: 'var(--radius-xl)', padding: '1.25rem', border: '1px solid rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: s.color, letterSpacing: '-0.04em', lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', marginTop: '0.375rem', fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input className="form-input" style={{ paddingLeft: '2.25rem' }} placeholder="Search forms..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['All', ...CATEGORIES].map(f => (
            <button key={f} className={`btn btn-sm ${categoryFilter === f ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCategoryFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      {error && <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.06)', color: '#dc2626', borderRadius: 'var(--radius-lg)', marginBottom: '1.25rem', fontSize: '0.875rem' }}>⚠ {error}</div>}

      {/* Templates Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--gray-400)' }}><Loader size={24} className="spin" style={{ display: 'inline-block' }} /></div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '5rem 2rem' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <FolderOpen size={36} color="var(--gray-300)" />
          </div>
          <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--gray-700)', marginBottom: '0.5rem' }}>No forms yet</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--gray-400)', marginBottom: '1.5rem' }}>Upload your first hospital form template to get started</div>
          {isAdmin && <button className="btn btn-primary" onClick={() => setShowModal(true)}><Upload size={15} /> Upload Form</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {templates.map(t => (
            <div key={t.id} className="card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
              {/* Decorative corner */}
              <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: 'linear-gradient(225deg, var(--primary-50) 0%, transparent 60%)', borderRadius: 'var(--radius-xl)' }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, var(--primary-500), var(--accent-teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={22} color="#fff" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--gray-900)', marginBottom: '0.25rem', lineHeight: 1.3 }}>{t.name}</div>
                  <span style={{ ...CATEGORY_COLORS[t.category], fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t.category}
                  </span>
                </div>
              </div>

              {t.description && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', marginBottom: '1rem', lineHeight: 1.5 }}>{t.description}</p>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--gray-400)', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <span>{t.file_name}</span>
                {t.file_size && <span>· {(t.file_size / 1024).toFixed(0)} KB</span>}
                <span>· Added {new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>

              <div className="divider" style={{ margin: '0 0 1rem' }} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <a
                  href={`${SERVER_URL}${t.file_path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}
                >
                  <Eye size={13} /> Preview
                </a>
                {isAdmin && (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0.375rem 0.75rem' }}
                      title="Edit name / category"
                      onClick={() => setEditing(t)}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ padding: '0.375rem 0.75rem' }}
                      onClick={() => handleDelete(t.id)}
                      disabled={deleting === t.id}
                    >
                      {deleting === t.id ? <Loader size={12} className="spin" /> : <Trash2 size={13} />}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
    {showModal && <UploadModal onClose={() => setShowModal(false)} onUploaded={t => setTemplates(prev => [t, ...prev])} token={token} />}
    {editing && <TemplateEditModal template={editing} category={editing.category} categories={CATEGORIES} onClose={() => setEditing(null)} onSave={saveEdit} />}
    </>
  )
}
