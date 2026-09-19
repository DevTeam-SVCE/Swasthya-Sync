# Swasthya-Sync Verified Project Status Audit

Audit date: 2026-09-16  
Project: `D:\clg_projects\cura\Swasthya-Sync`  
Audit type: read-only source verification with safe build, syntax, count, and health checks.

## Executive Summary

The repository contains a substantial React/Express/PostgreSQL HMS application. The strongest connected areas are patient and doctor CRUD, OPD/IPD primitives, beds, clinical notes, laboratory orders/results, radiology orders/results, pharmacy inventory/sales, billing, reports, staff management, form/template handling, and discharge editing. These are **source-connected**, but their runtime correctness still requires manual testing.

The most serious verified risks are:

1. Patient-form instance routes are public and do not apply hospital filtering.
2. Uploaded files are served through public static middleware, including medical-document paths.
3. Discharge-summary instance routes lack consistent hospital ownership checks, and backend approval is not role-restricted.
4. Most domain mutations require only a valid JWT, not a role/permission appropriate to the action.
5. Startup, seed, legacy schema, and runtime migration paths are inconsistent.
6. Frontend/backend contracts contain confirmed mismatches, including radiology email and several ignored or unchecked responses.

No source files, database records, schemas, migrations, or seed data were modified by this audit.

## 1. Scope, Evidence, and Limitations

### Files inspected

Named entry points:

- `PROJECT_DOCUMENTATION.md` as a comparison baseline.
- `src/App.jsx`, `src/api.js`, `src/context/AuthContext.jsx`.
- `server/index.js`, `server/auth.js`, `server/env.js`, `server/package.json`.
- `server/schema.sql`, `server/schema-auth.sql`, `server/schema-forms.sql`, `server/dscribe_hms_import.sql`.

Additional source/configuration inspected:

- All 44 relevant frontend `.js`, `.jsx`, and `.css` files under `src`.
- Backend route/auth/config/seed/test files under `server`, including `email.js`, `seed.js`, `seed-local.js`, `.env.example`, and package metadata.
- Root `package.json`, `vite.config.js`, `index.html`, `Dockerfile`, `docker-compose.yml`, `.gitignore`, `.dockerignore`.
- Root `dscribe_hms_backup.sql`, `dscribe_hms_schema.html`, `Working_Functionalities_of_HMS.md`, and project-tree/documentation artifacts.

### Evidence labels

- **Confirmed from source:** directly demonstrated by inspected code.
- **Confirmed through testing:** observed from a safe command or existing running service.
- **Suspected issue:** source pattern is concerning, but exploitability or runtime impact needs a controlled test.
- **Not verifiable without manual testing:** source wiring exists, but browser, database state, SMTP, files, or external services determine the result.

### Limitations

- No SQL was executed.
- No database records, schema, migration, or seed command was changed.
- No patient, billing, or other application mutation was sent.
- No email was sent and no file was uploaded.
- No authenticated browser workflow was run.
- PDFs and DOCX files were not inspected page-by-page; their source integration was inspected.
- Runtime database contents, SMTP delivery, cross-hospital exploitability, and third-party QR/barcode availability remain unverified.

## 2. Verified Architecture

```text
React/Vite SPA
  -> BrowserRouter / AuthContext / DashboardLayout
  -> src/api.js or direct fetch()
  -> Express server, /api prefix
  -> JWT middleware and route handlers
  -> PostgreSQL pool
  -> server/uploads filesystem
```

Confirmed configuration:

- Development API base: `http://localhost:5000/api` (`src/api.js:3`).
- Production API base: `/api` (`src/api.js:3`).
- Server default port: 5000 (`server/index.js:1436-1437`).
- Docker app port: 5000; PostgreSQL host mapping: 5433 to container 5432 (`docker-compose.yml:5-34`).
- Public health endpoint: `GET /api/health` (`server/index.js:1422`).
- React entry provider order: `StrictMode -> BrowserRouter -> AuthProvider -> App` (`src/main.jsx:1-10`).
- Runtime DB initialization: import SQL plus inline migrations in `server/index.js:76-225`.

Architecture status: **Confirmed from source; runtime deployment behavior needs testing.**

## 3. Frontend Feature Status Matrix

Status meanings: `Implemented` means a connected UI/API path exists; `Partially implemented` means important persistence, authorization, or domain behavior is missing; `Prototype` means the UI is present but core state is simulated/mock; `Missing` means no meaningful domain implementation; `Needs testing` is appended where static inspection cannot prove runtime success.

| Feature | Frontend | Backend API | Database | Status | Evidence and next action |
|---|---|---|---|---|---|
| Dashboard | Found | Found | Aggregate queries | Implemented; Needs testing | `/dashboard/stats` called in `src/pages/Dashboard.jsx:385-408`; failures are partly swallowed. Test with populated and empty DB. |
| Patient management | Found | Found | `patients`, `doctors` | Implemented; Needs testing | CRUD and validation in `src/pages/Patients.jsx:117-229`, `546-589`; test create/edit/delete and ownership. |
| Doctor management | Found | Found | `doctors` | Implemented; Needs testing | List/create/update UI in `src/pages/Doctors.jsx:17-27`, `123-138`; test role permissions. |
| OPD | Found | Found | `opd_visits`, patients | Implemented; Needs testing | API-backed visits/walk-ins/status in `src/pages/OPD.jsx:118-150`; test token uniqueness and persistence. |
| IPD/admissions | Found | Found | beds/patients | Implemented; Needs testing | Bed assignment, discharge, forms, summaries in `src/pages/IPD.jsx:107-161`, `363-453`; test end-to-end admission. |
| Beds | Found | Found | `beds` | Implemented; Needs testing | Create/assign/release/delete routes; test occupied deletion and cross-hospital IDs. |
| Laboratory | Found | Found | `lab_tests` | Implemented; Needs testing | Orders, result update/upload/email UI in `src/pages/Laboratory.jsx:597-619`, `754-767`; verify SMTP and file authorization. |
| Radiology | Found | Partial | `radiology_orders` | Partially implemented; Needs testing | Orders/status/upload exist in `src/pages/Radiology.jsx:703-727`; email helper has no matching backend route. |
| Pharmacy inventory | Found | Found | `pharmacy_inventory` | Implemented; Needs testing | API-backed inventory in `src/pages/Inventory.jsx:7-46`; test stock consistency. |
| Pharmacy sales | Found | Found | pharmacy/billing | Implemented; Needs testing | Sale route is transactional in `src/pages/Pharmacy.jsx:179-203`; test insufficient stock and concurrent sales. |
| Billing | Found | Found | `billing` | Implemented; Needs testing | Invoice/payment in `src/pages/Billing.jsx:72-81`, `166-181`; role and financial validation need testing. |
| Reports | Found | Found | Aggregate queries | Implemented; Needs testing | `/reports` call and error rendering in `src/pages/Reports.jsx:25-37`; verify aggregates against known rows. |
| Staff management | Found | Found/admin | `users`, doctors | Implemented; Needs testing | Admin UI and `/auth/staff` calls in `src/pages/StaffManagement.jsx:190-224`; test admin/non-admin access. |
| Audit logs | Found | Found/read | `audit_logs` | Implemented; Needs testing | List/filter/export in `src/pages/AuditLog.jsx:35-61`, `90-95`; verify which mutations generate events. |
| Patient forms | Found | Found but public instances | form tables/files | Partially implemented; Needs testing | Viewer/assignment exists in `src/pages/PatientForms.jsx:127-146`; server instance routes lack auth and tenant checks. |
| Discharge summaries | Found | Found | discharge tables | Partially implemented; Needs testing | Editor/save/approval in `src/components/DischargeEditor.jsx:223-350`; backend approval is not doctor/admin restricted. |
| Medical records | Found | Missing domain API | None identified | Prototype; Needs testing | Requests/status use local state and `setTimeout` in `src/pages/MedicalRecords.jsx:29-46`, `142-150`. |
| TPA/insurance | Found | Missing claims API | None identified | Prototype; Needs testing | Claims are local/mock in `src/pages/TPA.jsx:50-68`, `182-204`. |
| Operation theatre | Found | Missing surgery API | None identified | Prototype; Needs testing | Patients/doctors are real, surgeries are in-memory in `src/pages/OperationTheatre.jsx:91-124`. |
| Emergency/triage | Found | Patient primitive only | patients | Partially implemented; Needs testing | Patient creation persists; triage/disposition is local in `src/pages/Emergency.jsx:57-76`. |
| Nursing | Found | Notes primitive | `clinical_notes` | Partially implemented; Needs testing | Vitals/eMAR/nursing notes encoded as generic notes in `src/pages/NursingStation.jsx:25-92`. |
| QR registration | Found | Patient API only | patients | Partially implemented; Needs testing | External `qrserver.com`, no QR entity/persistence (`src/pages/QRRegistration.jsx:12`, `359-367`, `520-523`). |
| Barcode | Found | Patient API only | patients | Partially implemented; Needs testing | External barcode image and browser print; no saved barcode entity (`src/pages/BarcodePrinting.jsx:28-30`, `63-85`). |
| Health packages | Found | Missing | None | Missing; Needs testing | Hardcoded catalog and buttons without handlers (`src/pages/HealthPackages.jsx:5-22`, `60-61`). |
| Patient merge | Found | Missing merge API | None | Prototype; Needs testing | Duplicate detection is local; merge is simulated with an 800 ms delay (`src/pages/PatientMerge.jsx:92-95`). |
| Queue management | Found | OPD lookup only | `opd_visits` not queue state | Partially implemented; Needs testing | Patient/doctor lookup is API-backed, but token issuance/order/status are local (`src/pages/QueueManagement.jsx:45-65`, `259-278`). |
| Ward management | Found | Beds API only | `beds`, no ward entity | Partially implemented; Needs testing | Ward creation makes repeated bed calls and logs failures (`src/pages/WardManagement.jsx:13-21`, `166-180`). |
| CPOE | Found | OPD/notes primitives | OPD/clinical notes | Partially implemented; Needs testing | Queue/check-in/consultation persist, but orders/prescriptions are note payloads (`src/pages/CPOE.jsx:52-70`, `140-154`). |
| Settings | Found | Hospital/branding | `hospitals` | Partially implemented; Needs testing | Profile/branding persist; other settings are local (`src/pages/Settings.jsx:27-110`, `532-610`). |

Shared frontend status:

- Routing and private/admin guards are present in `src/App.jsx:42-57`, `74-139`.
- `AuthContext` stores local token/user, verifies `/auth/me`, and clears state on failed verification (`src/context/AuthContext.jsx:15-51`).
- `DashboardLayout` renders admin navigation based on client role and converts notification failures into empty results (`src/layouts/DashboardLayout.jsx:113-208`).
- `FormViewer` has PDF rendering, annotations, save/download, dirty-state handling, and UI eraser rules (`src/components/FormViewer.jsx:1008-1073`, `1199-1215`).
- `DischargeEditor` saves text by direct fetch without checking `response.ok` (`src/components/DischargeEditor.jsx:310-350`).

## 4. Backend Route Inventory

There are **68 concrete route handlers**: 7 in `server/auth.js` and 61 in `server/index.js`. The SPA fallback is excluded. `requireAuth` means any valid JWT; `requireAdmin` means the admin role claim is checked.

### Authentication and staff

| Method | Endpoint | Auth/role | Ownership/tables | Frontend caller | Functional status / concern |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | Public | Creates `hospitals`, `users` | `RegisterPage.jsx:86` | Connected; returns JWT; errors expose `e.message`. |
| POST | `/api/auth/login` | Public | Reads users/hospitals | `LoginPage.jsx:22` | Connected; six-character minimum only applies registration. |
| GET | `/api/auth/me` | Auth | User by token `id` | `AuthContext.jsx:21` | Connected; rechecks user existence but not active status before response. |
| GET | `/api/auth/staff` | Admin | `users` filtered by hospital | `StaffManagement.jsx:199` | Connected/admin-scoped. |
| POST | `/api/auth/staff` | Admin | Users hospital-scoped; doctor creation | `StaffManagement.jsx:34` | Connected; doctor ID generation uses latest global ID. |
| PATCH | `/api/auth/staff/:id` | Admin + same hospital lookup | Users/doctors | `StaffManagement.jsx:212` | Connected; SQL update keys are derived from fixed server object keys. |
| DELETE | `/api/auth/staff/:id` | Admin + same hospital predicates | Users/doctors | No current caller found | Returns success even when no user row is deleted. |

### Hospital, patients, doctors, beds, OPD, notes

| Method | Endpoint | Auth/role | Ownership/tables | Frontend caller | Functional status / concern |
|---|---|---|---|---|---|
| GET | `/api/hospital` | Auth/any | Hospital ID predicate; `hospitals` | `api.getHospital` | Connected. |
| PATCH | `/api/hospital` | Auth/any | Hospital ID predicate; allowlisted fields | `api.updateHospital` | Connected; ordinary staff can change profile. |
| POST | `/api/hospital/upload-branding/:type` | Auth/any | Hospital ID predicate; filesystem | `api.uploadHospitalBranding` | Connected; public static file exposure remains. |
| GET | `/api/patients` | Auth/any | Hospital-scoped `patients` | `getPatients` | Connected. |
| GET | `/api/patients/:id` | Auth/any | Patient hospital scope | `getPatient` | Connected. |
| POST | `/api/patients` | Auth/any | Inserts token hospital ID | `createPatient` | Connected; ID generation/collision behavior needs testing. |
| PATCH | `/api/patients/:id` | Auth/any | Hospital predicate | `updatePatient` | Connected; dynamic body keys become SQL identifiers. |
| DELETE | `/api/patients/:id` | Auth/any | Hospital predicate | `deletePatient` | Connected; destructive action available to any role. |
| GET | `/api/doctors` | Auth/any | Hospital-scoped `doctors` | `getDoctors` | Connected. |
| GET | `/api/doctors/:id` | Auth/any | Hospital predicate | `getDoctor` | Connected helper, limited caller use. |
| POST | `/api/doctors` | Auth/any | Inserts token hospital ID | `createDoctor` | Connected; any role can create doctors. |
| PATCH | `/api/doctors/:id` | Auth/any | Hospital predicate | `updateDoctor` | Connected; dynamic body keys. |
| DELETE | `/api/doctors/:id` | Auth/any | Hospital predicate | `deleteDoctor` | Connected; any role can delete doctors. |
| GET | `/api/beds` | Auth/any | Hospital-scoped `beds` | `getBeds` | Connected. |
| PATCH | `/api/beds/:id` | Auth/any | Hospital predicate; `beds` | `updateBed`, `assignBed`, `releaseBed` | Connected; referenced patient/doctor ownership is not always checked. |
| POST | `/api/beds` | Auth/any | Inserts token hospital ID | `createBed` | Connected; no ward table. |
| DELETE | `/api/beds/:id` | Auth/any | Hospital predicate; occupied guard | `deleteBed` | Connected. |
| GET | `/api/opd` | Auth/any | Hospital-scoped `opd_visits` | `getOPD` | Connected. |
| POST | `/api/opd` | Auth/any | Visit and optional hospital-scoped walk-in patient | `createOPD` | Connected/transactional; token generation needs concurrency test. |
| PATCH | `/api/opd/:id` | Auth/any | Hospital predicate | `updateOPD` | Connected; dynamic body keys. |
| GET | `/api/notes` | Auth/any | Hospital-scoped `clinical_notes` | `getNotes` | Connected. |
| POST | `/api/notes` | Auth/any | Inserts token hospital ID | `createNote` | Connected; supplied patient/doctor ownership not validated. |
| PATCH | `/api/notes/:id` | Auth/any | Hospital predicate | `updateNote` | Connected; dynamic body keys. |

### Laboratory, radiology, discharge

| Method | Endpoint | Auth/role | Ownership/tables | Frontend caller | Functional status / concern |
|---|---|---|---|---|---|
| GET | `/api/lab` | Auth/any | Hospital-scoped `lab_tests` | `getLab` | Connected. |
| POST | `/api/lab` | Auth/any | Inserts token hospital ID | `createLab` | Connected; supplied patient ownership not checked. |
| PATCH | `/api/lab/:id` | Auth/any | Hospital predicate | `updateLab` | Connected; ignores frontend `completed_at` field. |
| POST | `/api/lab/:id/upload-result` | Auth/any + PDF | Hospital predicate; `lab_tests`/file | `uploadLabPDF`, `uploadLabResult` | Connected; MIME-only validation and public files. |
| POST | `/api/lab/:id/email-result` | Auth/any + PDF | No lab lookup or `:id` ownership check | `sendLabEmail` | Connected path but weak authorization; caller controls recipient/display fields. |
| GET | `/api/radiology` | Auth/any | Hospital-scoped `radiology_orders` | `getRadiology` | Connected. |
| POST | `/api/radiology` | Auth/any | Inserts token hospital ID | `createRadiology` | Connected; supplied patient ownership not checked. |
| PATCH | `/api/radiology/:id` | Auth/any | Hospital predicate | `updateRadiology` | Connected. |
| POST | `/api/radiology/:id/upload-result` | Auth/any + PDF | Hospital predicate; file | `uploadRadiologyResult` | Connected. |
| GET | `/api/discharge-templates` | Auth/any | Hospital-scoped templates | `getDischargeTemplates` | Connected. |
| POST | `/api/discharge-templates` | Auth/any, not admin | Inserts hospital ID; file/template | Direct fetch | Connected but comment/UI intent says admin; `created_by` uses `req.user.userId` while token defines `id`. |
| DELETE | `/api/discharge-templates/:id` | Auth/any | Hospital predicate | Direct fetch/helper | Connected; ordinary users can delete; frontend ignores response status. |
| GET | `/api/discharge-summaries/patient/:patientId` | Auth/any | **No hospital predicate** | `getPatientDischargeSummaries` | Cross-tenant access risk. |
| POST | `/api/discharge-summaries` | Auth/any | **No template/patient ownership check** | `createDischargeSummary` | Cross-tenant association risk. |
| PATCH | `/api/discharge-summaries/:id` | Auth/any | **No hospital predicate** | `saveDischargeSummaryAnnotations` | Cross-tenant mutation risk. |
| PATCH | `/api/discharge-summaries/:id/text` | Auth/any | **No hospital predicate** | `DischargeEditor.jsx:317` | Direct fetch marks saved without `response.ok`. |
| PATCH | `/api/discharge-summaries/:id/approve` | Auth/any | **No hospital predicate or doctor check** | `approveDischargeSummary` | UI restriction is not server enforcement. |
| GET | `/api/discharge-summaries/:id` | Auth/any | **No hospital predicate** | `getDischargeSummaryInstance` | Cross-tenant read risk. |
| PATCH | `/api/beds/:id/discharge` | Auth/any | Hospital predicate; beds | `updateDischargeStep` | Connected. |

### Pharmacy, billing, reporting, forms, operational

| Method | Endpoint | Auth/role | Ownership/tables | Frontend caller | Functional status / concern |
|---|---|---|---|---|---|
| POST | `/api/pharmacy/sale` | Auth/any | Stock/billing hospital scope; supplied patient needs validation | `processPharmacySale` | Connected/transactional; any role can sell/alter stock. |
| GET | `/api/pharmacy` | Auth/any | Hospital-scoped inventory | `getPharmacy` | Connected. |
| POST | `/api/pharmacy` | Auth/any | Inserts token hospital ID | `createPharmacy` | Connected. |
| PATCH | `/api/pharmacy/:id` | Auth/any | Hospital predicate | `updatePharmacy` | Connected; dynamic body keys. |
| GET | `/api/billing` | Auth/any | Hospital-scoped billing | `getBilling` | Connected. |
| POST | `/api/billing` | Auth/any | Inserts token hospital ID | `createBilling` | Connected; supplied patient ownership needs validation. |
| PATCH | `/api/billing/:id` | Auth/any | Hospital predicate | `updateBilling` | Connected; dynamic body keys. |
| GET | `/api/reports` | Auth/any | Aggregate queries hospital-scoped | `getReports` | Connected; verify results against known data. |
| GET | `/api/forms/templates` | Auth/any | Hospital-scoped templates | `getFormTemplates` | Connected. |
| POST | `/api/forms/templates` | Auth/any, not admin | Inserts hospital ID; file | Direct fetch | Connected but ordinary users can upload; MIME-only validation. |
| DELETE | `/api/forms/templates/:id` | Auth/any | Hospital predicate; file | Direct fetch | Connected; frontend ignores response status. |
| GET | `/api/forms/patient/:patientId` | **Public** | **No hospital predicate**; patient forms/templates | `getPatientForms` | Critical exposure/mutation boundary. |
| POST | `/api/forms/patient` | **Public** | **No hospital predicate** | `createPatientForm` | Critical unauthorized creation/association. |
| PATCH | `/api/forms/patient/:id` | **Public** | **No hospital predicate** | `savePatientFormAnnotations` | Critical unauthorized modification. |
| GET | `/api/forms/patient-instance/:id` | **Public** | **No hospital predicate** | `getPatientFormInstance` | Critical unauthorized read. |
| GET | `/api/dashboard/stats` | Auth/any | Aggregate hospital queries | `getDashboardStats` | Connected; runtime data required. |
| GET | `/api/audit-logs` | Auth/any | Hospital-scoped audit logs | `getAuditLogs` | Connected read path; event generation incomplete. |
| GET | `/api/health` | Public | None | Manual check | Confirmed through testing: HTTP 200. |
| GET | `/uploads/*` | Public static | Filesystem | `FormViewer` direct fetch | Confirmed public file exposure. |

## 5. Frontend/API Mismatches

### Confirmed mismatches

1. **Radiology email route missing.** `src/api.js:99` calls `/radiology/:id/email-result`, and `src/pages/Radiology.jsx:703` invokes it. `server/index.js` defines radiology upload at `871-892` but no radiology email handler. This request cannot reach a matching backend route.
2. **Discharge-template helper routes missing.** `src/api.js:136-139` defines GET-by-ID and PATCH helpers, but backend defines list/create/delete only (`server/index.js:894-945`).
3. **Lab update field ignored.** Frontend sends `completed_at` (`src/pages/Laboratory.jsx:612`), while backend reads only `status,result_notes` (`server/index.js:754-765`). Completion time is server-derived; the client field is silently ignored.
4. **Admin intent differs from backend authorization.** Form and discharge template uploads use `requireAuth`, not `requireAdmin` (`server/index.js:909-925`, `1263-1278`).
5. **Approval intent differs from backend authorization.** UI controls approval based on role in `DischargeEditor`, but `/approve` uses only `requireAuth` (`server/index.js:1005-1020`).
6. **JWT creator field mismatch.** JWT payload defines `id` (`server/auth.js:17-20`), while discharge-template creation uses `req.user.userId` (`server/index.js:919-920`); `created_by` will normally be null.
7. **Unchecked direct responses.** Discharge text save (`DischargeEditor.jsx:317`) and template deletes (`FormTemplates.jsx:188`, `DischargeSummaryTemplates.jsx:197`) do not reliably check `response.ok` before changing UI state.
8. **Direct PDF fetch bypasses shared client.** `FormViewer.jsx:1329` fetches `/uploads/...` directly, so it does not get centralized auth/error behavior; the route itself is public.

### Backend routes without current frontend caller found

- `DELETE /api/auth/staff/:id` has no current caller found in the inspected frontend; staff UI appears to use toggle rather than permanent delete.
- `GET /api/doctors/:id` and `DELETE /api/doctors/:id` helpers/routes exist, but no major page caller was identified in the scan.
- `DELETE /api/patients/:id` exists, but no major page caller was identified in the scan.
- Several routes may be used by direct fetch or indirect components; absence in the broad scan is not proof of dead code.

## 6. Authentication and Authorization Findings

### Verified flow

- Registration validates required name/password fields, requires six-character passwords, hashes with bcrypt cost 12, creates hospital/admin in a transaction, and signs a token (`server/auth.js:52-115`).
- Login reads the user/hospital, checks `is_active`, compares bcrypt, and signs a token (`server/auth.js:117-153`).
- JWT payload fields are `id`, `role`, `hospitalId`, `name`, `loginId`; expiry defaults to `process.env.JWT_EXPIRY || '7d'` (`server/auth.js:17-20`).
- `requireAuth` checks bearer format and JWT signature/expiry only (`server/auth.js:31-40`).
- `requireAdmin` checks only the role claim in the verified token (`server/auth.js:42-47`).
- `/auth/me` re-queries the user by `req.user.id`, but does not reject an inactive user after token validation (`server/auth.js:155-178`).
- Frontend stores token/user in local storage, verifies on mount, and removes both on failed `/auth/me` (`src/context/AuthContext.jsx:10-51`).
- Logout is client-side local-storage/state clearing; there is no server-side token revocation route (`src/context/AuthContext.jsx:37-43`).

### Authentication/authorization issue table

| ID | Severity | Finding | Evidence and impact | Confidence | Safe recommendation | Manual test? |
|---|---|---|---|---|---|---|
| SEC-001 | Critical | Public patient-form reads/writes | `server/index.js:1300-1358` has no `requireAuth` or hospital predicate; PHI can be read/changed by unauthenticated callers. | Confirmed from source | Require auth, join through tenant-owned patient/template, and authorize role/action. | Yes, use isolated test data only. |
| SEC-002 | Critical | Public static uploads | `express.static` at `server/index.js:268-272`, `1245` exposes medical PDFs/images without token or tenant check. | Confirmed from source | Replace with authorized download handler or private storage; avoid public paths. | Yes, with non-sensitive fixture. |
| SEC-003 | High | Discharge summaries lack tenant/role checks | `server/index.js:947-1038` does not consistently constrain by hospital; approval uses any JWT. | Confirmed from source | Verify patient/template/summary ownership in every query and enforce approver role server-side. | Yes, with two test hospitals. |
| SEC-004 | High | Broad permissions | Most mutations use `requireAuth`; any authenticated role can mutate clinical, billing, pharmacy, doctor, template, and approval data. | Confirmed from source | Define server-side permissions by role and resource/action. | Yes, staff-role matrix. |
| SEC-005 | High | Related-record ownership not verified | Notes/lab/radiology/discharge/billing/forms accept caller IDs without checking referenced hospital ownership (`index.js:671`, `742`, `843`, `961`, `1161`, `1316`). | Confirmed from source; exploit impact needs DB test | Validate all foreign IDs through same-hospital joins or composite constraints. | Yes, isolated two-hospital test. |
| SEC-006 | High | Dynamic SQL identifiers | PATCH handlers interpolate request keys into SQL (`index.js:418`, `483`, `632`, `694`, `1124`, `1178`). Values are parameterized, identifiers are not. | Confirmed unsafe pattern; exploitability suspected | Use explicit field allowlists and fixed SQL. | Controlled integration test only. |
| SEC-007 | High | JWT status/role not continuously revalidated | `requireAuth` verifies token only; `/me` does not reject inactive account after query. Old tokens remain usable until expiry. | Confirmed from source | Revalidate active status/role or implement revocation/session versioning and short expiry. | Yes, deactivate user then retry. |
| SEC-008 | High | Weak/exposed deployment secrets | Compose and local/generated artifacts contain credential-bearing configuration; exact values intentionally omitted. | Confirmed from source | Rotate all exposed values, use secret storage, remove credentials from repository artifacts. | Deployment/security review. |
| SEC-009 | High | Lab email trusts caller and ignores order ID | `server/index.js:782-823` does not load/authorize `:id`, accepts recipient/display fields, and sends uploaded content. | Confirmed from source | Load authorized lab row/patient and derive recipient/content server-side; validate email. | Yes, use sink mailbox only. |
| SEC-010 | Medium | Unrestricted CORS | `app.use(cors())` at `server/index.js:268` has no allowlist. Bearer auth reduces CSRF risk but broadens cross-origin token use. | Confirmed from source | Restrict allowed origins and review deployment headers. | Browser-origin test. |
| SEC-011 | Medium | MIME-only upload validation | Multer checks `file.mimetype === 'application/pdf'` (`server/index.js:39-57`), not file signature/content or malware. | Confirmed from source | Validate signatures, scan files, use private storage and safe processing. | Non-sensitive fixtures. |
| SEC-012 | Medium | Errors may disclose internals | Many handlers return `e.message`, e.g. `auth.js:148`, `index.js:287`. | Confirmed from source | Return generic production errors; log details server-side. | Trigger safe validation/database error. |
| SEC-013 | Medium | No rate limiting/MFA/lockout | Public auth handlers at `auth.js:52`, `117` have no visible throttling. | Confirmed from source | Add rate limiting, lockout policy, stronger password policy, and consider MFA. | Load/security test in non-production. |
| SEC-014 | Low | Registration transaction early return | Duplicate-license branch returns 409 after `BEGIN` without explicit rollback (`auth.js:64-68`). | Confirmed source bug; pool impact needs runtime test | Roll back before returning or centralize transaction cleanup. | Pool/transaction test. |
| SEC-015 | Low | Staff delete reports success on no match | Delete route does not inspect affected rows (`auth.js:308-320`). | Confirmed from source | Return 404 when no same-hospital staff row was deleted. | API test with nonexistent ID. |
| SEC-016 | Informational | Client-only logout | `AuthContext.logout` clears local state but does not revoke server token. | Confirmed design | Add revocation/session invalidation if threat model requires it. | Token-after-logout test. |

## 7. Database Verification

### Schema generations

| File | Verified behavior |
|---|---|
| `server/schema.sql` | Destructively drops eight core tables with `CASCADE` at lines 6-14, then creates non-tenant doctors/patients/beds/OPD/notes/lab/pharmacy/billing tables and indexes at 17-138. |
| `server/schema-auth.sql` | Destructively drops `users` and `hospitals` with `CASCADE` at lines 5-6; creates auth tables and indexes. |
| `server/schema-forms.sql` | Adds non-tenant form templates and patient forms with cascading template/patient FKs and indexes. |
| `server/dscribe_hms_import.sql` | Uses `CREATE TABLE IF NOT EXISTS` for hospitals/users and ten core tenant-aware tables; child FKs use globally keyed patient/doctor IDs rather than composite hospital ownership. |
| `server/index.js:94-225` | Executes import SQL every startup, then applies repeated `ADD COLUMN IF NOT EXISTS`/exception-suppressed migrations and creates radiology, form, discharge, and audit tables. No migration version table exists. |
| `dscribe_hms_backup.sql` | Contains a broader schema plus historical rows, sequences, indexes, password hashes, patient/clinical/audit/contact data. Treat as sensitive. |

### Current tables and support

The verified runtime model includes:

- `hospitals`: serial PK, identity/contact/license data, later branding/report fields; unique `license_no`.
- `users`: serial PK, hospital FK, identity/login/password hash/role/status, self-referencing creator FK; unique `login_id`.
- `doctors`: string PK, optional hospital/user links, profile/schedule/status fields.
- `patients`: string PK, optional hospital link, clinical/contact/admission fields, doctor reference.
- `beds`: string PK, optional hospital link, ward/status, patient/doctor, diagnosis/admission/alert and runtime discharge fields.
- `opd_visits`: serial PK, hospital/patient/doctor references, token, visit/clinical/payment fields.
- `clinical_notes`: serial PK, hospital/patient/doctor references, typed content, status/priority.
- `lab_tests`: serial PK, hospital/patient references, test/result/status fields and runtime PDF path.
- `radiology_orders`: runtime serial PK, hospital/patient references, study/result/status/PDF fields.
- `pharmacy_inventory`: serial PK, hospital link, stock/product fields.
- `billing`: string PK, hospital/patient links, amounts/status/payment fields.
- `form_templates`, `patient_forms`: template metadata/files and JSONB annotation instances.
- `discharge_summary_templates`, `patient_discharge_summaries`: template/instance content, annotations, approval and rich text fields.
- `audit_logs`: serial PK, hospital/user/action/resource/details/IP/timestamp.

### Verified design problems

- Tenant columns are added to many legacy tables as nullable columns, without backfill or `NOT NULL` enforcement (`server/index.js:94-125`).
- Patient/doctor foreign keys are not composite `(hospital_id, id)` constraints in `server/dscribe_hms_import.sql:78` and related definitions. Application queries frequently scope the main row but not every referenced row.
- Legacy schemas are materially incompatible with the tenant-aware runtime schema. Running `schema.sql` or `schema-auth.sql` can destroy dependent data.
- Runtime migrations are repeated and unversioned. Partial failures are logged, but the process can continue after DB initialization reports an error (`server/index.js:80-117`).
- Docker init SQL runs only on first initialization of an empty named volume (`docker-compose.yml:35-38`); later schema changes depend on ad hoc startup migrations.
- `server/package.json:9` runs `node seed.js && node index.js`, so local `npm start` seeds before runtime schema initialization. Docker runs `node index.js` directly (`Dockerfile:39`), producing different setup behavior.
- `seed.js` inserts sample rows without consistently supplying `hospital_id` and has non-idempotent sections. These rows may be invisible to tenant-scoped queries or duplicate on repeated runs.
- No database-level checks enforce status/role/gender/payment domains, numeric relationships, or hospital-scoped uniqueness for identifiers/tokens.
- Backup and generated documentation contain sensitive historical/credential-bearing data; exact values were not reproduced.

## 8. Security and Operational Review

### File uploads and documents

Multer stores uploaded PDFs under `server/uploads/forms`, limits PDFs to 50 MB, and trusts the client MIME type (`server/index.js:39-57`). Branding has a separate image upload path/limit. `/uploads` is public static content. The same broad filesystem exposure is therefore a confirmed risk for form, lab, radiology, discharge, and branding files. Safe remediation is authorization-aware downloads/private storage, signature validation, scanning, and non-guessable access control; no remediation was applied.

### Passwords and tokens

Passwords are bcrypt-hashed with cost 12. JWT expiry defaults to seven days and is configurable through an environment variable. There is no visible refresh/revocation mechanism, rate limiting, MFA, or account lockout. `requireAuth` trusts a valid token after signature/expiry verification; it does not query active status or current role.

### SQL and error handling

Most values use PostgreSQL parameters. Dynamic update handlers interpolate field names from request bodies. This is a confirmed unsafe construction; actual exploitability should be tested only in an isolated environment. Many errors return raw `e.message` to clients, which can disclose database or filesystem details.

### Email and CORS

Nodemailer uses environment SMTP configuration. Lab email accepts caller-controlled recipient and HTML display fields and does not authorize the referenced lab ID. CORS is enabled with default `cors()` behavior and no visible origin allowlist.

## 9. Safe Validation Performed

| Command/check | Result |
|---|---|
| `npm run build` from `D:\clg_projects\cura\Swasthya-Sync` | **Passed.** Vite transformed 2,920 modules and built `dist`; warning: several minified chunks exceed 500 kB. |
| `node --check .\server\index.js` | **Passed** with no output. No server start or DB connection performed. |
| `node --check .\server\auth.js` | **Passed** with no output. |
| Static route/helper count | **Passed:** 68 route handlers, 70 API helper properties, 44 frontend source/style files, 13 backend JS/CJS/SQL files. |
| Existing `GET http://localhost:5000/api/health` | **Confirmed through testing:** HTTP 200; response had `status: "ok"` and a timestamp. This used the already-running listener and did not mutate data. |
| Authenticated read-only API checks | **Not run** because credentials and live data must not be used without an approved test plan. |
| Browser feature workflows | **Not run**; requires manual test fixtures and browser validation. |
| SQL execution/migration/seed | **Not run**; prohibited for this audit. |

### Command that failed

The first build, syntax, and count attempts were run from `D:\clg_projects\cura` instead of the project root and failed with missing `package.json`/source paths. They were rerun from `D:\clg_projects\cura\Swasthya-Sync` and passed. No application failure is inferred from the initial path error.

## 10. Manual Testing Checklist

All rows below are **Not tested — requires manual validation** unless otherwise stated. Use disposable test hospitals, synthetic patients, and a sink mailbox. Do not use production records.

| Test | Steps | Expected result | Actual/status | Notes |
|---|---|---|---|---|
| Admin login | Open login; submit valid admin credentials | Dashboard opens; `/auth/me` succeeds | Not tested | Use test admin only. |
| Staff login | Login as nurse/receptionist/lab/pharmacy role | Correct dashboard and permitted modules appear | Not tested | Verify server enforcement, not just hidden UI. |
| Invalid login | Submit wrong password/missing fields | Safe error; no token stored | Not tested | Check no sensitive error detail. |
| Registration | Register disposable hospital/admin | Transaction creates hospital/user; token returned | Not tested | Confirm duplicate license behavior. |
| Token expiry/status | Deactivate test user or use expired token; call API | Access denied and client logs out | Not tested | Current source suggests old tokens persist. |
| Patient creation | Create synthetic patient, reload, edit, delete | Record persists and correct hospital sees it | Not tested | Verify validation and ID uniqueness. |
| Doctor creation | Create doctor and link to staff if applicable | Doctor appears only in same hospital | Not tested | Test non-admin direct API permission. |
| OPD registration | Create visit/walk-in; update status | Visit persists and appears in queue/OPD | Not tested | Test repeated/concurrent tokens. |
| Queue | Generate tokens; refresh second browser | Same persistent queue/order is shown | Not tested | Source indicates local queue state. |
| IPD admission | Assign synthetic patient to available bed | Bed/patient relation persists after reload | Not tested | Test wrong-hospital patient/doctor IDs. |
| Bed allocation | Assign, discharge, release occupied bed | Occupied guard and discharge sequence behave correctly | Not tested | Verify unauthorized role cannot mutate. |
| Laboratory | Create order, update result, upload fixture PDF | Result/path/status persist; file access is authorized | Not tested | Do not send real email. |
| Radiology | Create order, upload result, try email UI | Upload works; email behavior is explicit and supported | Not tested | Expected mismatch for email route. |
| Pharmacy inventory | Add/edit stock, inspect status | Stock and status persist correctly | Not tested | Test negative/concurrent stock. |
| Pharmacy sale | Sell available and insufficient stock | Transaction decrements once or rejects safely | Not tested | Verify billing relation. |
| Billing | Create invoice, update payment, reload | Amount/status persist and are scoped | Not tested | Test role and numeric validation. |
| Reports | Compare report totals with known synthetic records | Aggregates match source rows | Not tested | Check empty DB behavior. |
| Patient forms | Assign/annotate/download form | Only authorized hospital users can access file/data | Not tested | Critical two-hospital test. |
| Discharge | Create/edit/approve summary by allowed roles | Backend enforces ownership and approval role | Not tested | UI restriction alone is insufficient. |
| Staff permissions | Call mutation routes with non-admin JWT | Forbidden where policy requires | Not tested | Source currently permits many mutations. |
| Cross-hospital access | Use IDs from test hospital B with hospital A token | All reads/writes reject | Not tested | Critical tenant test. |
| Upload validation | Submit valid fixture and renamed non-PDF | Signature/type/size policy behaves safely | Not tested | No sensitive files. |
| Logout | Logout then call API with retained token | Defined revocation behavior occurs | Not tested | Source only clears browser storage. |
| Health | Request `/api/health` | 200 status payload | **Passed** | Safe public request executed. |
| Health when DB unavailable | Controlled non-production outage | Readiness behavior is explicit | Not tested | Do not disrupt current environment. |

## 11. Recommended Development Order

### Phase 1 — Safety and critical fixes

Criteria: PHI exposure, cross-hospital modification, authentication bypass, and credential exposure take priority over feature breadth.

1. Protect all patient-form instance routes and enforce hospital ownership.
2. Replace public `/uploads` with authorized file delivery/private storage.
3. Add tenant ownership checks for discharge summaries and every caller-supplied patient/doctor/template/reference ID.
4. Add server-side role/permission middleware for approvals, templates, billing, pharmacy, patient/doctor deletion, clinical updates, and uploads.
5. Rotate all exposed DB/JWT/SMTP credentials; remove credential material from backup/generated docs/scripts and use deployment secret storage.
6. Revalidate user active status/role or implement session revocation; add login rate limiting and stronger account controls.
7. Replace dynamic SQL identifiers with explicit field allowlists and fixed statements.

### Phase 2 — Core workflow completion

Criteria: close user-visible flows that currently fail or silently simulate state.

1. Add the radiology email endpoint or remove the frontend call until supported.
2. Resolve discharge-template helper/route mismatch and fix creator identity field.
3. Implement persistent queue/token state.
4. Add dedicated models/APIs for medical records, emergency triage, operation theatre, TPA claims, patient merge, and health packages, or label those modules clearly as prototypes.
5. Complete pharmacy GRN/supplier/return workflows and dedicated blood-bank behavior if required.
6. Make direct fetch callers check HTTP status and use consistent error handling.

### Phase 3 — Data and reliability

Criteria: prevent silent corruption and make environments reproducible.

1. Retire destructive legacy schemas from normal setup.
2. Adopt versioned, transactional migrations with a migration table.
3. Define a deterministic order: schema/migrations first, explicit development seed second, no automatic production seeding.
4. Backfill and enforce tenant columns, composite ownership constraints, non-null rules, domain checks, and scoped uniqueness where required.
5. Make seeds idempotent and supply hospital IDs.
6. Add route/API contract tests, tenant-isolation tests, permission tests, upload tests, and report fixture tests.
7. Return generic production errors and log diagnostic details server-side.

### Phase 4 — UI and user experience

Criteria: reduce operational ambiguity after safety and data correctness are addressed.

1. Add visible error states and retry paths where errors are currently swallowed.
2. Add global request/401 handling and an error boundary.
3. Align loading/empty/validation behavior across pages.
4. Replace external QR/barcode dependencies or document their availability/SLA.
5. Finish settings persistence and global search only after backend contracts exist.
6. Address bundle-size warning with code splitting where it improves deployment performance.

### Phase 5 — Optional enhancements

Criteria: features with no current persisted domain model come after core safety and workflows.

1. Dedicated blood-bank inventory/donor/request models.
2. Dedicated nursing observations/eMAR model.
3. Dedicated prescriptions/CPOE orders.
4. Package booking and insurance integrations.
5. Advanced notifications, backup controls, MFA, and audit analytics.

## 12. Questions for the Development Team

1. Which schema path is authoritative for local, staging, and production: import SQL, backup restore, or legacy scripts?
2. Are the existing backup, `.env.local`, generated HTML, Compose values, and seed credentials already rotated and removed from shared repositories?
3. Which roles should be permitted to mutate patients, beds, doctors, billing, pharmacy, templates, and discharge approvals?
4. Should uploaded documents ever be publicly addressable, or must every download require hospital/user authorization?
5. Are patient/doctor IDs globally unique by design, or should all identifiers be hospital-scoped?
6. Which prototype modules are committed product scope: queue, medical records, TPA, OT, emergency, health packages, patient merge, and blood bank?
7. Is radiology email intended to be supported, and what should the authoritative recipient/source record be?
8. Should logout revoke existing JWTs, or is seven-day bearer-token validity acceptable for the threat model?
9. What is the approved non-production database and test-account policy for two-hospital authorization tests?
10. Which runtime/browser/SMTP/database environments must be supported before a feature is called production-ready?

## Final Audit Summary

```text
Total modules inspected: 29 feature/shared frontend modules, plus route/auth/config/database surfaces
Total backend routes inspected: 68 concrete route handlers
Total frontend API functions inspected: 70 helper properties in src/api.js, plus direct fetch callers
Confirmed issues: 16 tracked findings (SEC-001 through SEC-016), including critical/high security and data-integrity issues
Suspected issues: 3 explicitly marked areas requiring controlled runtime/schema confirmation
API mismatches: 8 confirmed frontend/backend contract or response-handling mismatches
Features requiring manual testing: All runtime workflows; health endpoint was tested successfully
Highest-priority next steps: Protect PHI/files, enforce tenant and role authorization, rotate secrets, replace dynamic SQL, reconcile migrations/seeds, then complete missing workflows
```

Created artifact: `VERIFIED_PROJECT_STATUS.md`. Existing source files and database records were not modified.
