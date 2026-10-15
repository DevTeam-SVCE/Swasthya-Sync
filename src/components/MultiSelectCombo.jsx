import { useState, useRef, useEffect } from 'react'
import { X, Check, Plus, ChevronDown } from 'lucide-react'

// Multi-select dropdown with a search box. Typing filters the list and highlights the first match,
// so Enter (or a comma) selects it; a value not in the list can be added as a new option.
// Backspace in an empty box removes the last selection.
export default function MultiSelectCombo({ options, value, onChange, placeholder = 'Search or add...', allowCustom = true }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef()
  const inputRef = useRef()
  const listRef = useRef()

  const isSelected = (opt) => value.some(v => v.toLowerCase() === opt.toLowerCase())
  const q = query.trim().toLowerCase()
  const matches = q ? options.filter(o => o.toLowerCase().includes(q)) : options
  // Starts-with matches first, e.g. typing "ent" lists ENT above Dentistry
  const sorted = q ? [...matches].sort((a, b) => (b.toLowerCase().startsWith(q) - a.toLowerCase().startsWith(q))) : matches
  const exact = q && (options.some(o => o.toLowerCase() === q) || value.some(v => v.toLowerCase() === q))
  const items = [...sorted.map(o => ({ type: 'option', label: o })), ...(allowCustom && q && !exact ? [{ type: 'custom', label: query.trim() }] : [])]

  useEffect(() => { setActive(0) }, [query])

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!rootRef.current?.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const toggle = (label) => {
    if (isSelected(label)) onChange(value.filter(v => v.toLowerCase() !== label.toLowerCase()))
    else onChange([...value, label])
    setQuery('')
    inputRef.current?.focus()
  }

  const choose = (item) => {
    if (!item) return
    if (item.type === 'custom') { if (!isSelected(item.label)) onChange([...value, item.label]); setQuery(''); inputRef.current?.focus() }
    else toggle(item.label)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' || (e.key === ',' && q)) {
      e.preventDefault()
      if (open && items.length) choose(items[active])
      else setOpen(true)
    }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); setQuery('') } }
    else if (e.key === 'Backspace' && !query && value.length) onChange(value.slice(0, -1))
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div
        className="form-input combo-box"
        onMouseDown={e => { if (e.target === e.currentTarget) { e.preventDefault(); inputRef.current?.focus(); setOpen(true) } }}
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.375rem', minHeight: 42, height: 'auto', padding: '0.3rem 2rem 0.3rem 0.5rem', cursor: 'text', position: 'relative' }}
      >
        {value.map(v => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--primary-50)', color: 'var(--primary-700, #4338ca)', fontSize: '0.8125rem', fontWeight: 600, padding: '0.2rem 0.375rem 0.2rem 0.5rem', borderRadius: 6 }}>
            {v}
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onChange(value.filter(x => x !== v))}
              title={`Remove ${v}`} style={{ display: 'inline-flex', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.7 }}>
              <X size={13} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          placeholder={value.length ? '' : placeholder}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          style={{ flex: 1, minWidth: 120, border: 0, outline: 'none', background: 'transparent', font: 'inherit', fontSize: '0.875rem', padding: '0.25rem 0.125rem', color: 'var(--gray-800)' }}
        />
        <ChevronDown size={16} color="var(--gray-400)" style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`, transition: 'transform 150ms', pointerEvents: 'none' }} />
      </div>

      {open && (
        <div ref={listRef} style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: 240, overflowY: 'auto', background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.1))', padding: '0.25rem' }}>
          {items.length === 0 && <div style={{ padding: '0.5rem 0.625rem', fontSize: '0.8125rem', color: 'var(--gray-400)' }}>No matching departments</div>}
          {items.map((it, i) => {
            const selected = it.type === 'option' && isSelected(it.label)
            return (
              <div
                key={`${it.type}:${it.label}`}
                data-idx={i}
                onMouseDown={e => e.preventDefault()}
                onClick={() => choose(it)}
                onMouseEnter={() => setActive(i)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.625rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem',
                  background: i === active ? 'var(--primary-50)' : 'transparent', color: selected ? 'var(--primary-600, #4f46e5)' : 'var(--gray-700)', fontWeight: selected ? 600 : 400 }}
              >
                {it.type === 'custom'
                  ? <><Plus size={14} /> Add "{it.label}"</>
                  : <><span style={{ width: 14, display: 'inline-flex' }}>{selected && <Check size={14} />}</span>{it.label}</>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
