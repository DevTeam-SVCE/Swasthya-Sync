const jwt = require("jsonwebtoken");
const { query } = require("./db");
const { canAccess, normalizeRole } = require("./permissions");

function createToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );
}

async function requireAuth(req, res, next) {
  if (req.user) return next();
  const header = req.get("authorization");
  const token = header && header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, u.active, u.hospital_id, h.name AS hospital_name
       FROM users u JOIN hospitals h ON h.id = u.hospital_id WHERE u.id = $1`,
      [payload.sub]
    );
    const user = result.rows[0];
    if (!user || !user.active) {
      return res.status(401).json({ message: "Your account is inactive or no longer exists." });
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Your session has expired. Please sign in again." });
    }
    return res.status(401).json({ message: "Invalid authentication token." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.map(normalizeRole).includes(normalizeRole(req.user.role))) {
      return res.status(403).json({ message: "You do not have permission to access this resource." });
    }
    next();
  };
}

function requirePermission(module, action = "view") {
  return (req, res, next) => {
    if (!canAccess(req.user.role, module, action)) {
      return res.status(403).json({ message: "You do not have permission to access this resource." });
    }
    next();
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role).toLowerCase(),
    hospitalName: user.hospital_name,
    hospitalId: user.hospital_id,
    avatarInitials: user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
  };
}

module.exports = { createToken, requireAuth, requireRole, requirePermission, publicUser };
