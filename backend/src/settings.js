const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { pool, query } = require("./db");
const { requireRole } = require("./auth");

const router = express.Router();
const settingsAssetDirectory = path.resolve(__dirname, "..", "uploads", "settings");
const assetExtensions = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const assetFields = {
  "primary-logo": "primaryLogoUrl",
  "accreditation-logo": "accreditationLogoUrl",
  "header-image": "headerImageUrl",
  "footer-image": "footerImageUrl",
};
const assetUrlPattern = /^\/uploads\/settings\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;
const fieldColumns = {
  hospitalName: "hospital_name",
  tagline: "tagline",
  address: "address",
  phone: "phone",
  email: "email",
  primaryLogoUrl: "primary_logo_url",
  accreditationLogoUrl: "accreditation_logo_url",
  brandingMode: "branding_mode",
  headerImageUrl: "header_image_url",
  footerImageUrl: "footer_image_url",
};
const textLimits = {
  hospitalName: 200,
  tagline: 240,
  address: 1000,
  phone: 40,
  email: 254,
};

const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    fs.mkdir(settingsAssetDirectory, { recursive: true }, (error) => callback(error, settingsAssetDirectory));
  },
  filename(_req, file, callback) {
    callback(null, `${crypto.randomUUID()}${assetExtensions.get(file.mimetype)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    if (!assetExtensions.has(file.mimetype)) {
      return callback(new Error("Upload a PNG, JPEG, or WebP image."));
    }
    callback(null, true);
  },
});

function defaultSettings(hospitalName) {
  return {
    id: null,
    hospitalName: hospitalName || "",
    tagline: "",
    address: "",
    phone: "",
    email: "",
    primaryLogoUrl: "",
    accreditationLogoUrl: "",
    brandingMode: "text_logo",
    headerImageUrl: "",
    footerImageUrl: "",
    createdAt: null,
    updatedAt: null,
  };
}

function publicSettings(row) {
  return {
    id: row.id,
    hospitalName: row.hospital_name,
    tagline: row.tagline || "",
    address: row.address || "",
    phone: row.phone || "",
    email: row.email || "",
    primaryLogoUrl: row.primary_logo_url || "",
    accreditationLogoUrl: row.accreditation_logo_url || "",
    brandingMode: row.branding_mode,
    headerImageUrl: row.header_image_url || "",
    footerImageUrl: row.footer_image_url || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateSettingsInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Settings must be sent as a JSON object." };
  }

  const values = {};
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(fieldColumns, key)) return { error: `Unknown Settings field: ${key}.` };
    if (key === "brandingMode") {
      if (value !== "text_logo" && value !== "image") return { error: "Branding mode must be text_logo or image." };
      values[key] = value;
      continue;
    }

    if (["primaryLogoUrl", "accreditationLogoUrl", "headerImageUrl", "footerImageUrl"].includes(key)) {
      if (value === null || value === "") {
        values[key] = null;
        continue;
      }
      if (typeof value !== "string" || !assetUrlPattern.test(value)) {
        return { error: `${key} must reference an uploaded branding image.` };
      }
      values[key] = value;
      continue;
    }

    if (value === null && key !== "hospitalName") {
      values[key] = null;
      continue;
    }
    if (typeof value !== "string") return { error: `${key} must be text.` };
    const cleanValue = value.trim();
    if (cleanValue.length > textLimits[key]) return { error: `${key} must be ${textLimits[key]} characters or fewer.` };
    if (key === "hospitalName" && !cleanValue) return { error: "Hospital name is required." };
    if (key === "email" && cleanValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanValue)) {
      return { error: "Enter a valid hospital email address." };
    }
    if (key === "phone" && cleanValue && !/^\+?[0-9\s().-]{7,40}$/.test(cleanValue)) {
      return { error: "Enter a valid hospital phone number." };
    }
    values[key] = cleanValue || null;
  }

  return { values };
}

router.get("/", async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM hospital_settings WHERE hospital_id = $1", [req.user.hospital_id]);
    if (result.rows[0]) return res.json({ settings: publicSettings(result.rows[0]) });

    const hospital = await query("SELECT name FROM hospitals WHERE id = $1", [req.user.hospital_id]);
    if (!hospital.rows[0]) return res.status(404).json({ message: "Hospital not found." });
    res.json({ settings: defaultSettings(hospital.rows[0].name) });
  } catch (error) {
    next(error);
  }
});

router.put("/", requireRole("ADMIN"), async (req, res, next) => {
  const validated = validateSettingsInput(req.body);
  if (validated.error) return res.status(400).json({ message: validated.error });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const hospital = await client.query("SELECT name FROM hospitals WHERE id = $1 FOR UPDATE", [req.user.hospital_id]);
    if (!hospital.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Hospital not found." });
    }
    const existing = await client.query("SELECT * FROM hospital_settings WHERE hospital_id = $1 FOR UPDATE", [req.user.hospital_id]);
    const current = existing.rows[0] ? publicSettings(existing.rows[0]) : defaultSettings(hospital.rows[0].name);
    const nextSettings = { ...current };
    for (const [key, value] of Object.entries(validated.values)) {
      nextSettings[key] = value ?? (key === "hospitalName" ? "" : "");
    }

    const columns = Object.values(fieldColumns);
    const values = [req.user.hospital_id, ...Object.keys(fieldColumns).map((key) => nextSettings[key] || null)];
    const placeholders = values.map((_value, index) => `$${index + 1}`);
    const updates = columns.map((column) => `${column} = EXCLUDED.${column}`).join(", ");
    const saved = await client.query(
      `INSERT INTO hospital_settings (hospital_id, ${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       ON CONFLICT (hospital_id) DO UPDATE SET ${updates}, updated_at = NOW()
       RETURNING *`,
      values
    );
    await client.query("UPDATE hospitals SET name = $1, updated_at = NOW() WHERE id = $2", [nextSettings.hospitalName, req.user.hospital_id]);
    await client.query("COMMIT");
    res.json({ settings: publicSettings(saved.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

router.post("/assets/:assetKey", requireRole("ADMIN"), (req, res, next) => {
  if (!Object.hasOwn(assetFields, req.params.assetKey)) {
    return res.status(400).json({ message: "Choose a supported branding asset." });
  }
  upload.single("file")(req, res, (error) => {
    if (error) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ message: error.message });
    }
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Select an image to upload." });
  res.status(201).json({ url: `/uploads/settings/${req.file.filename}` });
});

module.exports = { router, settingsAssetDirectory, validateSettingsInput };