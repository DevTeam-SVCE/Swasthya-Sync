# SwasthyaSync local API

Copy `.env.example` to `.env`, set `DATABASE_URL` and a private `JWT_SECRET`, then install and run:

```powershell
npm install
npm run seed
npm run dev
```

The API listens on `http://localhost:5000`. Development seed credentials:

- Admin: `admin@swasthyasync.com` / `admin123`
- Staff: `staff@swasthyasync.com` / `staff123`

These credentials are for local development only.

## Account roles

The schema supports `ADMIN`, `DOCTOR`, `FRONT_DESK`, and `STAFF`. Existing `STAFF` accounts are not rewritten during schema initialization and keep their legacy access. `FRONT_DESK` is a separate, explicitly assigned role with a narrower permission set.

## Optional KMH staff import

The normal seed does not import external staff records. To run an explicitly reviewed import, provide a JSON file in the importer format and the target hospital UUID, then run:

```powershell
$env:KMH_STAFF_JSON_PATH = "D:\private\kmh-staff.json"
$env:KMH_STAFF_HOSPITAL_ID = "<target-hospital-uuid>"
npm run import:kmh-staff
```

The importer upserts profiles by source staff ID. Keep the source file outside the repository and review the selected hospital and records before running it.
