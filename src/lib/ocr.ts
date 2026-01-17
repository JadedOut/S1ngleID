import { createWorker, Worker, PSM } from "tesseract.js";

export interface IDData {
    name: string | null;
    idNumber: string | null;
    birthYear: number | null;
    expiryDate: string | null; // Format: YYYY-MM-DD or YYYY/MM/DD
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
 * Initialize Tesseract worker with optimized settings for ID documents
 */
async function getWorker(): Promise<Worker> {
    if (!worker) {
        console.log("Initializing Tesseract worker...");
        worker = await createWorker("eng", 1, {
            logger: (m) => {
                console.log(`Tesseract: ${m.status} ${m.progress ? Math.round(m.progress * 100) + '%' : ''}`);
            },
        });

        // Set parameters for ID card/document recognition
        // Using SINGLE_BLOCK mode to ensure entire document is captured
        await worker.setParameters({
            tessedit_pageseg_mode: PSM.SINGLE_BLOCK, // Treat as single block - captures all text
            preserve_interword_spaces: '1',
        });

        console.log("Tesseract worker ready");
    }
    return worker;
}

/**
 * Preprocess image for better OCR results
 * Uses Canvas API to enhance contrast and convert to grayscale
 */
async function preprocessImage(imageData: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            if (!ctx) {
                resolve(imageData); // Fallback to original
                return;
            }

            // Set canvas size (limit max dimension for performance)
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

            // Draw image
            ctx.drawImage(img, 0, 0, width, height);

            // Get image data for processing
            const imgData = ctx.getImageData(0, 0, width, height);
            const data = imgData.data;

            // Convert to grayscale and increase contrast
            for (let i = 0; i < data.length; i += 4) {
                // Grayscale using luminosity method
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

                // Apply contrast enhancement (simple threshold-based)
                const contrast = 1.3; // Increase contrast by 30%
                const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
                const enhanced = factor * (gray - 128) + 128;

                // Clamp values
                const final = Math.max(0, Math.min(255, enhanced));

                data[i] = final;     // R
                data[i + 1] = final; // G
                data[i + 2] = final; // B
                // Alpha stays the same
            }

            ctx.putImageData(imgData, 0, 0);

            // Return as high-quality JPEG
            resolve(canvas.toDataURL("image/jpeg", 0.95));
        };

        img.onerror = () => {
            console.warn("Image preprocessing failed, using original");
            resolve(imageData);
        };

        img.src = imageData;
    });
}

/**
 * Extract ID data from an image using Tesseract OCR
 * All processing happens client-side - data never leaves the browser
 * Runs OCR on both preprocessed and original images to maximize text capture
 */
export async function extractIDData(
    imageData: string,
    onProgress?: (progress: number, status: string) => void
): Promise<OCRResult> {
    try {
        onProgress?.(0, "Initializing OCR engine...");
        console.log("Starting OCR extraction...");

        // Reset worker to apply any new settings
        if (worker) {
            await worker.terminate();
            worker = null;
        }

        // Get fresh worker
        const tesseractWorker = await getWorker();

        onProgress?.(10, "Preprocessing image...");

        // Preprocess image for better results
        const processedImage = await preprocessImage(imageData);
        console.log("Image preprocessed");

        onProgress?.(20, "Analyzing document (pass 1)...");

        // Run OCR on preprocessed image first
        const result1 = await Promise.race([
            tesseractWorker.recognize(processedImage),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("OCR timeout - image may be too complex")), 60000)
            )
        ]);

        let text = result1.data.text;
        let confidence = result1.data.confidence;

        console.log("OCR Pass 1 (preprocessed):", {
            textLength: text.length,
            confidence: Math.round(confidence),
            textPreview: text.substring(0, 300)
        });

        onProgress?.(50, "Analyzing document (pass 2)...");

        // Run OCR on ORIGINAL image too - sometimes preprocessing removes important details
        try {
            const result2 = await Promise.race([
                tesseractWorker.recognize(imageData),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("OCR timeout")), 60000)
                )
            ]);

            console.log("OCR Pass 2 (original):", {
                textLength: result2.data.text.length,
                confidence: Math.round(result2.data.confidence),
                textPreview: result2.data.text.substring(0, 300)
            });

            // If original image gave better/longer results, use it or combine
            if (result2.data.text.length > text.length) {
                console.log("Using original image results (more text captured)");
                text = result2.data.text;
                confidence = result2.data.confidence;
            } else if (result2.data.text.length > text.length * 0.8) {
                // Combine texts if they're similar in length - might have different captured sections
                const combinedText = text + "\n---PASS2---\n" + result2.data.text;
                console.log("Combining results from both passes");
                text = combinedText;
                confidence = Math.max(confidence, result2.data.confidence);
            }
        } catch (e) {
            console.warn("Second OCR pass failed, using first pass only:", e);
        }

        onProgress?.(80, "Extracting data...");

        console.log("Final OCR Result:", {
            textLength: text.length,
            confidence: Math.round(confidence),
            fullText: text
        });

        // Parse the extracted text
        const parsedData = parseIDText(text);

        console.log("Parsed data:", parsedData);

        onProgress?.(100, "Complete!");

        return {
            success: true,
            data: {
                ...parsedData,
                rawText: text,
                confidence,
            },
        };
    } catch (error) {
        console.error("OCR Error:", error);

        // Provide more helpful error messages
        let errorMessage = "Unknown OCR error";

        if (error instanceof Error) {
            if (error.message.includes("timeout")) {
                errorMessage = "Processing took too long. Try a clearer image.";
            } else if (error.message.includes("network") || error.message.includes("fetch")) {
                errorMessage = "Failed to load OCR engine. Check your internet connection.";
            } else if (error.message.includes("memory")) {
                errorMessage = "Image is too large. Try a smaller image.";
            } else {
                errorMessage = error.message;
            }
        }

        return {
            success: false,
            data: null,
            error: errorMessage,
        };
    }
}

/**
 * Parse extracted text to find relevant ID fields
 */
function parseIDText(text: string): Omit<IDData, "rawText" | "confidence"> {
    // Clean up the text
    const cleanText = text.replace(/\s+/g, " ").trim();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    console.log("Parsing text, lines:", lines.length);

    // Extract name (typically appears after "NAME" or at specific positions)
    const name = extractName(cleanText, lines);

    // Extract ID number (look for patterns like LICENSE #, ID #, DL#, etc.)
    const idNumber = extractIDNumber(cleanText);

    // Extract birth year (look for DOB patterns or 4-digit years between 1900-2007)
    const birthYear = extractBirthYear(cleanText);

    // Extract expiry date
    const expiryDate = extractExpiryDate(cleanText);

    return { name, idNumber, birthYear, expiryDate };
}

/**
 * Extract name from ID text
 */
function extractName(text: string, lines: string[]): string | null {
    // Common patterns for names on IDs (including passport patterns)
    const namePatterns = [
        /(?:SURNAME|FAMILY\s*NAME)[:\s<]+([A-Z][A-Z\s]+)/i,
        /(?:GIVEN\s*NAME|FIRST\s*NAME)[:\s<]+([A-Z][A-Z\s]+)/i,
        /(?:NAME|NM|FN|LN)[:\s]+([A-Z][A-Z\s]+)/i,
        /(?:FIRST|GIVEN)[:\s]+([A-Z]+)/i,
        /(?:LAST|SURNAME|FAMILY)[:\s]+([A-Z]+)/i,
        /P<[A-Z]{3}([A-Z]+)<<([A-Z]+)/i, // Machine-readable zone (passport)
    ];

    for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match) {
            // Handle MRZ format (last<<first)
            if (match[2]) {
                return `${match[2].replace(/<+/g, ' ').trim()} ${match[1].replace(/<+/g, ' ').trim()}`;
            }
            return match[1].replace(/<+/g, ' ').trim();
        }
    }

    // Fallback: look for lines with just letters (potential name)
    for (const line of lines) {
        if (/^[A-Z][A-Z\s,.-]+$/i.test(line) && line.length > 5 && line.length < 50) {
            // Skip common non-name fields
            if (!/DRIVER|LICENSE|STATE|ISSUE|EXPIR|PASSPORT|REPUBLIC|UNITED|DEPARTMENT/i.test(line)) {
                return line;
            }
        }
    }

    return null;
}

/**
 * Extract ID number from text
 */
function extractIDNumber(text: string): string | null {
    // Common ID number patterns
    const idPatterns = [
        /(?:PASSPORT\s*NO|PASS\s*NO)[.:\s]*([A-Z0-9]{6,12})/i,
        /(?:DL|LIC|LICENSE|ID)[#:\s]*([A-Z0-9]{6,15})/i,
        /(?:NO|NUMBER|#)[:\s]*([A-Z0-9]{6,15})/i,
        /\b([A-Z]\d{7,12})\b/, // Letter followed by digits (common format)
        /\b([A-Z]{2}\d{6,9})\b/, // Two letters followed by digits (passport)
        /\b(\d{9})\b/, // 9-digit number (common passport format)
    ];

    for (const pattern of idPatterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1].replace(/\s/g, "");
        }
    }

    return null;
}

/**
 * Extract expiry date from ID text
 * Looks for dates near EXP, EXPIRY, EXPIRES, DEL labels
 */
function extractExpiryDate(text: string): string | null {
    // Patterns to find expiry dates - look for date after EXP/EXPIRY/DEL
    const expiryPatterns = [
        // EXP followed by date: EXP 2026/01/23, EXP: 2026-01-23
        /(?:EXP|EXPIRY|EXPIRES|EXPIR)[.:\s]*(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/i,
        // Canadian format: EXP 2026/01/23
        /(?:EXP)[.:\s]*(\d{4})[\/\-](\d{2})[\/\-](\d{2})/i,
        // DD/MM/YYYY or MM/DD/YYYY after EXP
        /(?:EXP|EXPIRY|EXPIRES)[.:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
        // Just looking for 4b EXP pattern from Canadian license
        /4b\s*EXP[^\d]*(\d{4})[\/\-](\d{2})[\/\-](\d{2})/i,
    ];

    for (const pattern of expiryPatterns) {
        const match = text.match(pattern);
        if (match) {
            let year: string, month: string, day: string;

            // Determine if YYYY-MM-DD or DD-MM-YYYY format
            if (match[1].length === 4) {
                // YYYY-MM-DD format
                year = match[1];
                month = match[2].padStart(2, '0');
                day = match[3].padStart(2, '0');
            } else if (match[3].length === 4) {
                // DD-MM-YYYY or MM-DD-YYYY format
                year = match[3];
                // Assume DD/MM/YYYY for non-US
                day = match[1].padStart(2, '0');
                month = match[2].padStart(2, '0');
            } else {
                continue;
            }

            const expiryDate = `${year}-${month}-${day}`;
            console.log("Found expiry date:", expiryDate);
            return expiryDate;
        }
    }

    // Fallback: look for any date near EXP text
    const expIndex = text.toUpperCase().indexOf('EXP');
    if (expIndex !== -1) {
        const nearbyText = text.substring(expIndex, Math.min(text.length, expIndex + 30));
        const dateMatch = nearbyText.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (dateMatch) {
            const expiryDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
            console.log("Found expiry date (fallback):", expiryDate);
            return expiryDate;
        }
    }

    return null;
}

/**
 * Extract birth year from text
 * Specifically handles Canadian driver's licenses where DOB is at bottom
 * and avoids picking up ISS (issue) or EXP (expiry) dates
 */
function extractBirthYear(text: string): number | null {
    const currentYear = new Date().getFullYear();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    console.log("Extracting birth year from text, lines:", lines);

    // First, find all dates in the text with their context
    const dateContexts: Array<{ year: number; context: string; isDOB: boolean; isIssueExpiry: boolean }> = [];

    // Pattern to find dates: YYYY-MM-DD, DD-MM-YYYY, MM-DD-YYYY, DD/MM/YYYY, etc.
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})|(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g;

    let match;
    while ((match = dateRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const idx = match.index;

        // Get context around the date (50 chars before, 20 after)
        const contextStart = Math.max(0, idx - 50);
        const contextEnd = Math.min(text.length, idx + fullMatch.length + 20);
        const context = text.substring(contextStart, contextEnd).toUpperCase();

        // Extract year from date
        let year: number | null = null;

        if (match[4]) {
            // YYYY-MM-DD format
            year = parseInt(match[4], 10);
        } else if (match[3]) {
            // DD-MM-YYYY or MM-DD-YYYY format
            const yearStr = match[3];
            if (yearStr.length === 4) {
                year = parseInt(yearStr, 10);
            } else if (yearStr.length === 2) {
                const y = parseInt(yearStr, 10);
                year = y > 30 ? 1900 + y : 2000 + y;
            }
        }

        if (year && year >= 1900 && year <= currentYear) {
            // Check if this is near DOB-related text
            const isDOB = /DOB|D\.O\.B|DATE\s*OF\s*BIRTH|BIRTH|BORN|NAISSANCE|DN/i.test(context);

            // Check if this is near ISSUE/EXPIRY-related text  
            const isIssueExpiry = /ISS|ISSUE|ISSUED|EXP|EXPIR|EXPIRY|DEL|VALID|RENEW/i.test(context);

            dateContexts.push({
                year,
                context,
                isDOB,
                isIssueExpiry
            });

            console.log("Found date:", { fullMatch, year, isDOB, isIssueExpiry, context: context.substring(0, 60) });
        }
    }

    // Also look for standalone years with context
    const yearOnlyRegex = /\b(19[3-9]\d|20[0-2]\d)\b/g;
    while ((match = yearOnlyRegex.exec(text)) !== null) {
        const year = parseInt(match[1], 10);
        const idx = match.index;
        const contextStart = Math.max(0, idx - 50);
        const contextEnd = Math.min(text.length, idx + 10);
        const context = text.substring(contextStart, contextEnd).toUpperCase();

        // Only add if not already captured in a date
        const alreadyFound = dateContexts.some(d => d.year === year);
        if (!alreadyFound && year <= currentYear - 10) { // At least 10 years ago
            const isDOB = /DOB|D\.O\.B|DATE\s*OF\s*BIRTH|BIRTH|BORN|NAISSANCE|DN/i.test(context);
            const isIssueExpiry = /ISS|ISSUE|ISSUED|EXP|EXPIR|EXPIRY|DEL|VALID|RENEW/i.test(context);

            dateContexts.push({ year, context, isDOB, isIssueExpiry });
        }
    }

    // Priority 1: Find years explicitly marked as DOB
    const dobYears = dateContexts.filter(d => d.isDOB && !d.isIssueExpiry && d.year <= currentYear - 19);
    if (dobYears.length > 0) {
        console.log("Found DOB year:", dobYears[0].year);
        return dobYears[0].year;
    }

    // Priority 2: Find years that are NOT issue/expiry dates and are old enough
    const nonIssueYears = dateContexts.filter(d =>
        !d.isIssueExpiry &&
        d.year >= 1930 &&
        d.year <= currentYear - 19
    );

    if (nonIssueYears.length > 0) {
        // Return the oldest year (most likely to be DOB, not issue date)
        nonIssueYears.sort((a, b) => a.year - b.year);
        console.log("Using oldest non-issue year:", nonIssueYears[0].year);
        return nonIssueYears[0].year;
    }

    // Priority 3: Any year old enough to be a birth year (at least 19 years ago)
    const oldEnoughYears = dateContexts.filter(d => d.year >= 1930 && d.year <= currentYear - 19);
    if (oldEnoughYears.length > 0) {
        // Return the oldest year
        oldEnoughYears.sort((a, b) => a.year - b.year);
        console.log("Using oldest year:", oldEnoughYears[0].year);
        return oldEnoughYears[0].year;
    }

    console.log("No valid birth year found");
    return null;
}

/**
 * Extract photo region from ID image
 * This is a placeholder - actual implementation would use face detection
 */
export async function extractIDPhoto(imageData: string): Promise<string | null> {
    // For now, we'll use face-api.js in the face matching step to detect faces
    // This function can be enhanced to crop just the face region from the ID
    return imageData;
}

/**
 * Check if OCR result passes minimum confidence threshold
 * Note: Lowered to 40% since real-world ID photos often have lower confidence
 * The key is whether we can extract the birth year, not overall text confidence
 */
export function isConfidenceAcceptable(confidence: number): boolean {
    return confidence >= 40;
}

/**
 * Clean up OCR worker when done
 */
export async function terminateOCR(): Promise<void> {
    if (worker) {
        await worker.terminate();
        worker = null;
    }
}
