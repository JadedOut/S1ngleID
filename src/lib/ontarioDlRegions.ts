export type NormalizedRect = {
  /**
   * Normalized x coordinate in [0..1]
   */
  x: number;
  /**
   * Normalized y coordinate in [0..1]
   */
  y: number;
  /**
   * Normalized width in [0..1]
   */
  w: number;
  /**
   * Normalized height in [0..1]
   */
  h: number;
};

/**
 * Ontario driver's license crop regions after perspective rectification.
 *
 * Notes:
 * - These are intentionally "wide" crops to tolerate imperfect rectification and camera framing.
 * - Coordinates are normalized and should be applied to the rectified card image.
 * - If you find systematic misses, tune these numbers; the rest of the pipeline stays the same.
 */
export const ONTARIO_DL_REGIONS = {
  /**
   * ID portrait photo region (approximation).
   * This satisfies onboarding's "extract photo from ID" requirement without face detection.
   */
  photo: { x: 0.03, y: 0.18, w: 0.28, h: 0.68 } satisfies NormalizedRect,

  /**
   * Name block (covers surname/given names area).
   */
  name: { x: 0.33, y: 0.14, w: 0.64, h: 0.22 } satisfies NormalizedRect,

  /**
   * Driver's license number area.
   * Target pattern: #####-#####-#####
   */
  dlNumber: { x: 0.33, y: 0.38, w: 0.64, h: 0.14 } satisfies NormalizedRect,

  /**
   * Date of birth area.
   */
  dob: { x: 0.33, y: 0.56, w: 0.30, h: 0.14 } satisfies NormalizedRect,

  /**
   * Expiry date area (often near "4b EXP").
   */
  expiry: { x: 0.63, y: 0.56, w: 0.34, h: 0.14 } satisfies NormalizedRect,
} as const;

export type OntarioDlRegionKey = keyof typeof ONTARIO_DL_REGIONS;

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function normalizeRect(r: NormalizedRect): NormalizedRect {
  return {
    x: clamp01(r.x),
    y: clamp01(r.y),
    w: clamp01(r.w),
    h: clamp01(r.h),
  };
}

