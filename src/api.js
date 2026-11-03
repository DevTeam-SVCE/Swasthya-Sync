// src/api.js — Centralised API client
// All frontend pages import from here — change BASE_URL once to point to your server
export const BASE_URL = import.meta.env.PROD ? '/api' : 'http://localhost:5000/api'
export const SERVER_URL = import.meta.env.PROD ? '' : 'http://localhost:5000'

function getToken() {
  return localStorage.getItem('swasthyasync_token')
}

async function request(method, path, body = null, isMultipart = false) {
  const token = getToken()
  const opts = {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }
  if (!isMultipart) {
    opts.headers['Content-Type'] = 'application/json'
  }
  if (body) {
    opts.body = isMultipart ? body : JSON.stringify(body)
  }
  const res = await fetch(`${BASE_URL}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw Object.assign(new Error(err.error || res.statusText), { status: res.status, data: err })
  }
  return res.json()
}

// Upload a PDF file (multipart/form-data)
async function uploadPdf(path, file, fieldName = 'result_pdf') {
  const token = getToken()
  const form = new FormData()
  form.append(fieldName, file)
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Upload failed')
  }
  return res.json()
}

export const api = {
  // Patients
  getPatients: (params = {}) => request('GET', `/patients?${new URLSearchParams(params)}`),
  getPatient: (id) => request('GET', `/patients/${id}`),
  createPatient: (data) => request('POST', '/patients', data),
  updatePatient: (id, data) => request('PATCH', `/patients/${id}`, data),
  deletePatient: (id, cascade = false) => request('DELETE', `/patients/${id}${cascade ? '?cascade=1' : ''}`),
  mergePatients: (keepId, duplicateId) => request('POST', `/patients/${keepId}/merge`, { duplicate_id: duplicateId }),

  // Doctors
  getDoctors: (params = {}) => request('GET', `/doctors?${new URLSearchParams(params)}`),
  getDoctor: (id) => request('GET', `/doctors/${id}`),
  createDoctor: (data) => request('POST', '/doctors', data),
  bulkCreateDoctors: (doctors) => request('POST', '/doctors/bulk', { doctors }),
  updateDoctor: (id, data) => request('PATCH', `/doctors/${id}`, data),
  deleteDoctor: (id) => request('DELETE', `/doctors/${id}`),

  // Beds / IPD
  getBeds: (params = {}) => request('GET', `/beds?${new URLSearchParams(params)}`),
  createBed: (data) => request('POST', '/beds', data),
  updateBed: (id, data) => request('PATCH', `/beds/${id}`, data),
  assignBed: (id, data) => request('PATCH', `/beds/${id}`, data),
  updateDischargeStep: (id, data) => request('PATCH', `/beds/${id}/discharge`, data),
  releaseBed: (id) => request('PATCH', `/beds/${id}`, { status: 'available', patient_id: null, doctor_id: null, diagnosis: null, has_alert: false }),
  deleteBed: (id) => request('DELETE', `/beds/${id}`),
  updateBedDetails: (id, data) => request('PATCH', `/beds/${id}/details`, data),

  // OPD
  getOPD: (params = {}) => request('GET', `/opd?${new URLSearchParams(params)}`),
  createOPD: (data) => request('POST', '/opd', data),
  updateOPD: (id, data) => request('PATCH', `/opd/${id}`, data),
  deleteOPD: (id) => request('DELETE', `/opd/${id}`),

  // Clinical Notes
  getNotes: (params = {}) => request('GET', `/notes?${new URLSearchParams(params)}`),
  createNote: (data) => request('POST', '/notes', data),
  updateNote: (id, data) => request('PATCH', `/notes/${id}`, data),
  deleteNote: (id) => request('DELETE', `/notes/${id}`),

  // Lab
  getLab: (params = {}) => request('GET', `/lab?${new URLSearchParams(params)}`),
  createLab: (data) => request('POST', '/lab', data),
  updateLab: (id, data) => request('PATCH', `/lab/${id}`, data),
  deleteLab: (id) => request('DELETE', `/lab/${id}`),
  uploadLabPDF: (id, formData) => request('POST', `/lab/${id}/upload-result`, formData, true),
  uploadLabResult: (id, file) => uploadPdf(`/lab/${id}/upload-result`, file),
  sendLabEmail: (id, formData) => request('POST', `/lab/${id}/email-result`, formData, true),

  // Radiology
  getRadiology: (params = {}) => request('GET', `/radiology?${new URLSearchParams(params)}`),
  createRadiology: (data) => request('POST', '/radiology', data),
  updateRadiology: (id, data) => request('PATCH', `/radiology/${id}`, data),
  deleteRadiology: (id) => request('DELETE', `/radiology/${id}`),
  uploadRadiologyResult: (id, file) => uploadPdf(`/radiology/${id}/upload-result`, file),
  sendRadiologyEmail: (id, formData) => request('POST', `/radiology/${id}/email-result`, formData, true),

  // Pharmacy
  getPharmacy: (params = {}) => request('GET', `/pharmacy?${new URLSearchParams(params)}`),
  createPharmacy: (data) => request('POST', '/pharmacy', data),
  updatePharmacy: (id, data) => request('PATCH', `/pharmacy/${id}`, data),
  deletePharmacy: (id) => request('DELETE', `/pharmacy/${id}`),
  processPharmacySale: (data) => request('POST', '/pharmacy/sale', data),
  getGRNs: () => request('GET', '/grns'),
  createGRN: (data) => request('POST', '/grns', data),
  getPharmacyReturns: () => request('GET', '/pharmacy-returns'),
  createPharmacyReturn: (data) => request('POST', '/pharmacy-returns', data),
  getSuppliers: () => request('GET', '/suppliers'),
  createSupplier: (data) => request('POST', '/suppliers', data),
  updateSupplier: (id, data) => request('PATCH', `/suppliers/${id}`, data),
  deleteSupplier: (id) => request('DELETE', `/suppliers/${id}`),

  // Billing
  getBilling: (params = {}) => request('GET', `/billing?${new URLSearchParams(params)}`),
  createBilling: (data) => request('POST', '/billing', data),
  updateBilling: (id, data) => request('PATCH', `/billing/${id}`, data),
  recordPayment: (id, data) => request('POST', `/billing/${id}/payment`, data),
  cancelBilling: (id, data) => request('POST', `/billing/${id}/cancel`, data),
  deleteBilling: (id) => request('DELETE', `/billing/${id}`),

  // Dashboard
  getDashboardStats: () => request('GET', '/dashboard/stats'),
  getNavCounts: () => request('GET', '/nav-counts'),

  // Audit Logs
  getAuditLogs: (params = {}) => request('GET', `/audit-logs?${new URLSearchParams(params)}`),

  // Hospital Profile
  getHospital: () => request('GET', '/hospital'),
  updateHospital: (data) => request('PATCH', '/hospital', data),
  uploadHospitalBranding: async (type, file) => {
    const token = getToken()
    const form = new FormData()
    form.append('image', file)
    const res = await fetch(`${BASE_URL}/hospital/upload-branding/${type}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Upload failed')
    }
    return res.json()
  },
  deleteHospitalBranding: (type) => request('DELETE', `/hospital/branding/${type}`),

  // Discharge Summary Templates
  getDischargeTemplates: (params = {}) => request('GET', `/discharge-templates?${new URLSearchParams(params)}`),
  getDischargeTemplate: (id) => request('GET', `/discharge-templates/${id}`),
  createDischargeTemplate: (data) => request('POST', '/discharge-templates', data), // Note: Manual FormData in component
  updateDischargeTemplate: (id, data) => request('PATCH', `/discharge-templates/${id}`, data),
  deleteDischargeTemplate: (id) => request('DELETE', `/discharge-templates/${id}`),

  // Discharge Summary Instances (Filled versions)
  getPatientDischargeSummaries: (patientId) => request('GET', `/discharge-summaries/patient/${patientId}`),
  createDischargeSummary: (data) => request('POST', '/discharge-summaries', data),
  saveDischargeSummaryAnnotations: (id, data) => request('PATCH', `/discharge-summaries/${id}`, data),
  getDischargeSummaryInstance: (id) => request('GET', `/discharge-summaries/${id}`),
  approveDischargeSummary: (id, data) => request('PATCH', `/discharge-summaries/${id}/approve`, data),
  deleteDischargeSummary: (id) => request('DELETE', `/discharge-summaries/${id}`),

  // Reports
  getReports: () => request('GET', '/reports'),

  // Hospital Forms — Templates
  getFormTemplates: (params = {}) => request('GET', `/forms/templates?${new URLSearchParams(params)}`),
  deleteFormTemplate: (id) => request('DELETE', `/forms/templates/${id}`),
  updateFormTemplate: (id, data) => request('PATCH', `/forms/templates/${id}`, data),
  saveFormTemplateLayout: (id, data) => request('PUT', `/forms/templates/${id}/layout`, data),

  // Hospital Forms — Patient Instances
  getPatientForms: (patientId) => request('GET', `/forms/patient/${patientId}`),
  createPatientForm: (data) => request('POST', '/forms/patient', data),
  savePatientFormAnnotations: (id, data) => request('PATCH', `/forms/patient/${id}`, data),
  getPatientFormInstance: (id) => request('GET', `/forms/patient-instance/${id}`),
  deletePatientForm: (id) => request('DELETE', `/forms/patient/${id}`),

  // Patient attachments (photos / scans / PDFs)
  getPatientAttachments: (patientId) => request('GET', `/patients/${patientId}/attachments`),
  uploadPatientAttachment: (patientId, file, { name, category } = {}) => {
    const fd = new FormData()
    fd.append('file', file, file.name)
    if (name) fd.append('name', name)
    if (category) fd.append('category', category)
    return request('POST', `/patients/${patientId}/attachments`, fd, true)
  },
  updateAttachment: (id, data) => request('PATCH', `/attachments/${id}`, data),
  deleteAttachment: (id) => request('DELETE', `/attachments/${id}`),

  // Staff (admin)
  updateStaff: (id, data) => request('PATCH', `/auth/staff/${id}`, data),
  deleteStaff: (id) => request('DELETE', `/auth/staff/${id}`),

  // Operation Theatre
  getSurgeries: (params = {}) => request('GET', `/surgeries?${new URLSearchParams(params)}`),
  createSurgery: (data) => request('POST', '/surgeries', data),
  updateSurgery: (id, data) => request('PATCH', `/surgeries/${id}`, data),
  deleteSurgery: (id) => request('DELETE', `/surgeries/${id}`),

  // TPA / Insurance claims
  getClaims: () => request('GET', '/tpa-claims'),
  createClaim: (data) => request('POST', '/tpa-claims', data),
  updateClaim: (id, data) => request('PATCH', `/tpa-claims/${id}`, data),
  deleteClaim: (id) => request('DELETE', `/tpa-claims/${id}`),

  // OPD queue tokens (today)
  getQueue: () => request('GET', '/queue'),
  issueToken: (data) => request('POST', '/queue', data),
  updateToken: (id, status) => request('PATCH', `/queue/${id}`, { status }),
  deleteToken: (id) => request('DELETE', `/queue/${id}`),

  // Medical record requests
  getRecordRequests: () => request('GET', '/record-requests'),
  createRecordRequest: (data) => request('POST', '/record-requests', data),
  updateRecordRequest: (id, data) => request('PATCH', `/record-requests/${id}`, data),
  deleteRecordRequest: (id) => request('DELETE', `/record-requests/${id}`),

  // Emergency board
  getERVisits: () => request('GET', '/er-visits'),
  createERVisit: (data) => request('POST', '/er-visits', data),
  updateERVisit: (id, data) => request('PATCH', `/er-visits/${id}`, data),
  deleteERVisit: (id) => request('DELETE', `/er-visits/${id}`),

  // Health packages
  getHealthPackages: () => request('GET', '/health-packages'),
  createHealthPackage: (data) => request('POST', '/health-packages', data),
  updateHealthPackage: (id, data) => request('PATCH', `/health-packages/${id}`, data),
  deleteHealthPackage: (id) => request('DELETE', `/health-packages/${id}`),
  getPackageBookings: () => request('GET', '/package-bookings'),
  createPackageBooking: (data) => request('POST', '/package-bookings', data),
  updatePackageBooking: (id, data) => request('PATCH', `/package-bookings/${id}`, data),

  // Blood bank
  getBloodStock: () => request('GET', '/blood-stock'),
  getBloodDonations: () => request('GET', '/blood-donations'),
  createBloodDonation: (data) => request('POST', '/blood-donations', data),
  getBloodRequests: () => request('GET', '/blood-requests'),
  createBloodRequest: (data) => request('POST', '/blood-requests', data),
  updateBloodRequest: (id, data) => request('PATCH', `/blood-requests/${id}`, data),
  issueBloodRequest: (id) => request('POST', `/blood-requests/${id}/issue`),
  deleteBloodRequest: (id) => request('DELETE', `/blood-requests/${id}`),

  // Nursing charts (vitals / eMAR / nursing notes)
  getNursingRecords: (params = {}) => request('GET', `/nursing-records?${new URLSearchParams(params)}`),
  createNursingRecord: (data) => request('POST', '/nursing-records', data),
  updateNursingRecord: (id, data) => request('PATCH', `/nursing-records/${id}`, data),
  deleteNursingRecord: (id) => request('DELETE', `/nursing-records/${id}`),

  // IP billing ledger (charges / advances / insurance / package)
  getIPBilling: (params = {}) => request('GET', `/ip-billing?${new URLSearchParams(params)}`),
  createIPBillingEntry: (data) => request('POST', '/ip-billing', data),
  updateIPBillingEntry: (id, data) => request('PATCH', `/ip-billing/${id}`, data),
  deleteIPBillingEntry: (id) => request('DELETE', `/ip-billing/${id}`),
}
