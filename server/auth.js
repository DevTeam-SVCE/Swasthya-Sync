// auth.js — Authentication routes (register hospital, login, staff management)
import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pkg from 'pg'
const { Pool } = pkg

const router = express.Router()

// Pool is passed in from index.js
let pool

export function setPool(p) { pool = p }

// ─── HELPERS ──────────────────────────────────────────────────

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY || '7d' })
}

/** Generate a login_id like "DR.doctorname.hospitalslug" */
function makeLoginId(role, name, hospitalName) {
  const slug = hospitalName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)
  const namePart = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
  const prefix = { admin: 'ADM', doctor: 'DR', nurse: 'NR', receptionist: 'REC', lab_tech: 'LAB', pharmacist: 'PHR' }[role] || 'STF'
  return `${prefix}.${namePart}.${slug}`
}

async function nextDoctorId(db) {
  const { rows: [r] } = await db.query(
    `SELECT MAX(CAST(SUBSTRING(id FROM '^D-(\\d+)$') AS INTEGER)) AS n FROM doctors WHERE id ~ '^D-\\d+$'`)
  return `D-${String((r.n ?? 0) + 1).padStart(3, '0')}`
}

const STAFF_ROLES = ['doctor', 'nurse', 'receptionist', 'lab_tech', 'pharmacist']

// ─── MIDDLEWARE ────────────────────────────────────────────────

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' })
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' })
    next()
  })
}

// ─────────────────────────────────────────────────────────────
// POST /api/auth/register  — Admin registers a new hospital
// ─────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { hospitalName, city, address, phone, email, licenseNo, bedCount, adminName, adminEmail, adminPhone, password, logo } = req.body

  if (!hospitalName || !adminName || !password) {
    return res.status(400).json({ error: 'Hospital name, admin name and password are required' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Check duplicate hospital license
    if (licenseNo) {
      const dup = await client.query('SELECT id FROM hospitals WHERE license_no=$1', [licenseNo])
      if (dup.rows.length) return res.status(409).json({ error: 'A hospital with this license number already exists' })
    }

    // Create hospital
    const { rows: [hospital] } = await client.query(
      `INSERT INTO hospitals (name, city, address, phone, email, license_no, bed_count, logo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [hospitalName, city, address, phone, email, licenseNo || null, bedCount || 0, logo || null]
    )

    // Hash password
    const hash = await bcrypt.hash(password, 12)
    let loginId = makeLoginId('admin', adminName, hospitalName)

    // Make unique if clash
    const { rows: clash } = await client.query('SELECT id FROM users WHERE login_id=$1', [loginId])
    if (clash.length) loginId = loginId + Math.floor(Math.random() * 900 + 100)

    // Create admin user
    const { rows: [user] } = await client.query(
      `INSERT INTO users (hospital_id, name, email, login_id, password_hash, role, phone, is_active)
       VALUES ($1,$2,$3,$4,$5,'admin',$6,true) RETURNING id, name, login_id, role, hospital_id`,
      [hospital.id, adminName, adminEmail || null, loginId, hash, adminPhone || null]
    )

    // Update created_by to self
    await client.query('UPDATE users SET created_by=$1 WHERE id=$1', [user.id])

    await client.query('COMMIT')

    const token = signToken({ id: user.id, role: 'admin', hospitalId: hospital.id, name: user.name, loginId: user.login_id })

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, role: 'admin', loginId: user.login_id, hospitalId: hospital.id, hospitalName: hospital.name, hospitalLogo: hospital.logo },
    })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(e)
    res.status(500).json({ error: e.message })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { loginId, password } = req.body
  if (!loginId || !password) return res.status(400).json({ error: 'Login ID and password are required' })

  try {
    const { rows } = await pool.query(
      `SELECT u.*, h.name AS hospital_name, h.logo AS hospital_logo
       FROM users u JOIN hospitals h ON u.hospital_id = h.id
       WHERE u.login_id = $1`,
      [loginId.trim()]
    )
    if (!rows.length) return res.status(401).json({ error: 'Invalid login ID or password' })

    const user = rows[0]
    if (!user.is_active) return res.status(403).json({ error: 'This account has been deactivated' })

    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) return res.status(401).json({ error: 'Invalid login ID or password' })

    const token = signToken({ id: user.id, role: user.role, hospitalId: user.hospital_id, name: user.name, loginId: user.login_id })

    res.json({
      token,
      user: {
        id: user.id, name: user.name, role: user.role,
        loginId: user.login_id, department: user.department,
        hospitalId: user.hospital_id, hospitalName: user.hospital_name,
        hospitalLogo: user.hospital_logo
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/auth/me  — Verify token & return current user
// ─────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.login_id, u.role, u.department, u.phone, u.is_active,
              u.hospital_id, h.name AS hospital_name, h.city, h.logo AS hospital_logo
       FROM users u JOIN hospitals h ON u.hospital_id = h.id
       WHERE u.id = $1`,
      [req.user.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'User not found' })
    const u = rows[0]
    res.json({
      id: u.id, name: u.name, email: u.email, loginId: u.login_id, role: u.role,
      department: u.department, phone: u.phone, isActive: u.is_active,
      hospitalId: u.hospital_id, hospitalName: u.hospital_name, city: u.city,
      hospitalLogo: u.hospital_logo
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/auth/staff  — Admin: list all staff in their hospital
// ─────────────────────────────────────────────────────────────
router.get('/staff', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, login_id, role, department, phone, is_active, created_at
       FROM users
       WHERE hospital_id = $1 AND role != 'admin'
       ORDER BY created_at DESC`,
      [req.user.hospitalId]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/auth/staff  — Admin: create a staff login
// ─────────────────────────────────────────────────────────────
router.post('/staff', requireAdmin, async (req, res) => {
  const { name, role, department, phone, email, password, qualification, experience, schedule } = req.body
  if (!name || !role || !password) return res.status(400).json({ error: 'Name, role and password are required' })
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Get hospital name for the login_id slug
    const { rows: [hosp] } = await client.query('SELECT name FROM hospitals WHERE id=$1', [req.user.hospitalId])
    let loginId = makeLoginId(role, name, hosp.name)

    // Make unique if clash
    const { rows: clash } = await client.query('SELECT id FROM users WHERE login_id=$1', [loginId])
    if (clash.length) loginId = loginId + Math.floor(Math.random() * 900 + 100)

    const hash = await bcrypt.hash(password, 12)

    const { rows: [user] } = await client.query(
      `INSERT INTO users (hospital_id, name, email, login_id, password_hash, role, department, phone, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name, login_id, role, department, phone, email, is_active, created_at`,
      [req.user.hospitalId, name, email || null, loginId, hash, role, department || null, phone || null, req.user.id]
    )

    // If role is doctor, also create a record in the doctors table
    if (role === 'doctor') {
      // Generate a new doctor ID
      const newDocId = await nextDoctorId(client)

      await client.query(
        `INSERT INTO doctors (id, hospital_id, name, department, qualification, experience, status, schedule, phone, email, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,'available',$7,$8,$9,$10)`,
        [newDocId, req.user.hospitalId, name, department || 'General', qualification || '', experience || 0, schedule || '', phone || null, email || null, user.id]
      )
    }

    await client.query('COMMIT')
    res.status(201).json(user)
  } catch (e) {
    await client.query('ROLLBACK')
    if (e.code === '23505') return res.status(409).json({ error: 'A user with this login ID already exists' })
    res.status(500).json({ error: e.message })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────
// PATCH /api/auth/staff/:id  — Admin: toggle active / update
// ─────────────────────────────────────────────────────────────
router.patch('/staff/:id', requireAdmin, async (req, res) => {
  const { is_active, password, name, department, phone, email, role } = req.body
  const userId = req.params.id

  const client = await pool.connect()
  try {
    // Verify the staff belongs to the same hospital
    const { rows } = await client.query(
      'SELECT id, role FROM users WHERE id=$1 AND hospital_id=$2', [userId, req.user.hospitalId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Staff member not found' })
    const oldRole = rows[0].role
    if (oldRole === 'admin') return res.status(403).json({ error: 'Admin accounts cannot be edited here' })
    if (role !== undefined && !STAFF_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' })

    const updates = {}
    if (is_active !== undefined) updates.is_active = !!is_active
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty' })
      updates.name = String(name).trim()
    }
    if (department !== undefined) updates.department = department || null
    if (phone !== undefined) updates.phone = phone || null
    if (email !== undefined) updates.email = email || null
    if (role !== undefined && role !== oldRole) updates.role = role
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
      updates.password_hash = await bcrypt.hash(password, 12)
    }

    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' })

    await client.query('BEGIN')
    const keys = Object.keys(updates)
    const clause = keys.map((k, i) => `${k}=$${i + 2}`).join(',')
    const vals = [userId, ...keys.map(k => updates[k])]

    const { rows: [updated] } = await client.query(
      `UPDATE users SET ${clause} WHERE id=$1 RETURNING id, name, email, login_id, role, department, phone, is_active, created_at`, vals
    )

    // Keep the doctors table in step with the login
    const newRole = updated.role
    if (newRole === 'doctor') {
      const { rows: doc } = await client.query('SELECT id FROM doctors WHERE user_id=$1', [userId])
      if (!doc.length) {
        await client.query(
          `INSERT INTO doctors (id, hospital_id, name, department, status, phone, email, user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [await nextDoctorId(client), req.user.hospitalId, updated.name, updated.department || 'General',
           updated.is_active ? 'available' : 'on-leave', updated.phone, updated.email, userId])
      } else {
        await client.query(
          `UPDATE doctors SET name=$2, department=COALESCE($3, department), phone=$4, email=$5,
             status = CASE WHEN $6 THEN (CASE WHEN status='on-leave' THEN 'available' ELSE status END) ELSE 'on-leave' END
           WHERE user_id=$1`,
          [userId, updated.name, updated.department, updated.phone, updated.email, updated.is_active])
      }
    } else if (oldRole === 'doctor') {
      // No longer a doctor: keep the doctor record for history, but take them off the roster
      await client.query(`UPDATE doctors SET status='on-leave' WHERE user_id=$1`, [userId])
    }

    await client.query('COMMIT')
    res.json(updated)
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: e.message })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────
// DELETE /api/auth/staff/:id  — Admin: permanently remove
// ─────────────────────────────────────────────────────────────
router.delete('/staff/:id', requireAdmin, async (req, res) => {
  const client = await pool.connect()
  try {
    const { rows: [u] } = await client.query(
      `SELECT id FROM users WHERE id=$1 AND hospital_id=$2 AND role != 'admin'`, [req.params.id, req.user.hospitalId])
    if (!u) return res.status(404).json({ error: 'Staff member not found' })
    await client.query('BEGIN')
    // Remove the linked doctor record; if patients/visits reference it, keep it (unlinked, on leave)
    await client.query('SAVEPOINT doc')
    try {
      await client.query('DELETE FROM doctors WHERE user_id=$1 AND hospital_id=$2', [u.id, req.user.hospitalId])
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT doc')
      await client.query(`UPDATE doctors SET user_id=NULL, status='on-leave' WHERE user_id=$1`, [u.id])
    }
    await client.query('UPDATE users SET created_by=NULL WHERE created_by=$1', [u.id])
    await client.query('DELETE FROM users WHERE id=$1', [u.id])
    await client.query('COMMIT')
    res.json({ success: true })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: e.message })
  } finally {
    client.release()
  }
})

export default router
