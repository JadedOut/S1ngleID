import { createWorker, Worker, PSM } from "tesseract.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  /** Maximum dimension for images (resizes if larger) */
  MAX_IMAGE_DIMENSION: 4000,

  /** Contrast enhancement factor (1.4 = 40% boost) */
  CONTRAST_FACTOR: 1.4,

  /** Tesseract worker parameters */
  WORKER_PARAMS: {
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    preserve_interword_spaces: "1",
  }
};

/**
 * Data extracted from a driver's license
 */
export interface IDData {
  name: string | null;
  idNumber: string | null;
  birthDate: string | null; // Full date: YYYY-MM-DD
  expiryDate: string | null;
  rawText: string;
}

export interface OCRResult {
  success: boolean;
  data: IDData | null;
  error?: string;
}

let worker: Worker | null = null;

/**
 * Initialize or get existing Tesseract worker
 */
async function getWorker(): Promise<Worker> {
  if (!worker) {
    console.log("[OCR] Initializing Tesseract worker...");
    worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status && typeof m.progress === "number") {
          console.log(`[OCR] ${m.status}: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    // Configure for ID document scanning
    await worker.setParameters(CONFIG.WORKER_PARAMS);

    console.log("[OCR] Tesseract worker ready");
  }
  return worker;
}

/**
 * Preprocess image for better OCR results
 * Converts to grayscale and enhances contrast
 */
async function preprocessImage(imageData: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(imageData);
        return;
      }

      // Limit size for performance
      const maxDim = CONFIG.MAX_IMAGE_DIMENSION;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to grayscale with contrast boost
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      for (let i = 0; i < data.length; i += 4) {
        // Grayscale
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // Contrast enhancement
        const contrast = CONFIG.CONTRAST_FACTOR;
        const enhanced = Math.max(0, Math.min(255, (gray - 128) * contrast + 128));
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(imageData);
    img.src = imageData;
  });
}

/**
 * Extract ID data from an image using Tesseract OCR
 * All processing happens client-side
 */
export async function extractIDData(
  imageData: string,
  onProgress?: (progress: number, status: string) => void
): Promise<OCRResult> {
  try {
    onProgress?.(0, "Initializing OCR...");
    const tesseract = await getWorker();

    onProgress?.(10, "Preprocessing image...");
    const processed = await preprocessImage(imageData);

    onProgress?.(20, "Reading document...");
    const result = await tesseract.recognize(processed);
    const text = result.data.text;

    console.log("[OCR] Raw text:", text);

    onProgress?.(80, "Parsing data...");
    const parsed = parseDriverLicense(text);

    onProgress?.(100, "Complete!");

    return {
      success: true,
      data: {
        ...parsed,
        rawText: text,
      },
    };
  } catch (error) {
    console.error("[OCR] Error:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "OCR failed",
    };
  }
}

/**
 * Parse driver's license text to extract fields
 */
function parseDriverLicense(text: string): Omit<IDData, "rawText"> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  console.log("[OCR] Parsing", lines.length, "lines");

  return {
    name: extractName(lines),
    idNumber: extractDLNumber(text),
    birthDate: extractBirthDate(text),
    expiryDate: extractExpiryDate(text),
  };
}

/**
 * Extract name from license
 */
function extractName(lines: string[]): string | null {
  // Look for lines that look like names (letters, commas, hyphens only)
  for (const line of lines) {
    // Skip short lines or lines with too many numbers
    if (line.length < 3 || (line.match(/\d/g)?.length || 0) > 2) continue;

    // Skip common labels
    if (/^(NAME|SURNAME|GIVEN|FIRST|LAST|DOB|EXP|ISS|SEX|HGT|CLASS|REST|DRIVER)/i.test(line)) continue;

    // Check if line looks like a name
    if (/^[A-Z][A-Z\s,'-]+$/i.test(line) && line.length >= 3) {
      console.log("[OCR] Found name:", line);
      return line;
    }
  }
  return null;
}

/**
 * Extract driver's license number
 * Common formats: #####-#####-##### (Ontario), alphanumeric
 */
function extractDLNumber(text: string): string | null {
  // Ontario format: 1 Letter + 4 digits - 5 digits - 5 digits
  // Common error: 'Z' read as '7'
  const ontarioMatch = text.match(/([A-Z7])(\d{4})[ \t]*[-–.][ \t]*(\d{5})[ \t]*[-–.][ \t]*(\d{5})/i);

  if (ontarioMatch) {
    let firstChar = ontarioMatch[1].toUpperCase();
    // specific fix for Ontario: License  starts with first letter of last name
    if (firstChar === '7') firstChar = 'Z';

    const num = `${firstChar}${ontarioMatch[2]}-${ontarioMatch[3]}-${ontarioMatch[4]}`;
    console.log("[OCR] Found Ontario DL:", num);
    return num;
  }

  // Backup: Look for the specific spacing pattern even without dash separators
  const spacedMatch = text.match(/([A-Z7])(\d{4})\s+(\d{5})\s+(\d{5})/i);
  if (spacedMatch) {
    let firstChar = spacedMatch[1].toUpperCase();
    if (firstChar === '7') firstChar = 'Z';
    const num = `${firstChar}${spacedMatch[2]}-${spacedMatch[3]}-${spacedMatch[4]}`;
    console.log("[OCR] Found Ontario DL (spaced):", num);
    return num;
  }

  // Generic: letter followed by numbers (at least 7 chars)
  const genericMatch = text.match(/\b([A-Z]\d{8,14})\b/i);
  if (genericMatch) {
    console.log("[OCR] Found generic DL:", genericMatch[1]);
    return genericMatch[1].toUpperCase();
  }

  return null;
}

/**
 * Extract full birth date from DOB field
 * Returns YYYY-MM-DD format
 * Handles: YYYY/MM/DD, YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
 */
function extractBirthDate(text: string): string | null {
  const currentYear = new Date().getFullYear();

  // Find all dates in text with full date info
  const dates: { date: string; year: number; context: string }[] = [];

  // YYYY/MM/DD or YYYY-MM-DD
  const ymdRegex = /\b(19\d{2}|20[0-2]\d)[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/g;
  let m;
  while ((m = ymdRegex.exec(text)) !== null) {
    const context = text.substring(Math.max(0, m.index - 30), m.index + 15).toUpperCase();
    const year = parseInt(m[1]);
    const month = m[2].padStart(2, "0");
    const day = m[3].padStart(2, "0");
    dates.push({ date: `${m[1]}-${month}-${day}`, year, context });
  }

  // DD/MM/YYYY or MM/DD/YYYY (assume DD/MM for Canadian IDs)
  const dmyRegex = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](19\d{2}|20[0-2]\d)\b/g;
  while ((m = dmyRegex.exec(text)) !== null) {
    const context = text.substring(Math.max(0, m.index - 30), m.index + 15).toUpperCase();
    const year = parseInt(m[3]);
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    dates.push({ date: `${m[3]}-${month}-${day}`, year, context });
  }

  // Fix: Handle 10-digit dates where separators are read as digits (e.g. 2025008107)
  const mashedRegex = /\b(19\d{2}|20\d{2})[01](\d)[0123](\d)\b/g;
  // Very careful not to match random numbers. 
  // Only use this if context implies date.


  // Priority 1: Dates near DOB/BIRTH labels
  for (const d of dates) {
    if (/DOB|BIRTH|BORN|NAISSANCE/i.test(d.context) && !(/ISS|EXP|DEL/i.test(d.context))) {
      // Must be at least 16 years ago
      if (d.year <= currentYear - 16) {
        console.log("[OCR] Found DOB:", d.date);
        return d.date;
      }
    }
  }

  // Priority 2: Dates NOT near ISS/EXP that are old enough
  for (const d of dates) {
    if (!(/ISS|EXP|DEL|VALID/i.test(d.context)) && d.year <= currentYear - 16) {
      console.log("[OCR] Using date (not ISS/EXP):", d.date);
      return d.date;
    }
  }

  // Priority 3: Oldest date that could be a DOB (filter out future/recent dates)
  const validDates = dates.filter((d) => d.year >= 1920 && d.year <= currentYear - 16);
  if (validDates.length > 0) {
    validDates.sort((a, b) => a.year - b.year);
    console.log("[OCR] Using oldest date:", validDates[0].date);
    return validDates[0].date;
  }

  console.log("[OCR] No birth date found");
  return null;
}

/**
 * Extract expiry date
 * Returns YYYY-MM-DD format
 */
/**
 * Extract expiry date
 * Returns YYYY-MM-DD format
 */
function extractExpiryDate(text: string): string | null {
  // Find all potential dates in the text including "mashed" ones where / is read as 1
  const candidates: { date: string; year: number; context: string; index: number }[] = [];

  // Regex for Standard Dates (YYYY-MM-DD, YYYY/MM/DD)
  const standardRegex = /\b(20[2-9]\d)[\/\-.\s]+(\d{1,2})[\/\-.\s]+(\d{1,2})\b/g;
  let m;
  while ((m = standardRegex.exec(text)) !== null) {
    const year = parseInt(m[1]);
    const month = m[2].padStart(2, "0");
    const day = m[3].padStart(2, "0");
    candidates.push({
      date: `${year}-${month}-${day}`,
      year,
      context: text.substring(Math.max(0, m.index - 20), m.index).toUpperCase(),
      index: m.index
    });
  }

  // Regex for "Mashed" Dates (202711021 -> 2027 / 10 / 21 where / is read as 1)
  // Also handles missing separators: 20280103
  // Looks for 20XX followed by 1 (slash?) digit(s) 1 (slash?) digit(s)
  const mashedRegex = /\b(20[2-9]\d)[1l](\d{1,2})[1l]?(\d{1,2})\b/g;
  while ((m = mashedRegex.exec(text)) !== null) {
    const year = parseInt(m[1]);
    const month = m[2].padStart(2, '0');
    const day = m[3].padStart(2, '0');

    // Basic sanity check: Month <= 12, Day <= 31
    if (parseInt(month) <= 12 && parseInt(day) <= 31) {
      candidates.push({
        date: `${year}-${month}-${day}`,
        year,
        context: text.substring(Math.max(0, m.index - 20), m.index).toUpperCase(),
        index: m.index
      });
    }
  }

  // Regex for Partially Squeezed Dates (202712/30 -> YYYYMM/DD)
  // test case: "202712/30"
  const partialSqueezedRegex = /\b(20[2-9]\d)(\d{2})[\/\-.](\d{2})\b/g;
  while ((m = partialSqueezedRegex.exec(text)) !== null) {
    candidates.push({
      date: `${m[1]}-${m[2]}-${m[3]}`,
      year: parseInt(m[1]),
      context: text.substring(Math.max(0, m.index - 20), m.index).toUpperCase(),
      index: m.index
    });
  }

  // Also check for 8-digit squeezed dates (20280103)
  const squeezedRegex = /\b(20[2-9]\d)(\d{2})(\d{2})\b/g;
  while ((m = squeezedRegex.exec(text)) !== null) {
    candidates.push({
      date: `${m[1]}-${m[2]}-${m[3]}`,
      year: parseInt(m[1]),
      context: text.substring(Math.max(0, m.index - 20), m.index).toUpperCase(),
      index: m.index
    });
  }

  // Scoring / Filtering

  // 1. Filter out dates that look like "Issued" dates
  const expiryCandidates = candidates.filter(c => {
    // Exclude if context contains ISS, DATE (often "Date Issued"), 4a (Issued field code)
    // EXP was often mistaken for "EXE", so cover both
    if (/ISS|DATE|NAIS|BORN/i.test(c.context) && !/EXP|EXE|VAL/i.test(c.context)) {
      console.log("[OCR] Ignoring Issued/Birth date for expiry:", c.date, c.context);
      return false;
    }
    return true;
  });

  // 2. Look for explicit EXP/VAL label
  const explicit = expiryCandidates.find(c => /EXP|EXE|VAL|WEXE/i.test(c.context));
  if (explicit) {
    console.log("[OCR] Found explicit expiry:", explicit.date, "Context:", explicit.context);
    return explicit.date;
  }

  // 3. Fallback: Furthest future date that isn't excluded
  if (expiryCandidates.length > 0) {
    // Sort by year descending (furthest future)
    expiryCandidates.sort((a, b) => b.year - a.year);
    const best = expiryCandidates[0];
    console.log("[OCR] Using furthest future date:", best.date);
    return best.date;
  }

  return null;
}



/**
 * Clean up OCR worker
 */
export async function terminateOCR(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
