import { NextRequest, NextResponse } from "next/server";
import { createWorker, Worker, PSM } from "tesseract.js";
import sharp from "sharp";
import {
  preprocessIdDocument,
  type PreprocessResult,
} from "@/lib/server/opencvPreprocessPuppeteer";

// Force Node.js runtime (not Edge)
export const runtime = "nodejs";

// Environment flag to toggle between Puppeteer OpenCV and Sharp preprocessing
// Set USE_OPENCV_PREPROCESS=false to fall back to Sharp
const USE_OPENCV_PREPROCESS = process.env.USE_OPENCV_PREPROCESS !== "false";

// Module-level worker singletons to avoid re-initializing on every request
// and to avoid parameter races (each worker has fixed config)
let generalWorker: Worker | null = null;
let generalWorkerInitPromise: Promise<Worker> | null = null;

let datesWorker: Worker | null = null;
let datesWorkerInitPromise: Promise<Worker> | null = null;

/**
 * Initialize or get existing general Tesseract worker (pass 1: names, license #, expiry)
 */
async function getGeneralWorker(): Promise<Worker> {
  if (generalWorker) return generalWorker;

  if (generalWorkerInitPromise) return generalWorkerInitPromise;

  generalWorkerInitPromise = (async () => {
    console.log("[OCR API] Initializing general Tesseract worker...");
    const w = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status && typeof m.progress === "number") {
          console.log(`[OCR API:General] ${m.status}: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    // Configure for ID document scanning (general text)
    await w.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1",
    });

    console.log("[OCR API] General Tesseract worker ready");
    generalWorker = w;
    return w;
  })();

  return generalWorkerInitPromise;
}

/**
 * Initialize or get existing dates-focused Tesseract worker (pass 2: DOB, dates)
 * Uses character whitelist and sparse text mode for better date extraction
 */
async function getDatesWorker(): Promise<Worker> {
  if (datesWorker) return datesWorker;

  if (datesWorkerInitPromise) return datesWorkerInitPromise;

  datesWorkerInitPromise = (async () => {
    console.log("[OCR API] Initializing dates-focused Tesseract worker...");
    const w = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status && typeof m.progress === "number") {
          console.log(`[OCR API:Dates] ${m.status}: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    // Configure for date extraction: whitelist digits and date separators
    await w.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT, // Better for scattered date fields
      tessedit_char_whitelist: "0123456789/-.DOBdob: ",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    console.log("[OCR API] Dates-focused Tesseract worker ready");
    datesWorker = w;
    return w;
  })();

  return datesWorkerInitPromise;
}

/**
 * Convert base64 data URL to Buffer
 */
function base64ToBuffer(base64Data: string): Buffer {
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64, "base64");
}

/**
 * Convert Buffer to base64 data URL
 */
function bufferToBase64DataUrl(buffer: Buffer, mimeType = "image/png"): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/**
 * Server-side image preprocessing using Puppeteer + OpenCV.js.
 * Applies the full pipeline: grayscale, edge detection, contour finding,
 * perspective warp, adaptive threshold, and deskew.
 * Uses the exact same code as the frontend browser version.
 */
async function preprocessWithOpenCV(
  base64Data: string
): Promise<{ buffer: Buffer; preprocessResult: PreprocessResult }> {
  const inputBuffer = base64ToBuffer(base64Data);
  const preprocessResult = await preprocessIdDocument(inputBuffer);
  return { buffer: preprocessResult.preprocessedBuffer, preprocessResult };
}

/**
 * Server-side image preprocessing for general OCR (pass 1) using Sharp.
 * Fallback when OpenCV is disabled.
 * Mimics the browser canvas preprocessing: grayscale + contrast boost
 */
async function preprocessImageSharp(base64Data: string): Promise<Buffer> {
  const inputBuffer = base64ToBuffer(base64Data);

  // Get image metadata to limit size for performance
  const metadata = await sharp(inputBuffer).metadata();
  const maxDim = 2000;

  let pipeline = sharp(inputBuffer);

  // Resize if too large
  if (metadata.width && metadata.height) {
    if (metadata.width > maxDim || metadata.height > maxDim) {
      const ratio = Math.min(maxDim / metadata.width, maxDim / metadata.height);
      const newWidth = Math.round(metadata.width * ratio);
      const newHeight = Math.round(metadata.height * ratio);
      pipeline = pipeline.resize(newWidth, newHeight);
    }
  }

  // Convert to grayscale and boost contrast (similar to browser preprocessing)
  // The linear operation applies: output = input * a + b
  // For contrast of 1.4 centered at 128: output = (input - 128) * 1.4 + 128 = input * 1.4 - 51.2
  // In sharp linear: a = 1.4, b = -51.2 (as percentage: b = -51.2/255 ≈ -0.2)
  const processed = await pipeline
    .grayscale()
    .linear(1.4, -51.2) // contrast boost
    .png()
    .toBuffer();

  return processed;
}

/**
 * Server-side image preprocessing optimized for date extraction (pass 2)
 * Uses stronger upscale + sharpen to make date digits more readable
 */
async function preprocessForDates(base64Data: string): Promise<Buffer> {
  const inputBuffer = base64ToBuffer(base64Data);

  const metadata = await sharp(inputBuffer).metadata();

  let pipeline = sharp(inputBuffer);

  // Upscale smaller images to improve OCR on small date text
  // Target: at least 1500px on the shortest dimension
  const targetMin = 1500;
  if (metadata.width && metadata.height) {
    const minDim = Math.min(metadata.width, metadata.height);
    if (minDim < targetMin) {
      const scale = targetMin / minDim;
      const newWidth = Math.round(metadata.width * scale);
      const newHeight = Math.round(metadata.height * scale);
      pipeline = pipeline.resize(newWidth, newHeight, {
        kernel: sharp.kernel.lanczos3, // High-quality upscale
      });
    }
  }

  // Aggressive preprocessing for date digits:
  // - Grayscale
  // - High contrast (1.8x) to separate digits from background
  // - Sharpen to make digit edges crisp
  const processed = await pipeline
    .grayscale()
    .linear(1.8, -102.4) // stronger contrast: (input - 128) * 1.8 + 128
    .sharpen({ sigma: 1.5 }) // sharpen to improve digit edges
    .png()
    .toBuffer();

  return processed;
}

/**
 * Check if text contains a DOB-labeled date (not just any date like issue/expiry)
 * We need to be specific: look for DOB label OR a plausible birth year (1940-2010)
 */
function containsLabeledDobPattern(text: string): boolean {
  // Look for explicitly labeled DOB
  const labeledPatterns = [
    /DOB\s*[:\-]?\s*\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2}/i, // DOB: YYYY/MM/DD
    /DOB\s*[:\-]?\s*\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}/i, // DOB: MM/DD/YYYY
    /BIRTH\s*[:\-]?\s*\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2}/i,
    /DATE\s*OF\s*BIRTH\s*[:\-]?\s*\d/i,
  ];

  if (labeledPatterns.some((pattern) => pattern.test(text))) {
    return true;
  }

  // Also check for dates with birth-plausible years (1940-2010)
  // This catches DOB even if label is garbled but year is readable
  const birthYearPattern = /\b(19[4-9]\d|200\d|2010)[\/\-\.]\d{2}[\/\-\.]\d{2}\b/;
  if (birthYearPattern.test(text)) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageData } = body;

    // Check for debug mode via query param
    const debugMode = request.nextUrl.searchParams.get("debug") === "1";

    if (!imageData || typeof imageData !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid imageData" },
        { status: 400 }
      );
    }

    console.log("[OCR API] Received image, preprocessing for pass 1 (general)...");
    console.log(`[OCR API] Using ${USE_OPENCV_PREPROCESS ? "Puppeteer+OpenCV" : "Sharp"} preprocessing`);

    // === Pass 1: General OCR ===
    let generalBuffer: Buffer;
    let preprocessResult: PreprocessResult | null = null;

    if (USE_OPENCV_PREPROCESS) {
      // Use Puppeteer+OpenCV preprocessing (warp, adaptive threshold, deskew)
      const result = await preprocessWithOpenCV(imageData);
      generalBuffer = result.buffer;
      preprocessResult = result.preprocessResult;
      console.log(
        `[OCR API] Puppeteer+OpenCV preprocessing complete in ${preprocessResult.processingTimeMs}ms`
      );
    } else {
      // Fallback to Sharp preprocessing
      generalBuffer = await preprocessImageSharp(imageData);
    }

    const generalTesseract = await getGeneralWorker();
    const generalResult = await generalTesseract.recognize(generalBuffer);

    const generalText = generalResult.data.text;
    const generalConfidence = generalResult.data.confidence;

    console.log("[OCR API] Pass 1 complete. Confidence:", generalConfidence);
    console.log("[OCR API] Pass 1 text length:", generalText.length);

    // === Pass 2: Dates-focused OCR (conditional) ===
    let datesText = "";
    let ranPass2 = false;

    // Run pass 2 only if a labeled DOB or birth-year date is missing from pass 1
    // This avoids false positives from issue/expiry dates like 2023/01/04
    const hasDobInPass1 = containsLabeledDobPattern(generalText);
    console.log("[OCR API] Labeled DOB pattern in pass 1:", hasDobInPass1);

    if (!hasDobInPass1) {
      console.log("[OCR API] DOB pattern not found in pass 1, running pass 2 (dates-focused)...");
      ranPass2 = true;

      const datesBuffer = await preprocessForDates(imageData);
      const datesTesseract = await getDatesWorker();
      const datesResult = await datesTesseract.recognize(datesBuffer);

      datesText = datesResult.data.text;
      console.log("[OCR API] Pass 2 complete. Text length:", datesText.length);
      console.log("[OCR API] Pass 2 raw text:", datesText.substring(0, 500));
    } else {
      console.log("[OCR API] DOB pattern found in pass 1, skipping pass 2");
    }

    // === Combine results ===
    // Append pass 2 text (if any) to help the frontend parser find dates
    const combinedText = ranPass2
      ? `${generalText}\n--- DATES PASS ---\n${datesText}`
      : generalText;

    console.log("[OCR API] Combined text length:", combinedText.length);

    // Debug mode returns per-pass breakdown and preprocessed image preview
    if (debugMode) {
      const debugResponse: Record<string, unknown> = {
        text: combinedText,
        confidence: generalConfidence,
        debug: {
          generalText,
          generalConfidence,
          datesText,
          ranPass2,
          usedOpenCV: USE_OPENCV_PREPROCESS,
          opencvProcessingTimeMs: preprocessResult?.processingTimeMs ?? null,
        },
      };

      // Include base64 preview of preprocessed image (for visual debugging)
      // Only include if OpenCV was used and the buffer exists
      if (preprocessResult) {
        // Limit base64 preview to avoid huge responses
        // The preprocessed image should be small enough (binarized)
        debugResponse.preprocessedImageBase64 = bufferToBase64DataUrl(
          preprocessResult.preprocessedBuffer
        );
        debugResponse.rectifiedImageBase64 = bufferToBase64DataUrl(
          preprocessResult.rectifiedBuffer
        );
      }

      return NextResponse.json(debugResponse);
    }

    // Standard response (frontend unchanged)
    return NextResponse.json({
      text: combinedText,
      confidence: generalConfidence,
    });
  } catch (error) {
    console.error("[OCR API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OCR failed" },
      { status: 500 }
    );
  }
}
