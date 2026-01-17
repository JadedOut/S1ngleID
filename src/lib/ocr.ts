import { createWorker, Worker, PSM } from "tesseract.js";

export interface IDData {
    name: string | null;
    idNumber: string | null;
    birthYear: number | null;
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

        // Set parameters for better ID card/document recognition
        await worker.setParameters({
            tessedit_pageseg_mode: PSM.AUTO, // Automatic page segmentation
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/-., ',
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
 */
export async function extractIDData(
    imageData: string,
    onProgress?: (progress: number, status: string) => void
): Promise<OCRResult> {
    try {
        onProgress?.(0, "Initializing OCR engine...");
        console.log("Starting OCR extraction...");

        // Get or create worker
        const tesseractWorker = await getWorker();

        onProgress?.(10, "Preprocessing image...");

        // Preprocess image for better results
        const processedImage = await preprocessImage(imageData);
        console.log("Image preprocessed");

        onProgress?.(20, "Analyzing document...");

        // Run OCR with timeout protection
        const result = await Promise.race([
            tesseractWorker.recognize(processedImage),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("OCR timeout - image may be too complex")), 60000)
            )
        ]);

        onProgress?.(80, "Extracting data...");

        const text = result.data.text;
        const confidence = result.data.confidence;

        console.log("OCR Result:", {
            textLength: text.length,
            confidence: Math.round(confidence),
            textPreview: text.substring(0, 200)
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

    return { name, idNumber, birthYear };
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
 * Extract birth year from text
 */
function extractBirthYear(text: string): number | null {
    // Look for DOB patterns first (various date formats)
    const dobPatterns = [
        // Common DOB labels
        /(?:DOB|DATE\s*OF\s*BIRTH|BIRTH|BORN|BD|BIRTHDATE)[:\s]*([\d\/\-\.]+)/i,
        // DD/MM/YYYY or MM/DD/YYYY
        /(?:DOB|BIRTH)[:\s]*(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/i,
        // YYYY/MM/DD (ISO format)
        /(?:DOB|BIRTH)[:\s]*(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/i,
        // DD MMM YYYY (e.g., 15 JAN 1990)
        /(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(\d{4})/i,
        // Stand-alone date patterns
        /(\d{1,2})[\/-](\d{1,2})[\/-](19\d{2}|20[0-2]\d)/,
        /(19\d{2}|20[0-2]\d)[\/-](\d{1,2})[\/-](\d{1,2})/,
    ];

    for (const pattern of dobPatterns) {
        const match = text.match(pattern);
        if (match) {
            console.log("DOB pattern match:", match);

            // Find the 4-digit year in the match groups
            for (let i = 1; i < match.length; i++) {
                const val = match[i];
                if (!val) continue;

                // Check for 4-digit year
                if (/^\d{4}$/.test(val)) {
                    const year = parseInt(val, 10);
                    if (year >= 1900 && year <= 2025) {
                        return year;
                    }
                }

                // Check for 2-digit year
                if (/^\d{2}$/.test(val) && parseInt(val, 10) <= 31) {
                    continue; // Likely a day, not year
                }
                if (/^\d{2}$/.test(val)) {
                    const yearNum = parseInt(val, 10);
                    const year = yearNum > 30 ? 1900 + yearNum : 2000 + yearNum;
                    if (year >= 1900 && year <= 2007) {
                        return year;
                    }
                }
            }

            // Try to parse date string directly
            if (match[1] && /\d/.test(match[1])) {
                const dateStr = match[1];
                const yearMatch = dateStr.match(/(19\d{2}|20[0-2]\d)/);
                if (yearMatch) {
                    return parseInt(yearMatch[1], 10);
                }
            }
        }
    }

    // Fallback: look for any 4-digit year between 1920-2007
    // Exclude years that are likely issue/expiry dates (future or very recent years)
    const currentYear = new Date().getFullYear();
    const yearMatches = text.match(/\b(19[2-9]\d|200[0-7])\b/g);

    if (yearMatches) {
        // Filter out likely expiry dates (often future dates)
        const birthYears = yearMatches.filter(y => {
            const year = parseInt(y, 10);
            // Birth years should be at least 19 years ago
            return year <= currentYear - 19;
        });

        if (birthYears.length > 0) {
            // Prefer years that appear near DOB-related text
            for (const yearStr of birthYears) {
                const idx = text.indexOf(yearStr);
                const context = text.substring(Math.max(0, idx - 30), idx + 10);
                if (/DOB|BIRTH|BORN|DATE/i.test(context)) {
                    return parseInt(yearStr, 10);
                }
            }

            // Return the earliest plausible year (likely DOB, not issue date)
            birthYears.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
            return parseInt(birthYears[0], 10);
        }
    }

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
