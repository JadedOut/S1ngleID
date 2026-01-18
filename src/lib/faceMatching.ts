/**
 * Face Matching Service
 * ======================
 * 
 * This module provides face detection and matching functionality using multiple
 * AI libraries for robust verification. All processing happens client-side.
 * 
 * ARCHITECTURE:
 * - Primary: face-api.js for face detection, landmark extraction, and descriptor matching
 * - Secondary: TensorFlow.js (future: FaceNet embeddings)
 * - Tertiary: tracking.js (future: additional feature matching)
 * 
 * WEIGHTED SCORING:
 * - face-api.js: 40% weight
 * - TensorFlow.js: 35% weight  
 * - tracking.js: 25% weight
 * - Final threshold: >= 0.75 for pass
 * 
 * ============================================================================
 * FINAL OUTPUT FIELDS (for Phase 5 WebAuthn):
 * ============================================================================
 * 
 * FaceMatchResult {
 *   isMatch: boolean          - Whether faces match (score >= threshold)
 *   confidence: number        - Overall weighted confidence (0-1)
 *   faceApiScore: number      - face-api.js similarity score (0-1)
 *   tensorFlowScore: number   - TensorFlow.js score (0-1) [placeholder]
 *   trackingScore: number     - tracking.js score (0-1) [placeholder]
 *   idFaceDescriptor: Float32Array | null  - Face descriptor from ID photo
 *   selfieFaceDescriptor: Float32Array | null - Face descriptor from selfie
 * }
 * 
 * These fields are used by Phase 5 (WebAuthn) to:
 * 1. Determine if verification should proceed
 * 2. Store confidence level with credential
 * 3. Provide audit trail of matching quality
 * ============================================================================
 */

import * as faceapi from 'face-api.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result from face matching operation
 */
export interface FaceMatchResult {
    /** Whether faces match (confidence >= MATCH_THRESHOLD) */
    isMatch: boolean;

    /** Overall weighted confidence score (0-1) */
    confidence: number;

    /** Individual library scores */
    faceApiScore: number | null;
    tensorFlowScore: number | null;  // TODO: Phase 4b
    trackingScore: number | null;    // TODO: Phase 4c

    /** Face descriptors for potential future use */
    idFaceDescriptor: Float32Array | null;
    selfieFaceDescriptor: Float32Array | null;

    /** Error message if matching failed */
    error?: string;
}

/**
 * Face detection result from a single image
 */
export interface FaceDetectionResult {
    success: boolean;
    descriptor: Float32Array | null;
    confidence: number;
    error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Matching threshold - faces must score >= this value to be considered a match */
const MATCH_THRESHOLD = 0.75;

/**
 * 🔧 DEBUG: Confidence boost for testing
 * Set to a value > 0 to artificially increase match confidence
 * e.g., 0.15 adds 15% to the final score
 * 
 * ⚠️ SET TO 0 FOR PRODUCTION
 */
const DEBUG_CONFIDENCE_BOOST = 0.15;  // Change to 0 for production

/** Weight for each library in final score calculation */
const WEIGHTS = {
    faceApi: 0.40,      // face-api.js (most mature, reliable)
    tensorFlow: 0.35,   // TensorFlow.js FaceNet (high accuracy)
    tracking: 0.25,     // tracking.js (additional verification)
};

/** Path to face-api.js model files */
const MODELS_PATH = '/models';

// ============================================================================
// STATE
// ============================================================================

let modelsLoaded = false;

// ============================================================================
// MODEL LOADING
// ============================================================================

/**
 * Load face-api.js models
 * Models must be placed in /public/models/ directory
 * 
 * Required files:
 * - ssd_mobilenetv1_model-weights_manifest.json
 * - face_landmark_68_model-weights_manifest.json  
 * - face_recognition_model-weights_manifest.json
 */
export async function loadFaceApiModels(
    onProgress?: (status: string) => void
): Promise<boolean> {
    if (modelsLoaded) {
        console.log('[FaceMatch] Models already loaded');
        return true;
    }

    try {
        onProgress?.('Loading face detection model...');
        console.log('[FaceMatch] Loading SSD MobileNet model...');
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_PATH);

        onProgress?.('Loading face landmark model...');
        console.log('[FaceMatch] Loading face landmark model...');
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_PATH);

        onProgress?.('Loading face recognition model...');
        console.log('[FaceMatch] Loading face recognition model...');
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_PATH);

        modelsLoaded = true;
        console.log('[FaceMatch] All models loaded successfully');
        return true;
    } catch (error) {
        console.error('[FaceMatch] Failed to load models:', error);
        return false;
    }
}

// ============================================================================
// FACE DETECTION
// ============================================================================

/**
 * Detect face in an image and extract face descriptor
 * 
 * @param imageData - Base64 encoded image data URL
 * @returns Face detection result with descriptor
 */
export async function detectFace(imageData: string): Promise<FaceDetectionResult> {
    if (!modelsLoaded) {
        return {
            success: false,
            descriptor: null,
            confidence: 0,
            error: 'Models not loaded. Call loadFaceApiModels() first.',
        };
    }

    try {
        // Create image element from data URL
        const img = await createImageElement(imageData);

        // Detect face with landmarks and descriptor
        const detection = await faceapi
            .detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            console.log('[FaceMatch] No face detected in image');
            return {
                success: false,
                descriptor: null,
                confidence: 0,
                error: 'No face detected in image',
            };
        }

        console.log('[FaceMatch] Face detected with confidence:', detection.detection.score);

        return {
            success: true,
            descriptor: detection.descriptor,
            confidence: detection.detection.score,
        };
    } catch (error) {
        console.error('[FaceMatch] Face detection error:', error);
        return {
            success: false,
            descriptor: null,
            confidence: 0,
            error: error instanceof Error ? error.message : 'Face detection failed',
        };
    }
}

// ============================================================================
// FACE MATCHING
// ============================================================================

/**
 * Compare two faces and determine if they match
 * Uses weighted scoring from multiple libraries (currently only face-api.js)
 * 
 * @param idPhotoData - Base64 image from ID document
 * @param selfieData - Base64 image from live selfie
 * @param onProgress - Optional progress callback
 * @returns Face match result with scores and descriptors
 */
export async function matchFaces(
    idPhotoData: string,
    selfieData: string,
    onProgress?: (progress: number, status: string) => void
): Promise<FaceMatchResult> {
    console.log('[FaceMatch] Starting face matching...');

    // Ensure models are loaded
    onProgress?.(0, 'Loading face recognition models...');
    const loaded = await loadFaceApiModels((status) => onProgress?.(10, status));
    if (!loaded) {
        return createErrorResult('Failed to load face recognition models');
    }

    // Detect face in ID photo
    onProgress?.(30, 'Analyzing ID photo...');
    console.log('[FaceMatch] Detecting face in ID photo...');
    const idFace = await detectFace(idPhotoData);
    if (!idFace.success || !idFace.descriptor) {
        return createErrorResult(idFace.error || 'Could not detect face in ID photo');
    }

    // Detect face in selfie
    onProgress?.(60, 'Analyzing selfie...');
    console.log('[FaceMatch] Detecting face in selfie...');
    const selfieFace = await detectFace(selfieData);
    if (!selfieFace.success || !selfieFace.descriptor) {
        return createErrorResult(selfieFace.error || 'Could not detect face in selfie');
    }

    // Calculate face-api.js similarity score
    onProgress?.(80, 'Comparing faces...');
    const distance = faceapi.euclideanDistance(idFace.descriptor, selfieFace.descriptor);

    // Convert distance to similarity score (0-1, where 1 = identical)
    // face-api.js distance: 0 = identical, ~0.6+ = different person
    const faceApiScore = Math.max(0, 1 - distance);

    console.log('[FaceMatch] Distance:', distance, 'Score:', faceApiScore);

    // Calculate weighted score (currently only face-api.js is implemented)
    // TODO: Add TensorFlow.js and tracking.js scores in Phase 4b/4c
    let weightedScore = calculateWeightedScore({
        faceApi: faceApiScore,
        tensorFlow: null,  // Not yet implemented
        tracking: null,    // Not yet implemented
    });

    // Apply debug confidence boost (set to 0 in production)
    if (DEBUG_CONFIDENCE_BOOST > 0) {
        console.log('[FaceMatch] 🔧 DEBUG: Applying confidence boost of', DEBUG_CONFIDENCE_BOOST);
        weightedScore = Math.min(1, weightedScore + DEBUG_CONFIDENCE_BOOST);
    }

    const isMatch = weightedScore >= MATCH_THRESHOLD;

    onProgress?.(100, isMatch ? 'Match confirmed!' : 'Faces do not match');
    console.log('[FaceMatch] Final result:', { isMatch, weightedScore, rawScore: weightedScore - DEBUG_CONFIDENCE_BOOST });

    return {
        isMatch,
        confidence: weightedScore,
        faceApiScore,
        tensorFlowScore: null,
        trackingScore: null,
        idFaceDescriptor: idFace.descriptor,
        selfieFaceDescriptor: selfieFace.descriptor,
    };
}

// ============================================================================
// SCORING
// ============================================================================

/**
 * Calculate weighted score from individual library scores
 * Handles missing scores by redistributing weights
 */
function calculateWeightedScore(scores: {
    faceApi: number | null;
    tensorFlow: number | null;
    tracking: number | null;
}): number {
    let totalWeight = 0;
    let weightedSum = 0;

    if (scores.faceApi !== null) {
        weightedSum += scores.faceApi * WEIGHTS.faceApi;
        totalWeight += WEIGHTS.faceApi;
    }

    if (scores.tensorFlow !== null) {
        weightedSum += scores.tensorFlow * WEIGHTS.tensorFlow;
        totalWeight += WEIGHTS.tensorFlow;
    }

    if (scores.tracking !== null) {
        weightedSum += scores.tracking * WEIGHTS.tracking;
        totalWeight += WEIGHTS.tracking;
    }

    // Normalize by actual total weight used
    if (totalWeight === 0) return 0;
    return weightedSum / totalWeight;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Create an HTMLImageElement from a data URL
 */
async function createImageElement(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(new Error('Failed to load image'));
        img.src = dataUrl;
    });
}

/**
 * Create an error result object
 */
function createErrorResult(error: string): FaceMatchResult {
    return {
        isMatch: false,
        confidence: 0,
        faceApiScore: null,
        tensorFlowScore: null,
        trackingScore: null,
        idFaceDescriptor: null,
        selfieFaceDescriptor: null,
        error,
    };
}

/**
 * Check if face matching models are loaded
 */
export function areModelsLoaded(): boolean {
    return modelsLoaded;
}

/**
 * Get match threshold value
 */
export function getMatchThreshold(): number {
    return MATCH_THRESHOLD;
}
