/**
 * Turns raw vision observations into short, non-repetitive speech.
 *
 * A wearable that narrates every frame is unusable: the same chair would be
 * announced thirty times a second. This module decides WHAT to say and WHEN.
 * It has no camera, network or speech dependency, so it is unit-testable.
 *
 * An observation looks like:
 *   { kind: "object" | "text", label: string, confidence: number, position?: "left" | "ahead" | "right" }
 * where confidence is 0..1 (use 1 for OCR text if the engine gives no score).
 */

const DEFAULTS = {
  minObjectConfidence: 0.6, // ignore weak guesses rather than speak wrong things
  minTextLength: 3, // single characters are usually OCR noise
  maxTextLength: 80, // keep spoken text short; the user can ask for more
  maxObjects: 3, // at most three objects per announcement
  cooldownMs: 8000, // do not repeat the same label within this window
};

const POSITION_PHRASE = { left: "on your left", ahead: "ahead", right: "on your right" };

/** Horizontal centre of a bounding box -> where it is relative to the wearer. */
export function positionFromBox(bbox, frameWidth) {
  if (!Array.isArray(bbox) || !frameWidth) return undefined;
  const centre = (bbox[0] + bbox[2] / 2) / frameWidth;
  return centre < 1 / 3 ? "left" : centre > 2 / 3 ? "right" : "ahead";
}

export class Announcer {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.lastSpoken = new Map(); // "kind:label" -> timestamp (ms)
  }

  /** @returns {string | null} a sentence to speak, or null to stay silent */
  announce(observations, nowMs) {
    const o = this.options;
    const fresh = (key) => {
      const last = this.lastSpoken.get(key);
      return last === undefined || nowMs - last >= o.cooldownMs;
    };
    const norm = (s) => s.trim().toLowerCase();

    const objects = observations
      .filter((x) => x.kind === "object" && x.confidence >= o.minObjectConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .map((x) => ({ ...x, key: norm(x.label) }))
      .filter((x, i, all) => all.findIndex((y) => y.key === x.key) === i)
      .filter((x) => fresh(`object:${x.key}`))
      .slice(0, o.maxObjects);

    const texts = observations
      .filter((x) => x.kind === "text" && x.label.trim().length >= o.minTextLength)
      .map((x) => ({ ...x, key: norm(x.label) }))
      .filter((x, i, all) => all.findIndex((y) => y.key === x.key) === i)
      .filter((x) => fresh(`text:${x.key}`))
      .slice(0, 1); // read one block of text at a time

    const parts = [];
    if (objects.length > 0) {
      parts.push(`I see ${joinList(objects.map((x) => withPosition(withArticle(x.label), x.position)))}.`);
    }
    if (texts.length > 0) {
      const spoken = truncate(texts[0].label.trim(), o.maxTextLength);
      parts.push(`Text reads: ${spoken}${spoken.endsWith("…") ? "" : "."}`);
    }
    if (parts.length === 0) return null;

    for (const x of objects) this.lastSpoken.set(`object:${x.key}`, nowMs);
    for (const x of texts) this.lastSpoken.set(`text:${x.key}`, nowMs);
    return parts.join(" ");
  }
}

function withArticle(label) {
  const l = label.trim().toLowerCase();
  return /^[aeiou]/.test(l) ? `an ${l}` : `a ${l}`;
}

function withPosition(phrase, position) {
  return POSITION_PHRASE[position] ? `${phrase} ${POSITION_PHRASE[position]}` : phrase;
}

function joinList(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function truncate(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
