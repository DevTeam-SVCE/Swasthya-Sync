// index.js — dScribe HMS Express API Server
import './env.js'
import express from 'express'
import cors from 'cors'
import pkg from 'pg'
const { Pool, types } = pkg
// DATE columns as plain 'YYYY-MM-DD' strings — the default Date conversion shifts them
// by the server's timezone (2026-10-08 came back as 2026-10-07T18:30Z in IST)
types.setTypeParser(1082, v => v)
import authRouter, { setPool as setAuthPool, requireAuth, requireAdmin } from './auth.js'
import { RESOURCE_MIGRATIONS, migrateLegacyData, registerResourceRoutes, pickFields } from './resources.js'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { sendEmail } from './email.js'
import { fileURLToPath } from 'url'
// Built-in lightweight PDF text extractor (no npm package needed)
function extractTextFromPdf(buffer) {
  const str = buffer.toString('latin1')
  const lines = []
  // Extract strings from BT...ET blocks (text object markers)
  const btEt = /BT[\s\S]*?ET/g
  let match
  while ((match = btEt.exec(str)) !== null) {
    // Pull parenthesis-delimited strings: (hello world)
    const paren = /\(([^)]{1,300})\)/g
    let m2
    while ((m2 = paren.exec(match[0])) !== null) {
      const t = m2[1].replace(/\\n/g,'\n').replace(/\\r/g,'').replace(/\\t/g,' ').replace(/\\\\/g,'\\').trim()
      if (t.length > 1) lines.push(t)
    }
    // Also pull hex strings: <48656c6c6f>
    const hex = /<([0-9a-fA-F]{4,})>/g
    while ((m2 = hex.exec(match[0])) !== null) {
      const h = m2[1]
      let t2 = ''
      for (let i = 0; i < h.length - 1; i += 2) t2 += String.fromCharCode(parseInt(h.slice(i,i+2),16))
      t2 = t2.replace(/[\x00-\x1f\x7f]/g,'').trim()
      if (t2.length > 1) lines.push(t2)
    }
  }
  return lines.join('\n')
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'forms')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}_${safe}`)
  },
})
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Only PDF files are allowed'))
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
})

// ─── DB ──────────────────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'dscribe_hms',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
})

async function initDB() {
  let retries = 10
  let c
  while (retries > 0) {
    try {
      c = await pool.connect()
      console.log('✅  PostgreSQL connected')
      break
    } catch (e) {
      console.error(`❌  DB connection failed: ${e.message}, retrying in 3 seconds...`)
      retries--
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  if (!c) {
    console.error('💥 FATAL: Could not connect to DB.')
    return
  }

  try {
    // 1. Run the main schema creation file safely
    const importSql = fs.readFileSync(path.join(__dirname, 'dscribe_hms_import.sql'), 'utf-8')
    await c.query(importSql)

    // 2. Run forms / alterations
    const safeMigrations = [
      `DO $m$ BEGIN ALTER TABLE patients ADD COLUMN hospital_id INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE patients ADD COLUMN email VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE patients ADD COLUMN phone VARCHAR(20); EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE patients ADD COLUMN address TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE patients ADD COLUMN blood_group VARCHAR(5); EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE patients ADD COLUMN uhid VARCHAR(30); EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      // Registration fields without their own column (DOB, Aadhaar, guardian, insurance, MLC…)
      `ALTER TABLE patients ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'`,
      // The registration form's default blood group is "Unknown" (7 chars) — VARCHAR(5) rejected it
      `ALTER TABLE patients ALTER COLUMN blood_group TYPE VARCHAR(10)`,
      `DO $m$ BEGIN ALTER TABLE doctors ADD COLUMN hospital_id INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE doctors ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      // In-house staff doctor or a visiting consultant
      `ALTER TABLE doctors ADD COLUMN IF NOT EXISTS doctor_type VARCHAR(20) DEFAULT 'in-house'`,
      // Doctors can belong to several departments (comma-separated); the linked login mirrors the list
      `ALTER TABLE doctors ALTER COLUMN department TYPE VARCHAR(500)`,
      `ALTER TABLE users ALTER COLUMN department TYPE VARCHAR(500)`,
      `DO $m$ BEGIN ALTER TABLE beds ADD COLUMN hospital_id INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE opd_visits ADD COLUMN hospital_id INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `ALTER TABLE beds ADD COLUMN IF NOT EXISTS discharge_step INTEGER DEFAULT 0`,
      `ALTER TABLE beds ADD COLUMN IF NOT EXISTS discharge_status VARCHAR(50) DEFAULT 'Admitted'`,
      `ALTER TABLE beds ADD COLUMN IF NOT EXISTS discharge_notes TEXT`,
      `DO $m$ BEGIN ALTER TABLE hospitals ADD COLUMN logo TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE hospitals ADD COLUMN report_header_text TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE hospitals ADD COLUMN report_footer_text TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE hospitals ADD COLUMN report_tagline VARCHAR(300); EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE hospitals ADD COLUMN report_logo TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE hospitals ADD COLUMN report_header_image TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE hospitals ADD COLUMN report_footer_image TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE hospitals ADD COLUMN report_print_mode VARCHAR(50) DEFAULT 'text'; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE clinical_notes ADD COLUMN hospital_id INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE lab_tests ADD COLUMN hospital_id INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE pharmacy_inventory ADD COLUMN hospital_id INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE billing ADD COLUMN hospital_id INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `CREATE TABLE IF NOT EXISTS form_templates (
        id          SERIAL PRIMARY KEY,
        hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
        name        VARCHAR(200) NOT NULL,
        description TEXT,
        category    VARCHAR(100) DEFAULT 'General',
        file_path   VARCHAR(500) NOT NULL,
        file_name   VARCHAR(300) NOT NULL,
        file_size   INTEGER,
        page_count  INTEGER DEFAULT 1,
        is_active   BOOLEAN DEFAULT TRUE,
        created_by  VARCHAR(100),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )`,
      `DO $m$ BEGIN ALTER TABLE form_templates ADD COLUMN hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      // Auto-fill layout detected from the PDF (label blanks, empty header areas) — see src/utils/formLayout.js
      `ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS layout JSONB`,
      // SHA-256 of the PDF, used to spot a form that has already been uploaded
      `ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64)`,
      `CREATE TABLE IF NOT EXISTS patient_forms (
        id              SERIAL PRIMARY KEY,
        template_id     INTEGER REFERENCES form_templates(id) ON DELETE CASCADE,
        patient_id      VARCHAR(20) REFERENCES patients(id) ON DELETE CASCADE,
        annotations     JSONB DEFAULT '[]',
        status          VARCHAR(30) DEFAULT 'blank',
        filled_by       VARCHAR(100),
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_patient_forms_patient ON patient_forms(patient_id)`,
      `CREATE INDEX IF NOT EXISTS idx_patient_forms_template ON patient_forms(template_id)`,
      `CREATE INDEX IF NOT EXISTS idx_form_templates_hospital ON form_templates(hospital_id)`,
      // Photos / scans / documents attached to a patient (viewer's Records → Attachments)
      `CREATE TABLE IF NOT EXISTS patient_attachments (
        id          SERIAL PRIMARY KEY,
        hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE NOT NULL,
        patient_id  VARCHAR(20) REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
        name        VARCHAR(200) NOT NULL,
        category    VARCHAR(100) NOT NULL DEFAULT 'Others',
        file_path   VARCHAR(500) NOT NULL,
        mime_type   VARCHAR(100),
        file_size   INTEGER,
        uploaded_by VARCHAR(100),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_patient_attachments_patient ON patient_attachments(patient_id)`,

      // Result PDF column for lab tests
      `ALTER TABLE lab_tests ADD COLUMN IF NOT EXISTS result_pdf_path TEXT`,

      // Radiology orders table
      `CREATE TABLE IF NOT EXISTS radiology_orders (
        id                SERIAL PRIMARY KEY,
        hospital_id       INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
        patient_id        VARCHAR(20) REFERENCES patients(id),
        study_type        VARCHAR(100) NOT NULL,
        modality          VARCHAR(50),
        body_part         VARCHAR(100),
        requested_by      VARCHAR(100),
        clinical_indication TEXT,
        priority          VARCHAR(20) DEFAULT 'Routine',
        status            VARCHAR(30) DEFAULT 'Scheduled',
        radiologist_notes TEXT,
        result_pdf_path   TEXT,
        ordered_at        TIMESTAMPTZ DEFAULT NOW(),
        completed_at      TIMESTAMPTZ
      )`,
      `CREATE INDEX IF NOT EXISTS idx_radiology_hospital ON radiology_orders(hospital_id)`,
      `CREATE INDEX IF NOT EXISTS idx_radiology_status   ON radiology_orders(status)`,

      // Discharge Summary Templates (rich-text, hospital-scoped)
      `CREATE TABLE IF NOT EXISTS discharge_summary_templates (
        id          SERIAL PRIMARY KEY,
        hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE NOT NULL,
        name        VARCHAR(200) NOT NULL,
        type        VARCHAR(100) DEFAULT 'General',
        description TEXT,
        content     TEXT NOT NULL DEFAULT '',
        is_active   BOOLEAN DEFAULT TRUE,
        created_by  INTEGER REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )`,
      `ALTER TABLE discharge_summary_templates ADD COLUMN IF NOT EXISTS file_name  TEXT`,
      `ALTER TABLE discharge_summary_templates ADD COLUMN IF NOT EXISTS file_size  INTEGER`,
      `ALTER TABLE discharge_summary_templates ADD COLUMN IF NOT EXISTS file_path  TEXT`,

      `CREATE TABLE IF NOT EXISTS patient_discharge_summaries (
        id              SERIAL PRIMARY KEY,
        template_id     INTEGER REFERENCES discharge_summary_templates(id) ON DELETE CASCADE,
        patient_id      VARCHAR(20) REFERENCES patients(id) ON DELETE CASCADE,
        annotations     JSONB DEFAULT '[]',
        status          VARCHAR(30) DEFAULT 'blank',
        filled_by       VARCHAR(100),
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_patient_ds_patient ON patient_discharge_summaries(patient_id)`,
      `CREATE INDEX IF NOT EXISTS idx_patient_ds_template ON patient_discharge_summaries(template_id)`,
      `DO $m$ BEGIN ALTER TABLE patient_discharge_summaries ADD COLUMN text_content TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE patient_discharge_summaries ADD COLUMN approved_by VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE patient_discharge_summaries ADD COLUMN approved_at TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,

      // ── Audit Trail ──
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id          SERIAL PRIMARY KEY,
        hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
        user_id     INTEGER,
        user_name   VARCHAR(150),
        user_role   VARCHAR(50),
        action      VARCHAR(100) NOT NULL,
        resource    VARCHAR(100),
        resource_id VARCHAR(50),
        details     TEXT,
        ip_address  VARCHAR(50),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_audit_hospital ON audit_logs(hospital_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs(created_at)`,
    ]
    for (const sql of [...safeMigrations, ...RESOURCE_MIGRATIONS]) {
      await c.query(sql)
    }
    await migrateLegacyData(c)
    console.log('✅  All tables ready with hospital scoping')
  } catch (e) {
    console.error('❌  DB Init failed:', e.message)
  } finally {
    c.release()
  }
}

initDB()

// Share pool with auth module
setAuthPool(pool)

// ─── Audit-Trail helper ──────────────────────────────────────
async function logAudit(req, action, resource, resourceId, details) {
  req._audited = true
  try {
    const u = req.user || {}
    await pool.query(
      `INSERT INTO audit_logs (hospital_id, user_id, user_name, user_role, action, resource, resource_id, details, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        u.hospitalId || null,
        u.id         || null,
        u.name       || u.username || 'Unknown',
        u.role       || 'staff',
        action,
        resource     || null,
        resourceId   ? String(resourceId) : null,
        details      || null,
        req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
      ]
    )
  } catch (e) {
    console.error('[Audit] Log failed:', e.message)
  }
}

// Next sequential id like P-4812 / INV-4803 / D-007. Looks only at ids in that exact
// format, so other ids (e.g. old "INV-PH-123456" pharmacy bills) can't produce NaN.
async function nextId(db, table, prefix, fallback, pad = 0) {
  const { rows: [r] } = await db.query(
    `SELECT MAX(CAST(SUBSTRING(id FROM $1) AS INTEGER)) AS n FROM ${table} WHERE id ~ $2`,
    [`^${prefix}(\\d+)$`, `^${prefix}\\d+$`]
  )
  return `${prefix}${String((r.n ?? fallback) + 1).padStart(pad, '0')}`
}

// Tables (besides patients itself) that point at a patient — used by merge and delete
async function patientLinkedTables(db) {
  const { rows } = await db.query(
    `SELECT DISTINCT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'patient_id' AND table_name <> 'patients'`)
  return rows.map(r => r.table_name)
}

const billStatus = (total, paid) => (Number(paid) >= Number(total) ? 'Paid' : Number(paid) > 0 ? 'Partial' : 'Pending')

const PATIENT_FIELDS = ['name', 'age', 'gender', 'blood_group', 'department', 'doctor_id', 'phone', 'email',
                        'address', 'status', 'admission_type', 'notes', 'uhid', 'admitted_at']
// Stored in patients.details and returned as top-level fields
const PATIENT_DETAIL_FIELDS = ['dob', 'alt_phone', 'aadhaar', 'abha_id', 'city', 'state', 'pincode', 'religion',
  'marital_status', 'patient_category', 'guardian_name', 'guardian_relation', 'guardian_phone', 'mlc_type',
  'mlc_police_info', 'referred_by', 'referral_hospital', 'payment_type', 'insurance_company', 'tpa_name',
  'policy_no', 'validity']
const pickDetails = body => Object.fromEntries(PATIENT_DETAIL_FIELDS.filter(k => body[k] !== undefined).map(k => [k, body[k]]))
function flatPatient(row) {
  if (!row) return row
  const { details, ...rest } = row
  return { ...pickDetails(details || {}), ...rest }
}

// ─── APP ─────────────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Every successful create / update / delete by a signed-in user lands in the audit trail.
// Routes that call logAudit themselves (with a richer message) are skipped.
const AUDIT_VERB = { POST: 'CREATED', PUT: 'UPDATED', PATCH: 'UPDATED', DELETE: 'DELETED' }
const AUDIT_SKIP = /^\/api\/(auth\/(login|register)|forms\/templates\/\d+\/layout)/
app.use((req, res, next) => {
  const verb = AUDIT_VERB[req.method]
  const reqPath = req.path // captured now: mounted routers rewrite req.url while handling
  if (!verb || AUDIT_SKIP.test(reqPath)) return next()
  // Keep the response body so a create can be logged with the new record's id
  const json = res.json.bind(res)
  res.json = body => { res.locals.auditBody = body; return json(body) }
  res.on('finish', () => {
    if (req._audited || !req.user || res.statusCode >= 400) return
    const parts = reqPath.replace(/^\/api\//, '').split('/')
    if (parts[0] === 'auth') parts.shift() // /api/auth/staff/7 → staff
    const [resource = 'unknown', id, sub] = parts
    // /beds/B-1/discharge → BEDS_DISCHARGE_UPDATED; /lab/5 → LAB_UPDATED
    const subject = (sub && !/^\d+$/.test(sub) ? `${resource}_${sub}` : resource).replace(/[^a-z0-9]+/gi, '_').toUpperCase()
    const body = req.body && typeof req.body === 'object'
      ? Object.keys(req.body).filter(k => !/password|annotations|layout|content|text_content/i.test(k)).slice(0, 8)
      : []
    const label = req.body?.name || req.body?.patient_name || req.body?.status
    logAudit(req, `${subject}_${verb}`, resource, id ?? res.locals.auditBody?.id,
      `${req.method} ${reqPath}${label ? ` — ${label}` : ''}${body.length ? ` (fields: ${body.join(', ')})` : ''}`)
  })
  next()
})

// ─────────────────────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter)

// ─────────────────────────────────────────────────────────────
// HOSPITAL PROFILE
// ─────────────────────────────────────────────────────────────

app.get('/api/hospital', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM hospitals WHERE id = $1', [req.user.hospitalId])
    if (!rows.length) return res.status(404).json({ error: 'Hospital not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/hospital', requireAuth, async (req, res) => {
  try {
    const allowed = ['name', 'address', 'city', 'phone', 'email', 'license_no', 'bed_count',
                     'report_header_text', 'report_footer_text', 'report_tagline', 'report_print_mode', 'settings']
    const fields = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)))
    if (fields.settings !== undefined) fields.settings = JSON.stringify(fields.settings || {})
    if (!Object.keys(fields).length) return res.status(400).json({ error: 'Nothing to update' })
    const keys = Object.keys(fields)
    const clause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
    const vals = [req.user.hospitalId, ...keys.map(k => fields[k])]
    const { rows } = await pool.query(
      `UPDATE hospitals SET ${clause} WHERE id = $1 RETURNING *`, vals
    )
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Upload hospital report logo
const LOGO_DIR = path.join(__dirname, 'uploads', 'logos')
if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true })

const brandingStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LOGO_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const type = req.params.type || 'logo' // 'logo', 'header', 'footer'
    cb(null, `hospital_${req.user.hospitalId}_${type}${ext}`)
  },
})

const brandingUpload = multer({
  storage: brandingStorage,
  fileFilter: (req, file, cb) => {
    if (['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype)) cb(null, true)
    else cb(new Error('Only PNG, JPG, JPEG, WEBP images allowed'))
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
})

app.post('/api/hospital/upload-branding/:type', requireAuth, brandingUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' })
    const type = req.params.type
    if (!['logo', 'header', 'footer'].includes(type)) return res.status(400).json({ error: 'Invalid type' })
    
    const imagePath = `/uploads/logos/${req.file.filename}`
    let col = 'report_logo'
    if (type === 'header') col = 'report_header_image'
    if (type === 'footer') col = 'report_footer_image'

    const { rows } = await pool.query(
      `UPDATE hospitals SET ${col} = $2 WHERE id = $1 RETURNING *`,
      [req.user.hospitalId, imagePath]
    )
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Remove an uploaded logo / header / footer image
app.delete('/api/hospital/branding/:type', requireAuth, async (req, res) => {
  try {
    const col = { logo: 'report_logo', header: 'report_header_image', footer: 'report_footer_image' }[req.params.type]
    if (!col) return res.status(400).json({ error: 'Invalid type' })
    const { rows: [h] } = await pool.query(`SELECT ${col} AS file FROM hospitals WHERE id = $1`, [req.user.hospitalId])
    if (h?.file?.startsWith('/uploads/logos/')) {
      const abs = path.join(__dirname, h.file)
      if (fs.existsSync(abs)) fs.unlinkSync(abs)
    }
    const { rows } = await pool.query(`UPDATE hospitals SET ${col} = NULL WHERE id = $1 RETURNING *`, [req.user.hospitalId])
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// PATIENTS
// ─────────────────────────────────────────────────────────────

// GET /api/patients
// GET /api/nav-counts — live numbers for the sidebar badges (kept to two cheap COUNTs)
app.get('/api/nav-counts', requireAuth, async (req, res) => {
  try {
    const hid = req.user.hospitalId
    const [p, n] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM patients WHERE hospital_id = $1', [hid]),
      pool.query(`SELECT COUNT(*) FROM clinical_notes WHERE hospital_id = $1 AND status = 'pending'`, [hid]),
    ])
    res.json({ patients: parseInt(p.rows[0].count), pendingNotes: parseInt(n.rows[0].count) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/patients', requireAuth, async (req, res) => {
  try {
    const { search = '', filter = 'All' } = req.query
    const hid = req.user.hospitalId
    let query = `
      SELECT p.*, d.name AS doctor_name
      FROM patients p
      LEFT JOIN doctors d ON p.doctor_id = d.id
      WHERE p.hospital_id = $1`
    const params = [hid]

    if (search) {
      params.push(`%${search}%`)
      const sIdx1 = params.length
      params.push(`%${search}%`)
      const sIdx2 = params.length
      params.push(`%${search}%`)
      const sIdx3 = params.length
      query += ` AND (p.name ILIKE $${sIdx1} OR p.id ILIKE $${sIdx2} OR p.department ILIKE $${sIdx3})`
    }
    if (filter !== 'All') {
      params.push(filter)
      const fIdx1 = params.length
      params.push(filter)
      const fIdx2 = params.length
      query += ` AND (p.status = $${fIdx1} OR p.admission_type = $${fIdx2})`
    }
    query += ' ORDER BY p.admitted_at DESC'
    const { rows } = await pool.query(query, params)
    res.json(rows.map(flatPatient))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/patients/:id
app.get('/api/patients/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, d.name AS doctor_name, d.department AS doctor_dept
       FROM patients p LEFT JOIN doctors d ON p.doctor_id = d.id
       WHERE p.id = $1 AND p.hospital_id = $2`,
      [req.params.id, req.user.hospitalId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(flatPatient(rows[0]))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/patients
app.post('/api/patients', requireAuth, async (req, res) => {
  try {
    const { name, age, gender, blood_group, department, doctor_id, phone, status, admission_type, notes } = req.body
    const hid = req.user.hospitalId
    if (!name?.trim()) return res.status(400).json({ error: 'Patient name is required' })
    const newId = await nextId(pool, 'patients', 'P-', 4800)
    const { email, address } = req.body
    const { rows } = await pool.query(
      `INSERT INTO patients (id,hospital_id,name,age,gender,blood_group,department,doctor_id,phone,status,admission_type,notes,email,address,details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [newId, hid, name.trim(), age === '' ? null : age, gender, blood_group, department, doctor_id || null, phone, status || 'Stable', admission_type || 'OPD', notes, email || null, address || null, JSON.stringify(pickDetails(req.body))]
    )
    res.status(201).json(flatPatient(rows[0]))
    logAudit(req, 'PATIENT_CREATED', 'patients', rows[0].id, `Patient "${name}" registered (${admission_type || 'OPD'})`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PATCH /api/patients/:id
app.patch('/api/patients/:id', requireAuth, async (req, res) => {
  try {
    const fields = pickFields(req.body, PATIENT_FIELDS)
    const details = pickDetails(req.body)
    const keys = Object.keys(fields)
    if (!keys.length && !Object.keys(details).length) return res.status(400).json({ error: 'No fields to update' })
    const setClause = [...keys.map((k, i) => `${k} = $${i + 4}`), `details = COALESCE(details, '{}'::jsonb) || $3::jsonb`].join(', ')
    const { rows } = await pool.query(
      `UPDATE patients SET ${setClause} WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [req.params.id, req.user.hospitalId, JSON.stringify(details), ...keys.map(k => fields[k])]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(flatPatient(rows[0]))
    logAudit(req, 'PATIENT_UPDATED', 'patients', req.params.id, `Patient "${rows[0].name}" updated (${[...keys, ...Object.keys(details)].join(', ')})`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Delete rows of `table` matching `where`, first clearing any rows elsewhere that point at
// them through a foreign key without ON DELETE CASCADE / SET NULL (nullable refs are
// nulled, required refs are deleted recursively).
async function cascadeDelete(db, table, where, params, depth = 0) {
  if (depth > 6) throw new Error(`Cascade too deep at ${table}`)
  const { rows: refs } = await db.query(
    `SELECT ch.relname AS child, ca.attname AS child_col, pa.attname AS parent_col, NOT ca.attnotnull AS nullable
     FROM pg_constraint c
     JOIN pg_class ch ON ch.oid = c.conrelid
     JOIN pg_class pt ON pt.oid = c.confrelid
     JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
     JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
     WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1 AND c.confdeltype IN ('a', 'r')
       AND pt.relname = $1 AND pt.relnamespace = 'public'::regnamespace`, [table])
  for (const r of refs) {
    const { rows } = await db.query(`SELECT DISTINCT ${r.parent_col} AS v FROM ${table} WHERE ${where}`, params)
    const vals = rows.map(x => x.v).filter(v => v !== null)
    if (!vals.length) continue
    if (r.nullable) await db.query(`UPDATE ${r.child} SET ${r.child_col} = NULL WHERE ${r.child_col} = ANY($1)`, [vals])
    else await cascadeDelete(db, r.child, `${r.child_col} = ANY($1)`, [vals], depth + 1)
  }
  await db.query(`DELETE FROM ${table} WHERE ${where}`, params)
}

// DELETE /api/patients/:id — a patient with clinical / billing history is refused with
// 409 + `linked` unless ?cascade=1, which removes the patient and every linked record.
app.delete('/api/patients/:id', requireAuth, async (req, res) => {
  const c = await pool.connect()
  try {
    const hid = req.user.hospitalId, id = req.params.id
    const { rows: [p] } = await c.query('SELECT name FROM patients WHERE id = $1 AND hospital_id = $2', [id, hid])
    if (!p) return res.status(404).json({ error: 'Patient not found' })
    const tables = await patientLinkedTables(c)
    const linked = []
    for (const t of tables) {
      const { rows: [{ count }] } = await c.query(`SELECT COUNT(*) FROM ${t} WHERE patient_id = $1`, [id])
      if (+count && !['patient_forms', 'patient_discharge_summaries', 'queue_tokens'].includes(t)) linked.push(`${count} ${t.replace(/_/g, ' ')}`)
    }
    if (linked.length && req.query.cascade !== '1') {
      return res.status(409).json({ error: `This patient has ${linked.join(', ')}.`, linked })
    }
    await c.query('BEGIN')
    // Free any bed the patient occupies rather than deleting the bed
    await c.query(
      `UPDATE beds SET status = 'available', patient_id = NULL, doctor_id = NULL, diagnosis = NULL, has_alert = false
       WHERE patient_id = $1 AND hospital_id = $2`, [id, hid])
    for (const t of tables.filter(t => t !== 'beds')) await cascadeDelete(c, t, 'patient_id = $1', [id])
    await cascadeDelete(c, 'patients', 'id = $1 AND hospital_id = $2', [id, hid])
    await c.query('COMMIT')
    res.json({ success: true })
    logAudit(req, 'PATIENT_DELETED', 'patients', id,
      `Patient "${p.name}" deleted${linked.length ? ` with all linked records (${linked.join(', ')})` : ''}`)
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: e.message })
  } finally { c.release() }
})

// POST /api/patients/:id/merge { duplicate_id } — move every linked record from the
// duplicate onto this (primary) patient, fill blanks from the duplicate, then delete it.
app.post('/api/patients/:id/merge', requireAuth, async (req, res) => {
  const c = await pool.connect()
  try {
    const hid = req.user.hospitalId
    const keepId = req.params.id, dupId = req.body.duplicate_id
    if (!dupId || dupId === keepId) return res.status(400).json({ error: 'Choose two different patients' })
    await c.query('BEGIN')
    const { rows } = await c.query('SELECT * FROM patients WHERE id = ANY($1) AND hospital_id = $2 FOR UPDATE', [[keepId, dupId], hid])
    const keep = rows.find(r => r.id === keepId), dup = rows.find(r => r.id === dupId)
    if (!keep || !dup) throw Object.assign(new Error('Patient not found'), { status: 404 })
    const moved = {}
    for (const t of await patientLinkedTables(c)) {
      const r = await c.query(`UPDATE ${t} SET patient_id = $1 WHERE patient_id = $2`, [keepId, dupId])
      if (r.rowCount) moved[t] = r.rowCount
    }
    const fill = ['age', 'gender', 'blood_group', 'phone', 'email', 'address', 'department', 'doctor_id', 'uhid']
      .filter(k => (keep[k] === null || keep[k] === '') && dup[k] !== null && dup[k] !== '')
    if (fill.length) {
      await c.query(`UPDATE patients SET ${fill.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [keepId, ...fill.map(k => dup[k])])
    }
    // Registration details: the primary's values win, the duplicate fills the gaps
    await c.query(`UPDATE patients SET details = $2::jsonb || COALESCE(details, '{}'::jsonb) WHERE id = $1`,
      [keepId, JSON.stringify(dup.details || {})])
    await c.query('DELETE FROM patients WHERE id = $1', [dupId])
    await c.query('COMMIT')
    res.json({ success: true, moved })
    const summary = Object.entries(moved).map(([t, n]) => `${n} ${t}`).join(', ') || 'no linked records'
    logAudit(req, 'PATIENT_MERGED', 'patients', keepId, `"${dup.name}" (${dupId}) merged into "${keep.name}" (${keepId}); moved ${summary}`)
  } catch (e) {
    await c.query('ROLLBACK')
    res.status(e.status || 500).json({ error: e.message })
  } finally { c.release() }
})

// ─────────────────────────────────────────────────────────────
// DOCTORS
// ─────────────────────────────────────────────────────────────

app.get('/api/doctors', requireAuth, async (req, res) => {
  try {
    const { search = '', status = 'All', dept = 'All' } = req.query
    const hid = req.user.hospitalId
    let query = 'SELECT * FROM doctors WHERE hospital_id = $1'
    const params = [hid]
    if (search) { params.push(`%${search}%`); const d1=params.length; params.push(`%${search}%`); const d2=params.length; query += ` AND (name ILIKE $${d1} OR department ILIKE $${d2})` }
    if (status !== 'All') { params.push(status); query += ` AND status = $${params.length}` }
    // A doctor's department may list several ("Cardiology, ENT") — match any of them
    if (dept !== 'All') { params.push(dept); query += ` AND LOWER(TRIM($${params.length})) IN (SELECT LOWER(TRIM(x)) FROM unnest(regexp_split_to_array(department, '[,;]')) AS x)` }
    query += ' ORDER BY name'
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/doctors/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM doctors WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/doctors', requireAuth, async (req, res) => {
  try {
    const { name, department, qualification, experience, rating, status, schedule, phone, email, doctor_type } = req.body
    const hid = req.user.hospitalId
    if (!name?.trim() || !department) return res.status(400).json({ error: 'Name and department are required' })
    const newId = await nextId(pool, 'doctors', 'D-', 0, 3)
    const { rows } = await pool.query(
      `INSERT INTO doctors (id,hospital_id,name,department,qualification,experience,rating,status,schedule,phone,email,doctor_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [newId, hid, name, department, qualification, experience || 0, rating || 5.0, status || 'available', schedule, phone, email, doctor_type === 'visiting' ? 'visiting' : 'in-house']
    )
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/doctors/bulk — import many doctors at once (spreadsheet / historical data).
// All-or-nothing: rows are validated first, then inserted in one transaction.
app.post('/api/doctors/bulk', requireAuth, async (req, res) => {
  const list = req.body?.doctors
  if (!Array.isArray(list) || !list.length) return res.status(400).json({ error: 'No doctors to import' })
  if (list.length > 1000) return res.status(400).json({ error: 'At most 1000 doctors can be imported at once' })
  const STATUSES = ['available', 'in-consultation', 'on-leave']
  const bad = list.findIndex(d => !String(d?.name || '').trim() || !String(d?.department || '').trim()
    || (d.status && !STATUSES.includes(d.status)) || (d.doctor_type && !['in-house', 'visiting'].includes(d.doctor_type)))
  if (bad !== -1) return res.status(400).json({ error: `Row ${bad + 1}: name and department are required, and status / doctor type must be valid` })
  const hid = req.user.hospitalId
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Doctor IDs are sequential — keep a concurrent add from taking the same numbers
    await client.query('LOCK TABLE doctors IN SHARE ROW EXCLUSIVE MODE')
    let n = parseInt((await nextId(client, 'doctors', 'D-', 0, 3)).slice(2), 10)
    const created = []
    for (const d of list) {
      const exp = parseInt(d.experience, 10)
      const { rows } = await client.query(
        `INSERT INTO doctors (id,hospital_id,name,department,qualification,experience,rating,status,schedule,phone,email,doctor_type)
         VALUES ($1,$2,$3,$4,$5,$6,5.0,$7,$8,$9,$10,$11) RETURNING *`,
        [`D-${String(n++).padStart(3, '0')}`, hid, String(d.name).trim(), String(d.department).trim(), d.qualification || null,
          Number.isFinite(exp) && exp >= 0 ? exp : 0, d.status || 'available', d.schedule || null, d.phone || null, d.email || null,
          d.doctor_type || 'in-house'])
      created.push(rows[0])
    }
    await client.query('COMMIT')
    res.status(201).json({ created })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: e.message })
  } finally { client.release() }
})

app.patch('/api/doctors/:id', requireAuth, async (req, res) => {
  try {
    const fields = pickFields(req.body, ['name', 'department', 'qualification', 'experience', 'rating', 'status', 'schedule', 'phone', 'email', 'doctor_type'])
    if (fields.doctor_type !== undefined) fields.doctor_type = fields.doctor_type === 'visiting' ? 'visiting' : 'in-house'
    const keys = Object.keys(fields)
    if (!keys.length) return res.status(400).json({ error: 'No fields to update' })
    const setClause = keys.map((k, i) => `${k} = $${i + 3}`).join(', ')
    const { rows } = await pool.query(
      `UPDATE doctors SET ${setClause} WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [req.params.id, req.user.hospitalId, ...keys.map(k => fields[k])]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    // Keep the linked staff login in sync
    if (rows[0].user_id && (fields.name || fields.department || fields.phone || fields.email)) {
      await pool.query(
        `UPDATE users SET name = COALESCE($2, name), department = COALESCE($3, department), phone = COALESCE($4, phone), email = COALESCE($5, email)
         WHERE id = $1`, [rows[0].user_id, fields.name, fields.department, fields.phone, fields.email])
    }
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Doctors referenced by patients / visits / notes can't be hard-deleted; mark them on leave instead
app.delete('/api/doctors/:id', requireAuth, async (req, res) => {
  try {
    const hid = req.user.hospitalId
    const { rows: [d] } = await pool.query('SELECT id, user_id FROM doctors WHERE id = $1 AND hospital_id = $2', [req.params.id, hid])
    if (!d) return res.status(404).json({ error: 'Doctor not found' })
    const { rows: [{ n }] } = await pool.query(
      `SELECT (SELECT COUNT(*) FROM patients WHERE doctor_id = $1) + (SELECT COUNT(*) FROM opd_visits WHERE doctor_id = $1)
            + (SELECT COUNT(*) FROM clinical_notes WHERE doctor_id = $1) + (SELECT COUNT(*) FROM beds WHERE doctor_id = $1) AS n`, [d.id])
    if (+n > 0) {
      return res.status(409).json({ error: `This doctor is linked to ${n} patient/visit/note record(s). Set their status to "On Leave" instead of deleting.` })
    }
    await pool.query('DELETE FROM doctors WHERE id = $1 AND hospital_id = $2', [d.id, hid])
    if (d.user_id) await pool.query(`UPDATE users SET is_active = FALSE WHERE id = $1 AND hospital_id = $2`, [d.user_id, hid])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// BEDS / IPD
// ─────────────────────────────────────────────────────────────

app.get('/api/beds', requireAuth, async (req, res) => {
  try {
    const { ward = 'All', search = '' } = req.query
    const hid = req.user.hospitalId
    let query = `
      SELECT b.*, p.name AS patient_name, p.age, d.name AS doctor_name
      FROM beds b
      LEFT JOIN patients p ON b.patient_id = p.id
      LEFT JOIN doctors  d ON b.doctor_id  = d.id
      WHERE b.hospital_id = $1`
    const params = [hid]
    if (ward !== 'All') { params.push(ward); query += ` AND b.ward = $${params.length}` }
    if (search) { params.push(`%${search}%`); const b1=params.length; params.push(`%${search}%`); const b2=params.length; query += ` AND (p.name ILIKE $${b1} OR b.id ILIKE $${b2})` }
    query += ' ORDER BY b.id'
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/beds/:id', requireAuth, async (req, res) => {
  try {
    const { status, patient_id, doctor_id, diagnosis, has_alert } = req.body
    const { rows } = await pool.query(
      `UPDATE beds SET status=$2, patient_id=$3, doctor_id=$4, diagnosis=$5, has_alert=$6
       WHERE id = $1 AND hospital_id = $7 RETURNING *`,
      [req.params.id, status, patient_id || null, doctor_id || null, diagnosis, has_alert || false, req.user.hospitalId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Edit a bed's ward / type / maintenance status without touching its occupant
app.patch('/api/beds/:id/details', requireAuth, async (req, res) => {
  try {
    const fields = pickFields(req.body, ['ward', 'bed_type', 'status'])
    if (fields.status && !['available', 'maintenance', 'reserved'].includes(fields.status)) {
      return res.status(400).json({ error: 'Status can only be set to available, maintenance or reserved here' })
    }
    const keys = Object.keys(fields)
    if (!keys.length) return res.status(400).json({ error: 'Nothing to update' })
    const { rows: [bed] } = await pool.query('SELECT status FROM beds WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    if (!bed) return res.status(404).json({ error: 'Not found' })
    if (fields.status && bed.status === 'occupied') return res.status(400).json({ error: 'Bed is occupied — discharge the patient first' })
    const { rows } = await pool.query(
      `UPDATE beds SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [req.params.id, req.user.hospitalId, ...keys.map(k => fields[k])])
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/beds', requireAuth, async (req, res) => {
  try {
    const { id, ward, bed_type, status } = req.body
    if (!id || !ward) return res.status(400).json({ error: 'Bed ID and Ward are required' })
    const hid = req.user.hospitalId
    // Check duplicate ID within this hospital
    const { rows: existing } = await pool.query('SELECT id FROM beds WHERE id = $1 AND hospital_id = $2', [id, hid])
    if (existing.length) return res.status(409).json({ error: `Bed ID "${id}" already exists` })
    const { rows } = await pool.query(
      `INSERT INTO beds (id, hospital_id, ward, bed_type, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, hid, ward, bed_type || 'General', status || 'available']
    )
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/beds/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT status FROM beds WHERE id = $1 AND hospital_id = $2',
      [req.params.id, req.user.hospitalId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    if (rows[0].status === 'occupied') return res.status(400).json({ error: 'Cannot delete an occupied bed. Please discharge the patient first.' })
    await pool.query('DELETE FROM beds WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// OPD VISITS
// ─────────────────────────────────────────────────────────────

app.get('/api/opd', requireAuth, async (req, res) => {
  try {
    const { date, status = 'All', search = '' } = req.query
    const hid = req.user.hospitalId
    let query = `
      SELECT o.*, p.name AS patient_name, p.age, p.gender, p.phone, p.blood_group, d.name AS doctor_name
      FROM opd_visits o
      LEFT JOIN patients p ON o.patient_id = p.id
      LEFT JOIN doctors  d ON o.doctor_id  = d.id
      WHERE o.hospital_id = $1`
    const params = [hid]
    if (date) { params.push(date); query += ` AND o.visit_date = $${params.length}` }
    if (status !== 'All') { params.push(status); query += ` AND o.status = $${params.length}` }
    if (search) { params.push(`%${search}%`); const o1=params.length; params.push(`%${search}%`); const o2=params.length; query += ` AND (p.name ILIKE $${o1} OR o.token ILIKE $${o2})` }
    query += ' ORDER BY o.created_at DESC'
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/opd', requireAuth, async (req, res) => {
  const client = await pool.connect()
  try {
    const { patient_id, doctor_id, department, visit_type, symptoms, fee, is_walkin, patient_name, age, gender, phone } = req.body
    const hid = req.user.hospitalId

    await client.query('BEGIN')
    let pid = patient_id

    if (is_walkin) {
      const newId = await nextId(client, 'patients', 'P-', 4800)
      const { rows: [p] } = await client.query(
        `INSERT INTO patients (id,hospital_id,name,age,gender,department,doctor_id,phone,status,admission_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'OPD','Walk-In') RETURNING id`,
        [newId, hid, patient_name, age || null, gender || 'Other', department, doctor_id, phone || null]
      )
      pid = p.id
    }

    // Appointments can be booked for a later day; tokens are numbered per visit day
    const visitDate = /^\d{4}-\d{2}-\d{2}$/.test(req.body.visit_date || '') ? req.body.visit_date : null
    const { rows: count } = await client.query(
      `SELECT COUNT(*) FROM opd_visits WHERE visit_date = COALESCE($2::date, CURRENT_DATE) AND hospital_id = $1`, [hid, visitDate])
    const token = `T-${String(parseInt(count[0].count) + 1).padStart(3, '0')}`
    const { rows } = await client.query(
      `INSERT INTO opd_visits (hospital_id,patient_id,doctor_id,token,department,visit_type,symptoms,fee,visit_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::date, CURRENT_DATE)) RETURNING *`,
      [hid, pid, doctor_id || null, token, department, visit_type, symptoms, fee || 0, visitDate]
    )

    await client.query('COMMIT')
    res.status(201).json(rows[0])
  } catch (e) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: e.message })
  } finally {
    client.release()
  }
})

app.patch('/api/opd/:id', requireAuth, async (req, res) => {
  try {
    const fields = pickFields(req.body, ['doctor_id', 'department', 'visit_type', 'symptoms', 'diagnosis', 'prescription', 'status', 'fee', 'visit_date'])
    const keys = Object.keys(fields)
    if (!keys.length) return res.status(400).json({ error: 'No fields to update' })
    const setClause = keys.map((k, i) => `${k} = $${i + 3}`).join(', ')
    const { rows } = await pool.query(
      `UPDATE opd_visits SET ${setClause} WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [req.params.id, req.user.hospitalId, ...keys.map(k => fields[k])])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Delete a visit booked by mistake (completed visits are part of the record and stay)
app.delete('/api/opd/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [v] } = await pool.query('SELECT status FROM opd_visits WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    if (!v) return res.status(404).json({ error: 'Not found' })
    if (String(v.status).toLowerCase() === 'completed') return res.status(400).json({ error: 'Completed visits cannot be deleted' })
    await pool.query('DELETE FROM opd_visits WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// CLINICAL NOTES
// ─────────────────────────────────────────────────────────────

app.get('/api/notes', requireAuth, async (req, res) => {
  try {
    const { status = 'All', priority = 'All', search = '', patient_id } = req.query
    const hid = req.user.hospitalId
    let query = `
      SELECT n.*, p.name AS patient_name, d.name AS doctor_name
      FROM clinical_notes n
      LEFT JOIN patients p ON n.patient_id = p.id
      LEFT JOIN doctors  d ON n.doctor_id  = d.id
      WHERE n.hospital_id = $1`
    const params = [hid]
    if (patient_id) {
      params.push(patient_id)
      query += ` AND n.patient_id = $${params.length}`
    }
    if (status !== 'All') { params.push(status); query += ` AND n.status = $${params.length}` }
    if (priority !== 'All') { params.push(priority); query += ` AND n.priority = $${params.length}` }
    if (search) { params.push(`%${search}%`); const n1=params.length; params.push(`%${search}%`); const n2=params.length; query += ` AND (p.name ILIKE $${n1} OR n.note_type ILIKE $${n2})` }
    query += ' ORDER BY n.created_at DESC'
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/notes', requireAuth, async (req, res) => {
  try {
    const { patient_id, doctor_id, note_type, content, priority } = req.body
    if (!patient_id || !content) return res.status(400).json({ error: 'Patient and content are required' })
    const { rows } = await pool.query(
      `INSERT INTO clinical_notes (hospital_id, patient_id, doctor_id, note_type, content, priority)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        req.user.hospitalId,
        patient_id,
        doctor_id || null,      // empty string → null to avoid FK violation
        note_type || 'Progress Note',
        content,
        priority || 'medium',
      ]
    )
    res.status(201).json(rows[0])
  } catch (e) {
    console.error('POST /api/notes error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/notes/:id', requireAuth, async (req, res) => {
  try {
    const fields = pickFields(req.body, ['note_type', 'content', 'priority', 'status', 'doctor_id'])
    const keys = Object.keys(fields)
    if (!keys.length) return res.status(400).json({ error: 'No fields to update' })
    const setClause = keys.map((k, i) => `${k} = $${i + 3}`).join(', ')
    const { rows } = await pool.query(
      `UPDATE clinical_notes SET ${setClause}, updated_at = NOW() WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [req.params.id, req.user.hospitalId, ...keys.map(k => fields[k])]
    )
    if (!rows.length) return res.status(404).json({ error: 'Note not found' })
    res.json(rows[0])
  } catch (e) {
    console.error('PATCH /api/notes error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/notes/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM clinical_notes WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    if (!rowCount) return res.status(404).json({ error: 'Note not found' })
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// LABORATORY
// ─────────────────────────────────────────────────────────────

app.get('/api/lab', requireAuth, async (req, res) => {
  try {
    const { status = 'All', priority = 'All', search = '', patient_id } = req.query
    const hid = req.user.hospitalId
    let query = `
      SELECT l.*, p.name AS patient_name, p.id AS patient_code, p.email AS patient_email
      FROM lab_tests l
      LEFT JOIN patients p ON l.patient_id = p.id
      WHERE l.hospital_id = $1`
    const params = [hid]
    if (patient_id) { params.push(patient_id); query += ` AND l.patient_id = $${params.length}` }
    if (status !== 'All') { params.push(status); query += ` AND l.status = $${params.length}` }
    if (priority !== 'All') { params.push(priority); query += ` AND l.priority = $${params.length}` }
    if (search) {
      params.push(`%${search}%`)
      const pIdx1 = params.length
      params.push(`%${search}%`)
      const pIdx2 = params.length
      query += ` AND (p.name ILIKE $${pIdx1} OR l.test_name ILIKE $${pIdx2})`
    }
    query += ' ORDER BY l.ordered_at DESC'
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/lab', requireAuth, async (req, res) => {
  try {
    const { patient_id, test_name, category, requested_by, priority } = req.body
    const { rows } = await pool.query(
      `INSERT INTO lab_tests (hospital_id,patient_id,test_name,category,requested_by,priority)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.hospitalId, patient_id, test_name, category, requested_by, priority || 'Routine']
    )
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Only the fields sent are changed (a status-only update no longer wipes result notes)
app.patch('/api/lab/:id', requireAuth, async (req, res) => {
  try {
    const fields = pickFields(req.body, ['status', 'result_notes', 'test_name', 'category', 'requested_by', 'priority'])
    const keys = Object.keys(fields)
    if (!keys.length) return res.status(400).json({ error: 'No fields to update' })
    let set = keys.map((k, i) => `${k} = $${i + 3}`).join(', ')
    if (fields.status) set += `, completed_at = ${fields.status === 'Completed' ? 'COALESCE(completed_at, NOW())' : 'NULL'}`
    const { rows } = await pool.query(
      `UPDATE lab_tests SET ${set} WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [req.params.id, req.user.hospitalId, ...keys.map(k => fields[k])])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Remove an order placed by mistake (completed results stay on record)
app.delete('/api/lab/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [t] } = await pool.query('SELECT status FROM lab_tests WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    if (!t) return res.status(404).json({ error: 'Not found' })
    if (t.status === 'Completed') return res.status(400).json({ error: 'Completed tests cannot be deleted' })
    await pool.query('DELETE FROM lab_tests WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Upload result PDF for a lab test
app.post('/api/lab/:id/upload-result', requireAuth, upload.single('result_pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' })
    const filePath = `/uploads/forms/${req.file.filename}`
    const { rows } = await pool.query(
      `UPDATE lab_tests SET result_pdf_path=$2, status='Completed', completed_at=NOW()
       WHERE id=$1 AND hospital_id=$3 RETURNING *`,
      [req.params.id, filePath, req.user.hospitalId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Lab order not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Send lab result via Email
app.post('/api/lab/:id/email-result', requireAuth, upload.single('report_pdf'), async (req, res) => {
  try {
    const { email, patient_name, test_name } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No PDF file attached' });

    await sendEmail({
      to: email,
      subject: `Laboratory Report - ${test_name} - ${patient_name}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #4f46e5;">Medical Report Ready</h2>
          <p>Dear ${patient_name},</p>
          <p>Your laboratory report for <b>${test_name}</b> is ready and attached to this email.</p>
          <p>Please find the PDF document attached for your records.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 0.8em; color: #666;">Wishing you good health,<br/><b>Laboratory Department</b></p>
        </div>
      `,
      attachments: [
        {
          filename: `${patient_name.replace(/\\s+/g, '_')}_${test_name.replace(/\\s+/g, '_')}.pdf`,
          path: req.file.path,
          contentType: 'application/pdf'
        }
      ]
    });

    // Clean up temporary file after sending
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting temp email file:', err);
    });

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (e) {
    console.error('Email endpoint error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// RADIOLOGY
// ─────────────────────────────────────────────────────────────

app.get('/api/radiology', requireAuth, async (req, res) => {
  try {
    const { status = 'All', search = '', patient_id } = req.query
    const hid = req.user.hospitalId
    let query = `
      SELECT r.*, p.name AS patient_name, p.id AS patient_code
      FROM radiology_orders r
      LEFT JOIN patients p ON r.patient_id = p.id
      WHERE r.hospital_id = $1`
    const params = [hid]
    if (patient_id) { params.push(patient_id); query += ` AND r.patient_id = $${params.length}` }
    if (status !== 'All') { params.push(status); query += ` AND r.status = $${params.length}` }
    if (search) { params.push(`%${search}%`); const r1=params.length; params.push(`%${search}%`); const r2=params.length; query += ` AND (p.name ILIKE $${r1} OR r.study_type ILIKE $${r2})` }
    query += ' ORDER BY r.ordered_at DESC'
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/radiology', requireAuth, async (req, res) => {
  try {
    const { patient_id, study_type, modality, body_part, requested_by, priority, clinical_indication } = req.body
    if (!patient_id || !study_type) return res.status(400).json({ error: 'Patient and study type are required' })
    const { rows } = await pool.query(
      `INSERT INTO radiology_orders (hospital_id, patient_id, study_type, modality, body_part, requested_by, priority, clinical_indication)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.hospitalId, patient_id, study_type, modality || '', body_part || '', requested_by || '', priority || 'Routine', clinical_indication || '']
    )
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/radiology/:id', requireAuth, async (req, res) => {
  try {
    const fields = pickFields(req.body, ['status', 'radiologist_notes', 'study_type', 'modality', 'body_part', 'requested_by', 'priority', 'clinical_indication'])
    const keys = Object.keys(fields)
    if (!keys.length) return res.status(400).json({ error: 'No fields to update' })
    let set = keys.map((k, i) => `${k} = $${i + 3}`).join(', ')
    if (fields.status) set += `, completed_at = ${fields.status === 'Reported' ? 'COALESCE(completed_at, NOW())' : 'NULL'}`
    const { rows } = await pool.query(
      `UPDATE radiology_orders SET ${set} WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [req.params.id, req.user.hospitalId, ...keys.map(k => fields[k])])
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/radiology/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [r] } = await pool.query('SELECT status FROM radiology_orders WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    if (!r) return res.status(404).json({ error: 'Not found' })
    if (r.status === 'Reported') return res.status(400).json({ error: 'Reported studies cannot be deleted' })
    await pool.query('DELETE FROM radiology_orders WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Upload result PDF for a radiology order
app.post('/api/radiology/:id/upload-result', requireAuth, upload.single('result_pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' })
    const filePath = `/uploads/forms/${req.file.filename}`
    const { rows } = await pool.query(
      `UPDATE radiology_orders SET result_pdf_path=$2, status='Reported', completed_at=NOW()
       WHERE id=$1 AND hospital_id=$3 RETURNING *`,
      [req.params.id, filePath, req.user.hospitalId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Radiology order not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// DISCHARGE SUMMARY TEMPLATES (admin only, hospital-scoped)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// DISCHARGE SUMMARY TEMPLATES  (hospital-scoped, PDF-based)
// ─────────────────────────────────────────────────────────────

// GET  — list this hospital's discharge templates
app.get('/api/discharge-templates', requireAuth, async (req, res) => {
  try {
    const { category, search } = req.query
    let q = `SELECT * FROM discharge_summary_templates
              WHERE is_active = TRUE AND hospital_id = $1`
    const params = [req.user.hospitalId]
    if (category) { params.push(category); q += ` AND type = $${params.length}` }
    if (search)   { params.push(`%${search}%`); const ds1=params.length; params.push(`%${search}%`); const ds2=params.length; q += ` AND (name ILIKE $${ds1} OR description ILIKE $${ds2})` }
    q += ' ORDER BY created_at DESC'
    const { rows } = await pool.query(q, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST — upload a PDF discharge template (admin only)
app.post('/api/discharge-templates', requireAuth, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' })
    const { name, description, category } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Template name is required' })
    const filePath = `/uploads/forms/${req.file.filename}`
    const { rows } = await pool.query(
      `INSERT INTO discharge_summary_templates
         (hospital_id, name, description, type, file_path, file_name, file_size, content, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'',$8) RETURNING *`,
      [req.user.hospitalId, name.trim(), description || '', category || 'General',
       filePath, req.file.originalname, req.file.size, req.user.userId]
    )
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/discharge-templates/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM discharge_summary_templates WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    if (!rows.length) return res.status(404).json({ error: 'Template not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PATCH — rename / recategorise a discharge template
app.patch('/api/discharge-templates/:id', requireAuth, async (req, res) => {
  try {
    const f = pickFields({ ...req.body, type: req.body.category ?? req.body.type }, ['name', 'description', 'type'])
    if (f.name !== undefined && !String(f.name || '').trim()) return res.status(400).json({ error: 'Template name is required' })
    const keys = Object.keys(f)
    if (!keys.length) return res.status(400).json({ error: 'Nothing to update' })
    const { rows } = await pool.query(
      `UPDATE discharge_summary_templates SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')}, updated_at = NOW()
       WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [req.params.id, req.user.hospitalId, ...keys.map(k => f[k])])
    if (!rows.length) return res.status(404).json({ error: 'Template not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE — remove a discharge template
app.delete('/api/discharge-templates/:id', requireAuth, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId
    const { rows } = await pool.query(
      'SELECT file_path FROM discharge_summary_templates WHERE id=$1 AND hospital_id=$2',
      [req.params.id, hospitalId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Template not found' })
    // Delete physical file
    const absPath = path.join(__dirname, rows[0].file_path)
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath)
    await pool.query('DELETE FROM discharge_summary_templates WHERE id=$1 AND hospital_id=$2',
      [req.params.id, hospitalId])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── INSTANCES (Filled summaries for patients) ───

// GET — get summaries for a patient
app.get('/api/discharge-summaries/patient/:patientId', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ps.*, dt.name AS template_name, dt.type AS category, dt.file_path, dt.file_name, dt.file_size
       FROM patient_discharge_summaries ps
       JOIN discharge_summary_templates dt ON ps.template_id = dt.id
       WHERE ps.patient_id = $1 ORDER BY ps.created_at DESC`,
      [req.params.patientId]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST — create/assign a summary instance
app.post('/api/discharge-summaries', requireAuth, async (req, res) => {
  try {
    const { template_id, patient_id, filled_by } = req.body
    if (!template_id || !patient_id) return res.status(400).json({ error: 'Missing IDs' })
    const { rows } = await pool.query(
      `INSERT INTO patient_discharge_summaries (template_id, patient_id, filled_by)
       VALUES ($1,$2,$3) RETURNING *`,
      [template_id, patient_id, filled_by || '']
    )
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PATCH — save annotations (canvas mode)
app.patch('/api/discharge-summaries/:id', requireAuth, async (req, res) => {
  try {
    const { annotations, status, filled_by, notes } = req.body
    const { rows } = await pool.query(
      `UPDATE patient_discharge_summaries
       SET annotations=$2, status=$3, filled_by=$4, notes=$5, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, JSON.stringify(annotations || []), status || 'blank', filled_by || '', notes || '']
    )
    if (!rows.length) return res.status(404).json({ error: 'Summary instance not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PATCH — save HTML text content (word editor mode)
app.patch('/api/discharge-summaries/:id/text', requireAuth, async (req, res) => {
  try {
    const { text_content, status } = req.body
    const { rows } = await pool.query(
      `UPDATE patient_discharge_summaries
       SET text_content=$2, status=$3, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, text_content || '', status || 'in-progress']
    )
    if (!rows.length) return res.status(404).json({ error: 'Summary instance not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PATCH — approve discharge summary (doctors only)
app.patch('/api/discharge-summaries/:id/approve', requireAuth, async (req, res) => {
  try {
    const { approved_by } = req.body
    if (!approved_by) return res.status(400).json({ error: 'approved_by is required' })
    
    const { rows } = await pool.query(
      `UPDATE patient_discharge_summaries
       SET approved_by=$2, approved_at=NOW(), status='approved', updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, approved_by]
    )
    if (!rows.length) return res.status(404).json({ error: 'Summary instance not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE — remove a summary assigned by mistake (approved summaries are kept)
app.delete('/api/discharge-summaries/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [ps] } = await pool.query(
      `SELECT ps.status FROM patient_discharge_summaries ps
       JOIN discharge_summary_templates dt ON dt.id = ps.template_id
       WHERE ps.id = $1 AND dt.hospital_id = $2`, [req.params.id, req.user.hospitalId])
    if (!ps) return res.status(404).json({ error: 'Summary not found' })
    if (ps.status === 'approved') return res.status(400).json({ error: 'Approved discharge summaries cannot be deleted' })
    await pool.query('DELETE FROM patient_discharge_summaries WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET — get single instance
app.get('/api/discharge-summaries/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ps.*, dt.name AS template_name, dt.type AS category, dt.file_path, dt.file_name, dt.file_size
       FROM patient_discharge_summaries ps
       JOIN discharge_summary_templates dt ON ps.template_id = dt.id
       WHERE ps.id = $1`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Summary not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// DISCHARGE WORKFLOW (IPD)
// ─────────────────────────────────────────────────────────────

app.patch('/api/beds/:id/discharge', requireAuth, async (req, res) => {
  try {
    const { step, status, notes } = req.body
    const hid = req.user.hospitalId
    const { rows } = await pool.query(
      `UPDATE beds SET discharge_step = COALESCE($2, discharge_step), 
                      discharge_status = COALESCE($3, discharge_status),
                      discharge_notes = COALESCE($4, discharge_notes)
       WHERE id = $1 AND hospital_id = $5 RETURNING *`,
      [req.params.id, step, status, notes, hid]
    )
    if (!rows.length) return res.status(404).json({ error: 'Bed not found' })
    
    // If step is final (e.g. 5), we might want to actually discharge the patient record-wise
    // but for now we just track the workflow.
    
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// PHARMACY
// ─────────────────────────────────────────────────────────────

app.post('/api/pharmacy/sale', requireAuth, async (req, res) => {
  const client = await pool.connect()
  try {
    const { items, patient_id, total_amount } = req.body
    await client.query('BEGIN')
    
    for (const item of items) {
      const { rows } = await client.query(
        `UPDATE pharmacy_inventory SET stock = stock - $1 
         WHERE id = $2 AND stock >= $1 AND hospital_id = $3 RETURNING name`,
        [item.qty, item.id, req.user.hospitalId]
      )
      if (!rows.length) throw new Error(`Insufficient stock for ${item.name}`)
    }

    // Keep stock status in step with the new quantities
    await client.query(
      `UPDATE pharmacy_inventory SET status = CASE WHEN stock <= 0 THEN 'Out of Stock' WHEN stock < 50 THEN 'Low Stock' ELSE 'In Stock' END
       WHERE hospital_id = $1 AND id = ANY($2)`, [req.user.hospitalId, items.map(i => i.id)])

    if (patient_id) {
       await client.query(
         `INSERT INTO billing (id, hospital_id, patient_id, total_amount, paid_amount, status, type, payment_method)
          VALUES ($1, $2, $3, $4, $4, 'Paid', 'Pharmacy', 'Cash')`,
         [await nextId(client, 'billing', 'INV-', 4800), req.user.hospitalId, patient_id, total_amount]
       )
    }

    await client.query('COMMIT')
    res.json({ success: true })
  } catch (e) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: e.message })
  } finally {
    client.release()
  }
})

app.get('/api/pharmacy', requireAuth, async (req, res) => {
  try {
    const { status = 'All', search = '' } = req.query
    const hid = req.user.hospitalId
    let query = 'SELECT * FROM pharmacy_inventory WHERE hospital_id = $1'
    const params = [hid]
    if (status !== 'All') { params.push(status); query += ` AND status = $${params.length}` }
    if (search) { params.push(`%${search}%`); const ph1=params.length; params.push(`%${search}%`); const ph2=params.length; query += ` AND (name ILIKE $${ph1} OR category ILIKE $${ph2})` }
    query += ' ORDER BY name'
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/pharmacy', requireAuth, async (req, res) => {
  try {
    const { name, category, stock, unit, price, expiry, manufacturer } = req.body
    const status = stock === 0 ? 'Out of Stock' : stock < 50 ? 'Low Stock' : 'In Stock'
    const { rows } = await pool.query(
      `INSERT INTO pharmacy_inventory (hospital_id,name,category,stock,unit,price,expiry,manufacturer,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.hospitalId, name, category, stock, unit, price, expiry, manufacturer, status]
    )
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/pharmacy/:id', requireAuth, async (req, res) => {
  try {
    const fields = pickFields(req.body, ['name', 'category', 'stock', 'unit', 'price', 'expiry', 'manufacturer'])
    if (fields.stock !== undefined) {
      fields.stock = parseInt(fields.stock)
      if (!(fields.stock >= 0)) return res.status(400).json({ error: 'Stock must be 0 or more' })
      fields.status = fields.stock === 0 ? 'Out of Stock' : fields.stock < 50 ? 'Low Stock' : 'In Stock'
    }
    const keys = Object.keys(fields)
    if (!keys.length) return res.status(400).json({ error: 'Nothing to update' })
    const setClause = keys.map((k, i) => `${k} = $${i + 3}`).join(', ')
    const { rows } = await pool.query(
      `UPDATE pharmacy_inventory SET ${setClause} WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [req.params.id, req.user.hospitalId, ...keys.map(k => fields[k])])
    if (!rows.length) return res.status(404).json({ error: 'Item not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/pharmacy/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM pharmacy_inventory WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    if (!rowCount) return res.status(404).json({ error: 'Item not found' })
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// BILLING
// ─────────────────────────────────────────────────────────────

app.get('/api/billing', requireAuth, async (req, res) => {
  try {
    const { status = 'All', search = '' } = req.query
    const hid = req.user.hospitalId
    let query = `
      SELECT b.*, p.name AS patient_name
      FROM billing b
      LEFT JOIN patients p ON b.patient_id = p.id
      WHERE b.hospital_id = $1`
    const params = [hid]
    if (status !== 'All') { params.push(status); query += ` AND b.status = $${params.length}` }
    if (search) { params.push(`%${search}%`); const bi1=params.length; params.push(`%${search}%`); const bi2=params.length; query += ` AND (p.name ILIKE $${bi1} OR b.id ILIKE $${bi2})` }
    query += ' ORDER BY b.created_at DESC'
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/billing', requireAuth, async (req, res) => {
  try {
    const { patient_id, payment_method, type, notes } = req.body
    const total_amount = Number(req.body.total_amount) || 0
    const paid_amount = Number(req.body.paid_amount) || 0
    if (!patient_id) return res.status(400).json({ error: 'Patient is required' })
    if (total_amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' })
    const hid = req.user.hospitalId
    const newId = await nextId(pool, 'billing', 'INV-', 4800)
    const { rows } = await pool.query(
      `INSERT INTO billing (id,hospital_id,patient_id,total_amount,paid_amount,status,payment_method,type,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [newId, hid, patient_id, total_amount, paid_amount, billStatus(total_amount, paid_amount), payment_method, type, notes || null]
    )
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Edit amount / type / method. Status is always derived from the amounts unless cancelled.
app.patch('/api/billing/:id', requireAuth, async (req, res) => {
  try {
    const hid = req.user.hospitalId
    const { rows: [bill] } = await pool.query('SELECT * FROM billing WHERE id = $1 AND hospital_id = $2', [req.params.id, hid])
    if (!bill) return res.status(404).json({ error: 'Bill not found' })
    if (bill.status === 'Cancelled') return res.status(400).json({ error: 'Cancelled bills cannot be edited' })
    const f = pickFields(req.body, ['total_amount', 'paid_amount', 'payment_method', 'type', 'notes'])
    const total = Number(f.total_amount ?? bill.total_amount)
    const paid = Number(f.paid_amount ?? bill.paid_amount)
    if (total <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' })
    if (paid < 0 || paid > total) return res.status(400).json({ error: 'Paid amount must be between 0 and the bill total' })
    f.status = billStatus(total, paid)
    const keys = Object.keys(f)
    const { rows } = await pool.query(
      `UPDATE billing SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')}, updated_at = NOW() WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [req.params.id, hid, ...keys.map(k => f[k])])
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/billing/:id/payment { amount, payment_method } — record a (part) payment
app.post('/api/billing/:id/payment', requireAuth, async (req, res) => {
  try {
    const amount = Number(req.body.amount)
    if (!(amount > 0)) return res.status(400).json({ error: 'Enter a payment amount' })
    const { rows: [bill] } = await pool.query('SELECT * FROM billing WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    if (!bill) return res.status(404).json({ error: 'Bill not found' })
    if (bill.status === 'Cancelled') return res.status(400).json({ error: 'Bill is cancelled' })
    const due = Number(bill.total_amount) - Number(bill.paid_amount)
    if (amount > due + 0.001) return res.status(400).json({ error: `Only ₹${due.toFixed(2)} is due on this bill` })
    const paid = Number(bill.paid_amount) + amount
    const { rows } = await pool.query(
      `UPDATE billing SET paid_amount = $2, status = $3, payment_method = COALESCE($4, payment_method), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [bill.id, paid, billStatus(bill.total_amount, paid), req.body.payment_method || null])
    res.json(rows[0])
    logAudit(req, 'BILLING_PAYMENT', 'billing', bill.id, `Payment of ₹${amount} recorded (${rows[0].status})`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/billing/:id/cancel { reason, refund_amount } — void a bill, optionally refunding what was paid
app.post('/api/billing/:id/cancel', requireAuth, async (req, res) => {
  try {
    const { rows: [bill] } = await pool.query('SELECT * FROM billing WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    if (!bill) return res.status(404).json({ error: 'Bill not found' })
    if (bill.status === 'Cancelled') return res.status(400).json({ error: 'Bill is already cancelled' })
    const reason = String(req.body.reason || '').trim()
    if (!reason) return res.status(400).json({ error: 'A cancellation reason is required' })
    const refund = Math.min(Number(req.body.refund_amount) || 0, Number(bill.paid_amount))
    const { rows } = await pool.query(
      `UPDATE billing SET status = 'Cancelled', cancel_reason = $2, refunded_amount = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [bill.id, reason, refund])
    res.json(rows[0])
    logAudit(req, 'BILLING_CANCELLED', 'billing', bill.id, `Bill cancelled: ${reason}${refund ? ` — refunded ₹${refund}` : ''}`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Only bills with no payment can be deleted outright; others must be cancelled
app.delete('/api/billing/:id', requireAuth, async (req, res) => {
  try {
    const { rows: [bill] } = await pool.query('SELECT paid_amount FROM billing WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    if (!bill) return res.status(404).json({ error: 'Bill not found' })
    if (Number(bill.paid_amount) > 0) return res.status(400).json({ error: 'This bill has payments — cancel it instead of deleting' })
    await pool.query('DELETE FROM billing WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────────────────────

app.get('/api/reports', requireAuth, async (req, res) => {
  try {
    const hid = req.user.hospitalId
    const [
      patients, beds, doctors, notes, labOrders, opdToday,
      monthly, departments, billing
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM patients WHERE hospital_id=$1`, [hid]),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status='occupied') AS occupied, COUNT(*) AS total FROM beds WHERE hospital_id=$1`, [hid]),
      pool.query(`SELECT COUNT(*) AS total FROM doctors WHERE hospital_id=$1`, [hid]),
      pool.query(`SELECT COUNT(*) AS pending FROM clinical_notes WHERE status='pending' AND hospital_id=$1`, [hid]),
      pool.query(`SELECT COUNT(*) AS total FROM lab_tests WHERE hospital_id=$1`, [hid]),
      pool.query(`SELECT COUNT(*) AS total FROM opd_visits WHERE visit_date = CURRENT_DATE AND hospital_id=$1`, [hid]),
      pool.query(`
        SELECT TO_CHAR(admitted_at, 'Mon YYYY') AS month, COUNT(*) AS admissions
        FROM patients
        WHERE admitted_at >= NOW() - INTERVAL '6 months' AND hospital_id=$1
        GROUP BY TO_CHAR(admitted_at, 'Mon YYYY'), DATE_TRUNC('month', admitted_at)
        ORDER BY DATE_TRUNC('month', admitted_at)`, [hid]),
      pool.query(`
        SELECT department AS dept, COUNT(*) AS patient_count
        FROM patients WHERE hospital_id=$1
        GROUP BY department ORDER BY patient_count DESC`, [hid]),
      pool.query(`
        SELECT
          COALESCE(SUM(total_amount), 0) AS total,
          COALESCE(SUM(paid_amount), 0) AS paid,
          COALESCE(SUM(total_amount - paid_amount), 0) AS pending
        FROM billing WHERE hospital_id=$1 AND status<>'Cancelled'`, [hid]),
    ])
    res.json({
      kpis: {
        totalPatients: parseInt(patients.rows[0].total),
        totalBeds: parseInt(beds.rows[0].total),
        occupiedBeds: parseInt(beds.rows[0].occupied),
        totalDoctors: parseInt(doctors.rows[0].total),
        pendingNotes: parseInt(notes.rows[0].pending),
        labOrders: parseInt(labOrders.rows[0].total),
        opdToday: parseInt(opdToday.rows[0].total),
      },
      monthly: monthly.rows,
      departments: departments.rows,
      billing: billing.rows[0],
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// HOSPITAL FORMS — TEMPLATES
// ─────────────────────────────────────────────────────────────

// Serve uploaded PDFs statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// GET /api/forms/templates — list templates for the logged-in hospital only
app.get('/api/forms/templates', requireAuth, async (req, res) => {
  try {
    const { category = 'All', search = '' } = req.query
    const hospitalId = req.user.hospitalId
    let q = 'SELECT * FROM form_templates WHERE is_active = TRUE AND hospital_id = $1'
    const params = [hospitalId]
    if (category !== 'All') { params.push(category); q += ` AND category = $${params.length}` }
    if (search) { params.push(`%${search}%`); const ft1=params.length; params.push(`%${search}%`); const ft2=params.length; q += ` AND (name ILIKE $${ft1} OR description ILIKE $${ft2})` }
    q += ' ORDER BY created_at DESC'
    const { rows } = await pool.query(q, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

const hashFile = (fp) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256')
  fs.createReadStream(fp).on('error', reject).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex')))
})

// Templates uploaded before file_hash existed get hashed the first time a duplicate check needs them
async function backfillFormHashes(hospitalId) {
  const { rows } = await pool.query('SELECT id, file_path FROM form_templates WHERE hospital_id = $1 AND file_hash IS NULL', [hospitalId])
  for (const r of rows) {
    const fp = path.join(__dirname, r.file_path)
    if (!fs.existsSync(fp)) continue
    await pool.query('UPDATE form_templates SET file_hash = $2 WHERE id = $1', [r.id, await hashFile(fp)])
  }
}

// POST /api/forms/templates — upload a new form PDF (admin only, tied to their hospital).
// The same PDF can't be uploaded twice: a duplicate is discarded and 409 names the existing template.
app.post('/api/forms/templates', requireAdmin, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' })
    const { name, description, category } = req.body
    const hospitalId = req.user.hospitalId
    const createdBy = req.user.name
    const filePath = `/uploads/forms/${req.file.filename}`
    const fileHash = await hashFile(req.file.path)
    await backfillFormHashes(hospitalId)
    const dup = await pool.query(
      'SELECT id, name FROM form_templates WHERE hospital_id = $1 AND file_hash = $2 AND is_active = TRUE LIMIT 1',
      [hospitalId, fileHash])
    if (dup.rows.length) {
      fs.unlinkSync(req.file.path)
      return res.status(409).json({ error: `Already uploaded as "${dup.rows[0].name}"`, duplicate: dup.rows[0] })
    }
    const { rows } = await pool.query(
      `INSERT INTO form_templates (hospital_id, name, description, category, file_path, file_name, file_size, file_hash, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [hospitalId, name || req.file.originalname, description, category || 'General', filePath, req.file.originalname, req.file.size, fileHash, createdBy]
    )
    res.status(201).json(rows[0])
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/forms/templates/:id/layout — store the auto-fill layout scanned from the PDF (and its real page count)
app.put('/api/forms/templates/:id/layout', requireAuth, async (req, res) => {
  try {
    const { layout, page_count } = req.body
    if (!layout || typeof layout !== 'object' || !Array.isArray(layout.pages)) {
      return res.status(400).json({ error: 'Invalid layout' })
    }
    const { rows } = await pool.query(
      `UPDATE form_templates SET layout = $3, page_count = COALESCE($4, page_count)
       WHERE id = $1 AND hospital_id = $2 RETURNING id, page_count`,
      [req.params.id, req.user.hospitalId, JSON.stringify(layout), Number.isInteger(page_count) ? page_count : null]
    )
    if (!rows.length) return res.status(404).json({ error: 'Template not found or access denied' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PATCH /api/forms/templates/:id — rename / recategorise (admin only)
app.patch('/api/forms/templates/:id', requireAdmin, async (req, res) => {
  try {
    const f = pickFields(req.body, ['name', 'description', 'category'])
    if (f.name !== undefined && !String(f.name || '').trim()) return res.status(400).json({ error: 'Form name is required' })
    const keys = Object.keys(f)
    if (!keys.length) return res.status(400).json({ error: 'Nothing to update' })
    const { rows } = await pool.query(
      `UPDATE form_templates SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [req.params.id, req.user.hospitalId, ...keys.map(k => f[k])])
    if (!rows.length) return res.status(404).json({ error: 'Template not found or access denied' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /api/forms/templates/:id — only the owning hospital can delete
app.delete('/api/forms/templates/:id', requireAdmin, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId
    const { rows } = await pool.query(
      'SELECT file_path FROM form_templates WHERE id=$1 AND hospital_id=$2',
      [req.params.id, hospitalId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Template not found or access denied' })
    const fp = path.join(__dirname, rows[0].file_path)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
    await pool.query('DELETE FROM form_templates WHERE id=$1 AND hospital_id=$2', [req.params.id, hospitalId])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// PATIENT ATTACHMENTS — photos, scanned documents, PDFs
// ─────────────────────────────────────────────────────────────
const ATTACH_DIR = path.join(__dirname, 'uploads', 'attachments')
if (!fs.existsSync(ATTACH_DIR)) fs.mkdirSync(ATTACH_DIR, { recursive: true })
const ATTACH_TYPES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif' }
const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ATTACH_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ATTACH_TYPES[file.mimetype]}`),
  }),
  fileFilter: (req, file, cb) => ATTACH_TYPES[file.mimetype] ? cb(null, true) : cb(new Error('Only images and PDF files can be attached')),
  limits: { fileSize: 25 * 1024 * 1024 },
})

async function patientInHospital(patientId, hospitalId) {
  const { rows } = await pool.query('SELECT 1 FROM patients WHERE id = $1 AND hospital_id = $2', [patientId, hospitalId])
  return rows.length > 0
}

app.get('/api/patients/:id/attachments', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM patient_attachments WHERE patient_id = $1 AND hospital_id = $2 ORDER BY created_at DESC',
      [req.params.id, req.user.hospitalId])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/patients/:id/attachments', requireAuth, (req, res, next) => {
  attachmentUpload.single('file')(req, res, (err) => err ? res.status(400).json({ error: err.message }) : next())
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    if (!(await patientInHospital(req.params.id, req.user.hospitalId))) {
      fs.unlinkSync(req.file.path)
      return res.status(404).json({ error: 'Patient not found' })
    }
    const name = String(req.body.name || '').trim() || path.parse(req.file.originalname).name
    const category = String(req.body.category || '').trim() || 'Others'
    const { rows } = await pool.query(
      `INSERT INTO patient_attachments (hospital_id, patient_id, name, category, file_path, mime_type, file_size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.hospitalId, req.params.id, name.slice(0, 200), category.slice(0, 100), `/uploads/attachments/${req.file.filename}`,
        req.file.mimetype, req.file.size, req.user.name || null])
    res.status(201).json(rows[0])
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    res.status(500).json({ error: e.message })
  }
})

// Rename / move to another category
app.patch('/api/attachments/:id', requireAuth, async (req, res) => {
  try {
    const f = pickFields(req.body, ['name', 'category'])
    if (f.name !== undefined && !String(f.name).trim()) return res.status(400).json({ error: 'Name is required' })
    const keys = Object.keys(f)
    if (!keys.length) return res.status(400).json({ error: 'Nothing to update' })
    const { rows } = await pool.query(
      `UPDATE patient_attachments SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND hospital_id = $2 RETURNING *`,
      [req.params.id, req.user.hospitalId, ...keys.map(k => String(f[k]).trim())])
    if (!rows.length) return res.status(404).json({ error: 'Attachment not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/attachments/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM patient_attachments WHERE id = $1 AND hospital_id = $2 RETURNING file_path', [req.params.id, req.user.hospitalId])
    if (!rows.length) return res.status(404).json({ error: 'Attachment not found' })
    const fp = path.join(__dirname, rows[0].file_path)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// HOSPITAL FORMS — PATIENT INSTANCES
// ─────────────────────────────────────────────────────────────

// GET /api/forms/patient/:patientId — get all form instances for a patient
app.get('/api/forms/patient/:patientId', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pf.*, ft.name AS template_name, ft.category, ft.file_path, ft.file_name, ft.page_count, ft.layout
       FROM patient_forms pf
       JOIN form_templates ft ON pf.template_id = ft.id
       WHERE pf.patient_id = $1 AND ft.hospital_id = $2
       ORDER BY pf.created_at DESC`,
      [req.params.patientId, req.user.hospitalId]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/forms/patient — create a form instance for a patient
// Duplicates are allowed: the same template can be assigned multiple times
app.post('/api/forms/patient', requireAuth, async (req, res) => {
  try {
    const { template_id, patient_id, filled_by } = req.body
    const { rows: ok } = await pool.query(
      `SELECT 1 FROM form_templates ft JOIN patients p ON p.id = $2 AND p.hospital_id = ft.hospital_id
       WHERE ft.id = $1 AND ft.hospital_id = $3`, [template_id, patient_id, req.user.hospitalId])
    if (!ok.length) return res.status(404).json({ error: 'Template or patient not found' })
    const { rows } = await pool.query(
      `INSERT INTO patient_forms (template_id, patient_id, filled_by) VALUES ($1,$2,$3) RETURNING *`,
      [template_id, patient_id, filled_by || '']
    )
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PATCH /api/forms/patient/:id — save annotations
app.patch('/api/forms/patient/:id', requireAuth, async (req, res) => {
  try {
    const { annotations, status, notes, filled_by } = req.body
    const { rows } = await pool.query(
      `UPDATE patient_forms pf
       SET annotations = $2, status = $3, notes = $4, filled_by = $5, updated_at = NOW()
       FROM form_templates ft
       WHERE pf.id = $1 AND ft.id = pf.template_id AND ft.hospital_id = $6 RETURNING pf.*`,
      [req.params.id, JSON.stringify(annotations || []), status || 'in-progress', notes, filled_by, req.user.hospitalId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /api/forms/patient/:id — unassign a form given to the wrong patient
app.delete('/api/forms/patient/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM patient_forms pf USING form_templates ft
       WHERE pf.id = $1 AND ft.id = pf.template_id AND ft.hospital_id = $2`, [req.params.id, req.user.hospitalId])
    if (!rowCount) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/forms/patient-instance/:id — get single instance with annotations
app.get('/api/forms/patient-instance/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pf.*, ft.name AS template_name, ft.file_path, ft.page_count, ft.layout
       FROM patient_forms pf JOIN form_templates ft ON pf.template_id = ft.id
       WHERE pf.id = $1 AND ft.hospital_id = $2`,
      [req.params.id, req.user.hospitalId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────
// DASHBOARD STATS — live KPIs
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  const hid = req.user.hospitalId
  try {
    const COLORS = ['#6366f1','#0d9488','#0ea5e9','#f59e0b','#10b981']
    const [
      pR,bR,nR,rpR,pnR,opdR,todRevR,mRevR,lmRevR,labR,critR,wkR,moRevR,deptR,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM patients WHERE hospital_id=$1`,[hid]),
      pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER(WHERE status='occupied') AS occupied FROM beds WHERE hospital_id=$1`,[hid]),
      pool.query(`SELECT COUNT(*) FROM clinical_notes WHERE hospital_id=$1 AND status='pending'`,[hid]),
      pool.query(`SELECT p.id,p.name,p.age,p.status,p.department AS dept,p.admitted_at,d.name AS doctor FROM patients p LEFT JOIN doctors d ON p.doctor_id=d.id WHERE p.hospital_id=$1 ORDER BY p.admitted_at DESC NULLS LAST LIMIT 5`,[hid]),
      pool.query(`SELECT n.id,n.note_type,n.priority,n.created_at,p.name AS patient_name,d.name AS doctor_name FROM clinical_notes n LEFT JOIN patients p ON n.patient_id=p.id LEFT JOIN doctors d ON n.doctor_id=d.id WHERE n.hospital_id=$1 AND n.status='pending' ORDER BY n.created_at DESC LIMIT 5`,[hid]),
      pool.query(`SELECT COUNT(*) FROM opd_visits WHERE hospital_id=$1 AND visit_date=CURRENT_DATE`,[hid]),
      pool.query(`SELECT COALESCE(SUM(total_amount),0) AS t FROM billing WHERE hospital_id=$1 AND status<>'Cancelled' AND DATE(created_at)=CURRENT_DATE`,[hid]),
      pool.query(`SELECT COALESCE(SUM(total_amount),0) AS t FROM billing WHERE hospital_id=$1 AND status<>'Cancelled' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())`,[hid]),
      pool.query(`SELECT COALESCE(SUM(total_amount),0) AS t FROM billing WHERE hospital_id=$1 AND status<>'Cancelled' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW()-INTERVAL '1 month')`,[hid]),
      pool.query(`SELECT COUNT(*) FROM lab_tests WHERE hospital_id=$1 AND status='Pending'`,[hid]),
      pool.query(`SELECT COUNT(*) FROM patients WHERE hospital_id=$1 AND status='Critical'`,[hid]),
      pool.query(`SELECT TO_CHAR(d.day,'Dy') AS day, COALESCE(COUNT(p.id) FILTER(WHERE p.admission_type='IPD'),0) AS ipd, COALESCE(COUNT(p.id) FILTER(WHERE p.admission_type<>'IPD'),0) AS opd FROM generate_series(NOW()-INTERVAL '6 days',NOW(),INTERVAL '1 day') d(day) LEFT JOIN patients p ON DATE(p.admitted_at)=DATE(d.day) AND p.hospital_id=$1 GROUP BY d.day ORDER BY d.day`,[hid]),
      pool.query(`SELECT TO_CHAR(m.month,'Mon') AS month, COALESCE(SUM(b.total_amount),0)/100000.0 AS revenue FROM generate_series(DATE_TRUNC('month',NOW()-INTERVAL '5 months'),DATE_TRUNC('month',NOW()),INTERVAL '1 month') m(month) LEFT JOIN billing b ON DATE_TRUNC('month',b.created_at)=m.month AND b.hospital_id=$1 AND b.status<>'Cancelled' GROUP BY m.month ORDER BY m.month`,[hid]),
      pool.query(`SELECT COALESCE(department,'Other') AS name,COUNT(*) AS value FROM patients WHERE hospital_id=$1 AND status<>'Discharged' GROUP BY department ORDER BY value DESC LIMIT 5`,[hid]),
    ])
    const total=parseInt(bR.rows[0].total)||0, occ=parseInt(bR.rows[0].occupied)||0
    const mRev=parseFloat(mRevR.rows[0].t)||0, lmRev=parseFloat(lmRevR.rows[0].t)||0
    res.json({
      totalPatients:    parseInt(pR.rows[0].count),
      bedOccupancy:     `${total>0?Math.round(occ/total*100):0}%`,
      bedDetail:        `${occ}/${total} beds`,
      occupiedBeds:occ, totalBeds:total,
      pendingNotes:     parseInt(nR.rows[0].count),
      recentPatients:   rpR.rows,
      pendingNotesList: pnR.rows,
      todayOPD:         parseInt(opdR.rows[0].count),
      todayRevenue:     parseFloat(todRevR.rows[0].t)||0,
      monthRevenue:     mRev,
      lastMonthRevenue: lmRev,
      revenueChange:    lmRev>0?`${(((mRev-lmRev)/lmRev)*100).toFixed(1)}%`:'+0%',
      pendingLab:       parseInt(labR.rows[0].count),
      criticalPatients: parseInt(critR.rows[0].count),
      weeklyAdmissions: wkR.rows.map(r=>({day:r.day,ipd:+r.ipd||0,opd:+r.opd||0})),
      monthlyRevenue:   moRevR.rows.map(r=>({month:r.month,revenue:parseFloat(r.revenue)||0})),
      deptBreakdown:    deptR.rows.map((r,i)=>({name:r.name,value:parseInt(r.value)||0,color:COLORS[i%5]})),
    })
  } catch(e){ console.error('[DashStats]',e.message); res.status(500).json({error:e.message}) }
})

// AUDIT LOGS
app.get('/api/audit-logs', requireAuth, async (req, res) => {
  try {
    const { page=1, limit=60, action, resource } = req.query
    const hid=req.user.hospitalId, offset=(parseInt(page)-1)*parseInt(limit)
    let q='SELECT * FROM audit_logs WHERE hospital_id=$1'
    const p=[hid]
    if(action)  {p.push(action);  q+=` AND action=$${p.length}`}
    if(resource){p.push(resource);q+=` AND resource=$${p.length}`}
    q+=` ORDER BY created_at DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`
    p.push(parseInt(limit),offset)
    const {rows}=await pool.query(q,p)
    res.json(rows)
  } catch(e){res.status(500).json({error:e.message})}
})

registerResourceRoutes(app, { pool, requireAuth })

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }))

// ─────────────────────────────────────────────────────────────
// SERVE FRONTEND (PRODUCTION)
// ─────────────────────────────────────────────────────────────
const distPath = path.join(__dirname, '../dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`🚀  dScribe API running on http://localhost:${PORT}`))
