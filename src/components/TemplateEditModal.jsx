import { useState } from 'react'
import { X, Save, Loader } from 'lucide-react'

// Rename / recategorise an uploaded PDF template (form or discharge summary).
export default function TemplateEditModal({ template, categories, category, onClose, onSave }) {
  const [form, setForm] = useState({ name: template.name || '', category: category || 'General', description: template.description || '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError(null)
    try { await onSave({ ...form, name: form.name.trim() }); onClose() }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h4 style={{ color: 'var(--gray-900)', fontWeight: 700 }}>Edit Template</h4>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && <div style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-lg)', fontSize: '0.85rem' }}>{error}</div>}
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-input form-select" value={form.category} onChange={e => set('category', e.target.value)}>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>To change the PDF itself, upload it as a new template and delete this one.</div>
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
