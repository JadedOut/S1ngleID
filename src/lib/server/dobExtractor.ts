/**
 * Server-side DOB extraction from OCR text
 * Extracts and validates date of birth, calculates age
 */

export interface DobExtractionResult {
  birthDate: string | null; // YYYY-MM-DD format
  age: number | null;
  isOver19: boolean;
  rawMatch: string | null; // The raw matched date string
}

/**
 * Extract DOB from OCR text and calculate age
 * Prioritizes explicitly labeled DOB patterns over generic date patterns
 */
export function extractDobFromOcrText(ocrText: string): DobExtractionResult {
  const result: DobExtractionResult = {
    birthDate: null,
    age: null,
    isOver19: false,
    rawMatch: null,
  };

  // Try labeled patterns first (DOB:, Date of Birth, etc.)
  const labeledDate = extractLabeledDob(ocrText);
  if (labeledDate) {
    result.birthDate = labeledDate.isoDate;
    result.rawMatch = labeledDate.rawMatch;
  } else {
    // Fall back to birth-year heuristic (years 1940-2010)
    const birthYearDate = extractBirthYearDate(ocrText);
    if (birthYearDate) {
      result.birthDate = birthYearDate.isoDate;
      result.rawMatch = birthYearDate.rawMatch;
    }
  }

  if (result.birthDate) {
    result.age = calculateAge(result.birthDate);
    result.isOver19 = result.age !== null && result.age >= 19;
  }

  return result;
}

/**
 * Look for explicitly labeled DOB patterns
 */
function extractLabeledDob(
  text: string
): { isoDate: string; rawMatch: string } | null {
  // Pattern: DOB/BIRTH followed by date
  const patterns = [
    // YYYY/MM/DD or YYYY-MM-DD format
    /(?:DOB|BIRTH|DATE\s*OF\s*BIRTH)\s*[:\-]?\s*(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})/i,
    // MM/DD/YYYY or MM-DD-YYYY format
    /(?:DOB|BIRTH|DATE\s*OF\s*BIRTH)\s*[:\-]?\s*(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/i,
    // DD/MM/YYYY format (less common in Canada but check)
    /(?:DOB|BIRTH)\s*[:\-]?\s*(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const rawMatch = match[0];

      // Determine format based on which pattern matched
      if (pattern.source.includes("(\\d{4})[") && match[1].length === 4) {
        // YYYY/MM/DD format
        const [, year, month, day] = match;
        const isoDate = `${year}-${month}-${day}`;
        if (isValidDate(isoDate)) {
          return { isoDate, rawMatch };
        }
      } else if (match[3]?.length === 4) {
        // MM/DD/YYYY or DD/MM/YYYY format
        const [, first, second, year] = match;
        // Try MM/DD first (US/Canada standard)
        let isoDate = `${year}-${first}-${second}`;
        if (isValidDate(isoDate)) {
          return { isoDate, rawMatch };
        }
        // Try DD/MM
        isoDate = `${year}-${second}-${first}`;
        if (isValidDate(isoDate)) {
          return { isoDate, rawMatch };
        }
      }
    }
  }

  return null;
}

/**
 * Extract dates with birth-plausible years (1940-2010)
 * Falls back when DOB label is garbled but year is readable
 */
function extractBirthYearDate(
  text: string
): { isoDate: string; rawMatch: string } | null {
  // Match dates where year is between 1940-2010 (reasonable birth years for 19+)
  const patterns = [
    // YYYY/MM/DD format with birth-plausible year
    /\b(19[4-9]\d|200\d|2010)[\/\-\.](\d{2})[\/\-\.](\d{2})\b/g,
    // MM/DD/YYYY format with birth-plausible year
    /\b(\d{2})[\/\-\.](\d{2})[\/\-\.](19[4-9]\d|200\d|2010)\b/g,
  ];

  // First pattern: YYYY/MM/DD
  const firstPattern = patterns[0];
  let match = firstPattern.exec(text);
  if (match) {
    const [rawMatch, year, month, day] = match;
    const isoDate = `${year}-${month}-${day}`;
    if (isValidDate(isoDate) && isBirthPlausible(isoDate)) {
      return { isoDate, rawMatch };
    }
  }

  // Second pattern: MM/DD/YYYY
  const secondPattern = patterns[1];
  match = secondPattern.exec(text);
  if (match) {
    const [rawMatch, first, second, year] = match;
    // Try MM/DD first
    let isoDate = `${year}-${first}-${second}`;
    if (isValidDate(isoDate) && isBirthPlausible(isoDate)) {
      return { isoDate, rawMatch };
    }
    // Try DD/MM
    isoDate = `${year}-${second}-${first}`;
    if (isValidDate(isoDate) && isBirthPlausible(isoDate)) {
      return { isoDate, rawMatch };
    }
  }

  return null;
}

/**
 * Validate ISO date string is a real date
 */
function isValidDate(isoDate: string): boolean {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return false;

  // Check that parsing didn't shift the date (e.g., Feb 31 -> Mar 3)
  const [year, month, day] = isoDate.split("-").map(Number);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Check if date could plausibly be a birth date (person would be 14-100 years old)
 */
function isBirthPlausible(isoDate: string): boolean {
  const age = calculateAge(isoDate);
  return age !== null && age >= 14 && age <= 100;
}

/**
 * Calculate age from ISO date string
 */
export function calculateAge(birthDate: string): number | null {
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
