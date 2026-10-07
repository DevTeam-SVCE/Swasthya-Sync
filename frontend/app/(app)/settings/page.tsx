"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Image from "next/image";
import { Building2, ImagePlus, RotateCcw, Save, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import {
  brandingAssetUrl,
  fetchHospitalSettings,
  saveHospitalSettings,
  uploadBrandingAsset,
  type BrandingAssetKey,
  type HospitalSettings,
  type HospitalSettingsInput,
} from "@/lib/settings";
import styles from "./page.module.css";

const emptySettings: HospitalSettingsInput = {
  hospitalName: "",
  tagline: "",
  address: "",
  phone: "",
  email: "",
  primaryLogoUrl: "",
  accreditationLogoUrl: "",
  brandingMode: "text_logo",
  headerImageUrl: "",
  footerImageUrl: "",
};

type AssetField = "primaryLogoUrl" | "accreditationLogoUrl" | "headerImageUrl" | "footerImageUrl";

const assetFields: { key: BrandingAssetKey; field: AssetField; label: string }[] = [
  { key: "primary-logo", field: "primaryLogoUrl", label: "Primary hospital logo" },
  { key: "accreditation-logo", field: "accreditationLogoUrl", label: "Accreditation / certification logo" },
  { key: "header-image", field: "headerImageUrl", label: "Header image" },
  { key: "footer-image", field: "footerImageUrl", label: "Footer image" },
];

function inputFromSettings(settings: HospitalSettings): HospitalSettingsInput {
  return {
    hospitalName: settings.hospitalName,
    tagline: settings.tagline,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    primaryLogoUrl: settings.primaryLogoUrl,
    accreditationLogoUrl: settings.accreditationLogoUrl,
    brandingMode: settings.brandingMode,
    headerImageUrl: settings.headerImageUrl,
    footerImageUrl: settings.footerImageUrl,
  };
}

export default function SettingsPage() {
  const { token, user } = useAuth();
  const { success, error: showError } = useToast();
  const canEdit = user?.role === "admin";
  const [draft, setDraft] = useState<HospitalSettingsInput>(emptySettings);
  const [savedDraft, setSavedDraft] = useState<HospitalSettingsInput>(emptySettings);
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<BrandingAssetKey, File>>>({});
  const [filePreviews, setFilePreviews] = useState<Partial<Record<BrandingAssetKey, string>>>({});
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    return () => Object.values(filePreviews).forEach((url) => url && URL.revokeObjectURL(url));
  }, [filePreviews]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void fetchHospitalSettings(token).then(({ settings }) => {
      if (!active) return;
      const loaded = inputFromSettings(settings);
      if (!loaded.hospitalName && user?.hospitalName) loaded.hospitalName = user.hospitalName;
      setDraft(loaded);
      setSavedDraft(loaded);
      setLoadError("");
    }).catch((cause) => {
      if (active) setLoadError(cause instanceof Error ? cause.message : "Unable to load hospital settings.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token, user?.hospitalName]);

  const updateField = <K extends keyof HospitalSettingsInput>(field: K, value: HospitalSettingsInput[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleFileChange = (asset: typeof assetFields[number], event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      event.target.value = "";
      showError("Unsupported image", "Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      event.target.value = "";
      showError("Image is too large", "Branding images must be 5 MB or smaller.");
      return;
    }
    const preview = URL.createObjectURL(file);
    setSelectedFiles((current) => ({ ...current, [asset.key]: file }));
    setFilePreviews((current) => ({ ...current, [asset.key]: preview }));
  };

  const cancelChanges = () => {
    setDraft(savedDraft);
    setSelectedFiles({});
    setFilePreviews({});
    setFileInputVersion((version) => version + 1);
    setFormError("");
  };

  const submitSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !canEdit) return;
    setSaving(true);
    setFormError("");
    try {
      const nextDraft = { ...draft };
      for (const asset of assetFields) {
        const file = selectedFiles[asset.key];
        if (file) nextDraft[asset.field] = await uploadBrandingAsset(token, asset.key, file);
      }
      const result = await saveHospitalSettings(token, nextDraft);
      const saved = inputFromSettings(result.settings);
      setDraft(saved);
      setSavedDraft(saved);
      setSelectedFiles({});
      setFilePreviews({});
      setFileInputVersion((version) => version + 1);
      success("Settings saved", "Hospital configuration has been updated.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to save hospital settings.";
      setFormError(message);
      showError("Settings were not saved", message);
    } finally {
      setSaving(false);
    }
  };

  const imageSource = (asset: typeof assetFields[number]) => {
    const preview = filePreviews[asset.key];
    const value = draft[asset.field];
    return preview || (typeof value === "string" && value ? brandingAssetUrl(value) : "");
  };

  return (
    <main className={styles.page}>
      <PageHeader
        title="Hospital Settings"
        subtitle="Manage your hospital profile and the branding used across SwasthyaSync."
        icon={<Building2 size={20} />}
        meta={<span className={canEdit ? styles.roleAdmin : styles.roleStaff}><ShieldCheck size={14} />{canEdit ? "Administrator access" : "Read-only access"}</span>}
      />

      {loadError && <div className={styles.errorBanner} role="alert">{loadError}</div>}
      {formError && <div className={styles.errorBanner} role="alert">{formError}</div>}
      {loading ? (
        <div className={styles.loading} role="status">Loading hospital settings...</div>
      ) : (
        <form className={styles.content} onSubmit={submitSettings}>
          <Card>
            <CardHeader title="Hospital Information" subtitle="Contact details displayed with your hospital profile." />
            <div className={styles.formGrid}>
              <Input label="Hospital name" value={draft.hospitalName} onChange={(event) => updateField("hospitalName", event.target.value)} readOnly={!canEdit} required />
              <Input label="Tagline" value={draft.tagline} onChange={(event) => updateField("tagline", event.target.value)} readOnly={!canEdit} />
              <Textarea label="Address" value={draft.address} onChange={(event) => updateField("address", event.target.value)} readOnly={!canEdit} rows={3} />
              <div className={styles.formGridCompact}>
                <Input label="Phone" type="tel" value={draft.phone} onChange={(event) => updateField("phone", event.target.value)} readOnly={!canEdit} />
                <Input label="Email" type="email" value={draft.email} onChange={(event) => updateField("email", event.target.value)} readOnly={!canEdit} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Branding" subtitle="Choose the identity and image assets shown in the live preview." />
            <div className={styles.brandingBody}>
              <div className={styles.assetGrid}>
                {assetFields.slice(0, 2).map((asset) => (
                  <AssetPicker key={asset.key} asset={asset} src={imageSource(asset)} canEdit={canEdit} inputVersion={fileInputVersion} onChange={handleFileChange} />
                ))}
              </div>
              <Select
                label="Branding mode"
                value={draft.brandingMode}
                onChange={(event) => updateField("brandingMode", event.target.value as HospitalSettingsInput["brandingMode"])}
                disabled={!canEdit}
                options={[{ value: "text_logo", label: "Text / Logo" }, { value: "image", label: "Image Mode" }]}
              />
              {draft.brandingMode === "image" && (
                <div className={styles.assetGrid}>
                  {assetFields.slice(2).map((asset) => (
                    <AssetPicker key={asset.key} asset={asset} src={imageSource(asset)} canEdit={canEdit} inputVersion={fileInputVersion} onChange={handleFileChange} />
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Live Preview" subtitle="Preview updates as you edit the hospital details and branding." />
            <div className={styles.previewWrap}>
              <div className={styles.previewHeader}>
                {draft.brandingMode === "image" && imageSource(assetFields[2]) && (
                  <Image className={styles.headerImage} src={imageSource(assetFields[2])} alt="Hospital header preview" width={1400} height={150} unoptimized />
                )}
                <div className={styles.previewIdentity}>
                  {imageSource(assetFields[0]) ? <Image className={styles.primaryLogo} src={imageSource(assetFields[0])} alt="Hospital logo" width={64} height={64} unoptimized /> : <div className={styles.logoFallback}><Building2 size={22} /></div>}
                  <div className={styles.identityCopy}>
                    <strong>{draft.hospitalName || "Hospital name"}</strong>
                    <span>{draft.tagline || "Hospital tagline"}</span>
                  </div>
                  {imageSource(assetFields[1]) && <Image className={styles.accreditationLogo} src={imageSource(assetFields[1])} alt="Accreditation logo" width={72} height={52} unoptimized />}
                </div>
              </div>
              <div className={styles.previewDetails}>
                <span>{draft.address || "Hospital address"}</span>
                <span>{[draft.phone, draft.email].filter(Boolean).join("  ·  ") || "Phone and email"}</span>
              </div>
              {draft.brandingMode === "image" && imageSource(assetFields[3]) && (
                <Image className={styles.footerImage} src={imageSource(assetFields[3])} alt="Hospital footer preview" width={1400} height={72} unoptimized />
              )}
            </div>
          </Card>

          {canEdit && (
            <div className={styles.actions}>
              <Button type="button" variant="secondary" leftIcon={<RotateCcw size={16} />} onClick={cancelChanges} disabled={saving}>Cancel changes</Button>
              <Button type="submit" leftIcon={<Save size={16} />} loading={saving}>Save Settings</Button>
            </div>
          )}
        </form>
      )}
    </main>
  );
}

function AssetPicker({
  asset,
  src,
  canEdit,
  inputVersion,
  onChange,
}: {
  asset: typeof assetFields[number];
  src: string;
  canEdit: boolean;
  inputVersion: number;
  onChange: (asset: typeof assetFields[number], event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={styles.assetPicker}>
      <span className={styles.assetLabel}>{asset.label}</span>
      <div className={styles.assetControl}>
        {src ? <Image src={src} alt={`${asset.label} preview`} width={120} height={80} unoptimized /> : <div className={styles.assetEmpty}><ImagePlus size={21} /><span>No image selected</span></div>}
        {canEdit && (
          <label className={styles.uploadButton}>
            <Upload size={15} />
            <span>{src ? "Replace image" : "Choose image"}</span>
            <input key={`${asset.key}-${inputVersion}`} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onChange(asset, event)} />
          </label>
        )}
      </div>
      <span className={styles.assetHint}>PNG, JPEG or WebP. Maximum 5 MB.</span>
    </div>
  );
}
