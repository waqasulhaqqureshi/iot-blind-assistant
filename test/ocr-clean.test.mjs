import test from "node:test";
import assert from "node:assert/strict";
import { cleanOcr, textSentence } from "../docs/js/ocr-clean.mjs";

const w = (text, confidence) => ({ text, confidence });

test("keeps confident words and drops low-confidence noise", () => {
  const out = cleanOcr({ words: [w("EXIT", 95), w("~~", 40), w("PUSH", 88), w("xq", 30)] });
  assert.equal(out, "EXIT PUSH");
});

test("drops punctuation-only tokens and stray single letters", () => {
  assert.equal(cleanOcr({ words: [w("|", 90), w("X", 90), w("Room", 90), w("5", 90)] }), "Room 5");
});

test("drops a lone lowercase letter but keeps I, A and digits", () => {
  assert.equal(cleanOcr({ words: [w("i", 95), w("AD", 95), w("I", 95), w("emisiones", 95)] }), "AD I emisiones");
});

test("returns empty when too little real text survives", () => {
  assert.equal(cleanOcr({ words: [w("ab", 99)] }), "");
  assert.equal(cleanOcr({ words: [w("###", 99)] }), "");
  assert.equal(cleanOcr(null), "");
});

test("falls back to plain text when there are no word scores", () => {
  assert.equal(cleanOcr({ text: "  Open  \n 24 hours •• " }), "Open 24 hours");
});

test("builds the spoken sentence", () => {
  assert.equal(textSentence(""), "I could not read any text.");
  assert.equal(textSentence("EXIT"), "Text reads: EXIT.");
  assert.equal(textSentence("Emergency exit this way", 10), "Text reads: Emergency…");
});
