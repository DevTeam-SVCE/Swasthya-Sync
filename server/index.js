// index.js — dScribe HMS Express API Server
import './env.js'
import express from 'express'
import cors from 'cors'
import pkg from 'pg'
const { Pool } = pkg
import authRouter, { setPool as setAuthPool, requireAuth } from './auth.js'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// Built-in lightweight PDF text extractor
function extractTextFromPdf(buffer) {
  const str = buffer.toString('latin1')
  const lines = []
  const btEt = /BT[\s\S]*?ET/g
  let match
  while ((match = btEt.exec(str)) !== null) {
    const paren = /\(([^)]{1,300})\)/g
    let m2
    while ((m2 = paren.exec(match[0])) !== null) {
      const t = m2[1].replace(/\\n/g,'\n').replace(/\\r/g,'').replace(/\\t/g,' ').replace(/\\\\/g,'\\').trim()
      if (t.length > 1) lines.push(t)
    }
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

// ─── DB CONFIGURATION FOR SUPABASE & PG ───────────────────────
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl: { rejectUnauthorized: false }
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'dscribe_hms',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
      }
)

async function initDB() {
  let c
  try {
    c = await pool.connect()
    console.log('✅ PostgreSQL connected to Supabase')

    const importSqlPath = path.join(__dirname, 'dscribe_hms_import.sql')
    if (fs.existsSync(importSqlPath)) {
      const importSql = fs.readFileSync(importSqlPath, 'utf-8')
      await c.query(importSql)
    }

    const safeMigrations = [
      `DO $m$ BEGIN ALTER TABLE patients ADD COLUMN hospital_id INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE patients ADD COLUMN email VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE patients ADD COLUMN phone VARCHAR(20); EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE patients ADD COLUMN address TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE patients ADD COLUMN blood_group VARCHAR(5); EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE patients ADD COLUMN uhid VARCHAR(30); EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE doctors ADD COLUMN hospital_id INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
      `DO $m$ BEGIN ALTER TABLE doctors ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $m$`,
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
      `ALTER TABLE lab_tests ADD COLUMN IF NOT EXISTS result_pdf_path TEXT`,
      `CREATE TABLE IF NOT EXISTS radiology_orders (
        id                  SERIAL PRIMARY KEY,
        hospital_id        INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
        patient_id         VARCHAR(20) REFERENCES patients(id),
        study_type         VARCHAR(100) NOT NULL,
        modality           VARCHAR(50),
        body_part          VARCHAR(100),
        requested_by       VARCHAR(100),
        clinical_indication TEXT,
        priority           VARCHAR(20) DEFAULT 'Routine',
        status             VARCHAR(30) DEFAULT 'Scheduled',
        radiologist_notes TEXT,
        result_pdf_path    TEXT,
        ordered_at         TIMESTAMPTZ DEFAULT NOW(),
        completed_at       TIMESTAMPTZ
      )`,
      `CREATE INDEX IF NOT EXISTS idx_radiology_hospital ON radiology_orders(hospital_id)`,
      `CREATE INDEX IF NOT EXISTS idx_radiology_status   ON radiology_orders(status)`,
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
      `ALTER TABLE discharge_summary_templates ADD COLUMN IF NOT EXISTS file_name TEXT`,
      `ALTER TABLE discharge_summary_templates ADD COLUMN IF NOT EXISTS file_size INTEGER`,
      `ALTER TABLE discharge_summary_templates ADD COLUMN IF NOT EXISTS file_path TEXT`,
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
    for (const sql of safeMigrations) {
      await c.query(sql)
    }
    console.log('✅ All tables ready with hospital scoping')
  } catch (e) {
    console.error('❌ DB Init failed:', e.message)
  } finally {
    if (c) c.release()
  }
}

initDB()
setAuthPool(pool)

async function logAudit(req, action, resource, resourceId, details) {
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

// ─── APP ─────────────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Root Health Route for Vercel
app.get('/', (req, res) => {
  res.json({ message: 'dScribe HMS Express API is running on Vercel!' })
})

// Auth Routes
app.use('/api/auth', authRouter)

// Hospital Routes
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
                     'report_header_text', 'report_footer_text', 'report_tagline', 'report_print_mode']
    const fields = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)))
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

// Patients Routes
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
      const sIdx = params.length
      query += ` AND (p.name ILIKE $${sIdx} OR p.id ILIKE $${sIdx} OR p.department ILIKE $${sIdx})`
    }
    if (filter !== 'All') {
      params.push(filter)
      const fIdx = params.length
      query += ` AND (p.status = $${fIdx} OR p.admission_type = $${fIdx})`
    }
    query += ' ORDER BY p.admitted_at DESC'
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/patients/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, d.name AS doctor_name, d.department AS doctor_dept
       FROM patients p LEFT JOIN doctors d ON p.doctor_id = d.id
       WHERE p.id = $1 AND p.hospital_id = $2`,
      [req.params.id, req.user.hospitalId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/patients', requireAuth, async (req, res) => {
  try {
    const { name, age, gender, blood_group, department, doctor_id, phone, status, admission_type, notes } = req.body
    const hid = req.user.hospitalId
    const { rows: last } = await pool.query(`SELECT id FROM patients ORDER BY created_at DESC LIMIT 1`)
    const lastNum = last.length ? parseInt(last[0].id.replace('P-', '')) : 4800
    const newId = `P-${lastNum + 1}`
    const { rows } = await pool.query(
      `INSERT INTO patients (id,hospital_id,name,age,gender,blood_group,department,doctor_id,phone,status,admission_type,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [newId, hid, name, age, gender, blood_group, department, doctor_id || null, phone, status || 'Stable', admission_type || 'OPD', notes]
    )
    res.status(201).json(rows[0])
    logAudit(req, 'PATIENT_CREATED', 'patients', rows[0].id, `Patient "${name}" registered (${admission_type || 'OPD'})`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/patients/:id', requireAuth, async (req, res) => {
  try {
    const fields = req.body
    const keys = Object.keys(fields)
    if (!keys.length) return res.status(400).json({ error: 'No fields to update' })
    const setClause = keys.map((k, i) => `${k} = $${i + 3}`).join(', ')
    const vals = [req.params.id, req.user.hospitalId, ...keys.map(k => fields[k])]
    const { rows } = await pool.query(`UPDATE patients SET ${setClause} WHERE id = $1 AND hospital_id = $2 RETURNING *`, vals)
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/patients/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM patients WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
    res.json({ success: true })
    logAudit(req, 'PATIENT_DELETED', 'patients', req.params.id, 'Patient record deleted')
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Local Server Start / Vercel Serverless Export
// Server Listener for Render / Traditional Hosting
const PORT = process.env.PORT || 5000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${PORT}`)
})

export default app