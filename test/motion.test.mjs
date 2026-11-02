import test from "node:test";
import assert from "node:assert/strict";
import { toGray, frameDifference, shouldAnalyze } from "../docs/js/motion.mjs";

test("toGray converts RGBA to luminance", () => {
  const gray = toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]));
  assert.equal(gray.length, 3);
  assert.equal(gray[0], 255);
  assert.equal(gray[1], 0);
  assert.equal(gray[2], 76); // 0.299 * 255
});

test("identical frames differ by 0, opposite frames by 1", () => {
  const a = new Uint8Array([0, 0, 0, 0]);
  const b = new Uint8Array([255, 255, 255, 255]);
  assert.equal(frameDifference(a, a), 0);
  assert.equal(frameDifference(a, b), 1);
});

test("mismatched or empty frames count as fully different", () => {
  assert.equal(frameDifference(new Uint8Array(2), new Uint8Array(3)), 1);
  assert.equal(frameDifference(new Uint8Array(0), new Uint8Array(0)), 1);
  assert.equal(frameDifference(null, new Uint8Array(2)), 1);
});

test("analyses the first frame, changes, and long idle gaps only", () => {
  assert.equal(shouldAnalyze({ diff: 0, now: 0, lastAnalyzedAt: null }), true);
  assert.equal(shouldAnalyze({ diff: 0.01, now: 1000, lastAnalyzedAt: 0 }), false);
  assert.equal(shouldAnalyze({ diff: 0.2, now: 1000, lastAnalyzedAt: 0 }), true);
  assert.equal(shouldAnalyze({ diff: 0.01, now: 8000, lastAnalyzedAt: 0 }), true);
});
