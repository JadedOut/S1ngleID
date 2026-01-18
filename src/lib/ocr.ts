import { createWorker, Worker, PSM } from "tesseract.js";

/**
 * Data extracted from a driver's license
 */
export interface IDData {
  name: string | null;
  idNumber: string | null;
  birthDate: string | null; // Full date: YYYY-MM-DD
  expiryDate: string | null;
  rawText: string;
  confidence: number;
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
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1",
    });

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
      const maxDim = 2000;
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
        const contrast = 1.4;
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
    const confidence = result.data.confidence;

    console.log("[OCR] Raw text:", text);
    console.log("[OCR] Confidence:", confidence);

    onProgress?.(80, "Parsing data...");
    const parsed = parseDriverLicense(text);

    onProgress?.(100, "Complete!");

    return {
      success: true,
      data: {
        ...parsed,
        rawText: text,
        confidence,
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
function parseDriverLicense(text: string): Omit<IDData, "rawText" | "confidence"> {
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
  // Ontario format: 5 digits - 5 digits - 5 digits
  const ontarioMatch = text.match(/(\d{5})\s*[-–]\s*(\d{5})\s*[-–]\s*(\d{5})/);
  if (ontarioMatch) {
    const num = `${ontarioMatch[1]}-${ontarioMatch[2]}-${ontarioMatch[3]}`;
    console.log("[OCR] Found Ontario DL:", num);
    return num;
  }

  // Generic: letter followed by numbers
  const genericMatch = text.match(/\b([A-Z]\d{6,12})\b/i);
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

  // Priority 1: Dates near DOB/BIRTH labels
  for (const d of dates) {
    if (/DOB|BIRTH|BORN|NAISSANCE/i.test(d.context) && !(/ISS|EXP|DEL/i.test(d.context))) {
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

  // Priority 3: Oldest date that could be a DOB
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
function extractExpiryDate(text: string): string | null {
  // Look for EXP/EXPIRY followed by date
  const expPatterns = [
    /EXP[IREY]*[.:\s]*(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/i,
    /EXP[IREY]*[.:\s]*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})/i,
  ];

  for (const pattern of expPatterns) {
    const match = text.match(pattern);
    if (match) {
      let year: string, month: string, day: string;

      if (match[1].length === 4) {
        year = match[1];
        month = match[2].padStart(2, "0");
        day = match[3].padStart(2, "0");
      } else {
        day = match[1].padStart(2, "0");
        month = match[2].padStart(2, "0");
        year = match[3];
      }

      const expiry = `${year}-${month}-${day}`;
      console.log("[OCR] Found expiry:", expiry);
      return expiry;
    }
  }

  return null;
}

/**
 * Check if confidence is acceptable
 */
export function isConfidenceAcceptable(confidence: number): boolean {
  return confidence >= 30;
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
