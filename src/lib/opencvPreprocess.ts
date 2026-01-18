import type { NormalizedRect } from "./ontarioDlRegions";

declare global {
  interface Window {
    cv?: any;
  }
}

let openCvReadyPromise: Promise<any> | null = null;

function getCvFromWindow(): any | null {
  if (typeof window === "undefined") return null;
  // OpenCV.js attaches itself to window.cv
  return window.cv ?? null;
}

function isCvReady(cv: any): boolean {
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

/**
 * Loads OpenCV.js once in the browser and resolves when cv is ready.
 *
 * Uses the official OpenCV docs build. All OCR processing stays local; this only loads the library.
 */
export async function ensureOpenCvReady(): Promise<any> {
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

    if (typeof window === "undefined") {
      reject(new Error("OpenCV can only be loaded in the browser"));
      return;
    }

    // If a script tag already exists, wait for it.
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-opencv="true"]'
    );
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

      // OpenCV.js signals readiness via onRuntimeInitialized
      if (typeof cv.onRuntimeInitialized === "function") {
        const prev = cv.onRuntimeInitialized;
        cv.onRuntimeInitialized = () => {
          try {
            prev();
          } catch {
            // ignore
          }
          console.log("[OpenCV] Runtime initialized successfully");
          resolve(cv);
        };
      } else {
        cv.onRuntimeInitialized = () => {
          console.log("[OpenCV] Runtime initialized successfully");
          resolve(cv);
        };
      }

      // Some builds are ready immediately; don't hang.
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

type ImageToMatResult = {
  cv: any;
  mat: any;
  canvas: HTMLCanvasElement;
};

async function imageDataUrlToMat(imageDataUrl: string): Promise<ImageToMatResult> {
  console.log("[OpenCV] Converting image data URL to Mat...");
  const cv = await ensureOpenCvReady();

  const img = new Image();
  img.decoding = "async";
  img.src = imageDataUrl;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      console.log(`[OpenCV] Image loaded: ${img.width}x${img.height}`);
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
  console.log(`[OpenCV] Mat created: ${mat.cols}x${mat.rows}, channels: ${mat.channels()}`);
  return { cv, mat, canvas };
}

function matToPngDataUrl(cv: any, mat: any): string {
  const canvas = document.createElement("canvas");
  canvas.width = mat.cols;
  canvas.height = mat.rows;
  cv.imshow(canvas, mat);
  return canvas.toDataURL("image/png");
}

function orderQuadPoints(points: Array<{ x: number; y: number }>) {
  // Order: top-left, top-right, bottom-right, bottom-left
  const sum = points.map((p) => p.x + p.y);
  const diff = points.map((p) => p.x - p.y);
  const tl = points[sum.indexOf(Math.min(...sum))];
  const br = points[sum.indexOf(Math.max(...sum))];
  const tr = points[diff.indexOf(Math.max(...diff))];
  const bl = points[diff.indexOf(Math.min(...diff))];
  return [tl, tr, br, bl];
}

function getQuadFromContour(cv: any, contour: any): Array<{ x: number; y: number }> | null {
  const peri = cv.arcLength(contour, true);
  const approx = new cv.Mat();
  cv.approxPolyDP(contour, approx, 0.02 * peri, true);

  try {
    if (approx.rows !== 4) return null;
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 4; i++) {
      // approx is Nx1x2
      const x = approx.intPtr(i, 0)[0];
      const y = approx.intPtr(i, 0)[1];
      pts.push({ x, y });
    }
    return orderQuadPoints(pts);
  } finally {
    approx.delete();
  }
}

function warpPerspectiveToCard(cv: any, src: any, quad: Array<{ x: number; y: number }>) {
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
    tl.x,
    tl.y,
    tr.x,
    tr.y,
    br.x,
    br.y,
    bl.x,
    bl.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    dsize.width - 1,
    0,
    dsize.width - 1,
    dsize.height - 1,
    0,
    dsize.height - 1,
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

  srcTri.delete();
  dstTri.delete();
  M.delete();

  return dst;
}

function deskewBinary(cv: any, bin: any): any {
  // Compute minimal area rectangle around non-zero pixels, then rotate to deskew.
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
    // Heuristic for OpenCV angle range
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

/**
 * Preprocess an ID photo with OpenCV:
 * - grayscale
 * - find largest 4-point contour
 * - perspective warp
 * - adaptive threshold
 * - deskew
 *
 * Returns a binarized PNG data URL suitable for OCR and cropping.
 */
export async function preprocessOntarioDlToPng(imageDataUrl: string): Promise<{
  preprocessedPngDataUrl: string;
  rectifiedPngDataUrl: string;
}> {
  console.log("[OpenCV] Starting preprocessing pipeline...");
  const { cv, mat } = await imageDataUrlToMat(imageDataUrl);

  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  let rectified: any | null = null;
  let rectGray: any | null = null;
  let preprocessed: any | null = null;

  try {
    console.log("[OpenCV] Step 1: Converting to grayscale...");
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
    
    console.log("[OpenCV] Step 2: Applying Gaussian blur...");
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    
    console.log("[OpenCV] Step 3: Edge detection (Canny)...");
    cv.Canny(blurred, edges, 50, 150);

    console.log("[OpenCV] Step 4: Finding contours...");
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    console.log(`[OpenCV] Found ${contours.size()} contours`);

    // Find the largest contour that looks like a card.
    let bestContour: any | null = null;
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
      console.log(`[OpenCV] Best contour area: ${bestArea.toFixed(0)}`);
      const quad = getQuadFromContour(cv, bestContour);
      if (quad) {
        console.log("[OpenCV] Step 5: Perspective rectification...");
        rectified = warpPerspectiveToCard(cv, mat, quad);
        console.log(`[OpenCV] Rectified card: ${rectified.cols}x${rectified.rows}`);
      } else {
        console.warn("[OpenCV] Could not extract quad from contour, using grayscale");
      }
    } else {
      console.warn("[OpenCV] No suitable contour found, using grayscale");
    }

    if (!rectified) {
      rectified = gray.clone();
    }

    // Always threshold a single-channel grayscale mat.
    console.log("[OpenCV] Step 6: Preparing for thresholding...");
    if (rectified.channels && rectified.channels() > 1) {
      rectGray = new cv.Mat();
      cv.cvtColor(rectified, rectGray, cv.COLOR_RGBA2GRAY);
    } else {
      rectGray = rectified.clone();
    }

    console.log("[OpenCV] Step 7: Adaptive thresholding...");
    const bin = new cv.Mat();
    cv.adaptiveThreshold(
      rectGray,
      bin,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      31,
      7
    );

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
    rectGray?.delete?.();
    rectified?.delete?.();
    if (preprocessed && preprocessed !== rectified) preprocessed.delete?.();
  }
}

/**
 * Crop a normalized region out of an image (data URL) using Canvas.
 * Works for both OpenCV-processed and raw images.
 */
export async function cropDataUrlRegionToPng(
  imageDataUrl: string,
  region: NormalizedRect
): Promise<string> {
  const img = new Image();
  img.decoding = "async";
  img.src = imageDataUrl;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image for cropping"));
  });

  const sx = Math.max(0, Math.floor(region.x * img.width));
  const sy = Math.max(0, Math.floor(region.y * img.height));
  const sw = Math.min(img.width - sx, Math.ceil(region.w * img.width));
  const sh = Math.min(img.height - sy, Math.ceil(region.h * img.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context for crop");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

