# ============================================
# CURA PDF ORGANIZER
# ============================================

$source = Get-Location

# ============================================
# CATEGORY RULES
# ============================================

$categories = @{
    
    "Admission" = @(
        "Admission Slip",
        "General Consent for Admission",
        "Registration forms"
    )

    "Assessment" = @(
        "Initial Assessment",
        "Initial assessment",
        "Pain assessment",
        "Nutritional Assessment",
        "Daycare Initial Assessment",
        "OBG - Nursing History and Initial Assessment",
        "OBG Doctor Initial Assessment",
        "Peadiartic doctor assessment",
        "WARD Doctor Initial Assessment",
        "WARD Nurse Initial Assessment"
    )

    "Consent" = @{
        
        "Anesthesia" = @(
            "Anesthesia consent"
        )

        "Blood Transfusion" = @(
            "Blood Transfusion consent",
            "Consent Form Blood Transfusion"
        )

        "Central Line" = @(
            "Consent for central line",
            "Consent for Central Line"
        )

        "Conscious Sedation" = @(
            "Consent For Conscious Sedation"
        )

        "Coronary Angiogram" = @(
            "Consent for Coronary Angiogram",
            "Consent form for coronary Angiogram"
        )

        "Coronary Angioplasty" = @(
            "Consent for Coronary Angioplasty",
            "Consent form for coronary Angioplasty"
        )

        "CT" = @(
            "Consent for CT"
        )

        "Dialysis" = @(
            "Consent for Hemodialysis",
            "Consent for Intermittent dialysis",
            "consent forms haemodialysis"
        )

        "Dialyser Reprocessing" = @(
            "Dialyser reprocessing consent"
        )

        "Endoscopy" = @(
            "Consent for Endoscopy",
            "Consent Form GI Endoscopy"
        )

        "High Risk" = @(
            "Informed consent for High risk"
        )

        "Intubation & Ventilation" = @(
            "Consent for Intubation and Mechanical Ventilation"
        )

        "Procedure & Treatment" = @(
            "Consent for Procedure and Treatment",
            "Consent form for Proceudre and Treatment"
        )

        "Surgery & Major Procedures" = @(
            "Consent for Surgery & Major Procedures",
            "Consent Form Surgery and major Procedures",
            "Major & Minor procedure consent"
        )

        "Daycare Procedure" = @(
            "Informed consent for Daycare procedure"
        )

        "Decannulation" = @(
            "Decannulation Consent form"
        )

        "Implant" = @(
            "implant consent"
        )

        "Audio Visual" = @(
            "MDT & Patient Consent to Audio Visual"
        )

        "Tubectomy" = @(
            "Tubectomy Consent"
        )

        "Restraint" = @(
            "Restraint Consent"
        )
    }

    "Monitoring" = @(
        "monitoring sheet",
        "Monitoring for Day care patients",
        "Endoscopy monitoring form",
        "INTAKE & OUT PUT CHART",
        "Restraint Monitoring form",
        "Sedation monitoring record",
        "Transfusion Monitoring Chart",
        "RASS Scoring"
    )

    "Medication" = @(
        "MEDICATION ADMINISTRATION CHART",
        "Medication error reporting form"
    )

    "Nursing" = @(
        "NURSING reassessment",
        "Nursing care Bundle",
        "Doctors Handover",
        "Doctors Progress Notes",
        "WARD Nurse Initial Assessment"
    )

    "Surgery & OT" = @(
        "OT handover form",
        "Pre anesthesia evaluation",
        "Pre Operative Checklist",
        "Non OT - Procedure Safety Checklist"
    )

    "Transfer & Referral" = @(
        "transfer in form",
        "Transfer of patient Interdepartment",
        "Ambulance transfer out",
        "Checklist for Safe transfer",
        "referral form"
    )

    "Infection Control" = @(
        "HEALTHCARE-ASSOCIATED INFECTIONS",
        "SEPSIS CARE BUNDLE"
    )

    "Discharge & End of Life" = @(
        "Doctor's Discharge_Planning",
        "End of Life Care form"
    )

    "Other" = @()
}

# ============================================
# CREATE MAIN FOLDERS
# ============================================

foreach ($category in $categories.Keys) {

    $mainFolder = Join-Path $source $category

    if (-not (Test-Path $mainFolder)) {
        New-Item -ItemType Directory -Path $mainFolder | Out-Null
    }

    # Create Consent subfolders
    if ($category -eq "Consent") {

        foreach ($subCategory in $categories["Consent"].Keys) {

            $subFolder = Join-Path $mainFolder $subCategory

            if (-not (Test-Path $subFolder)) {
                New-Item -ItemType Directory -Path $subFolder | Out-Null
            }
        }
    }
}

# ============================================
# GET ORIGINAL PDFs ONLY
# ============================================

$files = Get-ChildItem -Path $source -File -Filter "*.pdf"

Write-Host ""
Write-Host "============================================"
Write-Host "        CURA PDF ORGANIZER"
Write-Host "============================================"
Write-Host "Found $($files.Count) PDF files."
Write-Host ""

$organized = 0
$unmatched = 0

# ============================================
# ORGANIZE FILES
# ============================================

foreach ($file in $files) {

    $matched = $false

    # ----------------------------------------
    # Check Consent subcategories FIRST
    # ----------------------------------------

    foreach ($subCategory in $categories["Consent"].Keys) {

        foreach ($keyword in $categories["Consent"][$subCategory]) {

            if ($file.BaseName -like "*$keyword*") {

                $destination = Join-Path $source "Consent\$subCategory"

                Copy-Item `
                    -Path $file.FullName `
                    -Destination $destination `
                    -Force

                Write-Host "$($file.Name) --> Consent\$subCategory"

                $organized++
                $matched = $true
                break
            }
        }

        if ($matched) {
            break
        }
    }

    # ----------------------------------------
    # Check main categories
    # ----------------------------------------

    if (-not $matched) {

        foreach ($category in $categories.Keys) {

            if ($category -eq "Consent" -or $category -eq "Other") {
                continue
            }

            foreach ($keyword in $categories[$category]) {

                if ($file.BaseName -like "*$keyword*") {

                    $destination = Join-Path $source $category

                    Copy-Item `
                        -Path $file.FullName `
                        -Destination $destination `
                        -Force

                    Write-Host "$($file.Name) --> $category"

                    $organized++
                    $matched = $true
                    break
                }
            }

            if ($matched) {
                break
            }
        }
    }

    # ----------------------------------------
    # Unmatched files
    # ----------------------------------------

    if (-not $matched) {

        $destination = Join-Path $source "Other"

        Copy-Item `
            -Path $file.FullName `
            -Destination $destination `
            -Force

        Write-Host "$($file.Name) --> Other"

        $unmatched++
    }
}

# ============================================
# FINAL SUMMARY
# ============================================

Write-Host ""
Write-Host "============================================"
Write-Host "        ORGANIZATION COMPLETE"
Write-Host "============================================"
Write-Host "Original PDFs : $($files.Count)"
Write-Host "Organized     : $organized"
Write-Host "Unmatched     : $unmatched"
Write-Host "============================================"