/**
 * Face Matching Service
 * ======================
 * 
 * This module provides face detection and matching functionality using face-api.js.
 * All processing happens client-side for privacy.
 * 
 * ============================================================================
 * FINAL OUTPUT FIELDS (for Phase 5 WebAuthn):
 * ============================================================================
 * 
 * FaceMatchResult {
 *   isMatch: boolean          - Whether faces match (score >= threshold)
 *   idFaceDescriptor: Float32Array | null  - Face descriptor from ID photo
 *   selfieFaceDescriptor: Float32Array | null - Face descriptor from selfie
 * }
 * 
 * These fields are used by Phase 5 (WebAuthn) to:
 * 1. Determine if verification should proceed
 * 2. Provide audit trail of matching quality
 * ============================================================================
 */

import * as faceapi from 'face-api.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    /** 
     * Matching threshold 
     * Faces must score >= this value to be considered a match 
     */
    MATCH_THRESHOLD: 0.60,

    /** Path to face-api.js model files */
    MODELS_PATH: '/models'
};

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result from face matching operation
 */
export interface FaceMatchResult {
    /** Whether faces match (score >= MATCH_THRESHOLD) */
    isMatch: boolean;

    /** Match confidence score (0-1, higher is better) */
    confidence: number;

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
    error?: string;
}

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
        await faceapi.nets.ssdMobilenetv1.loadFromUri(CONFIG.MODELS_PATH);

        onProgress?.('Loading face landmark model...');
        console.log('[FaceMatch] Loading face landmark model...');
        await faceapi.nets.faceLandmark68Net.loadFromUri(CONFIG.MODELS_PATH);

        onProgress?.('Loading face recognition model...');
        console.log('[FaceMatch] Loading face recognition model...');
        await faceapi.nets.faceRecognitionNet.loadFromUri(CONFIG.MODELS_PATH);

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
                error: 'No face detected in image',
            };
        }

        console.log('[FaceMatch] Face detected');

        return {
            success: true,
            descriptor: detection.descriptor,
        };
    } catch (error) {
        console.error('[FaceMatch] Face detection error:', error);
        return {
            success: false,
            descriptor: null,
            error: error instanceof Error ? error.message : 'Face detection failed',
        };
    }
}

// ============================================================================
// FACE MATCHING
// ============================================================================

/**
 * Compare two faces and determine if they match
 * 
 * @param idPhotoData - Base64 image from ID document
 * @param selfieData - Base64 image from live selfie
 * @param onProgress - Optional progress callback
 * @returns Face match result
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

    const isMatch = faceApiScore >= CONFIG.MATCH_THRESHOLD;

    onProgress?.(100, isMatch ? 'Match confirmed!' : 'Faces do not match');
    console.log('[FaceMatch] Final result:', { isMatch, faceApiScore });

    return {
        isMatch,
        confidence: faceApiScore,
        idFaceDescriptor: idFace.descriptor,
        selfieFaceDescriptor: selfieFace.descriptor,
    };
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
    return CONFIG.MATCH_THRESHOLD;
}
