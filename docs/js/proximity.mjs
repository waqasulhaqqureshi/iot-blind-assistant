/**
 * Turns raw distance readings (centimetres) from an ultrasonic sensor into
 * short spoken warnings, without chattering.
 *
 * Zones: clear > warn > danger. Moving to a MORE severe zone speaks at once.
 * Moving to a LESS severe zone needs a margin (hysteresis) so a reading that
 * jitters around a threshold does not flip the message back and forth.
 */

const DEFAULTS = {
  dangerCm: 50, // closer than this: "Stop"
  warnCm: 120, // closer than this: "Obstacle ahead"
  marginCm: 15, // hysteresis when leaving a zone
  repeatMs: 3000, // minimum time between repeats inside a zone
  closerByCm: 20, // in the warn zone, repeat only if this much closer
  minValidCm: 2, // HC-SR04 cannot measure below ~2 cm
  maxValidCm: 400, // ...or beyond ~4 m; readings outside mean "nothing seen"
};

/** Accepts "D:123.4", "123", "123 cm" and returns a number, or null. */
export function parseDistancePacket(raw) {
  if (raw === null || raw === undefined) return null;
  const m = String(raw)
    .trim()
    .match(/^(?:D\s*:\s*)?(-?\d+(?:\.\d+)?)\s*(?:cm)?$/i);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}

/** "60 centimetres" / "1.2 metres" for speech. */
export function describeDistance(cm) {
  const rounded = Math.round(cm / 10) * 10;
  if (rounded < 100) return `${Math.max(rounded, 10)} centimetres`;
  const metres = Math.round(cm / 10) / 10;
  return metres === 1 ? "1 metre" : `${metres.toFixed(1)} metres`;
}

export class ProximityMonitor {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.zone = "clear";
    this.lastSpokenAt = -Infinity;
    this.lastSpokenCm = Infinity;
  }

  /** @returns {{zone: string, say: string | null, vibrate: number[] | null}} */
  update(distanceCm, nowMs) {
    const o = this.options;
    if (distanceCm === null || distanceCm === undefined || Number.isNaN(distanceCm)) {
      return { zone: this.zone, say: null, vibrate: null };
    }
    // Out of the sensor's range means it sees nothing: treat as far away.
    const d = distanceCm < o.minValidCm || distanceCm > o.maxValidCm ? Infinity : distanceCm;

    const raw = d < o.dangerCm ? "danger" : d < o.warnCm ? "warn" : "clear";
    let next = raw;
    if (this.zone === "danger" && raw !== "danger" && d < o.dangerCm + o.marginCm) next = "danger";
    if (this.zone === "warn" && raw === "clear" && d < o.warnCm + o.marginCm) next = "warn";

    const previous = this.zone;
    this.zone = next;

    const speak = (text, vibrate) => {
      this.lastSpokenAt = nowMs;
      this.lastSpokenCm = d;
      return { zone: next, say: text, vibrate };
    };
    const message = (zone) =>
      zone === "danger" ? "Stop. Obstacle very close." : `Obstacle ahead, about ${describeDistance(d)}.`;
    const pattern = (zone) => (zone === "danger" ? [200, 100, 200] : zone === "warn" ? [100] : null);

    if (next !== previous) {
      if (next === "clear") return speak("Path clear.", null);
      return speak(message(next), pattern(next));
    }
    if (next === "danger" && nowMs - this.lastSpokenAt >= o.repeatMs) {
      return speak(message("danger"), pattern("danger"));
    }
    if (next === "warn" && nowMs - this.lastSpokenAt >= o.repeatMs && this.lastSpokenCm - d >= o.closerByCm) {
      return speak(message("warn"), pattern("warn"));
    }
    return { zone: next, say: null, vibrate: null };
  }
}
