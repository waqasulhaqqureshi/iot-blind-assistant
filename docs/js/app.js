/**
 * IoT Blind Assistant: camera + distance sensor -> short spoken sentences.
 *
 * Everything runs in the browser. Object detection (COCO-SSD on TensorFlow.js)
 * and text reading (Tesseract.js) use no API key and send no image to a server;
 * the model files are downloaded once from a CDN and cached by the service worker.
 */
import { Announcer, positionFromBox } from "./announcer.mjs";
import { ProximityMonitor } from "./proximity.mjs";
import { toGray, frameDifference, shouldAnalyze } from "./motion.mjs";
import { cleanOcr, textSentence } from "./ocr-clean.mjs";
import { connectDistanceSensor, bluetoothSupported } from "./sensor-ble.mjs";

const CDN = {
  tfjs: "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js",
  cocoSsd: "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js",
  tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
};

const $ = (id) => document.getElementById(id);
const els = {
  startBtn: $("startBtn"),
  readBtn: $("readBtn"),
  photoInput: $("photoInput"),
  sensorBtn: $("sensorBtn"),
  simToggle: $("simToggle"),
  simBox: $("simBox"),
  simRange: $("simRange"),
  simValue: $("simValue"),
  distance: $("distance"),
  rate: $("rate"),
  conf: $("conf"),
  saver: $("saver"),
  mute: $("mute"),
  autoText: $("autoText"),
  status: $("status"),
  log: $("log"),
  video: $("video"),
  overlay: $("overlay"),
};

/* ------------------------------ settings ------------------------------ */

const settings = { rate: 1, minConfidence: 0.6, saver: false, mute: false, autoText: false };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem("iba-settings") || "{}"));
} catch {
  /* private mode or corrupt value: keep defaults */
}
function saveSettings() {
  try {
    localStorage.setItem("iba-settings", JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
els.rate.value = settings.rate;
els.conf.value = settings.minConfidence;
els.saver.checked = settings.saver;
els.mute.checked = settings.mute;
els.autoText.checked = settings.autoText;
els.rate.addEventListener("input", () => ((settings.rate = Number(els.rate.value)), saveSettings()));
els.conf.addEventListener("input", () => ((settings.minConfidence = Number(els.conf.value)), saveSettings()));
els.saver.addEventListener("change", () => ((settings.saver = els.saver.checked), saveSettings()));
els.mute.addEventListener("change", () => ((settings.mute = els.mute.checked), saveSettings()));
els.autoText.addEventListener("change", () => ((settings.autoText = els.autoText.checked), saveSettings()));

/* ------------------------------ output ------------------------------ */

function setStatus(text) {
  els.status.textContent = text;
}

function logLine(text) {
  const li = document.createElement("li");
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  li.textContent = `${time}  ${text}`;
  els.log.prepend(li);
  while (els.log.children.length > 30) els.log.lastChild.remove();
}

/** Speak and log. `interrupt` cuts off whatever is being said (used for danger). */
function speak(text, { interrupt = false } = {}) {
  logLine(text);
  if (settings.mute || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  if (interrupt) synth.cancel();
  else if (synth.pending) return; // never build a backlog of stale sentences
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = settings.rate;
  synth.speak(utterance);
}

function vibrate(pattern) {
  if (pattern && "vibrate" in navigator) navigator.vibrate(pattern);
}

/* ------------------------------ models ------------------------------ */

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}. Check your connection.`));
    document.head.append(s);
  });
}

let detectorPromise = null;
function ensureDetector() {
  detectorPromise ??= (async () => {
    setStatus("Loading object detector (first time only)…");
    await loadScript(CDN.tfjs);
    await loadScript(CDN.cocoSsd);
    const model = await window.cocoSsd.load({ base: "lite_mobilenet_v2" });
    setStatus(`Object detector ready (${window.tf.getBackend()}).`);
    return model;
  })().catch((error) => {
    detectorPromise = null;
    throw error;
  });
  return detectorPromise;
}

let ocrPromise = null;
function ensureOcr() {
  ocrPromise ??= (async () => {
    setStatus("Loading text reader (first time only)…");
    await loadScript(CDN.tesseract);
    const worker = await window.Tesseract.createWorker("eng");
    setStatus("Text reader ready.");
    return worker;
  })().catch((error) => {
    ocrPromise = null;
    throw error;
  });
  return ocrPromise;
}

/* ------------------------------ analysis ------------------------------ */

// A long cooldown: a static scene is re-checked every few seconds but should not be re-announced each time.
const announcer = new Announcer({ cooldownMs: 30000 });

async function detectObjects(source, width) {
  const model = await ensureDetector();
  const predictions = await model.detect(source, 10, settings.minConfidence);
  return predictions.map((p) => ({
    kind: "object",
    label: p.class,
    confidence: p.score,
    position: positionFromBox(p.bbox, width),
    bbox: p.bbox,
  }));
}

async function recognizeText(canvas) {
  const worker = await ensureOcr();
  const { data } = await worker.recognize(canvas);
  return cleanOcr(data);
}

function drawBoxes(observations) {
  const ctx = els.overlay.getContext("2d");
  ctx.lineWidth = 3;
  ctx.font = "16px sans-serif";
  for (const o of observations) {
    if (!o.bbox) continue;
    const [x, y, w, h] = o.bbox;
    ctx.strokeStyle = "#7fffd4";
    ctx.strokeRect(x, y, w, h);
    const tag = `${o.label} ${Math.round(o.confidence * 100)}%`;
    ctx.fillStyle = "#06222b";
    ctx.fillRect(x, Math.max(y - 22, 0), ctx.measureText(tag).width + 10, 22);
    ctx.fillStyle = "#7fffd4";
    ctx.fillText(tag, x + 5, Math.max(y - 6, 16));
  }
}

function frameToCanvas(source, width, height, maxWidth) {
  const scale = Math.min(1, maxWidth / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Analyse a still image (a photo the user picked, or a test image).
 * Returns what was found and the sentences that were spoken.
 */
async function analyzeImage(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  els.video.hidden = true;
  els.overlay.width = width;
  els.overlay.height = height;
  els.overlay.getContext("2d").drawImage(image, 0, 0, width, height);

  setStatus("Looking at the photo…");
  const objects = await detectObjects(image, width);
  drawBoxes(objects);

  const spoken = [];
  const fresh = new Announcer({ cooldownMs: 0, minObjectConfidence: settings.minConfidence });
  const objectSentence = fresh.announce(objects, 0);
  if (objectSentence) spoken.push(objectSentence);

  setStatus("Reading text in the photo…");
  const text = await recognizeText(frameToCanvas(image, width, height, 1280));
  spoken.push(textSentence(text));
  if (!objectSentence) spoken.unshift("I do not see any objects I recognise.");

  setStatus("Done.");
  spoken.forEach((s, i) => (i === 0 ? speak(s, { interrupt: true }) : speak(s)));
  return { objects: objects.map(({ label, confidence, position }) => ({ label, confidence, position })), text, spoken };
}

/* ------------------------------ camera loop ------------------------------ */

const probe = document.createElement("canvas");
probe.width = 64;
probe.height = 48;
let previousGray = null;
let lastAnalyzedAt = null;
let stream = null;
let running = false;
let timer = null;
let wakeLock = null;
let lastAutoTextAt = 0;

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    speak("This browser cannot use the camera. You can still analyze a photo.");
    return;
  }
  try {
    setStatus("Starting camera…");
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (error) {
    const denied = error?.name === "NotAllowedError";
    speak(denied ? "Camera permission was denied. You can still analyze a photo." : "I could not start the camera.");
    setStatus(denied ? "Camera permission denied." : "Camera unavailable.");
    return;
  }
  els.video.srcObject = stream;
  els.video.hidden = false;
  await els.video.play();
  els.overlay.width = els.video.videoWidth;
  els.overlay.height = els.video.videoHeight;
  running = true;
  previousGray = null;
  lastAnalyzedAt = null;
  els.startBtn.textContent = "Stop camera";
  els.startBtn.setAttribute("aria-pressed", "true");
  els.readBtn.disabled = false;
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch {
    /* not critical */
  }
  speak("Camera on. Loading the object detector.");
  try {
    await ensureDetector();
  } catch (error) {
    speak("I could not load the object detector. Check your connection.");
    setStatus(error.message);
    stopCamera();
    return;
  }
  speak("Ready.");
  scheduleTick(0);
}

function stopCamera() {
  running = false;
  clearTimeout(timer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  els.video.srcObject = null;
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
  els.startBtn.textContent = "Start camera";
  els.startBtn.setAttribute("aria-pressed", "false");
  els.readBtn.disabled = true;
  setStatus("Camera stopped.");
  window.speechSynthesis?.cancel();
}

function scheduleTick(delay) {
  clearTimeout(timer);
  if (running) timer = setTimeout(tick, delay);
}

async function tick() {
  const interval = settings.saver ? 2500 : 1000;
  if (!running || document.hidden) return scheduleTick(interval);
  try {
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(els.video, 0, 0, probe.width, probe.height);
    const gray = toGray(ctx.getImageData(0, 0, probe.width, probe.height).data);
    const diff = previousGray ? frameDifference(previousGray, gray) : 1;
    previousGray = gray;

    const now = performance.now();
    if (shouldAnalyze({ diff, now, lastAnalyzedAt })) {
      lastAnalyzedAt = now;
      const objects = await detectObjects(els.video, els.video.videoWidth);
      els.overlay.getContext("2d").clearRect(0, 0, els.overlay.width, els.overlay.height);
      drawBoxes(objects);
      const sentence = announcer.announce(objects, now);
      if (sentence) speak(sentence);
      setStatus(objects.length ? `Seeing ${objects.length} object(s).` : "Nothing recognised.");

      if (settings.autoText && now - lastAutoTextAt > 8000) {
        lastAutoTextAt = now;
        void readTextNow({ announceEmpty: false });
      }
    } else {
      setStatus("Scene unchanged: saving battery.");
    }
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
  scheduleTick(interval);
}

async function readTextNow({ announceEmpty = true } = {}) {
  if (!running) return;
  try {
    setStatus("Reading text…");
    const canvas = frameToCanvas(els.video, els.video.videoWidth, els.video.videoHeight, 1280);
    const text = await recognizeText(canvas);
    if (text || announceEmpty) speak(textSentence(text), { interrupt: announceEmpty });
    setStatus(text ? "Text read." : "No text found.");
  } catch (error) {
    speak("I could not read the text.");
    setStatus(`Error: ${error.message}`);
  }
}

els.startBtn.addEventListener("click", () => (running ? stopCamera() : startCamera()));
els.readBtn.addEventListener("click", () => readTextNow());
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey && e.target.tagName !== "INPUT") readTextNow();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && running) scheduleTick(0);
});

/* ------------------------------ photo ------------------------------ */

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be loaded."));
    image.src = url;
  });
}

els.photoInput.addEventListener("change", async () => {
  const file = els.photoInput.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    await analyzeImage(image);
  } catch (error) {
    speak("I could not analyze that photo.");
    setStatus(`Error: ${error.message}`);
  } finally {
    URL.revokeObjectURL(url);
    els.photoInput.value = "";
  }
});

/* ------------------------------ distance sensor ------------------------------ */

const proximity = new ProximityMonitor();

function onDistance(cm) {
  els.distance.textContent = Number.isFinite(cm) ? `${Math.round(cm)} cm` : "–";
  const { zone, say, vibrate: pattern } = proximity.update(cm, performance.now());
  els.distance.dataset.zone = zone;
  if (say) speak(say, { interrupt: zone === "danger" });
  vibrate(pattern);
}

if (!bluetoothSupported()) {
  els.sensorBtn.disabled = true;
  els.sensorBtn.title = "Web Bluetooth is not available in this browser. Use Chrome or Edge on Android or desktop.";
}
els.sensorBtn.addEventListener("click", async () => {
  try {
    await connectDistanceSensor(onDistance, (message) => speak(message));
  } catch (error) {
    if (error?.name === "NotFoundError") return setStatus("No sensor chosen.");
    speak("I could not connect to the distance sensor.");
    setStatus(`Error: ${error.message}`);
  }
});

els.simToggle.addEventListener("change", () => {
  els.simBox.hidden = !els.simToggle.checked;
  if (els.simToggle.checked) onDistance(Number(els.simRange.value));
});
els.simRange.addEventListener("input", () => {
  els.simValue.textContent = `${els.simRange.value} cm`;
  onDistance(Number(els.simRange.value));
});

/* ------------------------------ boot ------------------------------ */

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
setStatus("Ready. Start the camera, or analyze a photo.");

// Small surface for testing from the console and for automated checks.
window.assistant = { analyzeImage, loadImage, onDistance, settings, announcer, proximity };
