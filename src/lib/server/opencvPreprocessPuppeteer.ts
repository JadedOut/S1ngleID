/**
 * Puppeteer-based OpenCV preprocessing for ID document OCR.
 *
 * Runs the exact same browser OpenCV.js code in a headless Chrome instance
 * to ensure 100% parity with frontend preprocessing behavior.
 *
 * Key features:
 * - Singleton browser instance (reused across requests)
 * - Page pool for concurrent request handling
 * - Same OpenCV.js from CDN as frontend
 * - Same preprocessing pipeline as opencvPreprocess.ts
 */

import puppeteer, { Browser, Page } from "puppeteer";

// Singleton browser instance
let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

// Page pool for concurrent requests
const pagePool: Page[] = [];
const MAX_POOL_SIZE = 3;
const pagesInUse = new Set<Page>();

// Timeouts
const OPENCV_LOAD_TIMEOUT = 60000; // 60s for OpenCV.js to load
const PREPROCESS_TIMEOUT = 120000; // 120s for preprocessing

/**
 * HTML template with embedded OpenCV.js preprocessing code.
 * This is the exact same code as opencvPreprocess.ts, converted to plain JavaScript.
 */
const HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>OpenCV Preprocessing</title>
</head>
<body>
<script>
let openCvReadyPromise = null;

function getCvFromWindow() {
  return window.cv ?? null;
}

function isCvReady(cv) {
  return Boolean(
    cv &&
      cv.Mat &&
      cv.imread &&
      cv.imshow &&
      cv.cvtColor &&
      cv.findContours &&
      cv.getPerspectiveTransform &&
      cv.warpPerspective
  );
}

function ensureOpenCvReady() {
  if (openCvReadyPromise) {
    console.log("[OpenCV] Using existing OpenCV instance");
    return openCvReadyPromise;
  }

  console.log("[OpenCV] Initializing OpenCV.js...");
  openCvReadyPromise = new Promise((resolve, reject) => {
    const existingCv = getCvFromWindow();
    if (existingCv && isCvReady(existingCv)) {
      console.log("[OpenCV] OpenCV already loaded and ready");
      resolve(existingCv);
      return;
    }

    const existingScript = document.querySelector('script[data-opencv="true"]');
    if (existingScript) {
      console.log("[OpenCV] Script tag exists, waiting for initialization...");
      const check = () => {
        const cv = getCvFromWindow();
        if (cv && isCvReady(cv)) {
          console.log("[OpenCV] OpenCV ready!");
          resolve(cv);
        } else setTimeout(check, 50);
      };
      check();
      return;
    }

    console.log("[OpenCV] Loading OpenCV.js from CDN...");
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.dataset.opencv = "true";
    script.src = "https://docs.opencv.org/4.x/opencv.js";

    script.onerror = () => {
      console.error("[OpenCV] Failed to load OpenCV.js script");
      reject(new Error("Failed to load OpenCV.js. Check your connection."));
    };

    script.onload = () => {
      console.log("[OpenCV] Script loaded, initializing runtime...");
      const cv = getCvFromWindow();
      if (!cv) {
        console.error("[OpenCV] cv object not found after script load");
        reject(new Error("OpenCV.js loaded but cv is not available"));
        return;
      }

      if (typeof cv.onRuntimeInitialized === "function") {
        const prev = cv.onRuntimeInitialized;
        cv.onRuntimeInitialized = () => {
          try { prev(); } catch {}
          console.log("[OpenCV] Runtime initialized successfully");
          resolve(cv);
        };
      } else {
        cv.onRuntimeInitialized = () => {
          console.log("[OpenCV] Runtime initialized successfully");
          resolve(cv);
        };
      }

      const check = () => {
        const cv2 = getCvFromWindow();
        if (cv2 && isCvReady(cv2)) {
          console.log("[OpenCV] OpenCV ready (immediate check)");
          resolve(cv2);
        } else setTimeout(check, 50);
      };
      check();
    };

    document.head.appendChild(script);
  });

  return openCvReadyPromise;
}

async function imageDataUrlToMat(imageDataUrl) {
  console.log("[OpenCV] Converting image data URL to Mat...");
  const cv = await ensureOpenCvReady();

  const img = new Image();
  img.decoding = "async";
  img.src = imageDataUrl;

  await new Promise((resolve, reject) => {
    img.onload = () => {
      console.log("[OpenCV] Image loaded: " + img.width + "x" + img.height);
      resolve();
    };
    img.onerror = () => {
      console.error("[OpenCV] Failed to load image");
      reject(new Error("Failed to load image for OpenCV"));
    };
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");
  ctx.drawImage(img, 0, 0);

  const mat = cv.imread(canvas);
  console.log("[OpenCV] Mat created: " + mat.cols + "x" + mat.rows + ", channels: " + mat.channels());
  return { cv, mat, canvas };
}

function matToPngDataUrl(cv, mat) {
  const canvas = document.createElement("canvas");
  canvas.width = mat.cols;
  canvas.height = mat.rows;
  cv.imshow(canvas, mat);
  return canvas.toDataURL("image/png");
}

function orderQuadPoints(points) {
  const sum = points.map((p) => p.x + p.y);
  const diff = points.map((p) => p.x - p.y);
  const tl = points[sum.indexOf(Math.min(...sum))];
  const br = points[sum.indexOf(Math.max(...sum))];
  const tr = points[diff.indexOf(Math.max(...diff))];
  const bl = points[diff.indexOf(Math.min(...diff))];
  return [tl, tr, br, bl];
}

function getQuadFromContour(cv, contour) {
  const peri = cv.arcLength(contour, true);
  const approx = new cv.Mat();
  cv.approxPolyDP(contour, approx, 0.02 * peri, true);

  try {
    if (approx.rows !== 4) return null;
    const pts = [];
    for (let i = 0; i < 4; i++) {
      const x = approx.intPtr(i, 0)[0];
      const y = approx.intPtr(i, 0)[1];
      pts.push({ x, y });
    }
    return orderQuadPoints(pts);
  } finally {
    approx.delete();
  }
}

function warpPerspectiveToCard(cv, src, quad) {
  const [tl, tr, br, bl] = quad;
  const widthA = Math.hypot(br.x - bl.x, br.y - bl.y);
  const widthB = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const maxWidth = Math.max(widthA, widthB);

  const heightA = Math.hypot(tr.x - br.x, tr.y - br.y);
  const heightB = Math.hypot(tl.x - bl.x, tl.y - bl.y);
  const maxHeight = Math.max(heightA, heightB);

  const dst = new cv.Mat();
  const dsize = new cv.Size(Math.round(maxWidth), Math.round(maxHeight));

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, dsize.width - 1, 0, dsize.width - 1, dsize.height - 1, 0, dsize.height - 1,
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

  srcTri.delete();
  dstTri.delete();
  M.delete();

  return dst;
}

function deskewBinary(cv, bin) {
  const nonZero = new cv.Mat();
  cv.findNonZero(bin, nonZero);
  if (nonZero.rows < 10) {
    nonZero.delete();
    return bin;
  }

  const rotated = new cv.Mat();
  try {
    const rect = cv.minAreaRect(nonZero);
    let angle = rect.angle;
    if (angle < -45) angle += 90;

    const center = new cv.Point(bin.cols / 2, bin.rows / 2);
    const rotMat = cv.getRotationMatrix2D(center, angle, 1.0);
    const dsize = new cv.Size(bin.cols, bin.rows);
    cv.warpAffine(bin, rotated, rotMat, dsize, cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    rotMat.delete();
    return rotated;
  } catch {
    rotated.delete();
    return bin;
  } finally {
    nonZero.delete();
  }
}

async function preprocessOntarioDlToPng(imageDataUrl) {
  console.log("[OpenCV] Starting preprocessing pipeline...");
  const { cv, mat } = await imageDataUrlToMat(imageDataUrl);

  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  let rectified = null;
  let rectGray = null;
  let preprocessed = null;

  try {
    console.log("[OpenCV] Step 1: Converting to grayscale...");
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
    
    console.log("[OpenCV] Step 2: Applying Gaussian blur...");
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    
    console.log("[OpenCV] Step 3: Edge detection (Canny)...");
    cv.Canny(blurred, edges, 50, 150);

    console.log("[OpenCV] Step 4: Finding contours...");
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    console.log("[OpenCV] Found " + contours.size() + " contours");

    let bestContour = null;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c, false);
      if (area > bestArea) {
        bestArea = area;
        bestContour = c;
      }
    }

    if (bestContour) {
      console.log("[OpenCV] Best contour area: " + bestArea.toFixed(0));
      const quad = getQuadFromContour(cv, bestContour);
      if (quad) {
        console.log("[OpenCV] Step 5: Perspective rectification...");
        rectified = warpPerspectiveToCard(cv, mat, quad);
        console.log("[OpenCV] Rectified card: " + rectified.cols + "x" + rectified.rows);
      } else {
        console.warn("[OpenCV] Could not extract quad from contour, using grayscale");
      }
    } else {
      console.warn("[OpenCV] No suitable contour found, using grayscale");
    }

    if (!rectified) {
      rectified = gray.clone();
    }

    console.log("[OpenCV] Step 6: Preparing for thresholding...");
    if (rectified.channels && rectified.channels() > 1) {
      rectGray = new cv.Mat();
      cv.cvtColor(rectified, rectGray, cv.COLOR_RGBA2GRAY);
    } else {
      rectGray = rectified.clone();
    }

    console.log("[OpenCV] Step 7: Adaptive thresholding...");
    const bin = new cv.Mat();
    cv.adaptiveThreshold(rectGray, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 7);

    console.log("[OpenCV] Step 8: Deskewing...");
    const deskewed = deskewBinary(cv, bin);
    preprocessed = deskewed === bin ? bin : deskewed;
    if (deskewed !== bin) {
      console.log("[OpenCV] Deskewing applied rotation");
    } else {
      console.log("[OpenCV] No deskewing needed");
    }

    console.log("[OpenCV] Step 9: Converting to PNG data URLs...");
    const rectifiedPngDataUrl = matToPngDataUrl(cv, rectified);
    const preprocessedPngDataUrl = matToPngDataUrl(cv, preprocessed);
    console.log("[OpenCV] Preprocessing complete!");

    if (deskewed !== bin) {
      bin.delete();
    }

    return { rectifiedPngDataUrl, preprocessedPngDataUrl };
  } finally {
    mat.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
    if (rectGray) rectGray.delete();
    if (rectified) rectified.delete();
    if (preprocessed && preprocessed !== rectified) preprocessed.delete();
  }
}

window.preprocessOntarioDlToPng = preprocessOntarioDlToPng;
window.ensureOpenCvReady = ensureOpenCvReady;

console.log("[OpenCV] Preprocessing page loaded, functions exposed globally");
<\/script>
</body>
</html>`;

export interface PreprocessResult {
  /** Preprocessed (binarized) image as PNG buffer */
  preprocessedBuffer: Buffer;
  /** Rectified (perspective-corrected) image as PNG buffer */
  rectifiedBuffer: Buffer;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Get or launch the singleton browser instance.
 */
async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  console.log("[Puppeteer] Launching headless browser...");
  browserLaunchPromise = puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-translate",
      "--mute-audio",
      "--no-first-run",
    ],
  });

  browserInstance = await browserLaunchPromise;
  console.log("[Puppeteer] Browser launched successfully");

  // Handle browser disconnect
  browserInstance.on("disconnected", () => {
    console.log("[Puppeteer] Browser disconnected");
    browserInstance = null;
    browserLaunchPromise = null;
    pagePool.length = 0;
    pagesInUse.clear();
  });

  return browserInstance;
}

/**
 * Get the HTML template content.
 */
function getHtmlTemplate(): string {
  return HTML_TEMPLATE;
}

/**
 * Get a page from the pool or create a new one.
 */
async function acquirePage(): Promise<Page> {
  const browser = await getBrowser();

  // Try to get a page from the pool
  while (pagePool.length > 0) {
    const page = pagePool.pop()!;
    if (!page.isClosed()) {
      pagesInUse.add(page);
      return page;
    }
  }

  // Create a new page
  console.log("[Puppeteer] Creating new page...");
  const page = await browser.newPage();

  // Forward console logs from the page
  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === "error") {
      console.error("[Puppeteer:Page]", text);
    } else if (type === "warn") {
      console.warn("[Puppeteer:Page]", text);
    } else {
      console.log("[Puppeteer:Page]", text);
    }
  });

  // Forward page errors
  page.on("pageerror", (err) => {
    console.error("[Puppeteer:PageError]", err.message);
  });

  // Set the HTML content with the preprocessing code
  const htmlContent = getHtmlTemplate();
  await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

  // Wait for OpenCV.js to load and be ready
  console.log("[Puppeteer] Waiting for OpenCV.js to load...");
  await page.evaluate(async () => {
    // @ts-ignore - window.ensureOpenCvReady is defined in the HTML
    await window.ensureOpenCvReady();
  });
  console.log("[Puppeteer] OpenCV.js loaded and ready");

  pagesInUse.add(page);
  return page;
}

/**
 * Release a page back to the pool or close it.
 */
function releasePage(page: Page): void {
  pagesInUse.delete(page);

  if (page.isClosed()) {
    return;
  }

  if (pagePool.length < MAX_POOL_SIZE) {
    pagePool.push(page);
  } else {
    page.close().catch(() => {});
  }
}

/**
 * Convert a base64 data URL to a Buffer.
 */
function base64DataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64, "base64");
}

/**
 * Convert a Buffer to a base64 data URL.
 */
function bufferToBase64DataUrl(buffer: Buffer, mimeType = "image/png"): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/**
 * Preprocess an ID document image using Puppeteer + OpenCV.js.
 *
 * This runs the exact same preprocessing pipeline as the frontend:
 * - grayscale
 * - find largest 4-point contour
 * - perspective warp
 * - adaptive threshold
 * - deskew
 *
 * @param imageDataUrl - Input image as a base64 data URL
 * @returns PreprocessResult with binarized and rectified image buffers
 */
export async function preprocessIdDocumentPuppeteer(
  imageDataUrl: string
): Promise<PreprocessResult> {
  const startTime = Date.now();
  console.log("[Puppeteer] Starting preprocessing...");

  let page: Page | null = null;

  try {
    page = await acquirePage();

    // Run the preprocessing function in the browser context
    const result = await page.evaluate(
      async (imageData: string) => {
        // @ts-ignore - window.preprocessOntarioDlToPng is defined in the HTML
        const { preprocessedPngDataUrl, rectifiedPngDataUrl } =
          await window.preprocessOntarioDlToPng(imageData);
        return { preprocessedPngDataUrl, rectifiedPngDataUrl };
      },
      imageDataUrl
    );

    // Convert data URLs to Buffers
    const preprocessedBuffer = base64DataUrlToBuffer(result.preprocessedPngDataUrl);
    const rectifiedBuffer = base64DataUrlToBuffer(result.rectifiedPngDataUrl);

    const processingTimeMs = Date.now() - startTime;
    console.log(`[Puppeteer] Preprocessing complete in ${processingTimeMs}ms`);

    return {
      preprocessedBuffer,
      rectifiedBuffer,
      processingTimeMs,
    };
  } catch (error) {
    console.error("[Puppeteer] Preprocessing failed:", error);
    throw error;
  } finally {
    if (page) {
      releasePage(page);
    }
  }
}

/**
 * Preprocess an ID document image from a Buffer.
 *
 * @param imageBuffer - Input image as a Buffer (PNG, JPEG, etc.)
 * @returns PreprocessResult with binarized and rectified image buffers
 */
export async function preprocessIdDocument(
  imageBuffer: Buffer
): Promise<PreprocessResult> {
  // Convert buffer to data URL
  const imageDataUrl = bufferToBase64DataUrl(imageBuffer);
  return preprocessIdDocumentPuppeteer(imageDataUrl);
}

/**
 * Close the browser and clean up resources.
 * Call this on process shutdown.
 */
export async function closeBrowser(): Promise<void> {
  console.log("[Puppeteer] Closing browser...");

  // Close all pooled pages
  for (const page of pagePool) {
    if (!page.isClosed()) {
      await page.close().catch(() => {});
    }
  }
  pagePool.length = 0;

  // Close all pages in use
  for (const page of pagesInUse) {
    if (!page.isClosed()) {
      await page.close().catch(() => {});
    }
  }
  pagesInUse.clear();

  // Close the browser
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
    browserLaunchPromise = null;
  }

  console.log("[Puppeteer] Browser closed");
}

// Graceful shutdown handlers
process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("beforeExit", async () => {
  await closeBrowser();
});
