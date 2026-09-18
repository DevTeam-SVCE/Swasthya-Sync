export type BedStatus = "AVAILABLE" | "OCCUPIED";
export type AdmissionStatus = "ADMITTED" | "DISCHARGED";

export interface Bed {
  id: string;
  bedNumber: string;
  ward: string;
  room: string | null;
  status: BedStatus;
  patientId: string | null;
  patientName: string | null;
  uhid: string | null;
  admissionNumber: string | null;
}

export interface IPDAdmission {
  id: string;
  admissionNumber: string;
  patientId: string;
  patientName: string;
  uhid: string;
  age: number;
  gender: string;
  bedId: string;
  bedNumber: string;
  ward: string;
  room: string | null;
  admissionDate: string;
  status: AdmissionStatus;
  dischargedAt: string | null;
}

export interface IPDOverview { total: number; available: number; occupied: number; }
