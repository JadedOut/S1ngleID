import { createWorker, Worker, PSM } from "tesseract.js";
import { ONTARIO_DL_REGIONS } from "./ontarioDlRegions";
import {
  cropDataUrlRegionToPng,
  preprocessOntarioDlToPng,
} from "./opencvPreprocess";

export type OcrFieldKey = "name" | "dlNumber" | "dob" | "expiry";

export type OcrFieldResult = {
  /**
   * Raw text returned by Tesseract for the crop.
   */
  text: string;
  /**
   * Tesseract confidence (0-100).
   */
  confidence: number;
  /**
   * Crop image used for OCR (PNG data URL). Useful for UI/debug.
   */
  cropPngDataUrl?: string;
  /**
   * Normalized value produced by our parsers.
   */
  normalized?: string | null;
};

export interface IDData {
  name: string | null;
  idNumber: string | null; // Ontario DL number normalized to #####-#####-#####
  birthYear: number | null;
  expiryDate: string | null; // YYYY-MM-DD
  /**
   * Cropped photo region from the rectified card.
   * This is a fixed crop (no face detection).
   */
  idPhoto: string | null;
  rawText: string;
  /**
   * Overall confidence. For Ontario flow, prefer `fieldResults.*.confidence`.
   */
  confidence: number;
  fieldResults?: Partial<Record<OcrFieldKey, OcrFieldResult>>;
  /**
   * Rectified/binarized card image we ran OCR against (PNG data URL).
   */
  preprocessedCardPng?: string;
}

export interface OCRResult {
  success: boolean;
  data: IDData | null;
  error?: string;
}

let worker: Worker | null = null;

async function getWorker(onWorkerLog?: (status: string, progress01: number) => void): Promise<Worker> {
  if (!worker) {
    console.log("[OCR] Initializing Tesseract worker...");
    worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m?.status && typeof m.progress === "number") {
          onWorkerLog?.(m.status, m.progress);
        }
      },
    });
    console.log("[OCR] Tesseract worker ready");
  } else {
    console.log("[OCR] Using existing Tesseract worker");
  }
  return worker;
}

/**
 * Canvas-only fallback preprocessing. Kept as a backup when OpenCV isn't available.
 */
async function preprocessImageFallback(imageData: string): Promise<string> {
  console.log("[OCR] Using fallback preprocessing (Canvas-only, no OpenCV)");
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      console.log(`[OCR] Fallback: Processing ${img.width}x${img.height} image`);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(imageData);
        return;
      }

      const maxDim = 2000;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const contrast = 1.3;
        const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
        const enhanced = factor * (gray - 128) + 128;
        const final = Math.max(0, Math.min(255, enhanced));
        data[i] = final;
        data[i + 1] = final;
        data[i + 2] = final;
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };

    img.onerror = () => resolve(imageData);
    img.src = imageData;
  });
}

function cleanOcrText(s: string): string {
  return s
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function parseOntarioDlNumber(raw: string): string | null {
  // Common OCR errors: hyphen as space or missing; remove non-digits and then re-format.
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length !== 15) {
    console.log(`[OCR] DL number parse failed: expected 15 digits, got ${digits.length} from "${raw}"`);
    return null;
  }
  const formatted = `${digits.slice(0, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 15)}`;
  console.log(`[OCR] DL number parsed: "${formatted}" from "${raw}"`);
  return formatted;
}

function parseYearFromDateLike(raw: string): number | null {
  // Accept YYYY/MM/DD, YYYY-MM-DD, DD/MM/YYYY, etc. Return year only.
  const s = raw.replace(/[^\d\/\-.]/g, " ").trim();

  // YYYY/MM/DD
  const ymd = s.match(/\b(19\d{2}|20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
  if (ymd) {
    const year = Number(ymd[1]);
    console.log(`[OCR] DOB year parsed (YYYY/MM/DD): ${year} from "${raw}"`);
    return year;
  }

  // DD/MM/YYYY or MM/DD/YYYY (assume DD/MM for Canadian IDs; we only need year)
  const dmy = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](19\d{2}|20\d{2})\b/);
  if (dmy) {
    const year = Number(dmy[3]);
    console.log(`[OCR] DOB year parsed (DD/MM/YYYY): ${year} from "${raw}"`);
    return year;
  }

  // Standalone year
  const y = s.match(/\b(19\d{2}|20\d{2})\b/);
  if (y) {
    const year = Number(y[1]);
    console.log(`[OCR] DOB year parsed (standalone): ${year} from "${raw}"`);
    return year;
  }

  console.log(`[OCR] DOB year parse failed: no valid year found in "${raw}"`);
  return null;
}

function parseIsoDate(raw: string): string | null {
  // Returns YYYY-MM-DD when possible.
  const s = raw.replace(/[^\d\/\-.]/g, " ").trim();

  const ymd = s.match(/\b(19\d{2}|20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
  if (ymd) {
    const yyyy = ymd[1];
    const mm = ymd[2].padStart(2, "0");
    const dd = ymd[3].padStart(2, "0");
    const date = `${yyyy}-${mm}-${dd}`;
    console.log(`[OCR] Expiry date parsed (YYYY/MM/DD): ${date} from "${raw}"`);
    return date;
  }

  const dmy = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](19\d{2}|20\d{2})\b/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    const yyyy = dmy[3];
    const date = `${yyyy}-${mm}-${dd}`;
    console.log(`[OCR] Expiry date parsed (DD/MM/YYYY): ${date} from "${raw}"`);
    return date;
  }

  console.log(`[OCR] Expiry date parse failed: no valid date found in "${raw}"`);
  return null;
}

function parseNameFromCrop(raw: string): string | null {
  const s = cleanOcrText(raw).replace(/[^A-Z\s,'-]/gi, " ").replace(/\s+/g, " ").trim();
  if (!s) {
    console.log(`[OCR] Name parse failed: empty text from "${raw}"`);
    return null;
  }
  // Avoid returning label-only text.
  if (/^(NAME|SURNAME|GIVEN|FAMILY)\b/i.test(s) && s.split(" ").length < 3) {
    console.log(`[OCR] Name parse failed: label-only text "${s}"`);
    return null;
  }
  const name = s.length >= 2 ? s : null;
  if (name) {
    console.log(`[OCR] Name parsed: "${name}" from "${raw}"`);
  } else {
    console.log(`[OCR] Name parse failed: too short from "${raw}"`);
  }
  return name;
}

async function runFieldOcr(args: {
  worker: Worker;
  field: OcrFieldKey;
  imagePngDataUrl: string;
}): Promise<OcrFieldResult> {
  const { worker: w, field, imagePngDataUrl } = args;

  console.log(`[Field:${field}] Starting OCR pass...`);

  // Field-specific constraints.
  if (field === "dlNumber") {
    await w.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      tessedit_char_whitelist: "0123456789-",
      preserve_interword_spaces: "1",
    });
    console.log(`[Field:${field}] PSM: SINGLE_LINE, whitelist: digits + hyphen`);
  } else if (field === "dob" || field === "expiry") {
    await w.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      tessedit_char_whitelist: "0123456789/-.",
      preserve_interword_spaces: "1",
    });
    console.log(`[Field:${field}] PSM: SINGLE_LINE, whitelist: digits + date separators`);
  } else {
    // name
    await w.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
    });
    console.log(`[Field:${field}] PSM: SPARSE_TEXT, no whitelist`);
  }

  const res = await w.recognize(imagePngDataUrl);
  const text = cleanOcrText(res.data.text || "");
  const confidence = res.data.confidence ?? 0;
  console.log(`[Field:${field}] OCR complete: confidence=${confidence.toFixed(1)}%, text="${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
  return { text, confidence, cropPngDataUrl: imagePngDataUrl };
}

/**
 * Extract ID data from an image using:
 * - OpenCV rectification + threshold + deskew
 * - Ontario field crops + Tesseract passes with per-field constraints
 *
 * All processing happens client-side; ID data stays in memory.
 */
export async function extractIDData(
  imageData: string,
  onProgress?: (progress: number, status: string) => void
): Promise<OCRResult> {
  console.log("[OCR] ========================================");
  console.log("[OCR] Starting ID data extraction pipeline");
  console.log("[OCR] ========================================");
  try {
    onProgress?.(0, "Initializing OCR engine...");

    const tesseractWorker = await getWorker((status, p01) => {
      // Map internal worker logs to a small band so the UI feels alive.
      const p = 30 + Math.round(p01 * 20);
      onProgress?.(Math.min(60, p), status);
    });

    onProgress?.(10, "Preparing image...");

    let rectifiedPng: string | null = null;
    let preprocessedPng: string | null = null;

    try {
      onProgress?.(15, "Rectifying card (OpenCV)...");
      const pre = await preprocessOntarioDlToPng(imageData);
      rectifiedPng = pre.rectifiedPngDataUrl;
      preprocessedPng = pre.preprocessedPngDataUrl;
      console.log("[OCR] OpenCV preprocessing successful");
    } catch (e) {
      console.warn("[OCR] OpenCV preprocessing failed, using fallback:", e);
      // Fallback to canvas-only preprocessing. No crops will be as accurate, but OCR can still work.
      const fallback = await preprocessImageFallback(imageData);
      rectifiedPng = fallback;
      preprocessedPng = fallback;
    }

    if (!rectifiedPng || !preprocessedPng) {
      throw new Error("Failed to prepare image for OCR");
    }

    onProgress?.(20, "Cropping fields...");
    console.log("[OCR] Cropping 5 field regions...");

    const [photoCrop, nameCrop, dlCrop, dobCrop, expCrop] = await Promise.all([
      cropDataUrlRegionToPng(rectifiedPng, ONTARIO_DL_REGIONS.photo),
      cropDataUrlRegionToPng(preprocessedPng, ONTARIO_DL_REGIONS.name),
      cropDataUrlRegionToPng(preprocessedPng, ONTARIO_DL_REGIONS.dlNumber),
      cropDataUrlRegionToPng(preprocessedPng, ONTARIO_DL_REGIONS.dob),
      cropDataUrlRegionToPng(preprocessedPng, ONTARIO_DL_REGIONS.expiry),
    ]);
    console.log("[OCR] All field crops completed");

    onProgress?.(25, "Reading name...");
    const nameRes = await runFieldOcr({ worker: tesseractWorker, field: "name", imagePngDataUrl: nameCrop });

    onProgress?.(40, "Reading license number...");
    const dlRes = await runFieldOcr({ worker: tesseractWorker, field: "dlNumber", imagePngDataUrl: dlCrop });

    onProgress?.(55, "Reading date of birth...");
    const dobRes = await runFieldOcr({ worker: tesseractWorker, field: "dob", imagePngDataUrl: dobCrop });

    onProgress?.(70, "Reading expiry date...");
    const expRes = await runFieldOcr({ worker: tesseractWorker, field: "expiry", imagePngDataUrl: expCrop });

    // One full pass on the preprocessed card for debugging and fallback parsing.
    onProgress?.(85, "Finalizing...");
    console.log("[OCR] Running full-card OCR pass for raw text...");
    await tesseractWorker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1",
    });
    const full = await tesseractWorker.recognize(preprocessedPng);
    const rawText = cleanOcrText(full.data.text || "");
    console.log(`[OCR] Full-card OCR: ${rawText.length} characters extracted`);

    console.log("[OCR] Parsing extracted fields...");
    const name = parseNameFromCrop(nameRes.text);
    const idNumber = parseOntarioDlNumber(dlRes.text);
    const birthYear = parseYearFromDateLike(dobRes.text);
    const expiryDate = parseIsoDate(expRes.text);

    nameRes.normalized = name;
    dlRes.normalized = idNumber;
    dobRes.normalized = birthYear ? String(birthYear) : null;
    expRes.normalized = expiryDate;

    const fieldResults: Partial<Record<OcrFieldKey, OcrFieldResult>> = {
      name: nameRes,
      dlNumber: dlRes,
      dob: dobRes,
      expiry: expRes,
    };

    const overallConfidence =
      (nameRes.confidence + dlRes.confidence + dobRes.confidence + expRes.confidence) / 4;

    console.log("[OCR] ========================================");
    console.log("[OCR] Extraction Summary:");
    console.log(`[OCR]   Name: ${name || "NOT FOUND"} (${nameRes.confidence.toFixed(1)}%)`);
    console.log(`[OCR]   DL Number: ${idNumber || "NOT FOUND"} (${dlRes.confidence.toFixed(1)}%)`);
    console.log(`[OCR]   Birth Year: ${birthYear || "NOT FOUND"} (${dobRes.confidence.toFixed(1)}%)`);
    console.log(`[OCR]   Expiry: ${expiryDate || "NOT FOUND"} (${expRes.confidence.toFixed(1)}%)`);
    console.log(`[OCR]   Overall Confidence: ${overallConfidence.toFixed(1)}%`);
    console.log("[OCR] ========================================");

    onProgress?.(100, "Complete!");

    return {
      success: true,
      data: {
        name,
        idNumber,
        birthYear,
        expiryDate,
        idPhoto: photoCrop ?? null,
        rawText,
        confidence: overallConfidence,
        fieldResults,
        preprocessedCardPng: preprocessedPng,
      },
    };
  } catch (error) {
    console.error("[OCR] ========================================");
    console.error("[OCR] ERROR during ID extraction:", error);
    console.error("[OCR] ========================================");
    let errorMessage = "Unknown OCR error";
    if (error instanceof Error) {
      if (error.message.toLowerCase().includes("timeout")) {
        errorMessage = "Processing took too long. Try a clearer image.";
      } else if (error.message.toLowerCase().includes("network") || error.message.toLowerCase().includes("load")) {
        errorMessage = "Failed to load OCR engine. Check your internet connection.";
      } else if (error.message.toLowerCase().includes("memory")) {
        errorMessage = "Image is too large. Try a smaller image.";
      } else {
        errorMessage = error.message;
      }
    }
    return { success: false, data: null, error: errorMessage };
  }
}

/**
 * Crop photo region from ID image.
 * For Ontario DL, this returns the fixed photo crop from the rectified card.
 */
export async function extractIDPhoto(imageData: string): Promise<string | null> {
  try {
    const pre = await preprocessOntarioDlToPng(imageData);
    return await cropDataUrlRegionToPng(pre.rectifiedPngDataUrl, ONTARIO_DL_REGIONS.photo);
  } catch {
    return imageData;
  }
}

export function isConfidenceAcceptable(confidence: number): boolean {
  // For Ontario flow, prefer field-level validation. Keep this as a soft threshold.
  return confidence >= 40;
}

export async function terminateOCR(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

