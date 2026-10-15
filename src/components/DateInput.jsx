import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'

// Typed DD/MM/YYYY date field. Native <input type="date"> auto-advances segments
// unpredictably (e.g. "2" in DD jumps to MM), so the user types digits freely and
// slashes are inserted automatically. The value in/out is ISO (YYYY-MM-DD), or ''
// while the date is incomplete or invalid.

const isoToDisplay = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

const displayToIso = text => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!m) return ''
  const [, d, mo, y] = m
  const dt = new Date(Date.UTC(+y, +mo - 1, +d))
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) return ''
  return `${y}-${mo}-${d}`
}

const mask = raw => {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/')
}

export default function DateInput({ value, onChange, min, max, className = 'form-input', style }) {
  const [text, setText] = useState(() => isoToDisplay(value))
  const pickerRef = useRef(null)

  // Sync when the value changes from outside (calendar pick, form reset)
  useEffect(() => {
    if ((value || '') !== displayToIso(text)) setText(isoToDisplay(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handleType = e => {
    const next = mask(e.target.value)
    setText(next)
    onChange(displayToIso(next))
  }

  const invalid = text.length === 10 && !displayToIso(text)

  return (
    <div style={{ position: 'relative' }}>
      <input
        className={className}
        type="text"
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        maxLength={10}
        value={text}
        onChange={handleType}
        aria-invalid={invalid}
        title={invalid ? 'Enter a valid date' : undefined}
        style={{ paddingRight: '2.25rem', ...(invalid ? { borderColor: '#dc2626' } : {}), ...style }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Open calendar"
        onClick={() => pickerRef.current?.showPicker?.()}
        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--gray-500)', display: 'flex' }}
      >
        <Calendar size={15} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={min}
        max={max}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{ position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, opacity: 0, border: 0, padding: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}
