import test from "node:test";
import assert from "node:assert/strict";
import { ProximityMonitor, parseDistancePacket, describeDistance } from "../docs/js/proximity.mjs";

test("parses the sensor packet formats", () => {
  assert.equal(parseDistancePacket("D:123.4"), 123.4);
  assert.equal(parseDistancePacket("d: 80"), 80);
  assert.equal(parseDistancePacket("57"), 57);
  assert.equal(parseDistancePacket(" 42 cm "), 42);
  assert.equal(parseDistancePacket("hello"), null);
  assert.equal(parseDistancePacket(""), null);
  assert.equal(parseDistancePacket(null), null);
});

test("describes distances for speech", () => {
  assert.equal(describeDistance(62), "60 centimetres");
  assert.equal(describeDistance(97), "1 metre");
  assert.equal(describeDistance(123), "1.2 metres");
  assert.equal(describeDistance(300), "3.0 metres");
});

test("far readings stay silent", () => {
  const m = new ProximityMonitor();
  assert.equal(m.update(250, 0).say, null);
  assert.equal(m.zone, "clear");
});

test("entering the warn zone speaks once with a short vibration", () => {
  const m = new ProximityMonitor();
  const r = m.update(100, 0);
  assert.equal(r.say, "Obstacle ahead, about 1 metre.");
  assert.deepEqual(r.vibrate, [100]);
  assert.equal(m.update(98, 100).say, null);
});

test("entering the danger zone speaks immediately and vibrates harder", () => {
  const m = new ProximityMonitor();
  m.update(100, 0);
  const r = m.update(40, 500);
  assert.equal(r.say, "Stop. Obstacle very close.");
  assert.deepEqual(r.vibrate, [200, 100, 200]);
});

test("danger repeats only after the repeat interval", () => {
  const m = new ProximityMonitor({ repeatMs: 3000 });
  m.update(40, 0);
  assert.equal(m.update(40, 2999).say, null);
  assert.equal(m.update(40, 3000).say, "Stop. Obstacle very close.");
});

test("hysteresis: jitter around the danger threshold does not flip messages", () => {
  const m = new ProximityMonitor({ dangerCm: 50, marginCm: 15 });
  m.update(45, 0); // danger
  assert.equal(m.update(55, 100).say, null); // 55 < 50 + 15: still danger
  assert.equal(m.zone, "danger");
  assert.equal(m.update(48, 200).say, null);
});

test("leaving danger past the margin falls back to warn with the distance", () => {
  const m = new ProximityMonitor();
  m.update(40, 0);
  const r = m.update(90, 500);
  assert.equal(r.zone, "warn");
  assert.equal(r.say, "Obstacle ahead, about 90 centimetres.");
});

test("path clear is announced once after leaving the warn zone", () => {
  const m = new ProximityMonitor();
  m.update(100, 0);
  assert.equal(m.update(130, 100).say, null); // 130 < 120 + 15: still warn
  assert.equal(m.update(200, 200).say, "Path clear.");
  assert.equal(m.update(210, 300).say, null);
});

test("warn repeats only when clearly closer and after the interval", () => {
  const m = new ProximityMonitor({ repeatMs: 3000, closerByCm: 20 });
  m.update(115, 0);
  assert.equal(m.update(105, 4000).say, null); // only 10 cm closer
  assert.equal(m.update(90, 4000).say, "Obstacle ahead, about 90 centimetres.");
});

test("invalid readings are ignored and out-of-range means clear", () => {
  const m = new ProximityMonitor();
  m.update(40, 0);
  assert.equal(m.update(null, 100).say, null);
  assert.equal(m.update(NaN, 200).say, null);
  assert.equal(m.zone, "danger");
  assert.equal(m.update(450, 300).say, "Path clear."); // beyond 400 cm: nothing seen
});
