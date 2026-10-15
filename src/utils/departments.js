// A doctor can belong to several departments; they're stored in the single `department`
// column as a comma-separated list, e.g. "Cardiology, General Medicine".

export const DEPARTMENTS = [
  'General Medicine', 'General Surgery', 'Orthopaedics', 'Gynaecology & Obstetrics',
  'Paediatrics', 'Neonatology', 'Cardiology', 'Cardiothoracic Surgery',
  'Neurology', 'Neurosurgery', 'Nephrology', 'Urology', 'Gastroenterology',
  'Oncology', 'Haematology', 'Pulmonology', 'Dermatology', 'Ophthalmology',
  'ENT', 'Dentistry', 'Psychiatry', 'Rheumatology', 'Endocrinology',
  'Infectious Disease', 'ICU / Critical Care', 'Emergency Medicine',
  'Anaesthesiology', 'Radiology', 'Pathology', 'Physiotherapy', 'Dietetics',
]

// "Cardiology, ENT" → ['Cardiology', 'ENT'] (case-insensitive de-duplication, first spelling wins)
export function splitDepartments(value) {
  const seen = new Set()
  return String(value || '').split(/[,;]/).map(s => s.trim()).filter(s => {
    const k = s.toLowerCase()
    if (!s || seen.has(k)) return false
    seen.add(k); return true
  })
}

export const joinDepartments = (list) => splitDepartments(list.join(',')).join(', ')

// Merge department lists case-insensitively, keeping the first spelling seen, sorted A–Z
export function mergeDepartments(...lists) {
  const byKey = new Map()
  for (const list of lists) for (const d of list) {
    const name = String(d || '').trim()
    if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name)
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b))
}
