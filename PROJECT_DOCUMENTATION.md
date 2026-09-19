# Swasthya-Sync / dScribe HMS Project Documentation

Audit date: 2026-09-16  
Scope: source, configuration, database scripts, and relevant documentation in `Swasthya-Sync`.  
Method: read-only inspection. No SQL was executed and no existing source file was changed.

## Audit conventions

- **Implemented** means inspected code contains a concrete persisted or executable implementation.
- **Partially implemented** means some workflow is real but important state is local, simulated, or incomplete.
- **Placeholder** means the UI explicitly presents a coming-soon or non-functional surface.
- **Referenced but missing** means a frontend helper or documented behavior has no matching backend implementation.
- **Unable to verify** means static inspection cannot prove runtime behavior, deployment success, live data, or external service delivery.

Line references below use the inspected files' line numbers. Secret and credential values are intentionally omitted.

## 1. Project Overview

### Purpose

Swasthya-Sync is a React/PostgreSQL hospital management system branded as dScribe HMS. It covers hospital registration and authentication, patient and doctor management, OPD/IPD workflows, clinical notes, diagnostics, pharmacy and billing, forms/discharge documents, reporting, and administrative screens.

### Technology stack

- Frontend: React 18, React Router 6, Vite 5, Recharts, Lucide React, PDF.js, PDF-Lib, jsPDF, html2pdf.js, html5-qrcode.
- Backend: Node.js ES modules, Express 4, PostgreSQL via `pg`, JWT via `jsonwebtoken`, bcryptjs, Multer, Nodemailer, dotenv, pdf-parse.
- Database: PostgreSQL. Runtime startup applies `server/dscribe_hms_import.sql` and inline migrations in `server/index.js`.
- Deployment: Docker Compose with an app container and PostgreSQL 15 container.

### Architecture

```text
Browser / React SPA
  -> BrowserRouter and AuthProvider
  -> src/api.js or direct fetch()
  -> Express server on port 5000
  -> JWT middleware and SQL handlers
  -> PostgreSQL
  -> server/uploads for PDFs and images
```

The frontend uses `http://localhost:5000/api` during development and `/api` outside development (`src/api.js:1-4`). The backend serves the SPA fallback and `/uploads` static files. There is no Vite development proxy (`vite.config.js:1-10`).

### Confirmed local URLs

- Frontend: Vite's default `http://localhost:5173` unless overridden; the port is not explicitly set in `vite.config.js`.
- Backend/API: `http://localhost:5000`; API prefix `/api`.
- Health check: `GET http://localhost:5000/api/health` (`server/index.js:1422`).
- Docker PostgreSQL: host port `5433` mapped to container port `5432` (`docker-compose.yml:25-34`).

## 2. Complete Project Structure

### Relevant tree

```text
Swasthya-Sync/
|-- index.html
|-- package.json / package-lock.json
|-- vite.config.js
|-- Dockerfile / docker-compose.yml
|-- .gitignore / .dockerignore
|-- dscribe_hms_backup.sql
|-- dscribe_hms_schema.html
|-- generate_hms_doc.py
|-- project-tree.txt
|-- Working_Functionalities_of_HMS.md
|-- server/
|   |-- index.js / auth.js / env.js / email.js
|   |-- package.json / package-lock.json
|   |-- .env.example / .env.local
|   |-- dscribe_hms_import.sql
|   |-- schema.sql / schema-auth.sql / schema-forms.sql
|   |-- seed.js / seed-local.js
|   `-- check_ids.cjs / test_opd.cjs / test_opd.js / temp_skip.txt
`-- src/
    |-- main.jsx / App.jsx / api.js / index.css
    |-- context/AuthContext.jsx
    |-- layouts/DashboardLayout.jsx
    |-- components/FormViewer.jsx / DischargeEditor.jsx
    `-- pages/*.jsx
```

### Root and configuration files

| File | Purpose and interactions |
|---|---|
| `package.json` | Frontend scripts (`dev`, `build`, `preview`) and React/UI/PDF dependencies. |
| `package-lock.json` | Locked frontend dependency graph; not audited dependency-by-dependency. |
| `vite.config.js` | React Vite plugin; excludes `pdfjs-dist` from dependency optimization. |
| `index.html` | Browser entry point, Google Fonts links, favicon reference, and `#root` mount. |
| `Dockerfile` | Runs the server container on port 5000; starts `node index.js`, not `seed.js`. |
| `docker-compose.yml` | App/PostgreSQL services, ports, environment names, persistent volumes, and one-time DB init mount. Secret values are not reproduced. |
| `.gitignore`, `.dockerignore` | Ignore rules. `.env.local` is ignored, but ordinary `.env` files are not excluded from Docker context. |
| `dscribe_hms_backup.sql` | PostgreSQL backup with schema, constraints, indexes, sequences, and historical rows. It is sensitive data, not merely a fixture. |
| `dscribe_hms_schema.html` | Generated/manual schema and setup reference. Its credential-bearing material is omitted. |
| `generate_hms_doc.py` | Documentation-generation utility; no runtime import was found. |
| `project-tree.txt` | Descriptive project tree snapshot. |
| `Working_Functionalities_of_HMS.md` | Existing status notes; source behavior is authoritative where notes differ. |

### Frontend files

| File/group | Main responsibility and interactions |
|---|---|
| `src/main.jsx` | Bootstraps `StrictMode`, `BrowserRouter`, `AuthProvider`, `App`, and global CSS. |
| `src/App.jsx` | All public/protected/admin routes, `PrivateRoute`, `AdminRoute`, and module placeholder. |
| `src/api.js` | Bearer-token JSON/multipart client and 70 helpers for clinical, business, form, discharge, hospital, report, and audit operations. |
| `src/index.css` | Global layout, forms, tables, modals, responsive, and utility styles. |
| `src/context/AuthContext.jsx` | Local-storage auth restoration, `/auth/me` verification, login/logout/admin state. |
| `src/layouts/DashboardLayout.jsx` | Protected shell, sidebar, admin navigation, search UI, notifications, branding, logout. |
| `src/components/FormViewer.jsx` | PDF.js/PDF-Lib annotation viewer/editor, protected text, save/download flow. |
| `src/components/DischargeEditor.jsx` | HTML discharge editor, branding/patient substitution, text save, approval. |
| `src/pages/LandingPage.jsx` | Public landing page. |
| `src/pages/LoginPage.jsx` | Login form and direct `/auth/login` call. |
| `src/pages/RegisterPage.jsx` | Multi-step hospital/admin registration and direct `/auth/register` call. |
| `src/pages/Dashboard.jsx` | Metrics, charts, recent patients, notes, module links. |
| `src/pages/Patients.jsx` | Patient search, registration/edit wizard, detail view, forms, discharge entry points. |
| `src/pages/Appointments.jsx` | Appointment/walk-in booking, filtering, status changes, cancellation. |
| `src/pages/QueueManagement.jsx` | OPD queue/token presentation; some state is local. |
| `src/pages/QRRegistration.jsx` | Patient selection and external QR generation; save/print is incomplete. |
| `src/pages/BarcodePrinting.jsx` | Patient selection/browser printing with external barcode images. |
| `src/pages/PatientMerge.jsx` | Local duplicate detection; merge is simulated. |
| `src/pages/MedicalRecords.jsx` | Record-request UI; requests/status are simulated. |
| `src/pages/HealthPackages.jsx` | Static catalog; create/book controls have no handlers. |
| `src/pages/IPD.jsx` | Inpatient beds, assignment, discharge, forms, summaries. |
| `src/pages/OPD.jsx` | OPD visits, filters, appointment creation, status changes. |
| `src/pages/WardManagement.jsx` | Bed occupancy, ward filtering, local ward creation, transfers. |
| `src/pages/NursingStation.jsx` | Occupied beds and typed notes for vitals, eMAR, nursing notes. |
| `src/pages/Emergency.jsx` | Patient creation is persisted; triage/disposition is local. |
| `src/pages/CPOE.jsx` | Queue check-in, consultation notes, prescription text, completion. |
| `src/pages/Doctors.jsx` | Doctor search, profile, creation. |
| `src/pages/ClinicalNotes.jsx` | Notes, filters, digitization, PDF generation. |
| `src/pages/DischargeSummaryTemplates.jsx` | Admin template upload/list/delete and summary entry points. |
| `src/pages/PatientForms.jsx` | Patient selection, assignment, annotation viewer. |
| `src/pages/Laboratory.jsx` | Lab orders, results, PDF upload, email, branded output. |
| `src/pages/Radiology.jsx` | Radiology orders, results, PDF upload, email UI. |
| `src/pages/BloodBank.jsx` | Blood inventory through pharmacy rows; requests through clinical notes. |
| `src/pages/OperationTheatre.jsx` | Patient/doctor lookup and in-memory mock surgery schedule. |
| `src/pages/Pharmacy.jsx` | Inventory, POS, drug creation, partial GRN/return UI. |
| `src/pages/Inventory.jsx` | Pharmacy-backed stock list, stock creation, price updates. |
| `src/pages/Billing.jsx` | Invoice list/create/payment update and IP discharge actions. |
| `src/pages/IPBilling.jsx` | Inpatient billing via typed notes and final billing/bed release. |
| `src/pages/TPA.jsx` | Patient lookup and local mock insurance claims. |
| `src/pages/Reports.jsx` | KPI, monthly, department, financial reports. |
| `src/pages/Settings.jsx` | Hospital profile/branding persistence; several preferences are client-only. |
| `src/pages/StaffManagement.jsx` | Admin staff list, creation, activation. |
| `src/pages/FormTemplates.jsx` | Admin patient-form PDF upload/list/delete using direct `fetch`. |
| `src/pages/AuditLog.jsx` | Audit listing, filtering, summary, CSV export. |

### Backend files

| File | Purpose and interactions |
|---|---|
| `server/index.js` | Express app, CORS/static middleware, PostgreSQL pool, startup import/migrations, uploads, all non-auth routes, audit helper, listen. |
| `server/auth.js` | Registration, login, current-user, staff routes, JWT/password helpers, auth/admin middleware; mounted under `/api/auth`. |
| `server/env.js` | Loads `.env`, then `.env.local` outside production; exports DB/JWT/SMTP configuration. |
| `server/email.js` | Nodemailer SMTP transport and send operation. |
| `server/package.json` | Server scripts/dependencies; `start` runs `seed.js` before `index.js`. |
| `server/.env.example` | Placeholder configuration shape. |
| `server/.env.local` | Local credentials/configuration; values were not documented. |
| `server/seed.js` | Sample doctors, patients, beds, OPD, notes, labs, pharmacy, billing. |
| `server/seed-local.js` | Local hospital/admin upsert and password reset. |
| `server/check_ids.cjs` | Ad hoc DB inspection with embedded connection settings. |
| `server/test_opd.cjs`, `server/test_opd.js` | Ad hoc OPD tests with embedded connection settings. |
| `server/temp_skip.txt` | Temporary/non-runtime artifact. |

## 3. Frontend Documentation

### Routes and protection

Public routes are `/`, `/login`, and `/register`. All routes under `/app` are wrapped by `PrivateRoute` and rendered through `DashboardLayout` (`src/App.jsx:74-139`). Protected routes are:

`/app`, `/app/dashboard`, `/app/patients`, `/app/appointments`, `/app/queue`, `/app/qr-register`, `/app/barcode`, `/app/patient-merge`, `/app/medical-records`, `/app/packages`, `/app/package-mgmt`, `/app/ipd`, `/app/opd`, `/app/wards`, `/app/nursing`, `/app/emergency`, `/app/cpoe`, `/app/doctors`, `/app/clinical-notes`, `/app/discharge-templates`, `/app/patient-forms`, `/app/laboratory`, `/app/radiology`, `/app/blood-bank`, `/app/operation-theatre`, `/app/pharmacy`, `/app/inventory`, `/app/billing`, `/app/ip-billing`, `/app/tpa-insurance`, `/app/reports`, and `/app/settings`.

Admin-only routes are `/app/staff`, `/app/form-templates`, `/app/audit-log`, and `/app/modules`. `/app/modules` renders `ComingSoon`. Unknown paths redirect to `/`.

`PrivateRoute` waits for auth verification, then redirects to `/login`. `AdminRoute` checks only client-side `user.role === 'admin'` and redirects non-admins to the dashboard. These are navigation guards, not backend authorization.

### Authentication flow

`AuthContext` uses `swasthyasync_token` and `swasthyasync_user` (`src/context/AuthContext.jsx:10-73`). On mount it calls `GET /auth/me`; failure clears local storage. Login stores the token/user and navigates to the dashboard. Registration posts hospital/admin data, including a base64 logo. Login validation only checks non-empty fields; registration validates required fields, password length, and confirmation.

The shared client adds the bearer token but has no global 401 handling, refresh, or automatic logout (`src/api.js:5-31`). Login/registration, staff, templates, discharge text, and some PDF retrieval use direct `fetch`, so authentication/error behavior is inconsistent.

### Page status and backend use

| Page/module | Intended behavior | Actual status and endpoints |
|---|---|---|
| Dashboard | KPIs, charts, recent patients, notifications | Implemented through `/dashboard/stats`; failures may be silently swallowed. |
| Patients | Register/search/edit and access forms/discharge | Substantial CRUD with patient, doctor, form, discharge helpers. |
| Doctors | Manage doctors | API-backed list/search/create; broad mutation permissions. |
| Beds/IPD | Admit, assign, discharge, release | Substantial bed/form/discharge flow. |
| OPD | Visits, walk-ins, appointment/status workflow | API-backed; walk-in creation is transactional server-side. |
| Appointments | Book/update appointments | API-backed through OPD primitives; no separate appointment entity. |
| Queue | Generate/display tokens | Patient/doctor/OPD data is real; queue/token state is partly local. |
| Medical records | Request/track records | Prototype: requests/status use `setTimeout`; print/download lacks handlers. |
| Clinical notes | Create/filter/update/digitize | API-backed; PDF/branding is browser-side. |
| Nursing | Vitals/eMAR/nursing notes | Partial; typed `clinical_notes`, no dedicated nursing model. |
| Laboratory | Orders/results/uploads/email | API-backed; SMTP delivery is unable to verify statically. |
| Radiology | Orders/results/upload/email | Orders/status/upload exist; frontend email helper has no backend match. |
| Pharmacy | Inventory/POS/GRN/returns | Inventory/sales are API-backed; GRN/suppliers/returns are incomplete. |
| Inventory | Stock/price management | Implemented as pharmacy inventory, not a separate domain. |
| Billing | Invoices/payments | API-backed; validation/authorization limited. |
| IP billing | Inpatient settlement | Partial; intermediate state is clinical-note JSON. |
| TPA/Insurance | Claims workflow | Prototype; mock claims, no claims API. |
| Discharge summaries | Templates/edit/approval | Substantial, but ownership and approval authorization require review. |
| Hospital forms | Upload/assign/annotate PDFs | UI/backend exist; patient-form instance routes are public server-side. |
| Reports | Operational/financial reporting | API-backed through `/reports`; live correctness is unverified. |
| Staff management | Admin staff lifecycle | Implemented UI and admin auth routes. |
| Audit logs | View/filter/export | Implemented read UI; event coverage is incomplete. |
| Blood bank | Stock, donations, transfusion requests | Partial; pharmacy items and append-only notes, no dedicated tables. |
| Operation theatre | Schedule/track surgeries | Prototype; in-memory mock surgeries. |
| Emergency | Triage/disposition | Partial; only patient creation persists. |
| CPOE | Queue/consultation/prescription | Substantial using OPD and notes primitives. |
| Health packages | Create/book packages | Static; controls have no handlers. |
| QR/barcode | Registration/identification output | Patient data is real; external image services and incomplete saves. |
| Settings | Hospital profile/preferences | Profile/branding persist; most preference controls are client-only. |

### Forms, validation, loading, and errors

Validation is component-local. Stronger examples include the patient wizard, registration, PDF type/size/name checks, bed duplicate checks, notes, diagnostics, billing, pharmacy, appointments, and staff passwords. There is no shared schema library; email, numeric ranges, dates, and financial relationships are inconsistent.

Mature API pages show loading/empty/error states, but Dashboard, Nursing Station, QR Registration, Barcode Printing, Ward Management, Patient Forms, and Patient Merge suppress some failures. Many mutations use `alert()`; there is no global error boundary, retry abstraction, or centralized request state.

## 4. Backend Documentation

### API endpoint inventory

There are 68 concrete route handlers: 7 in `server/auth.js` and 61 in `server/index.js`, including health and excluding the SPA fallback. `Auth` means `requireAuth`; `Admin` means `requireAdmin`; `Public` means no auth middleware was present.

| Method and endpoint | Auth/role | Tables | Purpose, input, response/status |
|---|---|---|---|
| POST `/api/auth/register` | Public | hospitals, users | Hospital/admin JSON; JWT/user 201; validation 400, duplicate license 409, failure 500. `auth.js:52-115` |
| POST `/api/auth/login` | Public | users, hospitals | `{loginId,password}`; JWT/user 200; missing 400, invalid 401, inactive 403. `auth.js:117-153` |
| GET `/api/auth/me` | Auth | users, hospitals | Current user/hospital 200; missing 404, failure 500. `auth.js:155-178` |
| GET `/api/auth/staff` | Admin | users | Current-hospital staff list 200; failure 500. `auth.js:180-196` |
| POST `/api/auth/staff` | Admin | users, doctors | Staff and optional doctor JSON; 201; validation 400, duplicate 409, failure 500. `auth.js:198-249` |
| PATCH `/api/auth/staff/:id` | Admin | users, doctors | Active/password/name/department/phone; 200; 404/400/500. `auth.js:251-306` |
| DELETE `/api/auth/staff/:id` | Admin | users, doctors | Delete staff/doctor; 200 or 500. `auth.js:308-320` |
| GET `/api/hospital` | Auth | hospitals | Current hospital 200; 404/500. `index.js:282-288` |
| PATCH `/api/hospital` | Auth | hospitals | Allowlisted profile fields; 200; empty 400/500. `index.js:290-305` |
| POST `/api/hospital/upload-branding/:type` | Auth | hospitals, filesystem | Multipart `image`; 200; bad type/file 400, failure 500. `index.js:328-344` |
| GET `/api/patients` | Auth | patients, doctors | Query `search/filter`; rows 200, failure 500. `index.js:352-384` |
| GET `/api/patients/:id` | Auth | patients, doctors | Detail 200; 404/500. `index.js:386-398` |
| POST `/api/patients` | Auth | patients | Patient JSON; 201 or 500. `index.js:400-416` |
| PATCH `/api/patients/:id` | Auth | patients | Dynamic update; 200, empty 400, missing 404, failure 500. `index.js:418-430` |
| DELETE `/api/patients/:id` | Auth | patients, audit_logs | Delete and audit; 200 or 500. `index.js:432-440` |
| GET `/api/doctors` | Auth | doctors | Query `search/status/dept`; rows 200/500. `index.js:444-457` |
| GET `/api/doctors/:id` | Auth | doctors | Row 200; 404/500. `index.js:459-465` |
| POST `/api/doctors` | Auth | doctors | JSON; 201/500. `index.js:467-481` |
| PATCH `/api/doctors/:id` | Auth | doctors | Dynamic update; 200 or 400/404/500. `index.js:483-494` |
| DELETE `/api/doctors/:id` | Auth | doctors | Delete; 200/500. `index.js:496-501` |
| GET `/api/beds` | Auth | beds, patients, doctors | Query ward/search; rows 200/500. `index.js:507-524` |
| PATCH `/api/beds/:id` | Auth | beds | Assignment/status/diagnosis/alert; 200/404/500. `index.js:526-537` |
| POST `/api/beds` | Auth | beds | `{id,ward,bed_type,status}`; 201; 400/409/500. `index.js:539-554` |
| DELETE `/api/beds/:id` | Auth | beds | Delete unoccupied bed; 200, 400/404/500. `index.js:556-570` |
| GET `/api/opd` | Auth | opd_visits, patients, doctors | Query date/status/search; rows 200/500. `index.js:573-591` |
| POST `/api/opd` | Auth | opd_visits, patients | Visit/walk-in JSON; transactional 201 or rollback/500. `index.js:593-630` |
| PATCH `/api/opd/:id` | Auth | opd_visits | Dynamic update; first row returned 200 even absent; 500. `index.js:632-645` |
| GET `/api/notes` | Auth | clinical_notes, patients, doctors | Filter/search; rows 200/500. `index.js:647-669` |
| POST `/api/notes` | Auth | clinical_notes | Patient/doctor/type/content/priority; 201, 400/500. `index.js:671-692` |
| PATCH `/api/notes/:id` | Auth | clinical_notes | Dynamic update; 200, 400/404/500. `index.js:694-715` |
| GET `/api/lab` | Auth | lab_tests, patients | Filter/search; rows 200/500. `index.js:717-740` |
| POST `/api/lab` | Auth | lab_tests | Lab JSON; 201/500. `index.js:742-752` |
| PATCH `/api/lab/:id` | Auth | lab_tests | Status/result; row or undefined 200, 500. `index.js:754-765` |
| POST `/api/lab/:id/upload-result` | Auth | lab_tests, filesystem | Multipart `result_pdf`, max 50 MB; 200; 400/404/500. `index.js:767-780` |
| POST `/api/lab/:id/email-result` | Auth | filesystem, SMTP | PDF plus email/patient/test fields; 200; 400/500. `index.js:782-823` |
| GET `/api/radiology` | Auth | radiology_orders, patients | Filter/search; rows 200/500. `index.js:825-841` |
| POST `/api/radiology` | Auth | radiology_orders | Study JSON; 201, 400/500. `index.js:843-854` |
| PATCH `/api/radiology/:id` | Auth | radiology_orders | Status/notes; 200, 404/500. `index.js:856-869` |
| POST `/api/radiology/:id/upload-result` | Auth | radiology_orders, filesystem | PDF upload; 200, 400/404/500. `index.js:871-892` |
| GET `/api/discharge-templates` | Auth | discharge_summary_templates | Category/search; active rows 200/500. `index.js:894-907` |
| POST `/api/discharge-templates` | Auth, not Admin | discharge_summary_templates, filesystem | Multipart PDF/name/description/category; 201, 400/500. `index.js:909-925` |
| DELETE `/api/discharge-templates/:id` | Auth | discharge_summary_templates, filesystem | Delete; 200, 404/500. `index.js:927-945` |
| GET `/api/discharge-summaries/patient/:patientId` | Auth | patient_discharge_summaries | Patient summaries; 200/500. `index.js:947-959` |
| POST `/api/discharge-summaries` | Auth | patient_discharge_summaries, templates | Template/patient/filled-by; 201, 400/500. `index.js:961-973` |
| PATCH `/api/discharge-summaries/:id` | Auth | patient_discharge_summaries | Annotations/status/notes; 200/404/500. `index.js:975-988` |
| PATCH `/api/discharge-summaries/:id/text` | Auth | patient_discharge_summaries | Rich text/status; 200/404/500. `index.js:990-1003` |
| PATCH `/api/discharge-summaries/:id/approve` | Auth, no doctor check | patient_discharge_summaries | `{approved_by}`; 200, 400/404/500. `index.js:1005-1020` |
| GET `/api/discharge-summaries/:id` | Auth | patient_discharge_summaries, templates | One summary; 200/404/500. `index.js:1022-1038` |
| PATCH `/api/beds/:id/discharge` | Auth | beds | Step/status/notes; 200/404/500. `index.js:1040-1062` |
| POST `/api/pharmacy/sale` | Auth | pharmacy_inventory, billing | Items/patient/total; transactional sale 200; stock/DB failure 500. `index.js:1064-1095` |
| GET `/api/pharmacy` | Auth | pharmacy_inventory | Filter/search; rows 200/500. `index.js:1097-1109` |
| POST `/api/pharmacy` | Auth | pharmacy_inventory | Medication JSON; 201/500. `index.js:1111-1122` |
| PATCH `/api/pharmacy/:id` | Auth | pharmacy_inventory | Dynamic update/status; 200 or undefined/500. `index.js:1124-1141` |
| GET `/api/billing` | Auth | billing, patients | Filter/search; rows 200/500. `index.js:1143-1159` |
| POST `/api/billing` | Auth | billing | Invoice JSON; 201/500. `index.js:1161-1176` |
| PATCH `/api/billing/:id` | Auth | billing | Dynamic update; 200 or undefined/500. `index.js:1178-1191` |
| GET `/api/reports` | Auth | aggregate clinical/business tables | KPI/report object 200/500. `index.js:1193-1246` |
| GET `/api/forms/templates` | Auth | form_templates | Category/search; rows 200/500. `index.js:1248-1261` |
| POST `/api/forms/templates` | Auth, not Admin | form_templates, filesystem | Multipart PDF/metadata; 201, 400/500. `index.js:1263-1278` |
| DELETE `/api/forms/templates/:id` | Auth | form_templates, filesystem | Delete; 200/404/500. `index.js:1280-1298` |
| GET `/api/forms/patient/:patientId` | **Public** | patient_forms, form_templates | Instances/annotations; 200/500. `index.js:1300-1314` |
| POST `/api/forms/patient` | **Public** | patient_forms | Template/patient/filled-by; 201/500. `index.js:1316-1326` |
| PATCH `/api/forms/patient/:id` | **Public** | patient_forms | Annotations/status/notes; 200/404/500. `index.js:1328-1341` |
| GET `/api/forms/patient-instance/:id` | **Public** | patient_forms, form_templates | One instance/template path; 200/404/500. `index.js:1343-1358` |
| GET `/api/dashboard/stats` | Auth | patients, doctors, beds, opd_visits, clinical_notes, billing | Dashboard aggregates 200/500. `index.js:1360-1405` |
| GET `/api/audit-logs` | Auth | audit_logs | Page/limit/action/resource filters; 200/500. `index.js:1407-1420` |
| GET `/api/health` | Public | none | `{status,time}` 200. `index.js:1422` |

### Middleware, uploads, email, initialization

- `cors()` is enabled broadly (`server/index.js:268-270`). JSON parsing and static `/uploads` are configured there; the directory is exposed without authentication at `index.js:268-272` and again at `1245`.
- Multer accepts PDFs based on client MIME type, max 50 MB; branding accepts image MIME types, max 5 MB (`index.js:39-57`, `306-326`). Filenames are sanitized but files remain directly addressable.
- Nodemailer reads SMTP settings from environment (`server/email.js:3-17`). Only the lab email route exists. Delivery is not verifiable statically.
- The PostgreSQL pool retries ten times (`server/index.js:61-84`). Startup executes import SQL and inline migrations (`index.js:96-225`), with no migration version table or transactional migration framework.
- `server/package.json:start` runs `node seed.js && node index.js`, so seeding precedes runtime schema creation on a new database. Docker runs `node index.js` directly and relies on PostgreSQL's one-time init mount.

## 5. Authentication and Authorization

`POST /api/auth/register` validates hospital/license/admin inputs, bcrypt-hashes the password at cost 12, creates the hospital/admin, and signs a JWT (`server/auth.js:52-115`). Login checks `login_id`, bcrypt comparison, and `is_active` (`auth.js:117-153`).

The JWT payload contains `id`, `role`, `hospitalId`, `name`, and `loginId`; default expiry is seven days (`auth.js:17-20`). `requireAuth` validates signature/expiry and copies the payload to `req.user`, but does not re-query the user. `requireAdmin` trusts the role claim (`auth.js:32-47`). A disabled user or changed role can therefore retain old access until token expiry.

Staff routes use `requireAdmin` and generally scope users to `req.user.hospitalId` (`auth.js:180-320`). Most clinical lists also include a hospital predicate, but related IDs in create/update bodies are not consistently ownership-checked and record-specific discharge/form routes do not consistently include tenant predicates.

### Security concerns found, without remediation

1. **Critical: public patient-form data and mutation.** Four form instance routes have no auth middleware (`server/index.js:1300-1358`).
2. **Critical: public uploaded medical documents.** Static `/uploads` bypasses JWT and hospital checks (`index.js:268-272`).
3. **Critical: incomplete discharge-summary tenant checks and approval role checks** (`index.js:947-1038`).
4. **High: broad mutation permissions.** Hospital settings, templates, billing, patients, doctors, inventory, and approvals mostly require only any JWT (`index.js:290-344`, `909-925`, `1263-1278`).
5. **High: dynamic SQL identifiers.** PATCH handlers build column names from request keys rather than explicit allowlists (`index.js:418-430`, `483-494`, `1178-1191`; `auth.js:278-286`).
6. **High: weak production JWT secret configuration** in `docker-compose.yml:10-17`; the actual value is omitted.
7. **High: unrestricted CORS** (`index.js:268-270`).
8. **Medium: no login rate limit or lockout** is visible.
9. **Medium: database error text is returned in many 500 responses.**
10. **Medium: audit coverage is incomplete;** only selected operations visibly call `logAudit` (`index.js:244-265`).
11. **Medium: lab email trusts caller-supplied recipient and display fields** (`index.js:782-823`).
12. **Medium: discharge-template creation uses `req.user.userId`, while JWT defines `id`** (`index.js:919-920`, `auth.js:17-20`).

## 6. Database Documentation

### SQL files analyzed

1. `server/schema.sql`: legacy core clinical schema; destructive drops followed by eight tables/indexes.
2. `server/schema-auth.sql`: legacy `hospitals`/`users`; destructive auth-table drops.
3. `server/schema-forms.sql`: legacy form template/instance schema.
4. `server/dscribe_hms_import.sql`: Docker/runtime import baseline with hospital IDs.
5. `dscribe_hms_backup.sql`: full backup with historical rows, sequences, schema, constraints, and indexes.

### Consolidated table reference

| Table | Purpose and columns | Keys/relationships |
|---|---|---|
| `hospitals` | `id SERIAL`, name, address/city/phone/email, `license_no`, bed count, timestamps; runtime/backup adds logo/report-branding paths. | PK; unique license; tenant parent; cascade behavior in import schema. |
| `users` | `id SERIAL`, `hospital_id`, name/email/login ID/password hash/role/department/phone/active/creator/timestamp. | PK; unique login ID; hospital cascade FK; creator self-FK. |
| `doctors` | String ID, name, department, qualification, experience, rating, status, schedule, phone, email, patient count, timestamp; runtime adds hospital/user IDs. | PK; hospital/user FKs; referenced by clinical tables. |
| `patients` | String ID, name, age, gender, blood group, department, doctor ID, phone/email, status, admission type, admitted/created times, notes; runtime adds address/uhid. | PK; doctor/patient/hospital FKs. |
| `beds` | String ID, ward, bed type/status, patient/doctor IDs, diagnosis, admitted date, alert; runtime adds discharge fields/hospital ID. | PK; patient/doctor/hospital FKs. |
| `opd_visits` | Serial ID, patient/doctor, token, department, type, symptoms/diagnosis/prescription, status, fee, dates, hospital ID. | PK; patient/doctor/hospital FKs. |
| `clinical_notes` | Serial ID, patient/doctor, note type/content, priority/status, timestamp, hospital ID. | PK; patient/doctor/hospital FKs; also stores typed nursing/blood/IP billing data. |
| `lab_tests` | Serial ID, patient, test/category/requester, status/priority/result, ordered/completed times, hospital ID; runtime adds PDF path. | PK; patient/hospital FKs. |
| `radiology_orders` | Serial ID, hospital/patient, study/modality/body part, requester/indication, priority/status, notes/PDF path, timestamps. | PK; hospital/patient FKs. |
| `pharmacy_inventory` | Serial ID, name/category, stock/unit/price/expiry/manufacturer/status, hospital ID. | PK; hospital FK; sale mutates stock in application code. |
| `billing` | String ID, patient, total/paid amounts, status/payment method/type/timestamp, hospital ID. | PK; patient/hospital FKs. |
| `form_templates` | Serial ID, name/description/category, file path/name/size/page count, active flag, creator, timestamp, hospital ID. | PK; hospital FK added at runtime. |
| `patient_forms` | Serial ID, template/patient IDs, JSONB annotations, status, filled-by, notes, timestamps. | PK; template/patient cascading FKs in legacy form schema. |
| `discharge_summary_templates` | Runtime/backup metadata, category/content, file fields, active/creator/timestamps, hospital ID. | PK; intended hospital ownership. |
| `patient_discharge_summaries` | Summary/template/patient IDs, annotations/status/filled-by/notes, rich text, approval fields/times, hospital ID. | PK; intended template/patient/hospital relationships. |
| `audit_logs` | Serial ID, hospital/user identity, action/resource, details, IP address, timestamp. | PK; hospital/user relationships where defined. |

Legacy `schema.sql` creates only doctors, patients, beds, OPD, notes, labs, pharmacy, and billing. `schema-auth.sql` adds hospitals/users; `schema-forms.sql` adds form tables. The import schema initially creates ten core tables and relies on runtime migrations for radiology, forms, discharge, audit, branding, and extra columns.

### Indexes and constraints

Legacy indexes cover patient status/admission type, bed status/ward, OPD date, note status, and lab status (`server/schema.sql:132-138`). Backup indexes/constraints are at `dscribe_hms_backup.sql:1392-1902`. Primary keys exist on all listed tables; hospital license and user login ID are unique. Most tenant relations use `ON DELETE CASCADE` in the import schema. There are no visible database checks for allowed status/role/gender values, numeric ranges, payment consistency, or composite uniqueness for hospital-scoped bed IDs, patient IDs, or tokens.

### Conflicts, migrations, seeds, and data-loss risks

- `schema.sql` drops eight tables with `CASCADE` (`schema.sql:6-14`); `schema-auth.sql` drops auth tables (`schema-auth.sql:5-6`). Running them can remove dependent data.
- `dscribe_hms_import.sql` is additive and incomplete by itself; it does not create every table used by the app.
- `index.js` reruns import SQL and inline `ADD COLUMN` migrations on every startup. There is no version table.
- `npm start` runs `seed.js` before `index.js`, so a clean database can fail before schema creation. Repeated seed runs duplicate several rows because conflict protection is incomplete.
- `seed.js` creates many records without `hospital_id`, conflicting with tenant-scoped queries and potentially producing invisible/orphaned data.
- Docker PostgreSQL initialization runs only for a new named volume; later changes depend on runtime migrations.
- The backup contains historical patient, audit, email/IP, and password-hash data and must be treated as sensitive production data.
- `.env.local`, Compose, ad hoc scripts, local seed code, and generated HTML contain credential-bearing material; values are intentionally not reproduced.

## 7. Frontend-to-Backend Mapping

| Frontend page/component | API function or direct call | Backend endpoint | Main tables |
|---|---|---|---|
| `AuthContext`, `LoginPage` | direct fetch | `/auth/me`, `/auth/login` | users, hospitals |
| `RegisterPage` | direct fetch | `/auth/register` | hospitals, users |
| `StaffManagement` | direct fetch | `/auth/staff` CRUD | users, doctors |
| `Dashboard`, `DashboardLayout` | dashboard/beds/notes/lab/OPD helpers | `/dashboard/stats`, `/beds`, `/notes`, `/lab`, `/opd` | aggregate clinical/business tables |
| Patients and patient-adjacent pages | patient helpers | `/patients` CRUD | patients, doctors |
| `Doctors` | doctor helpers | `/doctors` CRUD | doctors |
| `IPD`, `WardManagement`, `NursingStation`, `BloodBank` | bed helpers | `/beds`, `/beds/:id/discharge` | beds, patients, doctors |
| `OPD`, `Appointments`, `QueueManagement`, `CPOE` | OPD helpers | `/opd` CRUD | opd_visits, patients, doctors |
| Notes/nursing/blood/IP billing | note helpers | `/notes` CRUD | clinical_notes |
| `Laboratory` | lab helpers/upload/email | `/lab` CRUD/upload/email | lab_tests, files, SMTP |
| `Radiology` | radiology helpers/upload | `/radiology` CRUD/upload | radiology_orders, files |
| `Pharmacy`, `Inventory`, `BloodBank` | pharmacy/sale helpers | `/pharmacy`, `/pharmacy/sale` | pharmacy_inventory, billing |
| `Billing`, `IPBilling` | billing helpers | `/billing` CRUD | billing, beds |
| `Reports` | `getReports` | `/reports` | aggregate tables |
| `Settings` | hospital/branding helpers | `/hospital`, branding upload | hospitals, files |
| `FormTemplates` | direct fetch/helpers | `/forms/templates` | form_templates, files |
| `PatientForms`, `FormViewer` | form helpers | `/forms/patient*` | patient_forms, form_templates |
| Discharge pages/components | discharge helpers/direct fetch | `/discharge-templates`, `/discharge-summaries*` | discharge tables, beds |
| `AuditLog` | `getAuditLogs` | `/audit-logs` | audit_logs |

### Verified mismatches and missing flows

- `src/api.js:95` defines `sendRadiologyEmail`, but no `/api/radiology/:id/email-result` route exists.
- `src/api.js:136-139` defines discharge-template GET-by-ID and PATCH helpers, but backend exposes list/create/delete only.
- Template pages use direct `fetch`; delete handlers can remove local state without checking `response.ok` (`FormTemplates.jsx:188`, `DischargeSummaryTemplates.jsx:197`).
- Patient-form frontend calls match paths, but server-side instance routes are public.
- Blood Bank uses pharmacy and clinical notes; no dedicated blood-bank table/endpoint exists.
- Operation Theatre, TPA, Medical Records, Patient Merge, and Health Packages have no domain routes because their workflows are local/static.
- Global search stores text but has no execution path (`DashboardLayout.jsx:300`).
- Discharge template statistics use `type` while upload/filter data uses `category` (`DischargeSummaryTemplates.jsx:214`).

## 8. Feature Status Inventory

| Feature | Frontend status | Backend status | Database support | Evidence/missing parts |
|---|---|---|---|---|
| Dashboard | Implemented | Implemented | Aggregate queries | `/dashboard/stats`; silent failure path. |
| Patients | Implemented | Implemented | patients/doctors | CRUD; broad resource permissions. |
| Doctors | Implemented | Implemented | doctors | CRUD; ordinary users can mutate. |
| Beds | Implemented | Implemented | beds | Lifecycle exists; no composite tenant uniqueness. |
| OPD | Implemented | Implemented | opd_visits | Transactional create; token race risk. |
| Appointments | Partial | Primitive support | opd_visits | No separate appointment table/route. |
| Queue | Partial | Primitive support | opd_visits | Local token/queue behavior. |
| Medical records | Prototype | Missing domain API | None | Simulated requests/status. |
| Clinical notes | Implemented | Implemented | clinical_notes | Reused for other modules. |
| Laboratory | Implemented | Implemented | lab_tests | Upload/SMTP runtime dependent. |
| Radiology | Partial | Mostly implemented | radiology_orders | Email endpoint missing. |
| Pharmacy | Partial | Core implemented | pharmacy_inventory/billing | GRN/supplier/returns not persisted. |
| Inventory | Implemented | Reuses pharmacy | pharmacy_inventory | No separate inventory model. |
| Billing | Implemented | Implemented | billing | Dynamic updates and broad permissions. |
| IP billing | Partial | Primitive support | billing/beds/notes | Intermediate note JSON. |
| TPA/Insurance | Prototype | Missing | None | Mock claims only. |
| Discharge summaries | Substantial | Implemented | discharge tables | Ownership/approval gaps. |
| Hospital forms | Substantial | Implemented but public instances | form tables/files | PHI exposure risk. |
| Reports | Implemented | Implemented | Aggregates | Data consistency unverified. |
| Staff management | Implemented | Implemented/admin | users/doctors | Admin guard present. |
| Audit logs | Implemented read UI | Partial | audit_logs | Mutation coverage incomplete. |
| Blood bank | Partial | Reuses pharmacy/notes | pharmacy/clinical notes | No dedicated donor/request entities. |
| Operation theatre | Prototype | Missing | None | Mock in-memory surgeries. |
| Emergency | Partial | Patient primitive | patients | Triage/disposition not persisted. |
| Nursing | Partial | Note primitive | clinical_notes | No dedicated nursing model. |
| CPOE | Substantial | OPD/note support | opd_visits/clinical_notes | No orders/prescriptions tables. |

## 9. Known Issues and Risks

### Critical

1. Patient form instance APIs are unauthenticated and mutable (`server/index.js:1300-1358`).
2. `/uploads` exposes uploaded medical PDFs/images without authentication or hospital isolation (`server/index.js:268-272`, `1245`).
3. Discharge summaries lack consistent hospital ownership checks and approval role checks (`server/index.js:947-1038`).
4. The repository contains a historical backup with patient and credential-bearing data (`dscribe_hms_backup.sql`).

### High

1. Most non-staff mutations require only any valid JWT, including hospital settings, templates, billing, patients, doctors, inventory, and approvals.
2. JWT role/status is not revalidated after login; revoked/deactivated accounts retain access until expiry.
3. Dynamic request keys become SQL identifiers in several PATCH routes.
4. Docker Compose contains an example-style JWT secret configuration.
5. Related IDs are not consistently checked as belonging to the caller's hospital.
6. Startup/seed ordering can fail on a new database, while repeated seeds duplicate data.
7. Several seeds omit `hospital_id`, conflicting with tenant-scoped queries.

### Medium

1. Radiology email helper has no backend route; discharge-template helper methods also have no matching routes.
2. No request schema validation library, rate limit, login lockout, global 401 handling, or error boundary is visible.
3. Client MIME types are trusted for uploads; files are public after upload.
4. Generated IDs/tokens based on latest row/count can collide under concurrency.
5. Many 500 handlers return database error text.
6. Audit logging covers selected operations and suppresses failures.
7. Major modules are simulations or local state despite appearing operational.
8. The HTML setup reference conflicts with Compose/runtime behavior and recommends unsafe broad database exposure.

### Low

1. Global search has no behavior.
2. Settings contains client-only controls that do not persist.
3. Loading/error/alert patterns are inconsistent.
4. External QR/barcode services create a runtime dependency outside the app.
5. Ad hoc scripts and documentation utilities are not production request paths.

## 10. Local Setup Guide

This is the setup evidenced by repository configuration, not a claim that every path has been executed successfully.

### Required software

- Node.js/npm compatible with the installed frontend and server dependencies.
- PostgreSQL 15 or Docker Desktop with Compose.
- A browser capable of the React and PDF features.

### Native installation shape

```powershell
cd D:\clg_projects\cura\Swasthya-Sync
npm install
cd server
npm install
```

Use `server/.env.example` as the shape for a local environment. Use placeholders for all sensitive values:

```text
DB_HOST=<postgres-host>
DB_PORT=<postgres-port>
DB_NAME=<database-name>
DB_USER=<database-user>
DB_PASSWORD=<database-password>
JWT_SECRET=<long-random-secret>
PORT=5000
SMTP_HOST=<smtp-host>
SMTP_PORT=<smtp-port>
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
SMTP_FROM=<sender-address>
```

`server/env.js` loads `.env`, then `.env.local` outside production. Exact values are not included here.

### Docker shape

```powershell
docker compose up --build
```

Compose exposes the app on port 5000 and PostgreSQL on host port 5433. The import SQL is mounted as a PostgreSQL initialization script and runs only for a newly initialized database volume. The app container runs `node index.js`, not the server package's `start` script.

### Separate development startup

Terminal 1:

```powershell
cd D:\clg_projects\cura\Swasthya-Sync\server
npm run dev
```

Terminal 2:

```powershell
cd D:\clg_projects\cura\Swasthya-Sync
npm run dev
```

Root scripts are `npm run dev`, `npm run build`, and `npm run preview`. Server scripts are `npm run dev`, `npm start`, and `npm run seed`. Because `npm start` runs `seed.js` before `index.js`, setup order should be investigated before using it on a clean database. Do not run destructive legacy SQL without an approved backup and migration plan.

### Health check

```text
GET http://localhost:5000/api/health
Expected shape: {"status":"ok","time":"..."}
```

The endpoint is public. SMTP delivery, database readiness, and successful browser workflows cannot be confirmed by static inspection alone.

## 11. Team Handover Summary

The team has built a broad HMS shell with a clear React -> Express -> PostgreSQL path. Strongest implemented areas are authentication UI, patients/doctors, OPD/IPD beds, clinical notes, laboratory, core radiology, pharmacy inventory/sales, billing, reports, staff management, audit viewing, forms, and discharge editing. PDF annotation and branded report generation are substantial frontend capabilities.

Incomplete areas are Medical Records, TPA, Operation Theatre, Patient Merge, Health Packages, emergency triage, nursing-specific persistence, pharmacy GRN/returns, and parts of QR/barcode. Several modules use existing tables as workarounds instead of dedicated models.

The highest-priority investigation is authorization and isolation: protect form/file routes, enforce hospital ownership for every resource and foreign key, distinguish admin/clinical permissions, and revalidate account status/role. Next reconcile schema generations/startup order, isolate sensitive backup/credential material, and make migrations/seeds deterministic. Then evaluate UI mismatches and prototype modules.

Recommended first-read files are `src/App.jsx`, `src/context/AuthContext.jsx`, `src/api.js`, `server/auth.js`, `server/index.js`, `server/dscribe_hms_import.sql`, `server/index.js:90-225` for migrations, and the relevant page named in the mapping tables.

## Audit output and limitations

- Relevant frontend source/style files inspected: **44**.
- Relevant backend JavaScript/SQL files under `server`: **13**.
- SQL files analyzed: **5** (`server/schema.sql`, `server/schema-auth.sql`, `server/schema-forms.sql`, `server/dscribe_hms_import.sql`, `dscribe_hms_backup.sql`).
- Concrete API route handlers documented: **68** (7 auth and 61 in `server/index.js`, including health; SPA fallback excluded).
- Existing source code was not modified, deleted, refactored, or executed destructively.
- Secret values in `.env.local`, Compose, scripts, generated HTML, and backup data were not reproduced.
- Binary PDFs, DOCX files, uploaded documents, dependency folders, generated build output, and Git metadata were not inspected file-by-file. Their integration was documented where source references it.
- Static inspection cannot verify deployment success, live DB contents, SMTP delivery, third-party QR/barcode availability, or every UI event at runtime.
