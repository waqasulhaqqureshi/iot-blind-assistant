import test from "node:test";
import assert from "node:assert/strict";
import { Announcer, positionFromBox } from "../docs/js/announcer.mjs";

test("maps a bounding box to left, ahead or right of the wearer", () => {
  assert.equal(positionFromBox([0, 0, 100, 50], 640), "left");
  assert.equal(positionFromBox([270, 0, 100, 50], 640), "ahead");
  assert.equal(positionFromBox([540, 0, 100, 50], 640), "right");
  assert.equal(positionFromBox(null, 640), undefined);
  assert.equal(positionFromBox([0, 0, 10, 10], 0), undefined);
});

test("says where each object is when the position is known", () => {
  const a = new Announcer();
  const s = a.announce(
    [
      { kind: "object", label: "chair", confidence: 0.9, position: "left" },
      { kind: "object", label: "door", confidence: 0.8, position: "ahead" },
      { kind: "object", label: "person", confidence: 0.7, position: "right" },
    ],
    0
  );
  assert.equal(s, "I see a chair on your left, a door ahead and a person on your right.");
});

const obj = (label, confidence) => ({ kind: "object", label, confidence });
const txt = (label) => ({ kind: "text", label, confidence: 1 });

test("stays silent when nothing useful is seen", () => {
  const a = new Announcer();
  assert.equal(a.announce([], 0), null);
  assert.equal(a.announce([obj("cat", 0.3), txt("A")], 0), null);
});

test("announces the most confident objects first, at most three", () => {
  const a = new Announcer();
  const s = a.announce([obj("door", 0.7), obj("chair", 0.95), obj("table", 0.8), obj("lamp", 0.65)], 0);
  assert.equal(s, "I see a chair, a table and a door.");
});

test("uses 'an' before vowels", () => {
  assert.equal(new Announcer().announce([obj("Umbrella", 0.9)], 0), "I see an umbrella.");
});

test("does not repeat the same object inside the cooldown", () => {
  const a = new Announcer({ cooldownMs: 8000 });
  assert.equal(a.announce([obj("chair", 0.9)], 0), "I see a chair.");
  assert.equal(a.announce([obj("chair", 0.9)], 7999), null);
});

test("repeats after the cooldown has passed", () => {
  const a = new Announcer({ cooldownMs: 8000 });
  a.announce([obj("chair", 0.9)], 0);
  assert.equal(a.announce([obj("chair", 0.9)], 8000), "I see a chair.");
});

test("a new object is announced even while another is cooling down", () => {
  const a = new Announcer();
  a.announce([obj("chair", 0.9)], 0);
  assert.equal(a.announce([obj("chair", 0.9), obj("door", 0.8)], 1000), "I see a door.");
});

test("reads one block of text and ignores noise", () => {
  const a = new Announcer();
  assert.equal(a.announce([txt("X"), txt("EXIT"), txt("PUSH")], 0), "Text reads: EXIT.");
});

test("truncates very long text", () => {
  const a = new Announcer({ maxTextLength: 10 });
  assert.equal(a.announce([txt("Emergency exit this way")], 0), "Text reads: Emergency…");
});

test("combines objects and text in one sentence pair", () => {
  const a = new Announcer();
  assert.equal(a.announce([obj("door", 0.9), txt("EXIT")], 0), "I see a door. Text reads: EXIT.");
});

test("duplicate labels in one frame are spoken once", () => {
  assert.equal(new Announcer().announce([obj("chair", 0.9), obj("Chair ", 0.8)], 0), "I see a chair.");
});
