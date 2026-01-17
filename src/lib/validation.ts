import { IDData } from "./ocr";

export interface ValidationResult {
    isValid: boolean;
    age: number | null;
    isOver19: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    code: string;
    message: string;
}

export interface ValidationWarning {
    code: string;
    message: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const MIN_BIRTH_YEAR = 1900;
const MAX_BIRTH_YEAR = CURRENT_YEAR - 19; // Must be at least 19

/**
 * Validate extracted ID data
 */
export function validateIDData(data: IDData): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let age: number | null = null;
    let isOver19 = false;

    // Check OCR confidence (>40% - lowered for real-world photos)
    if (data.confidence < 40) {
        errors.push({
            code: "LOW_CONFIDENCE",
            message: `OCR confidence is too low (${Math.round(data.confidence)}%). Please retake the photo with better lighting.`,
        });
    }

    // Check if birth year was extracted
    if (!data.birthYear) {
        errors.push({
            code: "NO_BIRTH_YEAR",
            message: "Could not extract birth year from ID. Please ensure the date of birth is visible.",
        });
    } else {
        // Validate birth year range
        if (data.birthYear < MIN_BIRTH_YEAR) {
            errors.push({
                code: "INVALID_BIRTH_YEAR",
                message: "Birth year appears invalid. Please retake the photo.",
            });
        } else if (data.birthYear > MAX_BIRTH_YEAR) {
            errors.push({
                code: "UNDER_AGE",
                message: "You must be at least 19 years old to complete verification.",
            });
        } else {
            // Calculate age
            age = calculateAge(data.birthYear);
            isOver19 = age >= 19;

            if (!isOver19) {
                errors.push({
                    code: "UNDER_AGE",
                    message: `Age verification failed. You must be at least 19 years old.`,
                });
            }
        }
    }

    // Optional validations (warnings, not errors)
    if (!data.name) {
        warnings.push({
            code: "NO_NAME",
            message: "Name could not be extracted. Verification can still proceed.",
        });
    }

    if (!data.idNumber) {
        warnings.push({
            code: "NO_ID_NUMBER",
            message: "ID number could not be extracted. Verification can still proceed.",
        });
    }

    const isValid = errors.length === 0 && data.confidence >= 40 && isOver19;

    return {
        isValid,
        age,
        isOver19,
        errors,
        warnings,
    };
}

/**
 * Calculate age from birth year
 */
export function calculateAge(birthYear: number): number {
    return CURRENT_YEAR - birthYear;
}

/**
 * Validate that a face is detected in the ID photo
 * This is called after face detection runs on the ID image
 */
export function validateFaceDetection(faceDetected: boolean): ValidationError | null {
    if (!faceDetected) {
        return {
            code: "NO_FACE_IN_ID",
            message: "No face detected in the ID photo. Please ensure your ID photo is clearly visible.",
        };
    }
    return null;
}

/**
 * Validate face match score
 */
export function validateFaceMatch(score: number, threshold: number = 0.75): {
    passed: boolean;
    message: string;
} {
    if (score >= threshold) {
        return {
            passed: true,
            message: "Face verification successful!",
        };
    } else if (score >= 0.5) {
        return {
            passed: false,
            message: "Face match inconclusive. Please try again with better lighting.",
        };
    } else {
        return {
            passed: false,
            message: "Face does not match the ID photo. Please try again.",
        };
    }
}

/**
 * Get overall verification status
 */
export function getVerificationStatus(
    idValidation: ValidationResult,
    faceMatchScore: number
): {
    canProceed: boolean;
    status: "success" | "pending" | "failed";
    message: string;
} {
    if (!idValidation.isValid) {
        return {
            canProceed: false,
            status: "failed",
            message: idValidation.errors[0]?.message || "ID validation failed",
        };
    }

    const faceMatch = validateFaceMatch(faceMatchScore);
    if (!faceMatch.passed) {
        return {
            canProceed: false,
            status: "failed",
            message: faceMatch.message,
        };
    }

    return {
        canProceed: true,
        status: "success",
        message: "Verification successful! You are confirmed to be over 19.",
    };
}
