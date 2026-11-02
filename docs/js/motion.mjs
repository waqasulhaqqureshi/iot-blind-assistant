/**
 * Cheap scene-change detection so the phone can skip the expensive detector
 * when nothing in front of the camera has changed. This is the main
 * battery saver: detection runs on change, not on a fixed clock.
 */

/** RGBA pixels -> one luminance byte per pixel. */
export function toGray(rgba) {
  const out = new Uint8Array(Math.floor(rgba.length / 4));
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return out;
}

/** Mean absolute difference between two gray frames, 0 (same) to 1 (opposite). */
export function frameDifference(a, b) {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / (a.length * 255);
}

/**
 * Analyse when the scene changed, on the first frame, or after maxIdleMs so
 * a static scene is still re-checked now and then.
 */
export function shouldAnalyze({ diff, now, lastAnalyzedAt, threshold = 0.04, maxIdleMs = 8000 }) {
  if (lastAnalyzedAt === null || lastAnalyzedAt === undefined) return true;
  if (diff >= threshold) return true;
  return now - lastAnalyzedAt >= maxIdleMs;
}
