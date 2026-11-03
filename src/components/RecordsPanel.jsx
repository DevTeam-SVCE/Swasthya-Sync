import { useState, useEffect, useRef } from 'react'
import { MoreVertical, Plus, ChevronLeft, Paperclip, PlusSquare, Search, Loader, ChevronDown, Check, Trash2 } from 'lucide-react'
import { api } from '../api'
import AttachmentsView from './AttachmentsView'

// Slide-over "Records" panel for the form viewer: the patient's forms grouped by category,
// the open one highlighted (each with a delete button on hover), plus Attachments (uploaded lab / radiology reports) and Add Records.

const GREEN = '#7dd87d'
const GREEN_DARK = '#16a34a'
const BLUE = '#2563eb'

const SORTS = [
  { key: 'assigned', label: 'Date added' },
  { key: 'name', label: 'Name (A–Z)' },
]

// Same form assigned more than once → "Medication Chart 1", "Medication Chart 2" (oldest first)
function withCopyNumbers(forms) {
  const byTemplate = new Map()
  for (const f of forms) {
    const k = f.template_id ?? f.template_name
    if (!byTemplate.has(k)) byTemplate.set(k, [])
    byTemplate.get(k).push(f)
  }
  const labels = new Map()
  for (const list of byTemplate.values()) {
    if (list.length < 2) { labels.set(list[0].id, list[0].template_name); continue }
    ;[...list].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0) || a.id - b.id)
      .forEach((f, i) => labels.set(f.id, `${f.template_name} ${i + 1}`))
  }
  return labels
}

// The order records are shown in — grouped by record set (category), each group sorted by
// date added (oldest first) or name. The viewer's next / previous form follows the same order.
export function arrangeRecords(forms, sort = 'assigned') {
  const labels = withCopyNumbers(forms)
  const byAge = (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0) || a.id - b.id
  const ordered = sort === 'name'
    ? [...forms].sort((a, b) => labels.get(a.id).localeCompare(labels.get(b.id), undefined, { numeric: true }))
    : [...forms].sort(byAge)
  const groups = new Map()
  for (const f of ordered) {
    const cat = f.category || 'General'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat).push(f)
  }
  return { labels, groups }
}

export default function RecordsPanel({ forms, activeId, activePages, patientId, sort = 'assigned', onSortChange, onSelect, onAddForm, onAddForms, onDeleteForm, onClose }) {
  const [view, setView] = useState('list') // 'list' | 'add' | 'attachments'
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(new Set())
  const menuRef = useRef()
  const activeRef = useRef()

  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest' }) }, [activeId])

  useEffect(() => {
    if (!menuOpen) return
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const [copying, setCopying] = useState(false)
  const [copyError, setCopyError] = useState(null)
  const activeForm = forms.find(f => f.id === activeId)

  // "+" adds another copy of the open form (same template) — it becomes the next number and opens
  const addCopy = async () => {
    if (!activeForm || copying) return
    setCopying(true); setCopyError(null)
    try {
      await onAddForm({
        id: activeForm.template_id, name: activeForm.template_name, category: activeForm.category,
        file_path: activeForm.file_path, file_name: activeForm.file_name,
        page_count: activeForm.page_count, layout: activeForm.layout,
      }, { keepPanelOpen: true })
    } catch (e) { setCopyError(e.message) } finally { setCopying(false) }
  }

  const [deletingId, setDeletingId] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const deleteForm = async (f, label, filled) => {
    if (deletingId) return
    if (!window.confirm(`Delete "${label}" from this patient?${filled ? ' Everything written on it will be lost.' : ''} This cannot be undone.`)) return
    setDeletingId(f.id); setDeleteError(null)
    try { await onDeleteForm(f) } catch (e) { setDeleteError(e.message) } finally { setDeletingId(null) }
  }

  const { labels, groups } = arrangeRecords(forms, sort)
  const toggleGroup = (cat) => setCollapsed(prev => {
    const next = new Set(prev)
    next.has(cat) ? next.delete(cat) : next.add(cat)
    return next
  })

  return (
    <>
      <style>{`
        @keyframes recordsPanelIn { from { transform: translateX(-100%); } to { transform: none; } }
        .records-item:hover { background: #f1f5f1; }
        .records-link:hover { text-decoration: underline; }
        .records-del { opacity: 0; transition: opacity 120ms, background 120ms; }
        .records-row:hover .records-del, .records-del:focus-visible, .records-del.busy { opacity: 1; }
        .records-del:hover { background: #fee2e2 !important; color: #dc2626 !important; }
        @media (hover: none) { .records-del { opacity: 1; } }
      `}</style>
      {/* Click-away backdrop over the rest of the viewer */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(15,23,42,0.25)' }} />
      <aside style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 41, width: 'min(320px, 85vw)',
        background: '#fff', display: 'flex', flexDirection: 'column',
        borderRadius: '0 14px 14px 0', boxShadow: '8px 0 32px rgba(0,0,0,0.25)',
        animation: 'recordsPanelIn 220ms cubic-bezier(0.4,0,0.2,1)', color: '#1f2937',
      }}>
        {/* Header (Attachments draws its own, with the scan / photo / gallery menu) */}
        {view !== 'attachments' && <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.875rem 0.75rem 0.875rem 1.125rem', borderBottom: '1px solid #e5e7eb' }}>
          {view !== 'list' && (
            <button onClick={() => setView('list')} title="Back to records" style={iconBtn}><ChevronLeft size={18} /></button>
          )}
          <div style={{ flex: 1, fontSize: '1rem', fontWeight: 600 }}>
            {view === 'list' ? 'Records' : view === 'add' ? 'Add Records' : 'Attachments'}
          </div>
          {view === 'list' && (
            <>
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button onClick={() => setMenuOpen(v => !v)} title="More options" style={iconBtn}><MoreVertical size={18} /></button>
                {menuOpen && (
                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 5, minWidth: 190, background: '#fff', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', border: '1px solid #e5e7eb', padding: '0.3rem' }}>
                    <div style={{ padding: '0.35rem 0.6rem', fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort by</div>
                    {SORTS.map(s => (
                      <button key={s.key} onClick={() => { onSortChange?.(s.key); setMenuOpen(false) }} style={menuItem}>
                        <span style={{ width: 16, display: 'inline-flex' }}>{sort === s.key && <Check size={14} />}</span>{s.label}
                      </button>
                    ))}
                    <div style={{ height: 1, background: '#f3f4f6', margin: '0.25rem 0' }} />
                    <button onClick={() => { setCollapsed(new Set()); setMenuOpen(false) }} style={menuItem}><span style={{ width: 16 }} />Expand all groups</button>
                    <button onClick={() => { setCollapsed(new Set(groups.keys())); setMenuOpen(false) }} style={menuItem}><span style={{ width: 16 }} />Collapse all groups</button>
                  </div>
                )}
              </div>
              {onAddForm && activeForm && (
                <button onClick={addCopy} disabled={copying} title={`Add another copy of ${activeForm.template_name}`} style={{ ...iconBtn, cursor: copying ? 'wait' : 'pointer' }}>
                  {copying ? <Loader size={17} className="spin" /> : <Plus size={19} />}
                </button>
              )}
            </>
          )}
        </div>}

        {view === 'list' && (
          <>
            {copyError && <div style={{ margin: '0.5rem 1rem 0', color: '#dc2626', fontSize: '0.8rem' }}>Could not add a copy: {copyError}</div>}
            {deleteError && <div style={{ margin: '0.5rem 1rem 0', color: '#dc2626', fontSize: '0.8rem' }}>Could not delete: {deleteError}</div>}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem' }}>
              {forms.length === 0 && (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', padding: '2rem 1rem' }}>No records yet</div>
              )}
              {[...groups.entries()].map(([cat, list]) => (
                <div key={cat} style={{ marginBottom: '0.5rem' }}>
                  <button onClick={() => toggleGroup(cat)} style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', background: 'none', border: 0, cursor: 'pointer', padding: '0.75rem 0.5rem 0.4rem', color: BLUE, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {cat}
                    <ChevronDown size={12} style={{ transform: collapsed.has(cat) ? 'rotate(-90deg)' : 'none', transition: 'transform 150ms' }} />
                  </button>
                  {!collapsed.has(cat) && list.map(f => {
                    const active = f.id === activeId
                    const filled = (f.status && f.status !== 'blank') || (Array.isArray(f.annotations) && f.annotations.some(a => !a._autofilled))
                    const pages = active && activePages ? activePages : (f.page_count || 1)
                    return (
                      <div
                        key={f.id}
                        ref={active ? activeRef : undefined}
                        className={active ? 'records-row' : 'records-row records-item'}
                        onClick={() => !active && onSelect(f)}
                        title={labels.get(f.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          padding: '0.7rem 0.875rem', margin: '0.15rem 0', borderRadius: 999,
                          cursor: active ? 'default' : 'pointer',
                          background: active ? GREEN : 'transparent',
                          boxShadow: active ? '0 2px 6px rgba(22,163,74,0.25)' : 'none',
                          transition: 'background 120ms',
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, fontSize: '0.875rem', lineHeight: 1.35, fontWeight: active ? 500 : 400, color: active ? '#14301a' : '#374151' }}>
                          {labels.get(f.id)}
                        </span>
                        <span
                          title={`${pages} page${pages > 1 ? 's' : ''}${filled ? ' · has entries' : ' · not filled yet'}`}
                          style={{
                            minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, flexShrink: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.65rem', fontWeight: 700,
                            background: filled ? (active ? GREEN_DARK : '#4ade80') : '#e5e7eb',
                            color: filled ? '#fff' : '#6b7280',
                          }}
                        >{pages}</span>
                        {onDeleteForm && (
                          <button
                            className={`records-del${deletingId === f.id ? ' busy' : ''}`}
                            onClick={e => { e.stopPropagation(); deleteForm(f, labels.get(f.id), filled) }}
                            disabled={!!deletingId}
                            title={`Delete ${labels.get(f.id)}`}
                            style={{ ...iconBtn, width: 26, height: 26, margin: '-4px -6px -4px -4px', borderRadius: 999, flexShrink: 0, color: active ? '#14301a' : '#9ca3af', cursor: deletingId ? 'wait' : 'pointer' }}
                          >
                            {deletingId === f.id ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #f3f4f6', padding: '0.75rem 1rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.1rem' }}>
              {patientId && (
                <button className="records-link" onClick={() => setView('attachments')} style={footerLink}><Paperclip size={16} /> Attachments</button>
              )}
              {onAddForm && (
                <button className="records-link" onClick={() => setView('add')} style={footerLink}><PlusSquare size={18} /> Add Records</button>
              )}
            </div>
          </>
        )}

        {view === 'add' && <AddRecordsView onAddMany={onAddForms} onDone={() => setView('list')} />}
        {view === 'attachments' && (
          <AttachmentsView
            patientId={patientId}
            onBack={() => setView('list')}
            onShowRecords={() => setView('list')}
            onAddRecords={onAddForm ? () => setView('add') : undefined}
          />
        )}
      </aside>
    </>
  )
}

// Pick forms to add, with a checkbox per form and per record set (category).
// Ticking a record set ticks every form under it (that matches the current search).
function AddRecordsView({ onAddMany, onDone }) {
  const [templates, setTemplates] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(new Set()) // template ids
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    api.getFormTemplates().then(setTemplates).catch(e => setError(e.message))
  }, [])

  const q = query.trim().toLowerCase()
  const shown = (templates || []).filter(t => !q || t.name.toLowerCase().includes(q) || (t.category || '').toLowerCase().includes(q))
  const groups = new Map()
  for (const t of shown) {
    const cat = t.category || 'General'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat).push(t)
  }

  const stateOf = (list) => {
    const n = list.filter(t => selected.has(t.id)).length
    return n === 0 ? 'none' : n === list.length ? 'all' : 'some'
  }
  const setMany = (list, on) => setSelected(prev => {
    const next = new Set(prev)
    for (const t of list) on ? next.add(t.id) : next.delete(t.id)
    return next
  })
  const toggleOne = (t) => setMany([t], !selected.has(t.id))
  const toggleList = (list) => setMany(list, stateOf(list) !== 'all')

  const add = async () => {
    // keep the order shown in the list (record set by record set)
    const picked = (templates || []).filter(t => selected.has(t.id))
      .sort((a, b) => (a.category || 'General').localeCompare(b.category || 'General') || a.name.localeCompare(b.name))
    if (!picked.length) return
    setAdding(true); setError(null)
    const failed = await onAddMany(picked)
    setAdding(false)
    if (failed.length) {
      setError(`Could not add: ${failed.join(' · ')}`)
      setSelected(new Set(picked.filter(t => failed.some(f => f.startsWith(`${t.name}:`))).map(t => t.id)))
      return
    }
    onDone()
  }

  const allState = stateOf(shown)

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.75rem 0.875rem 0.25rem', position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '1.5rem', top: '1.4rem', color: '#9ca3af' }} />
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search forms..."
          style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.1rem', border: '1.5px solid #e5e7eb', borderRadius: 999, fontSize: '0.85rem', outline: 'none', font: 'inherit' }} />
      </div>
      {error && <div style={{ margin: '0.5rem 0.875rem 0', color: '#dc2626', fontSize: '0.8rem' }}>{error}</div>}
      {shown.length > 0 && (
        <div onClick={() => !adding && toggleList(shown)} style={{ ...checkRow, margin: '0.375rem 0.75rem 0', padding: '0.5rem 0.875rem', fontSize: '0.8rem', fontWeight: 600, color: '#4b5563' }}>
          <CheckBox state={allState} />
          <span style={{ flex: 1 }}>Select all{q ? ' matching' : ''}</span>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 500 }}>{shown.length} forms</span>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0.75rem 1rem' }}>
        {!templates && !error && <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}><Loader size={18} className="spin" style={{ display: 'inline-block' }} /></div>}
        {templates && !shown.length && <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', padding: '2rem 1rem' }}>No matching forms</div>}
        {[...groups.entries()].map(([cat, list]) => {
          const st = stateOf(list)
          return (
            <div key={cat} style={{ marginTop: '0.375rem' }}>
              {/* Record set: ticks / unticks every form under it */}
              <div onClick={() => !adding && toggleList(list)} style={{ ...checkRow, padding: '0.6rem 0.875rem 0.4rem' }}>
                <CheckBox state={st} />
                <span style={{ flex: 1, color: BLUE, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{cat}</span>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{list.filter(t => selected.has(t.id)).length}/{list.length}</span>
              </div>
              {list.map(t => (
                <div key={t.id} className="records-item" onClick={() => !adding && toggleOne(t)}
                  style={{ ...checkRow, padding: '0.55rem 0.875rem 0.55rem 2.125rem', fontSize: '0.875rem', color: '#374151' }}>
                  <CheckBox state={selected.has(t.id) ? 'all' : 'none'} />
                  <span style={{ flex: 1, minWidth: 0 }}>{t.name}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <div style={{ padding: '0.75rem 0.875rem 1rem', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '0.5rem' }}>
        <button onClick={onDone} disabled={adding}
          style={{ padding: '0.65rem 1rem', border: '1.5px solid #e5e7eb', borderRadius: 999, background: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
        <button onClick={add} disabled={adding || !selected.size}
          style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.65rem 1rem', border: 0, borderRadius: 999, background: GREEN_DARK, color: '#fff', fontWeight: 600, fontSize: '0.875rem', cursor: adding ? 'wait' : 'pointer', opacity: selected.size ? 1 : 0.5 }}>
          {adding ? <><Loader size={15} className="spin" /> Adding...</> : <><Plus size={15} /> Add {selected.size ? `${selected.size} Form${selected.size > 1 ? 's' : ''}` : 'Forms'}</>}
        </button>
      </div>
    </div>
  )
}

// Checkbox with a partial ("some") state for record sets where only some forms are ticked
function CheckBox({ state }) {
  const on = state !== 'none'
  return (
    <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: `2px solid ${on ? GREEN_DARK : '#9ca3af'}`, background: on ? GREEN_DARK : '#fff', color: '#fff', transition: 'all 120ms' }}>
      {state === 'all' && <Check size={13} strokeWidth={3} />}
      {state === 'some' && <span style={{ width: 8, height: 2, background: '#fff', borderRadius: 1 }} />}
    </span>
  )
}

const checkRow = { display: 'flex', alignItems: 'center', gap: '0.75rem', borderRadius: 999, cursor: 'pointer', userSelect: 'none' }
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: 0, borderRadius: 8, background: 'transparent', color: '#4b5563', cursor: 'pointer' }
const menuItem = { display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%', padding: '0.45rem 0.6rem', border: 0, borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: '0.825rem', color: '#374151', textAlign: 'left' }
const footerLink = { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', border: 0, background: 'none', color: BLUE, fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', padding: 0 }
