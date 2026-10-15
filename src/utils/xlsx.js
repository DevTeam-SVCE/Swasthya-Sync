// Minimal .xlsx reader for the browser: returns the first worksheet as an array of rows
// (arrays of cell values: string | number | boolean | Date | null).
// Uses the built-in DecompressionStream + DOMParser, and is lenient about cells that exporters
// write without a value (e.g. an empty <c t="inlineStr"/>), which stricter libraries reject.

const td = new TextDecoder()

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// Read the zip central directory → { path: () => Promise<string> }
function readZip(buf) {
  const dv = new DataView(buf)
  const bytes = new Uint8Array(buf)
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd === -1) throw new Error('This is not a valid .xlsx file.')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const entries = {}
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true)
    const size = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const local = dv.getUint32(p + 42, true)
    const name = td.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    entries[name.replace(/^\//, '')] = async () => {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
      const data = bytes.subarray(start, start + size)
      if (method === 0) return td.decode(data)
      if (method === 8) return td.decode(await inflateRaw(data))
      throw new Error('Unsupported compression in .xlsx file.')
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml')
const all = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag))
const first = (node, tag) => node.getElementsByTagNameNS('*', tag)[0]
const kids = (node) => Array.from(node.childNodes).filter(n => n.nodeType === 1)

// Text of an <si> / <is> element: every <t> run, skipping phonetic (<rPh>) hints
const richText = (el) => all(el, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join('')

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])
const isDateFormat = (code) => /[dmyhs]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"|\\./g, ''))

const colIndex = (ref) => {
  const letters = /^[A-Z]+/i.exec(ref || '')?.[0]
  if (!letters) return -1
  return letters.toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
}

export default async function readXlsx(file) {
  const zip = readZip(await file.arrayBuffer())
  const load = async (path) => (zip[path] ? parseXml(await zip[path]()) : null)

  // Locate the first worksheet via the workbook relationships
  const workbook = await load('xl/workbook.xml')
  const rels = await load('xl/_rels/workbook.xml.rels')
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const firstSheet = workbook && first(workbook, 'sheet')
  if (firstSheet && rels) {
    const rid = Array.from(firstSheet.attributes).find(a => a.localName === 'id')?.value
    const target = all(rels, 'Relationship').find(r => r.getAttribute('Id') === rid)?.getAttribute('Target')
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
  }
  const sheet = await load(sheetPath)
  if (!sheet) throw new Error('Could not find a worksheet in the .xlsx file.')
  const date1904 = workbook ? first(workbook, 'workbookPr')?.getAttribute('date1904') === '1' : false

  const sst = await load('xl/sharedStrings.xml')
  const shared = sst ? all(sst, 'si').map(richText) : []

  // Which cell styles are date formats
  const styles = await load('xl/styles.xml')
  const dateStyles = new Set()
  if (styles) {
    const custom = Object.fromEntries(all(styles, 'numFmt').map(f => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') || '']))
    const cellXfs = first(styles, 'cellXfs')
    if (cellXfs) kids(cellXfs).forEach((xf, i) => {
      const id = Number(xf.getAttribute('numFmtId'))
      if (BUILTIN_DATE_FORMATS.has(id) || (custom[id] && isDateFormat(custom[id]))) dateStyles.add(i)
    })
  }
  const serialToDate = (n) => new Date(Math.round((n - (date1904 ? -1462 : 25569)) * 86400000))

  const rows = []
  for (const rowEl of all(sheet, 'row')) {
    const r = Number(rowEl.getAttribute('r')) - 1
    const row = []
    let next = 0
    for (const c of kids(rowEl).filter(el => el.localName === 'c')) {
      let col = colIndex(c.getAttribute('r'))
      if (col < 0) col = next
      next = col + 1
      const t = c.getAttribute('t') || 'n'
      const v = first(c, 'v')?.textContent
      let value = null
      if (t === 's') value = v != null ? (shared[Number(v)] ?? null) : null
      else if (t === 'inlineStr') { const is = first(c, 'is'); value = is ? richText(is) : (v ?? null) }
      else if (t === 'str' || t === 'e') value = v ?? null
      else if (t === 'b') value = v == null ? null : v === '1'
      else if (t === 'd') value = v ? new Date(v) : null
      else if (v != null && v !== '') {
        const num = Number(v)
        value = Number.isNaN(num) ? v : dateStyles.has(Number(c.getAttribute('s'))) ? serialToDate(num) : num
      }
      if (typeof value === 'string') value = value.trim() || null
      row[col] = value
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null
    rows[Number.isInteger(r) && r >= 0 ? r : rows.length] = row
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = []
  return rows
}
