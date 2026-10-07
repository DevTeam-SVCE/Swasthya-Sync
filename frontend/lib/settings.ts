import { API_BASE_URL, ApiError, apiRequest, authHeaders } from "@/lib/api";

export type BrandingMode = "text_logo" | "image";
export type BrandingAssetKey = "primary-logo" | "accreditation-logo" | "header-image" | "footer-image";

export interface HospitalSettings {
  id: string | null;
  hospitalName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  primaryLogoUrl: string;
  accreditationLogoUrl: string;
  brandingMode: BrandingMode;
  headerImageUrl: string;
  footerImageUrl: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export type HospitalSettingsInput = Omit<HospitalSettings, "id" | "createdAt" | "updatedAt">;

export async function fetchHospitalSettings(token: string) {
  return apiRequest<{ settings: HospitalSettings }>("/api/settings", {
    headers: authHeaders(token),
  });
}

export async function saveHospitalSettings(token: string, settings: HospitalSettingsInput) {
  return apiRequest<{ settings: HospitalSettings }>("/api/settings", {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(settings),
  });
}

export async function uploadBrandingAsset(token: string, assetKey: BrandingAssetKey, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/settings/assets/${assetKey}`, {
      method: "POST",
      headers: authHeaders(token),
      body: formData,
    });
  } catch {
    throw new ApiError("Unable to connect to the Settings service. Start the local backend and try again.", 0);
  }

  const payload = (await response.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!response.ok) throw new ApiError(payload.message ?? "The image could not be uploaded.", response.status);
  return payload.url ?? "";
}

export function brandingAssetUrl(url: string) {
  return url.startsWith("/") ? new URL(url, API_BASE_URL).toString() : url;
}