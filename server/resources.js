// resources.js — Hospital-scoped tables for modules that previously only kept data in
// browser state (OT, TPA, queue, ER board, record requests, packages, GRN, blood bank,
// nursing charts, IP billing) plus the generic CRUD routes that serve them.

// ─── Schema ──────────────────────────────────────────────────
export const RESOURCE_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS surgeries (
    id             SERIAL PRIMARY KEY,
    hospital_id    INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    patient_id     VARCHAR(20) REFERENCES patients(id) ON DELETE CASCADE,
    procedure_name VARCHAR(200) NOT NULL,
    surgeon        VARCHAR(150),
    theatre        VARCHAR(100),
    scheduled_date DATE,
    scheduled_time VARCHAR(10),
    pac_status     VARCHAR(30) DEFAULT 'Pending',
    status         VARCHAR(30) DEFAULT 'Scheduled',
    notes          TEXT,
    created_by     VARCHAR(100),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS tpa_claims (
    id               SERIAL PRIMARY KEY,
    hospital_id      INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    patient_id       VARCHAR(20) REFERENCES patients(id) ON DELETE CASCADE,
    tpa_name         VARCHAR(150) NOT NULL,
    policy_no        VARCHAR(100),
    amount_requested NUMERIC(12,2) DEFAULT 0,
    amount_approved  NUMERIC(12,2) DEFAULT 0,
    status           VARCHAR(30) DEFAULT 'Pre-Auth Pending',
    remarks          TEXT,
    created_by       VARCHAR(100),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS queue_tokens (
    id           SERIAL PRIMARY KEY,
    hospital_id  INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    token        VARCHAR(20) NOT NULL,
    patient_id   VARCHAR(20) REFERENCES patients(id) ON DELETE SET NULL,
    patient_name VARCHAR(150),
    department   VARCHAR(100),
    doctor_id    VARCHAR(20) REFERENCES doctors(id) ON DELETE SET NULL,
    priority     VARCHAR(30) DEFAULT 'Normal',
    phone        VARCHAR(20),
    visit_type   VARCHAR(50),
    status       VARCHAR(20) DEFAULT 'waiting',
    queue_date   DATE DEFAULT CURRENT_DATE,
    created_by   VARCHAR(100),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_queue_tokens_day ON queue_tokens(hospital_id, queue_date)`,
  `CREATE TABLE IF NOT EXISTS record_requests (
    id             SERIAL PRIMARY KEY,
    hospital_id    INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    patient_id     VARCHAR(20) REFERENCES patients(id) ON DELETE CASCADE,
    requested_by   VARCHAR(150) NOT NULL,
    relation       VARCHAR(60),
    identity_proof VARCHAR(60),
    urgency        VARCHAR(40) DEFAULT 'Normal',
    date_from      DATE,
    date_to        DATE,
    record_types   JSONB DEFAULT '[]',
    purpose        TEXT,
    status         VARCHAR(20) DEFAULT 'pending',
    created_by     VARCHAR(100),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS er_visits (
    id              SERIAL PRIMARY KEY,
    hospital_id     INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    patient_id      VARCHAR(20) REFERENCES patients(id) ON DELETE CASCADE,
    triage_level    VARCHAR(40),
    case_type       VARCHAR(100),
    chief_complaint TEXT,
    brought_by      VARCHAR(60),
    mlc_type        VARCHAR(60) DEFAULT 'None',
    police_info     TEXT,
    guardian_phone  VARCHAR(20),
    vitals          JSONB DEFAULT '{}',
    disposition     VARCHAR(40) DEFAULT 'Under Triage',
    doctor_assigned VARCHAR(150),
    ambulance_no    VARCHAR(40),
    created_by      VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS health_packages (
    id          SERIAL PRIMARY KEY,
    hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    category    VARCHAR(100) DEFAULT 'Health Checkup',
    price       NUMERIC(12,2) DEFAULT 0,
    services    JSONB DEFAULT '[]',
    popular     BOOLEAN DEFAULT FALSE,
    is_active   BOOLEAN DEFAULT TRUE,
    created_by  VARCHAR(100),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS package_bookings (
    id           SERIAL PRIMARY KEY,
    hospital_id  INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    package_id   INTEGER REFERENCES health_packages(id) ON DELETE SET NULL,
    package_name VARCHAR(200),
    patient_id   VARCHAR(20) REFERENCES patients(id) ON DELETE CASCADE,
    booking_date DATE DEFAULT CURRENT_DATE,
    amount       NUMERIC(12,2) DEFAULT 0,
    billing_id   VARCHAR(20),
    status       VARCHAR(30) DEFAULT 'Booked',
    created_by   VARCHAR(100),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id             SERIAL PRIMARY KEY,
    hospital_id    INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    name           VARCHAR(200) NOT NULL,
    contact_person VARCHAR(150),
    phone          VARCHAR(20),
    email          VARCHAR(150),
    gstin          VARCHAR(30),
    address        TEXT,
    created_by     VARCHAR(100),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS grns (
    id            SERIAL PRIMARY KEY,
    hospital_id   INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    supplier_name VARCHAR(200) NOT NULL,
    invoice_no    VARCHAR(100) NOT NULL,
    items         JSONB DEFAULT '[]',
    total_value   NUMERIC(12,2) DEFAULT 0,
    status        VARCHAR(20) DEFAULT 'Verified',
    created_by    VARCHAR(100),
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS pharmacy_returns (
    id            SERIAL PRIMARY KEY,
    hospital_id   INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    patient_id    VARCHAR(20) REFERENCES patients(id) ON DELETE CASCADE,
    drug_id       INTEGER REFERENCES pharmacy_inventory(id) ON DELETE SET NULL,
    drug_name     VARCHAR(150),
    qty           INTEGER NOT NULL,
    refund_amount NUMERIC(12,2) DEFAULT 0,
    reason        TEXT,
    created_by    VARCHAR(100),
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS blood_stock (
    id          SERIAL PRIMARY KEY,
    hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    blood_group VARCHAR(5) NOT NULL,
    units       INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (hospital_id, blood_group)
  )`,
  `CREATE TABLE IF NOT EXISTS blood_donations (
    id          SERIAL PRIMARY KEY,
    hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    donor_name  VARCHAR(150),
    blood_group VARCHAR(5) NOT NULL,
    units       INTEGER NOT NULL,
    created_by  VARCHAR(100),
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS blood_requests (
    id           SERIAL PRIMARY KEY,
    hospital_id  INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    patient_id   VARCHAR(20) REFERENCES patients(id) ON DELETE CASCADE,
    blood_group  VARCHAR(5) NOT NULL,
    units        INTEGER NOT NULL DEFAULT 1,
    product_type VARCHAR(100),
    priority     VARCHAR(20) DEFAULT 'Routine',
    status       VARCHAR(30) DEFAULT 'Pending',
    created_by   VARCHAR(100),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS nursing_records (
    id          SERIAL PRIMARY KEY,
    hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    patient_id  VARCHAR(20) REFERENCES patients(id) ON DELETE CASCADE,
    record_type VARCHAR(30) NOT NULL,
    data        JSONB DEFAULT '{}',
    created_by  VARCHAR(100),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_nursing_patient ON nursing_records(patient_id)`,
  `CREATE TABLE IF NOT EXISTS ip_billing_entries (
    id          SERIAL PRIMARY KEY,
    hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    patient_id  VARCHAR(20) REFERENCES patients(id) ON DELETE CASCADE,
    entry_type  VARCHAR(30) NOT NULL,
    data        JSONB DEFAULT '{}',
    created_by  VARCHAR(100),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ip_billing_patient ON ip_billing_entries(patient_id)`,
  // Preferences from Settings → Notifications / Security / Appearance / Backup
  `ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'`,
  // Bills: settlement breakdown, cancellation and refunds
  `ALTER TABLE billing ADD COLUMN IF NOT EXISTS notes TEXT`,
  `ALTER TABLE billing ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(12,2) DEFAULT 0`,
  `ALTER TABLE billing ADD COLUMN IF NOT EXISTS cancel_reason TEXT`,
  `ALTER TABLE billing ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`,
  // Clinical note edits
  `ALTER TABLE clinical_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`,
]

// Note types that used to be stored in clinical_notes as JSON blobs
const NURSING_TYPES = ['VITALS', 'EMAR', 'NURSING_NOTE']
const IP_BILLING_TYPES = ['IP_CHARGE', 'IP_ADVANCE', 'IP_INSURANCE', 'IP_PACKAGE']

const parseJson = s => { try { return JSON.parse(s) } catch { return null } }

/**
 * One-time move of nursing / IP-billing / blood-bank data out of clinical_notes and
 * pharmacy_inventory into their own tables. Idempotent: moved rows are deleted from
 * the source, so a second run finds nothing.
 */
export async function migrateLegacyData(c) {
  await c.query('BEGIN')
  try {
    const { rows: legacy } = await c.query(
      `SELECT * FROM clinical_notes WHERE note_type = ANY($1) ORDER BY created_at, id`,
      [[...NURSING_TYPES, ...IP_BILLING_TYPES, 'BLOOD_REQUEST']]
    )
    const moved = []
    // BLOOD_REQUEST status changes were appended as new notes; keep the latest per request
    const bloodLatest = new Map()
    for (const n of legacy) {
      const data = parseJson(n.content) || { text: n.content }
      if (n.note_type === 'BLOOD_REQUEST') {
        const key = `${n.patient_id}|${data.date || n.id}|${data.group}|${data.units}`
        bloodLatest.set(key, { n, data })
      } else if (NURSING_TYPES.includes(n.note_type)) {
        await c.query(
          `INSERT INTO nursing_records (hospital_id, patient_id, record_type, data, created_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [n.hospital_id, n.patient_id, n.note_type, JSON.stringify(data), data.nurse_name || null, n.created_at]
        )
      } else {
        await c.query(
          `INSERT INTO ip_billing_entries (hospital_id, patient_id, entry_type, data, created_at)
           VALUES ($1,$2,$3,$4,$5)`,
          [n.hospital_id, n.patient_id, n.note_type, JSON.stringify(data), n.created_at]
        )
      }
      moved.push(n.id)
    }
    for (const { n, data } of bloodLatest.values()) {
      await c.query(
        `INSERT INTO blood_requests (hospital_id, patient_id, blood_group, units, product_type, priority, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [n.hospital_id, n.patient_id, data.group || 'O+', parseInt(data.units) || 1, data.type || null,
         data.priority || 'Routine', data.status || 'Pending', data.date || n.created_at]
      )
    }
    if (moved.length) await c.query('DELETE FROM clinical_notes WHERE id = ANY($1)', [moved])

    // Blood stock used to be pharmacy_inventory rows with category 'BLOOD_BANK'
    const { rows: blood } = await c.query(`SELECT * FROM pharmacy_inventory WHERE category = 'BLOOD_BANK'`)
    for (const b of blood) {
      await c.query(
        `INSERT INTO blood_stock (hospital_id, blood_group, units) VALUES ($1,$2,$3)
         ON CONFLICT (hospital_id, blood_group) DO UPDATE SET units = blood_stock.units + EXCLUDED.units`,
        [b.hospital_id, b.name, Math.max(0, b.stock || 0)]
      )
    }
    if (blood.length) await c.query(`DELETE FROM pharmacy_inventory WHERE category = 'BLOOD_BANK'`)

    await c.query('COMMIT')
    if (moved.length || blood.length) {
      console.log(`✅  Moved ${moved.length} legacy notes and ${blood.length} blood stock rows to their own tables`)
    }
  } catch (e) {
    await c.query('ROLLBACK')
    console.error('❌  Legacy data migration failed:', e.message)
  }
}

// ─── Helpers ─────────────────────────────────────────────────

/** Keep only whitelisted keys; JSON columns are stringified for pg. */
export function pickFields(body, allowed, jsonCols = []) {
  const out = {}
  for (const k of allowed) {
    if (body[k] === undefined) continue
    let v = body[k] === '' ? null : body[k]
    if (jsonCols.includes(k) && v !== null) v = JSON.stringify(v)
    out[k] = v
  }
  return out
}

const userName = req => req.user?.name || req.user?.loginId || null

/**
 * Registers list / get / create / update / delete routes for a hospital-scoped table.
 * `columns` is the whitelist of client-writable columns. Query params that match a
 * column (or `date` for created_at::date) are used as equality filters on list.
 */
function crud(app, requireAuth, pool, path, table, { columns, json = [], order = 't.created_at DESC', joinPatient = true, hasUpdatedAt = true, hasCreatedBy = true }) {
  const select = joinPatient
    ? `SELECT t.*, p.name AS patient_name, p.age AS patient_age, p.gender AS patient_gender
       FROM ${table} t LEFT JOIN patients p ON p.id = t.patient_id`
    : `SELECT t.* FROM ${table} t`

  app.get(`/api/${path}`, requireAuth, async (req, res) => {
    try {
      const params = [req.user.hospitalId]
      let q = `${select} WHERE t.hospital_id = $1`
      for (const [k, v] of Object.entries(req.query)) {
        if (v === '' || v === 'All') continue
        if (columns.includes(k) || k === 'patient_id') { params.push(v); q += ` AND t.${k} = $${params.length}` }
        else if (k === 'date') { params.push(v); q += ` AND t.created_at::date = $${params.length}` }
      }
      const { rows } = await pool.query(`${q} ORDER BY ${order}`, params)
      res.json(rows)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.post(`/api/${path}`, requireAuth, async (req, res) => {
    try {
      const fields = pickFields(req.body, columns, json)
      if (hasCreatedBy) fields.created_by = userName(req)
      const keys = Object.keys(fields)
      const { rows } = await pool.query(
        `INSERT INTO ${table} (hospital_id${keys.map(k => `, ${k}`).join('')})
         VALUES ($1${keys.map((_, i) => `, $${i + 2}`).join('')}) RETURNING *`,
        [req.user.hospitalId, ...keys.map(k => fields[k])]
      )
      res.status(201).json(rows[0])
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.patch(`/api/${path}/:id`, requireAuth, async (req, res) => {
    try {
      const fields = pickFields(req.body, columns, json)
      const keys = Object.keys(fields)
      if (!keys.length) return res.status(400).json({ error: 'Nothing to update' })
      const set = keys.map((k, i) => `${k} = $${i + 3}`).join(', ') + (hasUpdatedAt ? ', updated_at = NOW()' : '')
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${set} WHERE id = $1 AND hospital_id = $2 RETURNING *`,
        [req.params.id, req.user.hospitalId, ...keys.map(k => fields[k])]
      )
      if (!rows.length) return res.status(404).json({ error: 'Not found' })
      res.json(rows[0])
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.delete(`/api/${path}/:id`, requireAuth, async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1 AND hospital_id = $2`, [req.params.id, req.user.hospitalId])
      if (!rowCount) return res.status(404).json({ error: 'Not found' })
      res.json({ success: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
}

const stockStatus = n => (n <= 0 ? 'Out of Stock' : n < 50 ? 'Low Stock' : 'In Stock')

// ─── Routes ──────────────────────────────────────────────────
export function registerResourceRoutes(app, { pool, requireAuth }) {
  crud(app, requireAuth, pool, 'surgeries', 'surgeries', {
    columns: ['patient_id', 'procedure_name', 'surgeon', 'theatre', 'scheduled_date', 'scheduled_time', 'pac_status', 'status', 'notes'],
    order: 't.scheduled_date DESC NULLS LAST, t.scheduled_time',
  })
  crud(app, requireAuth, pool, 'tpa-claims', 'tpa_claims', {
    columns: ['patient_id', 'tpa_name', 'policy_no', 'amount_requested', 'amount_approved', 'status', 'remarks'],
  })
  crud(app, requireAuth, pool, 'record-requests', 'record_requests', {
    columns: ['patient_id', 'requested_by', 'relation', 'identity_proof', 'urgency', 'date_from', 'date_to', 'record_types', 'purpose', 'status'],
    json: ['record_types'],
  })
  crud(app, requireAuth, pool, 'er-visits', 'er_visits', {
    columns: ['patient_id', 'triage_level', 'case_type', 'chief_complaint', 'brought_by', 'mlc_type', 'police_info', 'guardian_phone', 'vitals', 'disposition', 'doctor_assigned', 'ambulance_no'],
    json: ['vitals'],
  })
  crud(app, requireAuth, pool, 'health-packages', 'health_packages', {
    columns: ['name', 'category', 'price', 'services', 'popular', 'is_active'],
    json: ['services'], joinPatient: false, order: 't.popular DESC, t.name',
  })
  crud(app, requireAuth, pool, 'package-bookings', 'package_bookings', {
    columns: ['package_id', 'package_name', 'patient_id', 'booking_date', 'amount', 'billing_id', 'status'],
  })
  crud(app, requireAuth, pool, 'suppliers', 'suppliers', {
    columns: ['name', 'contact_person', 'phone', 'email', 'gstin', 'address'],
    joinPatient: false, order: 't.name',
  })
  crud(app, requireAuth, pool, 'nursing-records', 'nursing_records', {
    columns: ['patient_id', 'record_type', 'data'], json: ['data'],
  })
  crud(app, requireAuth, pool, 'ip-billing', 'ip_billing_entries', {
    columns: ['patient_id', 'entry_type', 'data'], json: ['data'], order: 't.created_at',
  })
  crud(app, requireAuth, pool, 'blood-requests', 'blood_requests', {
    columns: ['patient_id', 'blood_group', 'units', 'product_type', 'priority', 'status'],
  })

  // ── Queue tokens: number per department per day, list only today by default ──
  app.get('/api/queue', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM queue_tokens WHERE hospital_id = $1 AND queue_date = COALESCE($2::date, CURRENT_DATE)
         ORDER BY CASE priority WHEN 'Emergency' THEN 0 WHEN 'Urgent' THEN 1 WHEN 'Senior Citizen' THEN 2 WHEN 'VIP' THEN 3 ELSE 4 END, created_at`,
        [req.user.hospitalId, req.query.date || null]
      )
      res.json(rows)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
  app.post('/api/queue', requireAuth, async (req, res) => {
    try {
      const f = pickFields(req.body, ['patient_id', 'patient_name', 'department', 'doctor_id', 'priority', 'phone', 'visit_type'])
      if (!f.patient_name && !f.patient_id) return res.status(400).json({ error: 'Patient is required' })
      const prefix = (f.department || 'General').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'GN'
      const { rows: [{ count }] } = await pool.query(
        `SELECT COUNT(*) FROM queue_tokens WHERE hospital_id = $1 AND queue_date = CURRENT_DATE AND token LIKE $2`,
        [req.user.hospitalId, `${prefix}%`]
      )
      const token = `${prefix}${String(parseInt(count) + 1).padStart(3, '0')}`
      const { rows } = await pool.query(
        `INSERT INTO queue_tokens (hospital_id, token, patient_id, patient_name, department, doctor_id, priority, phone, visit_type, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.user.hospitalId, token, f.patient_id || null, f.patient_name, f.department, f.doctor_id || null,
         f.priority || 'Normal', f.phone, f.visit_type, userName(req)]
      )
      res.status(201).json(rows[0])
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
  app.patch('/api/queue/:id', requireAuth, async (req, res) => {
    const c = await pool.connect()
    try {
      const { status } = req.body
      if (!['waiting', 'calling', 'in-room', 'done', 'skipped'].includes(status)) return res.status(400).json({ error: 'Invalid status' })
      await c.query('BEGIN')
      // Only one token per department is "calling" at a time
      if (status === 'calling') {
        await c.query(
          `UPDATE queue_tokens SET status = 'waiting', updated_at = NOW()
           WHERE hospital_id = $1 AND queue_date = CURRENT_DATE AND status = 'calling'
             AND department IS NOT DISTINCT FROM (SELECT department FROM queue_tokens WHERE id = $2)`,
          [req.user.hospitalId, req.params.id]
        )
      }
      const { rows } = await c.query(
        `UPDATE queue_tokens SET status = $3, updated_at = NOW() WHERE id = $1 AND hospital_id = $2 RETURNING *`,
        [req.params.id, req.user.hospitalId, status]
      )
      await c.query('COMMIT')
      if (!rows.length) return res.status(404).json({ error: 'Not found' })
      res.json(rows[0])
    } catch (e) { await c.query('ROLLBACK'); res.status(500).json({ error: e.message }) } finally { c.release() }
  })
  app.delete('/api/queue/:id', requireAuth, async (req, res) => {
    try {
      await pool.query('DELETE FROM queue_tokens WHERE id = $1 AND hospital_id = $2', [req.params.id, req.user.hospitalId])
      res.json({ success: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── GRN: record the receipt and add the received quantity to stock, atomically ──
  app.get('/api/grns', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM grns WHERE hospital_id = $1 ORDER BY created_at DESC', [req.user.hospitalId])
      res.json(rows)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
  app.post('/api/grns', requireAuth, async (req, res) => {
    const c = await pool.connect()
    try {
      const { supplier_name, invoice_no } = req.body
      const items = (req.body.items || []).filter(i => i.drug_id && parseInt(i.qty) > 0)
      if (!supplier_name || !invoice_no) return res.status(400).json({ error: 'Supplier and invoice number are required' })
      if (!items.length) return res.status(400).json({ error: 'Add at least one line with a drug and quantity' })
      await c.query('BEGIN')
      const lines = []
      for (const it of items) {
        const qty = parseInt(it.qty)
        const { rows: [drug] } = await c.query(
          `UPDATE pharmacy_inventory
           SET stock = stock + $3,
               price = COALESCE($4, price),
               expiry = COALESCE($5, expiry)
           WHERE id = $1 AND hospital_id = $2 RETURNING *`,
          [it.drug_id, req.user.hospitalId, qty, it.mrp ? Number(it.mrp) : null, it.expiry ? `${it.expiry.slice(0, 7)}-01` : null]
        )
        if (!drug) throw new Error(`Drug #${it.drug_id} not found`)
        await c.query('UPDATE pharmacy_inventory SET status = $2 WHERE id = $1', [drug.id, stockStatus(drug.stock)])
        lines.push({ drug_id: drug.id, drug_name: drug.name, batch: it.batch || '', expiry: it.expiry || '', qty, ptr: Number(it.ptr) || 0, mrp: Number(it.mrp) || 0 })
      }
      const total = lines.reduce((s, l) => s + l.qty * l.ptr, 0)
      const { rows } = await c.query(
        `INSERT INTO grns (hospital_id, supplier_name, invoice_no, items, total_value, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.hospitalId, supplier_name, invoice_no, JSON.stringify(lines), total, userName(req)]
      )
      await c.query('COMMIT')
      res.status(201).json(rows[0])
    } catch (e) { await c.query('ROLLBACK'); res.status(500).json({ error: e.message }) } finally { c.release() }
  })

  // ── IP medicine returns: put stock back and record the refund ──
  app.get('/api/pharmacy-returns', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT r.*, p.name AS patient_name FROM pharmacy_returns r LEFT JOIN patients p ON p.id = r.patient_id
         WHERE r.hospital_id = $1 ORDER BY r.created_at DESC`, [req.user.hospitalId])
      res.json(rows)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
  app.post('/api/pharmacy-returns', requireAuth, async (req, res) => {
    const c = await pool.connect()
    try {
      const { patient_id, drug_id, reason } = req.body
      const qty = parseInt(req.body.qty)
      if (!patient_id || !drug_id || !(qty > 0)) return res.status(400).json({ error: 'Patient, drug and quantity are required' })
      await c.query('BEGIN')
      const { rows: [drug] } = await c.query(
        'UPDATE pharmacy_inventory SET stock = stock + $3 WHERE id = $1 AND hospital_id = $2 RETURNING *',
        [drug_id, req.user.hospitalId, qty])
      if (!drug) throw new Error('Drug not found')
      await c.query('UPDATE pharmacy_inventory SET status = $2 WHERE id = $1', [drug.id, stockStatus(drug.stock)])
      const { rows } = await c.query(
        `INSERT INTO pharmacy_returns (hospital_id, patient_id, drug_id, drug_name, qty, refund_amount, reason, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.user.hospitalId, patient_id, drug.id, drug.name, qty, qty * Number(drug.price || 0), reason || null, userName(req)])
      await c.query('COMMIT')
      res.status(201).json(rows[0])
    } catch (e) { await c.query('ROLLBACK'); res.status(500).json({ error: e.message }) } finally { c.release() }
  })

  // ── Blood bank ──
  const BLOOD_GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']
  app.get('/api/blood-stock', requireAuth, async (req, res) => {
    try {
      await pool.query(
        `INSERT INTO blood_stock (hospital_id, blood_group) SELECT $1, g FROM unnest($2::text[]) g
         ON CONFLICT (hospital_id, blood_group) DO NOTHING`, [req.user.hospitalId, BLOOD_GROUPS])
      const { rows } = await pool.query('SELECT * FROM blood_stock WHERE hospital_id = $1', [req.user.hospitalId])
      rows.sort((a, b) => BLOOD_GROUPS.indexOf(a.blood_group) - BLOOD_GROUPS.indexOf(b.blood_group))
      res.json(rows)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
  app.get('/api/blood-donations', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM blood_donations WHERE hospital_id = $1 ORDER BY created_at DESC', [req.user.hospitalId])
      res.json(rows)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
  app.post('/api/blood-donations', requireAuth, async (req, res) => {
    const c = await pool.connect()
    try {
      const { donor_name, blood_group } = req.body
      const units = parseInt(req.body.units)
      if (!BLOOD_GROUPS.includes(blood_group) || !(units > 0)) return res.status(400).json({ error: 'Valid blood group and units are required' })
      await c.query('BEGIN')
      const { rows } = await c.query(
        `INSERT INTO blood_donations (hospital_id, donor_name, blood_group, units, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.user.hospitalId, donor_name || null, blood_group, units, userName(req)])
      await c.query(
        `INSERT INTO blood_stock (hospital_id, blood_group, units) VALUES ($1,$2,$3)
         ON CONFLICT (hospital_id, blood_group) DO UPDATE SET units = blood_stock.units + EXCLUDED.units, updated_at = NOW()`,
        [req.user.hospitalId, blood_group, units])
      await c.query('COMMIT')
      res.status(201).json(rows[0])
    } catch (e) { await c.query('ROLLBACK'); res.status(500).json({ error: e.message }) } finally { c.release() }
  })
  // Issuing blood deducts stock in the same transaction as the status change
  app.post('/api/blood-requests/:id/issue', requireAuth, async (req, res) => {
    const c = await pool.connect()
    try {
      await c.query('BEGIN')
      const { rows: [r] } = await c.query(
        `SELECT * FROM blood_requests WHERE id = $1 AND hospital_id = $2 FOR UPDATE`, [req.params.id, req.user.hospitalId])
      if (!r) throw Object.assign(new Error('Request not found'), { status: 404 })
      if (r.status === 'Issued') throw Object.assign(new Error('Already issued'), { status: 409 })
      const { rows: stock } = await c.query(
        `UPDATE blood_stock SET units = units - $3, updated_at = NOW()
         WHERE hospital_id = $1 AND blood_group = $2 AND units >= $3 RETURNING units`,
        [req.user.hospitalId, r.blood_group, r.units])
      if (!stock.length) throw Object.assign(new Error(`Not enough ${r.blood_group} stock to issue ${r.units} unit(s)`), { status: 409 })
      const { rows } = await c.query(
        `UPDATE blood_requests SET status = 'Issued', updated_at = NOW() WHERE id = $1 RETURNING *`, [r.id])
      await c.query('COMMIT')
      res.json(rows[0])
    } catch (e) { await c.query('ROLLBACK'); res.status(e.status || 500).json({ error: e.message }) } finally { c.release() }
  })
}
