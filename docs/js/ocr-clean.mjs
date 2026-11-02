/**
 * OCR engines return plenty of garbage next to the real text. Reading garbage
 * aloud to a blind user is worse than saying nothing, so filter hard.
 */

const KEEP_SHORT = /^[AI0-9]$/; // single characters that are real words or numbers (not a lone lowercase letter)

/**
 * @param {{text?: string, words?: {text: string, confidence: number}[]}} result  Tesseract.js `data`
 * @returns {string} cleaned text, or "" when nothing trustworthy was found
 */
export function cleanOcr(result, { minWordConfidence = 60, minChars = 3 } = {}) {
  if (!result) return "";
  let text;
  if (Array.isArray(result.words) && result.words.length > 0) {
    text = result.words
      .filter((w) => w && typeof w.text === "string")
      .filter((w) => w.confidence >= minWordConfidence)
      .map((w) => w.text.trim())
      .filter((t) => /[\p{L}\p{N}]/u.test(t))
      .filter((t) => t.length > 1 || KEEP_SHORT.test(t))
      .join(" ");
  } else {
    text = String(result.text ?? "").replace(/[^\p{L}\p{N}\s.,:;!?'\-/&%$#@()]/gu, "");
  }
  text = text.replace(/\s+/g, " ").trim();
  const alphanumeric = (text.match(/[\p{L}\p{N}]/gu) || []).length;
  return alphanumeric >= minChars ? text : "";
}

/** Sentence to speak for an explicit "read text" request (longer limit than auto announcements). */
export function textSentence(text, maxLength = 240) {
  if (!text) return "I could not read any text.";
  const spoken = text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
  return `Text reads: ${spoken}${spoken.endsWith("…") ? "" : "."}`;
}
