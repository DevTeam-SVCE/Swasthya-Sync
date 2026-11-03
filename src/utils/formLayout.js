// formLayout.js — scans a form template PDF once and works out where patient details
// and the hospital logo can go; then turns that layout + a patient into auto-fill annotations.
//
// analyzeTemplate(pdfDoc) → layout (stored on form_templates.layout):
//   - fields:      label positions with the REAL blank space after each label (stops at the
//                  next printed text or a cell border; underlines / dotted leaders are ignored)
//   - freeRects:   empty areas in the top part of the page (inside header boxes, beside titles)
//   - hasHeaderImage / scanned: whether the page already carries a logo image / is a scan
// Scanned pages have no text layer, so their labels are read with OCR (tesseract.js,
// Kannada + English). This only happens once per template — the stored layout is reused
// for every patient.
// planAutoFill(layoutPage, pageNum, values, logo) → annotations for FormViewer's protected layer.
//
// All geometry is in PDF points with the origin at the TOP-LEFT of the page; stored as
// fractions of the page size so it is independent of zoom.

export const LAYOUT_VERSION = 5 // 2: OCR scans + Kannada; 3: OCR garbled text, blank images; 4: gender choices, fuzzy OCR labels, small blanks; 5: repeated headers

export const OCR_LANGS = ['kan', 'eng']

const FONT = '"Inter", "Segoe UI", sans-serif'

// English + Kannada label text. (No bare "name"/"ಹೆಸರು": witness / staff name fields would match.)
// Order matters: combined/specific keys first so e.g. "Age/Sex" is claimed before "Age".
// Matching is whole-word, and a label only counts if there is real blank space after it,
// so table column headers ("DATE", "STAFF NAME") are not filled.
export const FIELD_LABEL_MAP = [
  { key: 'patient_name',      aliases: ['patient name', 'name of patient', "patient's name", 'pt. name', 'pt name', 'name of the patient', 'patient', 'ರೋಗಿಯ ಹೆಸರು', 'ರೋಗಿಯ ಪೂರ್ಣ ಹೆಸರು'] },
  { key: 'age_gender',        aliases: ['age / gender', 'age/gender', 'age & gender', 'age-gender', 'age / sex', 'age/sex', 'age & sex', 'ವಯಸ್ಸು/ಲಿಂಗ', 'ವಯಸ್ಸು / ಲಿಂಗ'] },
  { key: 'age',               aliases: ['age', 'age (yrs)', 'age in years', 'ವಯಸ್ಸು'] },
  { key: 'gender',            aliases: ['gender', 'sex', 'sex/gender', 'ಲಿಂಗ'] },
  { key: 'reg_no',            aliases: ['reg no', 'reg. no', 'reg no.', 'uhid', 'uhid no', 'mrd no', 'mr no', 'cr no', 'patient id', 'registration no', 'registration number', 'hosp. no', 'hosp no', 'ನೋಂದಣಿ ಸಂಖ್ಯೆ', 'ನೋಂದಣಿ ಸಂ', 'ಯುಹೆಚ್ಐಡಿ ಸಂಖ್ಯೆ', 'ಯುಹೆಚ್ಐಡಿ', 'ಯುಎಚ್ಐಡಿ ಸಂಖ್ಯೆ', 'ಯುಎಚ್ಐಡಿ'] },
  { key: 'ip_no',             aliases: ['ip no', 'ip number', 'ipd no', 'inpatient no', 'admission no', 'ip/op no', 'ಒಳರೋಗಿ ಸಂಖ್ಯೆ', 'ಐಪಿ ಸಂಖ್ಯೆ', 'ipid', 'ip id'] },
  { key: 'date_of_admission', aliases: ['date of admission', 'admission date', 'd.o.a', 'doa', 'admitted on', 'date of admit', 'ದಾಖಲಾದ ದಿನಾಂಕ', 'ದಾಖಲಾತಿ ದಿನಾಂಕ'] },
  { key: 'date_of_discharge', aliases: ['date of discharge', 'discharge date', 'd.o.d', 'dod', 'discharged on', 'ಬಿಡುಗಡೆ ದಿನಾಂಕ', 'ಬಿಡುಗಡೆಯ ದಿನಾಂಕ'] },
  { key: 'phone',             aliases: ['phone number', 'phone no', 'mobile no', 'contact no', 'mobile', 'phone', 'mob no', 'ದೂರವಾಣಿ ಸಂಖ್ಯೆ', 'ದೂರವಾಣಿ', 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ', 'ಮೊಬೈಲ್'] },
  { key: 'consultant',        aliases: ['consultant', 'doctor', 'physician', 'attending doctor', 'consultant doctor', 'treating doctor', 'treating physician', 'surgeon', 'dr.', 'ವೈದ್ಯರ ಹೆಸರು', 'ವೈದ್ಯರು', 'ಸಲಹಾ ವೈದ್ಯರು'] },
  { key: 'room_bed',          aliases: ['room / bed', 'room/bed', 'ward / bed', 'ward/bed', 'bed no', 'bed no.', 'bed number', 'room no', 'room', 'bed', 'ward', 'ಹಾಸಿಗೆ ಸಂಖ್ಯೆ', 'ವಾರ್ಡ್'] },
  { key: 'department',        aliases: ['department', 'dept', 'dept.', 'specialty', 'speciality', 'ward name', 'ವಿಭಾಗ'] },
  { key: 'diagnosis',         aliases: ['diagnosis', 'final diagnosis', 'primary diagnosis', 'clinical diagnosis', 'provisional diagnosis', 'chief complaint', 'ರೋಗನಿರ್ಣಯ'] },
  { key: 'blood_group',       aliases: ['blood group', 'blood type', 'b/g', 'blood grp', 'blood gp', 'ರಕ್ತದ ಗುಂಪು', 'ರಕ್ತ ಗುಂಪು'] },
  { key: 'address',           aliases: ['address', 'residence', 'residing at', 'ವಿಳಾಸ'] },
  { key: 'today_date',        aliases: ['date', 'ದಿನಾಂಕ'] },
]

// Build the patient value map from patientData
export function buildPatientValues(patientData) {
  if (!patientData) return {}
  const p = patientData
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  return {
    patient_name:      p.name || '',
    age:               p.age  || '',
    gender:            p.gender || '',
    age_gender:        [p.age ? `${p.age} Y` : '', p.gender].filter(Boolean).join(' / '),
    reg_no:            p.id || p.uhid || '',
    today_date:        new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    date_of_admission: formatDate(p.admitted_at),
    phone:             p.phone || '',
    consultant:        p.doctor_name || '',
    room_bed:          p.bed_id || p.room_bed || p.ward || '',
    ip_no:             p.ip_no || p.id || '',
    date_of_discharge: formatDate(p.discharged_at),
    department:        p.department || '',
    diagnosis:         p.diagnosis || p.notes || '',
    blood_group:       p.blood_group && p.blood_group !== 'Unknown' ? p.blood_group : '',
    address:           p.address || '',
  }
}

// ─── pdf.js loader (shared by the upload page) ───────────────────────────────
export async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
  return pdfjsLib
}

// ─── Image cache (logo drawing on screen + download) ─────────────────────────
const imageCache = new Map() // src -> Promise<HTMLImageElement>
export function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous' // keeps the download canvas untainted (server sends CORS headers)
      img.onload = () => resolve(img)
      img.onerror = () => { imageCache.delete(src); reject(new Error(`Could not load image ${src}`)) }
      img.src = src
    }))
  }
  return imageCache.get(src)
}
const loadedImages = new Map() // src -> HTMLImageElement, for synchronous canvas redraws
export function getLoadedImage(src) { return loadedImages.get(src) || null }
export async function preloadImage(src) {
  const img = await loadImage(src)
  loadedImages.set(src, img)
  return img
}

// ─── Text measuring ──────────────────────────────────────────────────────────
let measureCtx = null
function unitWidth(text) {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d')
    measureCtx.font = `bold 100px ${FONT}`
  }
  return measureCtx.measureText(text).width / 100 // width of `text` at 1pt
}

// ─── Analysis ────────────────────────────────────────────────────────────────
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]

// Render the page and classify pixels: all ink, and long ruling lines (borders, underlines).
async function renderInk(pdfPage, W, H) {
  const S = Math.min(2, 1800 / Math.max(W, H)) // px per pt — enough detail, bounded cost
  const vp = pdfPage.getViewport({ scale: S })
  const pw = Math.ceil(vp.width), ph = Math.ceil(vp.height)
  const canvas = document.createElement('canvas')
  canvas.width = pw; canvas.height = ph
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, pw, ph)
  await pdfPage.render({ canvasContext: ctx, viewport: vp }).promise
  const { data } = ctx.getImageData(0, 0, pw, ph)
  canvas.width = canvas.height = 0

  const ink = new Uint8Array(pw * ph)
  for (let i = 0, p = 0; i < ink.length; i++, p += 4) {
    ink[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) < 200 ? 1 : 0 // light-grey box borders count
  }
  // Runs longer than ~28pt are ruling lines, not glyphs
  const minRun = Math.round(28 * S)
  const hLine = new Uint8Array(pw * ph)
  const vLine = new Uint8Array(pw * ph)
  for (let y = 0; y < ph; y++) {
    let start = -1
    for (let x = 0; x <= pw; x++) {
      const on = x < pw && ink[y * pw + x]
      if (on && start < 0) start = x
      else if (!on && start >= 0) {
        if (x - start >= minRun) for (let k = start; k < x; k++) hLine[y * pw + k] = 1
        start = -1
      }
    }
  }
  for (let x = 0; x < pw; x++) {
    let start = -1
    for (let y = 0; y <= ph; y++) {
      const on = y < ph && ink[y * pw + x]
      if (on && start < 0) start = y
      else if (!on && start >= 0) {
        if (y - start >= minRun) for (let k = start; k < y; k++) vLine[k * pw + x] = 1
        start = -1
      }
    }
  }
  return { ink, hLine, vLine, pw, ph, S }
}

// Bounding boxes of images painted on the page (to detect an existing logo / a scanned page)
async function findImages(pdfPage, vp, OPS) {
  const { fnArray, argsArray } = await pdfPage.getOperatorList()
  const imageOps = new Set([
    OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject,
    OPS.paintImageXObjectRepeat, OPS.paintInlineImageXObjectGroup, OPS.paintImageMaskXObjectGroup,
    OPS.paintSolidColorImageMask, OPS.paintJpegXObject,
  ].filter(v => v != null))
  let ctm = [1, 0, 0, 1, 0, 0]
  const stack = []
  const boxes = []
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], args = argsArray[i]
    if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() || ctm
    else if (fn === OPS.transform) ctm = mul(ctm, args)
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = mul(ctm, args[0]) }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm
    else if (imageOps.has(fn)) {
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) =>
        vp.convertToViewportPoint(ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]))
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
      boxes.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) })
    }
  }
  return boxes
}

// Text rows with per-character x positions, so a label's exact end can be located
async function getTextRows(pdfPage, vp) {
  const tc = await pdfPage.getTextContent()
  const items = []
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue
    const tr = mul(vp.transform, it.transform)
    const size = Math.hypot(tr[2], tr[3]) || it.height || 10
    if (Math.abs(tr[1]) > 0.01 * size) continue // skip rotated text
    items.push({ str: it.str, x: tr[4], baseline: tr[5], width: it.width * vp.scale, size })
  }
  items.sort((a, b) => a.baseline - b.baseline || a.x - b.x)
  const rows = []
  for (const it of items) {
    const row = rows.find(r => Math.abs(r.baseline - it.baseline) <= 0.4 * Math.min(r.size, it.size))
    if (row) { row.items.push(it); row.size = Math.max(row.size, it.size) }
    else rows.push({ baseline: it.baseline, size: it.size, items: [it] })
  }
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x)
    const chars = []
    let prevEnd = null
    for (const it of row.items) {
      if (prevEnd != null && it.x - prevEnd > 0.15 * it.size) chars.push({ ch: ' ', x0: prevEnd, x1: it.x, size: it.size })
      const n = it.str.length
      for (let i = 0; i < n; i++) {
        chars.push({ ch: fold(it.str[i].toLowerCase()), x0: it.x + it.width * i / n, x1: it.x + it.width * (i + 1) / n, size: it.size })
      }
      prevEnd = it.x + it.width
    }
    row.chars = chars
    row.text = chars.map(c => c.ch).join('')
  }
  return rows
}

// Fold characters that OCR / PDF fonts commonly swap, so labels still match:
// curly quotes, ';' read for ':', and long/short Kannada vowel signs (ೂ/ು, ೀ/ಿ, ೇ/ೆ, ೋ/ೊ).
// Strictly one character to one character, so match indices still line up with x positions.
const FOLD = { '’': "'", '‘': "'", '`': "'", ';': ':', 'ೂ': 'ು', 'ೀ': 'ಿ', 'ೇ': 'ೆ', 'ೋ': 'ೊ' }
const fold = ch => FOLD[ch] || ch
const foldText = t => Array.from(t.toLowerCase(), fold).join('')

// OCR a scanned page into the same row structure the text layer produces
const ZW = /[\u200b-\u200d\ufeff]/g
async function ocrRows(pdfPage, W, H, worker) {
  const S = Math.min(3, 3300 / Math.max(W, H)) // ~200-300 dpi: what Tesseract reads best
  const vp = pdfPage.getViewport({ scale: S })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await pdfPage.render({ canvasContext: ctx, viewport: vp }).promise
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false })
  canvas.width = canvas.height = 0

  const rows = []
  for (const block of data.blocks || []) for (const para of block.paragraphs) for (const line of para.lines) {
    const words = line.words.filter(w => w.confidence >= 35 && w.text.replace(ZW, '').trim())
    if (!words.length) continue
    words.sort((a, b) => a.bbox.x0 - b.bbox.x0)
    const bl = line.baseline
    const baseline = ((bl.y0 + bl.y1) / 2) / S
    const tops = words.map(w => baseline - w.bbox.y0 / S).filter(h => h > 0).sort((a, b) => a - b)
    const size = (tops[Math.floor(tops.length / 2)] || 10) / 0.72 // cap height ≈ 0.72 em
    const chars = []
    let prevEnd = null
    for (const w of words) {
      if (prevEnd != null) chars.push({ ch: ' ', x0: prevEnd, x1: w.bbox.x0 / S, size })
      const syms = w.symbols?.length ? w.symbols : [{ text: w.text, bbox: w.bbox }]
      for (const sym of syms) {
        const t = sym.text.replace(ZW, '')
        for (let i = 0; i < t.length; i++) {
          const x0 = sym.bbox.x0 + (sym.bbox.x1 - sym.bbox.x0) * i / t.length
          const x1 = sym.bbox.x0 + (sym.bbox.x1 - sym.bbox.x0) * (i + 1) / t.length
          chars.push({ ch: fold(t[i].toLowerCase()), x0: x0 / S, x1: x1 / S, size })
        }
      }
      prevEnd = w.bbox.x1 / S
    }
    rows.push({ baseline, size, chars, text: chars.map(c => c.ch).join('') })
  }
  return rows
}

// Labels that belong to someone else (relative, witness, contact person) — e.g.
// "Relationship / Phone Number" must not get the patient's phone
const OTHER_PERSON = /relation|relative|contact person|attender|attendant|witness|guardian|next of kin|informant|ಸಂಬಂಧ|ಸಾಕ್ಷಿ|ಪಾಲಕ|ಪೋಷಕ/u

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Fields: labels followed by real blank space
// Values short enough to fit a small blank ("Age: __")
const SHORT_VALUE_KEYS = new Set(['age', 'gender', 'blood_group'])

// Printed choices after a label ("Gender: Male/Female", "ಲಿಂಗ: ಪುರುಷ / ಸ್ತ್ರೀ") — the patient's one gets circled
const CHOICES = {
  gender: {
    male:   ['male', 'm', 'ಪುರುಷ', 'ಗಂಡು'],
    female: ['female', 'f', 'ಸ್ತ್ರೀ', 'ಮಹಿಳೆ', 'ಹೆಣ್ಣು'],
    other:  ['other', 'others', 'transgender', 'ಇತರೆ'],
  },
}

const wordRe = (w) => new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])(${escapeRe(w)})(?![\\p{L}\\p{M}\\p{N}])`, 'gu')

function editDistance(a, b) {
  a = Array.from(a); b = Array.from(b)
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

// Where `alias` occurs in a row: exact whole-word matches, or (fuzzy) runs of words within
// ~1 edit per 5 letters — OCR often gets one letter of a label wrong
function labelOccurrences(row, alias, fuzzy) {
  const out = []
  if (!fuzzy) {
    const re = wordRe(alias)
    let m
    while ((m = re.exec(row.text))) {
      const start = m.index + m[1].length
      out.push({ start, end: start + alias.length - 1 })
    }
    return out
  }
  if (alias.length < 5) return out
  const tokens = [...row.text.matchAll(/\S+/gu)].map(m => ({ s: m.index, e: m.index + m[0].length }))
  const k = alias.split(/\s+/).length
  const maxDist = Math.max(1, Math.floor(alias.length / 5))
  for (let i = 0; i + k <= tokens.length; i++) {
    let s = tokens[i].s, e = tokens[i + k - 1].e
    while (e > s && /[:.\-;]/.test(row.text[e - 1])) e--
    const cand = row.text.slice(s, e).replace(/\s+/g, ' ')
    if (Math.abs(cand.length - alias.length) <= maxDist && editDistance(cand, alias) <= maxDist) out.push({ start: s, end: e - 1 })
  }
  return out
}

// Printed choices right after a label: { male: [x0, x1], female: [x0, x1], ... } or null
function findChoices(row, from, choiceDef) {
  const to = Math.min(row.text.length, from + 32)
  const seg = row.text.slice(from, to)
  const found = {}
  for (const [value, words] of Object.entries(choiceDef)) {
    for (const w of words.map(foldText)) {
      const m = wordRe(w).exec(seg)
      if (m) {
        const s = from + m.index + m[1].length, e = s + w.length - 1
        found[value] = [row.chars[s].x0, row.chars[e].x1]
        break
      }
    }
  }
  const vals = Object.keys(found)
  if (!vals.length) return null
  // OCR may misread one of a "A / B" pair — infer the other side of the slash
  if (vals.length === 1 && (found.male || found.female)) {
    const known = found.male ? 'male' : 'female', other = known === 'male' ? 'female' : 'male'
    const tokens = [...seg.matchAll(/[^\s/]+/gu)].map(m => ({ s: from + m.index, e: from + m.index + m[0].length - 1 }))
    const i = tokens.findIndex(t => row.chars[t.s].x0 >= found[known][0] - 0.5)
    const slashAfter = i >= 0 && i + 1 < tokens.length && row.text.slice(tokens[i].e + 1, tokens[i + 1].s).includes('/')
    const slashBefore = i > 0 && row.text.slice(tokens[i - 1].e + 1, tokens[i].s).includes('/')
    const t = slashAfter ? tokens[i + 1] : slashBefore ? tokens[i - 1] : null
    if (t && /[\p{L}]/u.test(row.text.slice(t.s, t.e + 1))) found[other] = [row.chars[t.s].x0, row.chars[t.e].x1]
  }
  return found
}

// Fields: labels followed by real blank space (or, for gender, printed choices to circle)
function findFields(rows, mask, W) {
  const { ink, hLine, pw, ph, S } = mask
  const fields = []
  const usedRanges = rows.map(() => [])
  const blockedAt = (xPt, yTopPt, yBotPt) => {
    const px = Math.round(xPt * S)
    if (px < 0 || px >= pw) return true
    const y0 = Math.max(0, Math.round(yTopPt * S)), y1 = Math.min(ph - 1, Math.round(yBotPt * S))
    for (let y = y0; y <= y1; y++) {
      const i = y * pw + px
      if (ink[i] && !hLine[i]) return true // text or a vertical border; underlines don't count
    }
    return false
  }
  const overlapsField = (baseline, size, x0, x1) =>
    fields.some(f => Math.abs(f.baselinePt - baseline) < size && x0 < f.endPt && x1 > f.startPt)

  const tryLabel = (def, r, start, end) => {
    const row = rows[r]
    if (usedRanges[r].some(([a, b]) => start <= b && end >= a)) return null
    if (def.key !== 'patient_name' && OTHER_PERSON.test(row.text.slice(Math.max(0, start - 40), start))) return null
    // Step over label punctuation (":", "-", ".") but stop at underscores (the blank itself)
    let k = end + 1
    let labelEnd = row.chars[end].x1
    while (k < row.chars.length && /[\s:.\-–=#)]/.test(row.chars[k].ch)) {
      if (row.chars[k].ch.trim()) labelEnd = row.chars[k].x1
      k++
    }
    const size = row.chars[end].size
    const valueX = labelEnd + 0.35 * size
    // Measure the blank: scan right in the x-height band (above the baseline, so
    // underlines and dotted leaders sitting on/below it are not obstacles)
    const yTop = row.baseline - 0.75 * size, yBot = row.baseline - 0.25 * size
    let x = valueX, run = 0
    const step = 1 / S
    const pageW = pw / S
    while (x < pageW - 2) {
      if (blockedAt(x, yTop, yBot)) { if (++run >= 2) { x -= step; break } } else run = 0
      x += step
    }
    const spanEnd = x - 2
    const minSpan = SHORT_VALUE_KEYS.has(def.key) ? Math.max(7, 0.8 * size) : Math.max(25, 2.5 * size)
    if (spanEnd - valueX >= minSpan && !overlapsField(row.baseline, size, valueX, spanEnd)) {
      return { r, start, end: k - 1, size, baseline: row.baseline, startPt: valueX, endPt: spanEnd }
    }
    if (CHOICES[def.key]) {
      const options = findChoices(row, k, CHOICES[def.key])
      if (options) {
        const xs = Object.values(options).flat()
        return { r, start, end: k - 1, size, baseline: row.baseline, startPt: Math.min(...xs), endPt: Math.max(...xs), options }
      }
    }
    return null // no room — e.g. a table column header
  }

  for (const def of FIELD_LABEL_MAP) {
    // A combined "Age/Sex" field already covers both — don't also hunt for them separately
    if ((def.key === 'age' || def.key === 'gender') && fields.some(f => f.key === 'age_gender')) continue
    const aliases = [...new Set(def.aliases.map(foldText))].sort((a, b) => b.length - a.length)
    let found = null
    for (const fuzzy of [false, true]) {
      for (let r = 0; r < rows.length && !found; r++) {
        for (const alias of aliases) {
          for (const { start, end } of labelOccurrences(rows[r], alias, fuzzy)) {
            if ((found = tryLabel(def, r, start, end))) break
          }
          if (found) break
        }
      }
      if (found) break
    }
    if (!found) continue
    usedRanges[found.r].push([found.start, found.end])
    fields.push({
      key: def.key,
      startPt: found.startPt, endPt: found.endPt, baselinePt: found.baseline,
      font: Math.max(6, Math.min(Math.max(14, 0.016 * W), found.size * 0.95)),
      options: found.options,
    })
  }
  return fields
}

// Empty rectangles in the top part of the page (maximal-rectangle search on a coarse grid)
function findFreeRects(mask, W, H, taken = []) {
  const { ink, pw, ph, S } = mask
  const cellPt = 3
  const c = Math.max(2, Math.round(cellPt * S))
  const cols = Math.floor(pw / c)
  const rows = Math.floor(Math.min(ph, Math.round(0.32 * H * S)) / c)
  const occ = new Uint8Array(rows * cols)
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      let n = 0
      for (let y = gy * c; y < (gy + 1) * c && n < 2; y++) {
        for (let x = gx * c; x < (gx + 1) * c; x++) if (ink[y * pw + x] && ++n >= 2) break
      }
      occ[gy * cols + gx] = n >= 2 ? 1 : 0
    }
  }
  // Blanks that patient values will fill are not free for the logo / details block
  for (const t of taken) {
    const gx0 = Math.max(0, Math.floor(t.x0 * S / c)), gx1 = Math.min(cols, Math.ceil(t.x1 * S / c))
    const gy0 = Math.max(0, Math.floor(t.y0 * S / c)), gy1 = Math.min(rows, Math.ceil(t.y1 * S / c))
    for (let gy = gy0; gy < gy1; gy++) for (let gx = gx0; gx < gx1; gx++) occ[gy * cols + gx] = 1
  }
  const minW = Math.ceil(50 / cellPt), minH = Math.ceil(16 / cellPt)
  const cand = []
  const heights = new Int32Array(cols)
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) heights[gx] = occ[gy * cols + gx] ? 0 : heights[gx] + 1
    const stack = []
    for (let gx = 0; gx <= cols; gx++) {
      const h = gx < cols ? heights[gx] : 0
      let left = gx
      while (stack.length && stack[stack.length - 1][1] >= h) {
        const [l, sh] = stack.pop()
        const w = gx - l
        if (sh >= minH && w >= minW) cand.push({ gx0: l, gx1: gx, gy0: gy - sh + 1, gy1: gy + 1 })
        left = l
      }
      if (h > 0) stack.push([left, h])
    }
  }
  // How many sides are closed by ink (a box border / neighbouring content) rather than open page
  const sideBound = (r) => {
    const frac = (cells) => cells.length ? cells.filter(Boolean).length / cells.length : 0
    const top = r.gy0 > 0 ? frac(range(r.gx0, r.gx1).map(x => occ[(r.gy0 - 1) * cols + x])) : 0
    const bottom = r.gy1 < rows ? frac(range(r.gx0, r.gx1).map(x => occ[r.gy1 * cols + x])) : 0
    const left = r.gx0 > 0 ? frac(range(r.gy0, r.gy1).map(y => occ[y * cols + r.gx0 - 1])) : 0
    const right = r.gx1 < cols ? frac(range(r.gy0, r.gy1).map(y => occ[y * cols + r.gx1])) : 0
    return [top, bottom, left, right].filter(f => f >= 0.5).length
  }
  cand.sort((a, b) => (b.gx1 - b.gx0) * (b.gy1 - b.gy0) - (a.gx1 - a.gx0) * (a.gy1 - a.gy0))
  const picked = []
  for (const r of cand) {
    if (picked.length >= 16) break
    const area = (r.gx1 - r.gx0) * (r.gy1 - r.gy0)
    const dup = picked.some(p => {
      const ix = Math.max(0, Math.min(p.gx1, r.gx1) - Math.max(p.gx0, r.gx0))
      const iy = Math.max(0, Math.min(p.gy1, r.gy1) - Math.max(p.gy0, r.gy0))
      return ix * iy > 0.6 * area
    })
    if (!dup) picked.push(r)
  }
  const pad = 2 // pt of breathing room from borders
  return picked.map(r => ({
    x0: (r.gx0 * c / S + pad) / W, y0: (r.gy0 * c / S + pad) / H,
    x1: (r.gx1 * c / S - pad) / W, y1: (r.gy1 * c / S - pad) / H,
    bounded: sideBound(r),
  }))
}
// Layout of the page's header strip: which cells have something printed in them.
// Comparing occupancy (not exact pixels) treats "same letterhead, different title text" as the
// same header. Cells that are solid ink (a coloured background tint) count as empty.
const HDR_COLS = 32, HDR_ROWS = 8, HDR_BAND = 0.14 // top 14% of the page
function headerSignature(mask) {
  const { ink, pw, ph } = mask
  const bandH = Math.round(ph * HDR_BAND)
  const sig = new Uint8Array(HDR_COLS * HDR_ROWS)
  for (let gy = 0; gy < HDR_ROWS; gy++) {
    const y0 = Math.floor(gy * bandH / HDR_ROWS), y1 = Math.floor((gy + 1) * bandH / HDR_ROWS)
    for (let gx = 0; gx < HDR_COLS; gx++) {
      const x0 = Math.floor(gx * pw / HDR_COLS), x1 = Math.floor((gx + 1) * pw / HDR_COLS)
      let n = 0, t = 0
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { t++; n += ink[y * pw + x] }
      const f = t ? n / t : 0
      sig[gy * HDR_COLS + gx] = f > 0.02 && f < 0.85 ? 1 : 0
    }
  }
  return sig
}

// 0..1 — overlap of two header layouts (Jaccard), tolerating a one-cell shift between scans
function headerSimilarity(a, b) {
  let best = 0
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    let both = 0, either = 0
    for (let gy = 0; gy < HDR_ROWS; gy++) for (let gx = 0; gx < HDR_COLS; gx++) {
      const sy = gy + dy, sx = gx + dx
      const va = a[gy * HDR_COLS + gx]
      const vb = sy >= 0 && sy < HDR_ROWS && sx >= 0 && sx < HDR_COLS ? b[sy * HDR_COLS + sx] : 0
      both += va & vb; either += va | vb
    }
    if (either) best = Math.max(best, both / either)
  }
  return best
}

function inkFraction(mask, b) {
  const { ink, pw, ph, S } = mask
  const x0 = Math.max(0, Math.floor(b.x0 * S)), x1 = Math.min(pw, Math.ceil(b.x1 * S))
  const y0 = Math.max(0, Math.floor(b.y0 * S)), y1 = Math.min(ph, Math.ceil(b.y1 * S))
  let n = 0, total = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { total++; n += ink[y * pw + x] }
  return total ? n / total : 0
}

const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i)

/**
 * Scan every page of a template. Never throws — a page that can't be analysed gets an empty layout.
 * onProgress({ page, pages }) is called as each page starts (OCR can take several seconds a page).
 * ocrWorker: an existing tesseract worker to use (left running); otherwise one is created on demand.
 */
export async function analyzeTemplate(pdfDoc, { onProgress, ocrWorker } = {}) {
  const { OPS } = await import('pdfjs-dist')
  const pages = []
  let worker = ocrWorker || null
  let firstHeader = null // page 1's header signature
  let ocrUnavailable = false
  const getWorker = async () => {
    if (!worker && !ocrUnavailable) {
      try {
        const { createWorker } = await import('tesseract.js')
        worker = await createWorker(OCR_LANGS)
      } catch (err) {
        ocrUnavailable = true // e.g. offline: language data couldn't be downloaded
        console.warn('[formLayout] OCR unavailable — scanned pages get no label detection', err)
      }
    }
    return worker
  }
  try {
    for (let n = 1; n <= pdfDoc.numPages; n++) {
      onProgress?.({ page: n, pages: pdfDoc.numPages })
      const pdfPage = await pdfDoc.getPage(n)
      const vp = pdfPage.getViewport({ scale: 1 })
      const W = vp.width, H = vp.height
      const page = { w: W, h: H, fields: [], freeRects: [], hasHeaderImage: false, scanned: false }
      try {
        const mask = await renderInk(pdfPage, W, H)
        // Does this page repeat page 1's header (same letterhead / patient box)? Then it gets
        // the same treatment as page 1 (details block + logo) so the header looks identical.
        const sig = headerSignature(mask)
        if (n === 1) {
          const inked = sig.reduce((t, v) => t + v, 0) / sig.length
          firstHeader = inked > 0.05 ? { sig, W, H } : null // a (nearly) blank top is not a header
        } else if (firstHeader && Math.abs(W - firstHeader.W) < 0.02 * W && Math.abs(H - firstHeader.H) < 0.02 * H) {
          page.headerSimilarity = +headerSimilarity(firstHeader.sig, sig).toFixed(3)
          page.repeatsHeader = page.headerSimilarity >= 0.8 // same letterhead scores ≥0.85, different headers ≤0.55
        }
        // Images that render blank (e.g. an empty logo placeholder) don't count
        const images = (await findImages(pdfPage, vp, OPS)).filter(b => inkFraction(mask, b) > 0.01)
        const area = b => (b.x1 - b.x0) * (b.y1 - b.y0)
        page.scanned = images.some(b => area(b) > 0.6 * W * H)
        page.hasHeaderImage = images.some(b => area(b) < 0.3 * W * H && area(b) > 0.001 * W * H && (b.y0 + b.y1) / 2 < 0.3 * H)
        // Text layer first. Many Kannada PDFs embed fonts without a proper Unicode map, so their
        // text layer is garbled ("ರೋಗಿಯ ಹೆಸರು" comes out as "ರ ೋಗಿಯ ಹ ಸ್ ರತ") — when it yields few
        // labels, read the page with OCR as well and keep whichever found more.
        let found = findFields(await getTextRows(pdfPage, vp), mask, W)
        if (page.scanned || found.length < 3) {
          const w = await getWorker()
          if (w) {
            const ocrFound = findFields(await ocrRows(pdfPage, W, H, w), mask, W)
            if (ocrFound.length > found.length) { found = ocrFound; page.ocr = true }
          }
        }
        page.fields = found.map(f => ({
          key: f.key, x: f.startPt / W, maxX: f.endPt / W, baseline: f.baselinePt / H, font: +f.font.toFixed(2),
          ...(f.options && { kind: 'choice', options: Object.fromEntries(Object.entries(f.options).map(([v, [a, b]]) => [v, [a / W, b / W]])) }),
        }))
        const fields = page.fields
        page.freeRects = findFreeRects(mask, W, H, fields.map(f => ({
          x0: f.x * W - 2, x1: f.maxX * W, y0: f.baseline * H - 1.2 * f.font, y1: f.baseline * H + 0.4 * f.font,
        })))
      } catch (err) {
        console.warn(`[formLayout] page ${n} analysis failed`, err)
      }
      pages.push(page)
    }
  } finally {
    if (worker && worker !== ocrWorker) await worker.terminate().catch(() => {})
  }
  return { version: LAYOUT_VERSION, pages }
}

// ─── Planning (per patient, at view time) ────────────────────────────────────

// Remove `box` from a rect by keeping its largest remaining side strip
function subtract(r, box) {
  if (r.x1 <= box.x0 || r.x0 >= box.x1 || r.y1 <= box.y0 || r.y0 >= box.y1) return r
  const parts = [
    { ...r, x1: box.x0 }, { ...r, x0: box.x1 }, { ...r, y1: box.y0 }, { ...r, y0: box.y1 },
  ].filter(p => p.x1 > p.x0 && p.y1 > p.y0)
  parts.sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))
  return parts[0] || null
}

function placeLogo(rects, W, H, logo) {
  let best = null
  for (const r of rects) {
    const rw = r.x1 - r.x0, rh = r.y1 - r.y0
    const h = Math.min(rh * 0.85, 0.07 * H, (rw * 0.85) * logo.h / logo.w)
    if (h < 0.025 * H) continue
    const w = h * logo.w / logo.h
    // Bigger is better; the top of the page, boxed-in areas and the left side
    // (where logos usually sit) are preferred
    const top = 1.5 - ((r.y0 + r.y1) / 2) / (0.32 * H)
    const score = h * top * (1 + 0.08 * r.bounded) * ((r.x0 + r.x1) / 2 < W / 2 ? 1.1 : 1)
    if (!best || score > best.score) {
      const x0 = r.x0 + Math.min(rw - w, rh * 0.1)
      const y0 = r.y0 + (rh - h) / 2
      best = { score, box: { x0, y0, x1: x0 + w, y1: y0 + h } }
    }
  }
  return best?.box || null
}

function stickerLines(values) {
  const v = values
  return [
    [v.patient_name && `Name: ${v.patient_name}`, v.age_gender && `Age/Sex: ${v.age_gender}`],
    [v.reg_no && `UHID: ${v.reg_no}${v.room_bed ? ` / Bed: ${v.room_bed}` : ''}`, v.today_date && `Date: ${v.today_date}`],
    [[v.consultant && `Dr: ${v.consultant}`, v.blood_group && `B/G: ${v.blood_group}`].filter(Boolean).join(' · '), v.department && `Dept: ${v.department}`],
  ].map(r => r.filter(Boolean)).filter(r => r.length)
}

// Best way to lay the sticker out in a rect: 2 columns × 3 rows, or 1 column × N rows
function fitSticker(r, lines, W) {
  const rw = r.x1 - r.x0, rh = r.y1 - r.y0
  const maxFont = 0.019 * W
  const LH = 1.4
  const cu = [0, 1].map(c => Math.max(0, ...lines.map(l => (l[c] ? unitWidth(l[c]) : 0))))
  const twoCol = Math.min(maxFont, rh / (lines.length * LH), rw / (cu[0] + cu[1] + 1.6))
  const flat = lines.flat()
  const oneCol = Math.min(maxFont, rh / (flat.length * LH), rw / (Math.max(...flat.map(unitWidth)) + 0.8))
  return twoCol >= oneCol
    ? { font: twoCol, rows: lines, cu }
    : { font: oneCol, rows: flat.map(t => [t]), cu: [Math.max(...flat.map(unitWidth)), 0] }
}

function placeSticker(rects, W, H, lines, pageNum) {
  let best = null
  for (const r of rects) {
    const fit = fitSticker(r, lines, W)
    const top = 1.25 - 0.5 * ((r.y0 + r.y1) / 2) / (0.32 * H)
    const score = fit.font * top * (1 + 0.12 * r.bounded)
    if (fit.font >= 5.5 && (!best || score > best.score)) best = { score, r, fit }
  }
  if (!best) {
    // Nothing suitable detected — the usual top-right header area
    const r = { x0: 0.51 * W, y0: 0.02 * H, x1: 0.93 * W, y1: 0.13 * H, bounded: 0 }
    best = { r, fit: fitSticker(r, lines, W) }
  }
  const { r, fit } = best
  const { font, rows, cu } = fit
  const LH = 1.4
  const blockH = rows.length * font * LH - (LH - 1) * font
  const y0 = r.y0 + Math.max(0, (r.y1 - r.y0 - blockH) / 2)
  const x0 = r.x0 + 0.4 * font
  const col1X = x0 + cu[0] * font + 1.2 * font
  const anns = []
  rows.forEach((row, i) => row.forEach((text, c) => {
    anns.push({
      type: 'text', content: text,
      xFrac: (c ? col1X : x0) / W, yFrac: (y0 + i * font * LH) / H,
      x: 0, y: 0, color: '#1e3a5f', lineWidth: font / 6, page: pageNum,
      _autofilled: true, _baselineY: false, _label: 'sticker',
      _maxXFrac: (c || row.length === 1 && cu[1] === 0 ? r.x1 : col1X - 0.6 * font) / W,
      refScale: 1.0,
    })
  }))
  return anns
}

/**
 * Annotations for one page: values written into detected blanks on every page; on page 1 (and
 * pages that repeat page 1's header) also the hospital logo and, if the page has no name label,
 * a patient-details block in the best empty area.
 * `logo` = { src, w, h } (natural size) or null.
 */
export function planAutoFill(layoutPage, pageNum, values, logo) {
  const W = layoutPage.w, H = layoutPage.h
  const anns = []

  for (const f of layoutPage.fields || []) {
    const value = values[f.key]
    if (!value) continue
    if (f.kind === 'choice') {
      const v = String(value).trim().toLowerCase()
      const choice = v === 'm' || v === 'male' ? 'male' : v === 'f' || v === 'female' ? 'female' : 'other'
      const opt = f.options?.[choice]
      if (!opt) continue
      const font = f.font
      anns.push({
        type: 'ellipse', page: pageNum, color: '#1a1a2e', _autofilled: true, _label: f.key,
        xFrac: (opt[0] + opt[1]) / 2, yFrac: f.baseline - 0.3 * font / H,
        rxFrac: (opt[1] - opt[0]) / 2 + 0.35 * font / W, ryFrac: 0.75 * font / H,
        lineWidth: Math.max(0.8, font * 0.09), // pt
      })
      continue
    }
    const spanPt = (f.maxX - f.x) * W
    const font = Math.max(5, Math.min(f.font, spanPt / unitWidth(String(value))))
    anns.push({
      type: 'text', content: String(value), xFrac: f.x, yFrac: f.baseline,
      x: 0, y: 0, color: '#1a1a2e', lineWidth: font / 6, page: pageNum,
      _autofilled: true, _baselineY: true, _label: f.key, _maxXFrac: f.maxX, refScale: 1.0,
    })
  }

  let rects = (layoutPage.freeRects || []).map(r => ({ x0: r.x0 * W, y0: r.y0 * H, x1: r.x1 * W, y1: r.y1 * H, bounded: r.bounded || 0 }))

  // Page 1, and later pages whose header is the same as page 1's, get the logo and details block
  const headerPage = pageNum === 1 || layoutPage.repeatsHeader
  if (headerPage && logo && !layoutPage.hasHeaderImage && !layoutPage.scanned) {
    const box = placeLogo(rects, W, H, logo)
    if (box) {
      anns.push({
        type: 'image', src: logo.src,
        xFrac: box.x0 / W, yFrac: box.y0 / H, wFrac: (box.x1 - box.x0) / W, hFrac: (box.y1 - box.y0) / H,
        page: pageNum, _autofilled: true, _label: 'logo',
      })
      const padded = { x0: box.x0 - 6, y0: box.y0 - 6, x1: box.x1 + 6, y1: box.y1 + 6 }
      rects = rects.map(r => subtract(r, padded)).filter(Boolean)
    }
  }

  // The details block goes on the first page (and pages repeating its header) — other pages
  // just get their labelled blanks filled — and only when the form's own labels don't already identify the patient
  // (name plus UHID or age) — e.g. a consent form that only asks for the name still gets it
  const keys = new Set((layoutPage.fields || []).filter(f => values[f.key]).map(f => f.key))
  const identified = keys.has('patient_name') && ['reg_no', 'ip_no', 'age', 'age_gender'].some(k => keys.has(k))
  if (headerPage && !identified && values.patient_name) {
    anns.push(...placeSticker(rects, W, H, stickerLines(values), pageNum))
  }
  return anns
}

/**
 * Cut the leftmost logo out of a letterhead banner (logo · badges · address laid out side by side):
 * trim the margins, split into blocks at wide blank columns, keep the first sizeable block.
 * Returns { src (PNG data URL), w, h } or null.
 */
export function logoFromBanner(img) {
  const W = img.naturalWidth, H = img.naturalHeight
  if (!W || !H) return null
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, W, H)
  const isInk = (x, y) => {
    const p = (y * W + x) * 4
    return data[p + 3] > 40 && (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) < 225
  }
  const colInk = new Int32Array(W)
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y += 2) if (isInk(x, y)) colInk[x]++
  const minCol = Math.max(1, H * 0.01)
  const gap = Math.max(4, Math.round(W * 0.03))
  const blocks = []
  let start = -1, blank = 0
  for (let x = 0; x <= W; x++) {
    const on = x < W && colInk[x] >= minCol
    if (on) { if (start < 0) start = x; blank = 0 }
    else if (start >= 0 && (++blank >= gap || x === W)) { blocks.push([start, x - blank + 1]); start = -1; blank = 0 }
  }
  const block = blocks.find(([a, b]) => b - a >= W * 0.05)
  if (!block) return null
  const [bx0, bx1] = block
  let by0 = H, by1 = 0
  for (let y = 0; y < H; y++) for (let x = bx0; x < bx1; x += 2) if (isInk(x, y)) { by0 = Math.min(by0, y); by1 = Math.max(by1, y); break }
  if (by1 <= by0) return null
  const out = document.createElement('canvas')
  out.width = bx1 - bx0; out.height = by1 - by0 + 1
  out.getContext('2d').drawImage(c, bx0, by0, out.width, out.height, 0, 0, out.width, out.height)
  return { src: out.toDataURL('image/png'), w: out.width, h: out.height }
}
