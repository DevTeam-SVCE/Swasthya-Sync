import { DEPARTMENTS, splitDepartments, mergeDepartments } from './departments.js'

// Turn an uploaded CSV / Excel sheet of doctors into rows the bulk-import endpoint accepts.

export const IMPORT_COLUMNS = [
  { key: 'name', label: 'Full Name', required: true, aliases: ['name', 'fullname', 'doctorname', 'doctor'] },
  { key: 'department', label: 'Department', required: true, aliases: ['department', 'dept', 'speciality', 'specialty', 'specialization', 'specialisation'] },
  { key: 'qualification', label: 'Qualification', aliases: ['qualification', 'qualifications', 'degree', 'degrees'] },
  { key: 'experience', label: 'Experience (years)', aliases: ['experience', 'experienceyears', 'yearsofexperience', 'exp'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phoneno', 'phonenumber', 'mobile', 'mobileno', 'mobilenumber', 'contact', 'contactno'] },
  { key: 'email', label: 'Email', aliases: ['email', 'emailid', 'emailaddress', 'mail'] },
  { key: 'schedule', label: 'Working Schedule', aliases: ['schedule', 'workingschedule', 'timings', 'workinghours', 'timing'] },
  { key: 'status', label: 'Status', aliases: ['status'] },
  { key: 'doctor_type', label: 'Doctor Type', aliases: ['doctortype', 'type', 'inhousevisiting'] },
]

const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

const STATUS_VALUES = { available: 'available', inconsultation: 'in-consultation', consultation: 'in-consultation', onleave: 'on-leave', leave: 'on-leave' }
const TYPE_VALUES = { inhouse: 'in-house', house: 'in-house', visiting: 'visiting', visitor: 'visiting', vc: 'visiting', visitingconsultant: 'visiting' }

// Minimal RFC 4180 CSV reader: quoted fields, escaped quotes, commas / newlines inside quotes
export function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  text = text.replace(/^﻿/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

export async function readSheet(file) {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return parseCsv(await file.text())
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsx } = await import('./xlsx')
    return readXlsx(file)
  }
  throw new Error('Unsupported file. Upload a .csv or .xlsx file (save older .xls files as .xlsx first).')
}

const cellText = (v) => {
  if (v == null) return ''
  if (v instanceof Date) return v.toLocaleDateString('en-IN')
  return String(v).trim()
}

// rows: array of arrays, first row is the header. existing: doctors already in the system.
// Returns { rows: [{ line, data, errors, duplicate }], missing: [labels of required columns not found] }
export function mapDoctorRows(rows, existing = []) {
  const headerIdx = rows.findIndex(r => r.some(c => cellText(c)))
  if (headerIdx === -1) return { rows: [], missing: IMPORT_COLUMNS.filter(c => c.required).map(c => c.label) }
  const header = rows[headerIdx].map(norm)
  const colIndex = {}
  for (const col of IMPORT_COLUMNS) {
    const i = header.findIndex(h => col.aliases.includes(h))
    if (i !== -1) colIndex[col.key] = i
  }
  const missing = IMPORT_COLUMNS.filter(c => c.required && colIndex[c.key] === undefined).map(c => c.label)
  if (missing.length) return { rows: [], missing }

  // Spell departments the way the app already does ("cardiology" → "Cardiology"); several per cell are fine
  const known = new Map(mergeDepartments(DEPARTMENTS, existing.flatMap(d => splitDepartments(d.department))).map(d => [d.toLowerCase(), d]))
  const cleanDepartments = (v) => splitDepartments(v).map(d => known.get(d.toLowerCase()) || d).join(', ')
  const keyOf = (name, dept) => `${norm(name)}|${splitDepartments(dept).map(norm).sort().join(',')}`
  const seenKeys = new Set(existing.map(d => keyOf(d.name, d.department)))
  const seenEmails = new Set(existing.map(d => (d.email || '').toLowerCase()).filter(Boolean))

  const out = []
  rows.slice(headerIdx + 1).forEach((r, i) => {
    if (!r.some(c => cellText(c))) return // blank line
    const data = {}
    for (const [key, idx] of Object.entries(colIndex)) data[key] = cellText(r[idx])
    const errors = []
    if (!data.name) errors.push('Name is missing')
    data.department = cleanDepartments(data.department)
    if (!data.department) errors.push('Department is missing')
    if (data.experience) {
      const n = Number(String(data.experience).replace(/years?|yrs?/i, '').trim())
      if (!Number.isFinite(n) || n < 0) errors.push(`Experience "${data.experience}" is not a number`)
      else data.experience = Math.round(n)
    } else data.experience = 0
    if (data.status) {
      const s = STATUS_VALUES[norm(data.status)]
      if (!s) errors.push(`Unknown status "${data.status}"`)
      else data.status = s
    } else data.status = 'available'
    if (data.doctor_type) {
      const t = TYPE_VALUES[norm(data.doctor_type)]
      if (!t) errors.push(`Doctor type "${data.doctor_type}" should be In House or Visiting`)
      else data.doctor_type = t
    } else data.doctor_type = 'in-house'
    if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) errors.push(`Email "${data.email}" looks invalid`)

    let duplicate = null
    if (!errors.length) {
      const email = (data.email || '').toLowerCase()
      if (seenKeys.has(keyOf(data.name, data.department))) duplicate = 'Same name & department already exists'
      else if (email && seenEmails.has(email)) duplicate = 'Email already used by another doctor'
      seenKeys.add(keyOf(data.name, data.department))
      if (email) seenEmails.add(email)
    }
    out.push({ line: headerIdx + i + 2, data, errors, duplicate })
  })
  return { rows: out, missing: [] }
}

export function downloadDoctorTemplate() {
  const csv = [
    IMPORT_COLUMNS.map(c => c.label).join(','),
    'Dr. Anjali Sharma,Cardiology,"MBBS, MD",10,9876510010,a.sharma@example.com,"Mon-Fri, 9AM-5PM",Available,In House',
    'Dr. Ravi Kumar,"Orthopaedics, Emergency Medicine","MBBS, MS Ortho",15,9876510011,,Tue & Thu 4PM-7PM,Available,Visiting',
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'doctors_import_template.csv'; a.click()
  URL.revokeObjectURL(url)
}
