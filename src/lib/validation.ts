import { IDData } from "./ocr";

export interface ValidationResult {
    isValid: boolean;
    age: number | null;
    isOver19: boolean;
    isExpired: boolean;
    expiryDate: string | null;
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

    // OCR confidence is now just a warning, not an error
    // The key metric is whether we can extract the birth year
    if (data.confidence < 20) {
        warnings.push({
            code: "LOW_CONFIDENCE",
            message: `OCR confidence is low (${Math.round(data.confidence)}%), but verification can proceed if birth year was detected.`,
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

    // ID number is optional - just for information
    if (!data.idNumber) {
        warnings.push({
            code: "NO_ID_NUMBER",
            message: "ID number could not be extracted. Verification can still proceed.",
        });
    }

    // Check expiry date
    let isExpired = false;
    if (data.expiryDate) {
        const expiry = new Date(data.expiryDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Compare dates only

        if (expiry < today) {
            isExpired = true;
            errors.push({
                code: "ID_EXPIRED",
                message: `This ID has expired (${data.expiryDate}). Please use a valid, non-expired ID.`,
            });
        }
    } else {
        warnings.push({
            code: "NO_EXPIRY_DATE",
            message: "Could not detect expiry date. Please ensure your ID is not expired.",
        });
    }

    // Valid if we have a valid birth year showing age >= 19 AND ID is not expired
    const isValid = errors.length === 0 && isOver19 && !isExpired;

    return {
        isValid,
        age,
        isOver19,
        isExpired,
        expiryDate: data.expiryDate,
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
