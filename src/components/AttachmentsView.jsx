import { useState, useEffect, useRef } from 'react'
import {
  ChevronLeft, Plus, MoreVertical, ScanLine, Camera, ImagePlus, Layers, PlusSquare,
  Loader, X, Trash2, Eye, Pencil, FolderInput, FileText, Check,
} from 'lucide-react'
import { api, SERVER_URL } from '../api'

// Attachments for one patient, inside the form viewer's Records panel:
// grouped list (uploaded photos / scans / PDFs + lab & radiology report PDFs) and a "+" menu
// to Scan Documents (camera pages → one PDF), Capture Photo, or Add from Gallery.

export const ATTACHMENT_CATEGORIES = ['Others', 'Investigation Reports', 'ID Proof', 'Insurance', 'Prescriptions', 'Previous Records', 'Consent']
const REPORTS = 'Investigation Reports'
const BLUE = '#2563eb'
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'

const pad = (n) => String(n).padStart(2, '0')
function formatStamp(d) {
  const dt = new Date(d)
  if (isNaN(dt)) return ''
  let h = dt.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${pad(dt.getDate())}-${pad(dt.getMonth() + 1)}-${dt.getFullYear()}, ${pad(h)}:${pad(dt.getMinutes())}${ampm}`
}

const isImage = (file) => /^image\//.test(file.type)

// Downscale large camera photos before upload (keeps them sharp enough to read, far smaller).
// `scan` also boosts contrast in greyscale so paper documents read like a scan.
async function prepareImage(file, { scan = false, maxSide = 2000 } = {}) {
  let bmp
  try { bmp = await createImageBitmap(file) } catch { return null } // e.g. HEIC the browser can't decode
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (scan) ctx.filter = 'grayscale(1) contrast(1.35) brightness(1.08)'
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
  return canvas
}

const canvasToFile = (canvas, name) => new Promise(resolve =>
  canvas.toBlob(b => resolve(new File([b], name, { type: 'image/jpeg' })), 'image/jpeg', 0.85))

async function compressPhoto(file) {
  if (!isImage(file)) return file
  const canvas = await prepareImage(file)
  if (!canvas) return file
  const out = await canvasToFile(canvas, file.name.replace(/\.[^.]+$/, '') + '.jpg')
  return out.size < file.size ? out : file
}

// Scanned pages → one A4 PDF
async function pagesToPdf(pages, name) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 18
  for (let i = 0; i < pages.length; i++) {
    const canvas = await prepareImage(pages[i].file, { scan: true, maxSide: 1800 })
    if (!canvas) continue
    if (i > 0) pdf.addPage()
    const k = Math.min((W - 2 * M) / canvas.width, (H - 2 * M) / canvas.height)
    const w = canvas.width * k, h = canvas.height * k
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', (W - w) / 2, (H - h) / 2, w, h)
  }
  return new File([pdf.output('blob')], `${name || 'Scan'}.pdf`, { type: 'application/pdf' })
}

export default function AttachmentsView({ patientId, onBack, onShowRecords, onAddRecords }) {
  const [items, setItems] = useState(null)
  const [reports, setReports] = useState([])
  const [error, setError] = useState(null)
  const [addMenu, setAddMenu] = useState(false)
  const [mode, setMode] = useState('list') // 'list' | 'scan' | 'save'
  const [scanPages, setScanPages] = useState([]) // { id, file, url }
  const [pending, setPending] = useState(null) // { kind, entries: [{ id, file, name, url }], category }
  const [saving, setSaving] = useState(false)
  const [rowMenu, setRowMenu] = useState(null) // attachment id
  const [editing, setEditing] = useState(null) // { id, field: 'name' | 'category', value }
  const cameraRef = useRef(), galleryRef = useRef(), scanCameraRef = useRef(), scanGalleryRef = useRef()
  const addMenuRef = useRef()
  const nextId = useRef(0)

  const load = () => {
    setError(null)
    Promise.all([
      api.getPatientAttachments(patientId),
      api.getLab({ patient_id: patientId }).catch(() => []),
      api.getRadiology({ patient_id: patientId }).catch(() => []),
    ]).then(([att, lab, rad]) => {
      setItems(att)
      setReports([
        ...lab.filter(l => l.result_pdf_path).map(l => ({ key: `lab-${l.id}`, tag: 'Lab', name: l.test_name, file_path: l.result_pdf_path, created_at: l.completed_at || l.ordered_at })),
        ...rad.filter(r => r.result_pdf_path).map(r => ({ key: `rad-${r.id}`, tag: 'Radiology', name: [r.study_type, r.body_part].filter(Boolean).join(' — '), file_path: r.result_pdf_path, created_at: r.completed_at || r.ordered_at })),
      ])
    }).catch(e => { setError(e.message); setItems([]) })
  }
  useEffect(load, [patientId])

  useEffect(() => {
    if (!addMenu && rowMenu == null) return
    const close = (e) => {
      if (addMenu && !addMenuRef.current?.contains(e.target)) setAddMenu(false)
      if (rowMenu != null && !e.target.closest?.('[data-row-menu]')) setRowMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [addMenu, rowMenu])

  // Free preview URLs when they're no longer shown
  const revokeAll = (list) => list.forEach(e => e.url && URL.revokeObjectURL(e.url))
  useEffect(() => () => { revokeAll(scanPages); if (pending) revokeAll(pending.entries) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = (file) => (isImage(file) ? URL.createObjectURL(file) : null)
  const stamp = () => { const d = new Date(); return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}` }

  const startSave = (kind, files, category = 'Others') => {
    const entries = files.map((file, i) => ({
      id: nextId.current++, file, url: preview(file),
      name: kind === 'photo' ? `Photo ${stamp()}` : kind === 'scan' ? `Scan ${stamp()}` : file.name.replace(/\.[^.]+$/, '') || `File ${i + 1}`,
    }))
    setPending({ kind, entries, category })
    setMode('save')
  }

  const onPick = (kind) => (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) startSave(kind, files)
  }

  const onScanPick = (e) => {
    const files = Array.from(e.target.files || []).filter(isImage)
    e.target.value = ''
    if (files.length) setScanPages(prev => [...prev, ...files.map(file => ({ id: nextId.current++, file, url: URL.createObjectURL(file) }))])
  }

  const startScan = () => {
    setAddMenu(false)
    revokeAll(scanPages)
    setScanPages([])
    setMode('scan')
    setTimeout(() => scanCameraRef.current?.click(), 0)
  }

  const finishScan = async () => {
    setSaving(true); setError(null)
    try {
      const pdf = await pagesToPdf(scanPages, 'Scan')
      revokeAll(scanPages)
      setScanPages([])
      startSave('scan', [pdf])
    } catch (e) { setError('Could not create the scanned PDF: ' + e.message) } finally { setSaving(false) }
  }

  const cancelPending = () => { revokeAll(pending?.entries || []); setPending(null); setMode('list') }

  const savePending = async () => {
    if (pending.entries.some(e => !e.name.trim())) { setError('Every attachment needs a name.'); return }
    setSaving(true); setError(null)
    const failed = new Map() // entry id -> message
    for (const entry of pending.entries) {
      try {
        const file = pending.kind === 'scan' ? entry.file : await compressPhoto(entry.file)
        const created = await api.uploadPatientAttachment(patientId, file, { name: entry.name.trim(), category: pending.category })
        setItems(prev => [created, ...(prev || [])])
      } catch (e) { failed.set(entry.id, `${entry.name}: ${e.message}`) }
    }
    setSaving(false)
    if (failed.size) {
      setError([...failed.values()].join(' · '))
      // keep only the ones that failed so they can be retried
      setPending(p => ({ ...p, entries: p.entries.filter(en => failed.has(en.id)) }))
      return
    }
    cancelPending()
  }

  const view = (filePath) => window.open(`${SERVER_URL}${filePath}`, '_blank', 'noopener')

  const commitEdit = async () => {
    if (!editing) return
    const { id, field, value } = editing
    const cur = items.find(i => i.id === id)
    if (!value.trim() || value.trim() === cur?.[field]) { setEditing(null); return }
    try {
      const updated = await api.updateAttachment(id, { [field]: value.trim() })
      setItems(prev => prev.map(i => i.id === id ? updated : i))
      setEditing(null)
    } catch (e) { setError(e.message) }
  }

  const remove = async (att) => {
    setRowMenu(null)
    if (!window.confirm(`Delete "${att.name}"? This cannot be undone.`)) return
    try {
      await api.deleteAttachment(att.id)
      setItems(prev => prev.filter(i => i.id !== att.id))
    } catch (e) { setError(e.message) }
  }

  // Group: uploaded attachments by category, lab / radiology report PDFs under Investigation Reports
  const groups = new Map()
  for (const a of items || []) {
    const cat = a.category || 'Others'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat).push({ ...a, key: `att-${a.id}` })
  }
  if (reports.length) groups.set(REPORTS, [...(groups.get(REPORTS) || []), ...reports])
  const order = (c) => { const i = ATTACHMENT_CATEGORIES.indexOf(c); return i === -1 ? 99 : i }
  const sortedGroups = [...groups.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
  for (const [, list] of sortedGroups) list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  const categories = [...new Set([...ATTACHMENT_CATEGORIES, ...groups.keys()])]

  const title = mode === 'scan' ? 'Scan Documents' : mode === 'save' ? (pending?.kind === 'scan' ? 'Save Scan' : 'Save Attachment') : 'Attachments'
  const back = mode === 'scan' ? () => { revokeAll(scanPages); setScanPages([]); setMode('list') } : mode === 'save' ? cancelPending : onBack

  return (
    <>
      {/* hidden pickers: camera (rear camera on tablets/phones) and gallery */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPick('photo')} />
      <input ref={galleryRef} type="file" accept={ACCEPT} multiple style={{ display: 'none' }} onChange={onPick('gallery')} />
      <input ref={scanCameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onScanPick} />
      <input ref={scanGalleryRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onScanPick} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.875rem 0.75rem', borderBottom: '1px solid #e5e7eb' }}>
        <button onClick={back} disabled={saving} title="Back" style={iconBtn}><ChevronLeft size={19} /></button>
        <div style={{ flex: 1, fontSize: '1rem', fontWeight: 600, paddingLeft: '0.25rem' }}>{title}</div>
        {mode === 'list' && (
          <div ref={addMenuRef} style={{ position: 'relative' }}>
            <button onClick={() => setAddMenu(v => !v)} title="Add attachment" style={iconBtn}><Plus size={19} /></button>
            {addMenu && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50, minWidth: 190, background: '#fff', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb', padding: '0.3rem' }}>
                <button onClick={startScan} style={menuItem}><ScanLine size={16} /> Scan Documents</button>
                <button onClick={() => { setAddMenu(false); cameraRef.current.click() }} style={menuItem}><Camera size={16} /> Capture Photo</button>
                <button onClick={() => { setAddMenu(false); galleryRef.current.click() }} style={menuItem}><ImagePlus size={16} /> Add from Gallery</button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '0.5rem 0.875rem 0', color: '#dc2626', fontSize: '0.78rem' }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ ...iconBtn, width: 20, height: 20, color: '#dc2626' }}><X size={13} /></button>
        </div>
      )}

      {/* ── List ── */}
      {mode === 'list' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0.75rem 0.75rem' }}>
            {!items && <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}><Loader size={18} className="spin" style={{ display: 'inline-block' }} /></div>}
            {items && !sortedGroups.length && (
              <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', padding: '2.5rem 1rem', lineHeight: 1.6 }}>
                No attachments yet.<br />Tap <strong style={{ color: '#6b7280' }}>+</strong> to scan a document, take a photo or add from the gallery.
              </div>
            )}
            {sortedGroups.map(([cat, list]) => (
              <div key={cat}>
                <div style={{ padding: '0.8rem 0.5rem 0.3rem', color: BLUE, fontSize: '0.72rem', fontWeight: 600 }}>{cat}</div>
                {list.map(a => {
                  const uploaded = a.key.startsWith('att-')
                  const editingThis = uploaded && editing != null && editing.id === a.id
                  const isEditingName = editingThis && editing.field === 'name'
                  const isEditingCat = editingThis && editing.field === 'category'
                  return (
                    <div key={a.key} className="records-item" onClick={() => !editing && view(a.file_path)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.25rem 0.55rem 0.75rem', borderRadius: 10, cursor: 'pointer', position: 'relative' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditingName ? (
                          <input autoFocus value={editing.value} onClick={e => e.stopPropagation()}
                            onChange={e => setEditing(ed => ({ ...ed, value: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
                            onBlur={commitEdit}
                            style={inlineInput} />
                        ) : (
                          <div style={{ fontSize: '0.875rem', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.name}
                            {!uploaded && <span style={{ marginLeft: 6, fontSize: '0.6rem', fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>{a.tag}</span>}
                          </div>
                        )}
                        {isEditingCat ? (
                          <select autoFocus value={editing.value} onClick={e => e.stopPropagation()}
                            onChange={e => setEditing(ed => ({ ...ed, value: e.target.value }))}
                            onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
                            style={{ ...inlineInput, marginTop: 4, fontSize: '0.75rem' }}>
                            {categories.map(c => <option key={c}>{c}</option>)}
                          </select>
                        ) : (
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>{formatStamp(a.created_at)}</div>
                        )}
                      </div>
                      <div data-row-menu style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setRowMenu(m => m === a.key ? null : a.key)} title="Options" style={{ ...iconBtn, width: 28, height: 28 }}><MoreVertical size={16} /></button>
                        {rowMenu === a.key && (
                          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 2px)', zIndex: 50, minWidth: 160, background: '#fff', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb', padding: '0.3rem' }}>
                            <button onClick={() => { setRowMenu(null); view(a.file_path) }} style={menuItem}><Eye size={15} /> View</button>
                            {uploaded && <>
                              <button onClick={() => { setRowMenu(null); setEditing({ id: a.id, field: 'name', value: a.name }) }} style={menuItem}><Pencil size={15} /> Rename</button>
                              <button onClick={() => { setRowMenu(null); setEditing({ id: a.id, field: 'category', value: a.category || 'Others' }) }} style={menuItem}><FolderInput size={15} /> Move to…</button>
                              <button onClick={() => remove(a)} style={{ ...menuItem, color: '#dc2626' }}><Trash2 size={15} /> Delete</button>
                            </>}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #f3f4f6', padding: '0.75rem 1rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.1rem' }}>
            <button className="records-link" onClick={onShowRecords} style={footerLink}><Layers size={16} /> Records</button>
            {onAddRecords && <button className="records-link" onClick={onAddRecords} style={footerLink}><PlusSquare size={18} /> Add Records</button>}
          </div>
        </>
      )}

      {/* ── Scan: capture pages, then combine into one PDF ── */}
      {mode === 'scan' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.875rem' }}>
            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              Photograph each page of the document. The pages are combined into one PDF.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.625rem' }}>
              {scanPages.map((p, i) => (
                <div key={p.id} style={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f9fafb' }}>
                  <img src={p.url} alt={`Page ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1) contrast(1.35) brightness(1.08)' }} />
                  <span style={{ position: 'absolute', left: 6, bottom: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>{i + 1}</span>
                  <button onClick={() => { URL.revokeObjectURL(p.url); setScanPages(prev => prev.filter(x => x.id !== p.id)) }} title="Remove page"
                    style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', border: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={13} /></button>
                </div>
              ))}
              <button onClick={() => scanCameraRef.current.click()}
                style={{ aspectRatio: '3 / 4', borderRadius: 8, border: '2px dashed #cbd5e1', background: '#f8fafc', color: BLUE, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                <Camera size={22} /> {scanPages.length ? 'Add page' : 'Capture page'}
              </button>
            </div>
            <button onClick={() => scanGalleryRef.current.click()} className="records-link" style={{ ...footerLink, fontSize: '0.8rem', marginTop: '0.875rem' }}>
              <ImagePlus size={15} /> Pick pages from gallery
            </button>
          </div>
          <div style={{ padding: '0.75rem 0.875rem 1rem', borderTop: '1px solid #f3f4f6' }}>
            <button onClick={finishScan} disabled={!scanPages.length || saving} style={{ ...primaryBtn, opacity: scanPages.length ? 1 : 0.5 }}>
              {saving ? <Loader size={15} className="spin" /> : <Check size={15} />} Done · {scanPages.length} page{scanPages.length === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}

      {/* ── Save: name + category, then upload ── */}
      {mode === 'save' && pending && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.875rem' }}>
            {pending.entries.map(en => (
              <div key={en.id} style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ width: 52, height: 64, flexShrink: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {en.url ? <img src={en.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <FileText size={22} color="#9ca3af" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>Name</label>
                  <input value={en.name} disabled={saving}
                    onChange={e => setPending(p => ({ ...p, entries: p.entries.map(x => x.id === en.id ? { ...x, name: e.target.value } : x) }))}
                    style={{ ...inlineInput, marginTop: 2 }} />
                </div>
                {pending.entries.length > 1 && (
                  <button onClick={() => { en.url && URL.revokeObjectURL(en.url); setPending(p => ({ ...p, entries: p.entries.filter(x => x.id !== en.id) })) }} disabled={saving} title="Remove" style={{ ...iconBtn, width: 28, height: 28 }}><X size={15} /></button>
                )}
              </div>
            ))}
            <label style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>Category</label>
            <select value={pending.category} disabled={saving} onChange={e => setPending(p => ({ ...p, category: e.target.value }))} style={{ ...inlineInput, marginTop: 2 }}>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ padding: '0.75rem 0.875rem 1rem', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '0.5rem' }}>
            <button onClick={cancelPending} disabled={saving} style={secondaryBtn}>Cancel</button>
            <button onClick={savePending} disabled={saving || !pending.entries.length} style={{ ...primaryBtn, flex: 1 }}>
              {saving ? <><Loader size={15} className="spin" /> Uploading...</> : <><Check size={15} /> Save{pending.entries.length > 1 ? ` ${pending.entries.length} files` : ''}</>}
            </button>
          </div>
        </>
      )}
    </>
  )
}

const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: 0, borderRadius: 8, background: 'transparent', color: '#4b5563', cursor: 'pointer', flexShrink: 0 }
const menuItem = { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.55rem 0.65rem', border: 0, borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: '0.84rem', color: '#374151', textAlign: 'left', whiteSpace: 'nowrap' }
const footerLink = { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', border: 0, background: 'none', color: BLUE, fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', padding: 0 }
const inlineInput = { width: '100%', padding: '0.4rem 0.55rem', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: '0.85rem', outline: 'none', font: 'inherit', background: '#fff', color: '#1f2937' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', padding: '0.65rem 1rem', border: 0, borderRadius: 999, background: BLUE, color: '#fff', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }
const secondaryBtn = { padding: '0.65rem 1rem', border: '1.5px solid #e5e7eb', borderRadius: 999, background: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }
