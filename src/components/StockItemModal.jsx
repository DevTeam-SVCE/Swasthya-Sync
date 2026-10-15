import { useState } from 'react'
import { X, Save, Loader } from 'lucide-react'
import { api } from '../api'

// Edit an inventory / pharmacy item: details, price, expiry and a stock correction.
export default function StockItemModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: item.name || '', category: item.category || '', manufacturer: item.manufacturer || '',
    unit: item.unit || '', price: item.price ?? '', expiry: item.expiry ? String(item.expiry).slice(0, 10) : '',
    stock: item.stock ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    const stock = parseInt(form.stock)
    if (!(stock >= 0)) { setError('Stock must be 0 or more'); return }
    setSaving(true); setError(null)
    try {
      const updated = await api.updatePharmacy(item.id, {
        ...form, name: form.name.trim(), stock, price: form.price === '' ? null : Number(form.price),
      })
      onSaved(updated); onClose()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const diff = (parseInt(form.stock) || 0) - (item.stock || 0)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <h4 style={{ color: 'var(--gray-900)', fontWeight: 700 }}>Edit Item</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)', marginTop: 2 }}>INV-{item.id}</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && <div style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-lg)', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>}
          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Name *</label>
              <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <input className="form-input" value={form.category} onChange={e => set('category', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Manufacturer</label>
              <input className="form-input" value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Unit</label>
              <input className="form-input" value={form.unit} onChange={e => set('unit', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Price per unit (₹)</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Expiry</label>
              <input className="form-input" type="date" value={form.expiry} onChange={e => set('expiry', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Stock on hand</label>
              <input className="form-input" type="number" min="0" value={form.stock} onChange={e => set('stock', e.target.value)} />
              {diff !== 0 && (
                <div style={{ fontSize: '0.75rem', marginTop: 4, color: diff > 0 ? '#059669' : '#b45309' }}>
                  Stock correction: {diff > 0 ? '+' : ''}{diff} {form.unit}
                </div>
              )}
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
