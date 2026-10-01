require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { pool } = require("./db");
const { importKmhStaff } = require("./kmh-staff-import");

async function main() {
  const sourcePath = process.env.KMH_STAFF_JSON_PATH;
  const hospitalId = process.env.KMH_STAFF_HOSPITAL_ID;
  if (!sourcePath || !hospitalId) {
    throw new Error("Set KMH_STAFF_JSON_PATH and KMH_STAFF_HOSPITAL_ID to explicitly run a staff import.");
  }

  const resolvedPath = path.resolve(sourcePath);
  const rows = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  const report = await importKmhStaff(hospitalId, rows);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
