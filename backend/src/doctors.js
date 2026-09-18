const DOCTORS = [
  { id: "doc-001", name: "Dr. Sneha Patel", department: "Cardiology" },
  { id: "doc-002", name: "Dr. Rahul Gupta", department: "Paediatrics" },
  { id: "doc-003", name: "Dr. Kavita Nair", department: "Gynaecology" },
  { id: "doc-004", name: "Dr. Amit Joshi", department: "Neurology" },
  { id: "doc-005", name: "Dr. Priya Singh", department: "General Medicine" },
  { id: "doc-006", name: "Dr. Ravi Mehta", department: "Orthopaedics" },
  { id: "doc-007", name: "Dr. Nisha Roy", department: "Dermatology" },
  { id: "doc-008", name: "Dr. Arvind Menon", department: "General Surgery" },
  { id: "doc-009", name: "Dr. Meera Iyer", department: "Nephrology" },
  { id: "doc-010", name: "Dr. Vikram Shah", department: "Emergency" },
  { id: "doc-011", name: "Dr. Ananya Bose", department: "Pulmonology" },
  { id: "doc-012", name: "Dr. Sameer Khan", department: "Oncology" },
];

function findDoctor(id) {
  return DOCTORS.find((doctor) => doctor.id === id);
}

module.exports = { DOCTORS, findDoctor };