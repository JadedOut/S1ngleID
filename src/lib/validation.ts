import { IDData } from "./ocr";

export interface ValidationResult {
    isValid: boolean;
    birthDate: string | null;
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

/**
 * Validate extracted ID data
 */
export function validateIDData(data: IDData): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let age: number | null = null;
    let isOver19 = false;

    // ID number warning (not required)
    if (!data.idNumber) {
        warnings.push({
            code: "NO_ID_NUMBER",
            message: "License number not detected.",
        });
    }

    // Birth date validation (required)
    if (!data.birthDate) {
        errors.push({
            code: "NO_BIRTH_DATE",
            message: "Could not find date of birth. Ensure it's clearly visible.",
        });
    } else {
        // Calculate precise age from full birth date
        age = calculateAgeFromDate(data.birthDate);

        if (age === null || age < 0 || age > 150) {
            errors.push({
                code: "INVALID_BIRTH_DATE",
                message: "Birth date appears invalid.",
            });
        } else if (age < 19) {
            errors.push({
                code: "UNDER_AGE",
                message: "You must be at least 19 years old.",
            });
        } else {
            isOver19 = true;
        }
    }

    // Expiry date validation
    let isExpired = false;
    if (data.expiryDate) {
        const expiry = new Date(data.expiryDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (expiry < today) {
            isExpired = true;
            errors.push({
                code: "ID_EXPIRED",
                message: `ID expired on ${data.expiryDate}. Use a valid ID.`,
            });
        }
    } else {
        warnings.push({
            code: "NO_EXPIRY",
            message: "Expiry date not detected. Ensure your ID is current.",
        });
    }

    const isValid = errors.length === 0 && isOver19;

    return {
        isValid,
        birthDate: data.birthDate,
        age,
        isOver19,
        isExpired,
        expiryDate: data.expiryDate,
        errors,
        warnings,
    };
}

/**
 * Calculate precise age in years from a birth date string (YYYY-MM-DD)
 */
export function calculateAgeFromDate(birthDate: string): number | null {
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();

    // Adjust if birthday hasn't occurred yet this year
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }

    return age;
}
