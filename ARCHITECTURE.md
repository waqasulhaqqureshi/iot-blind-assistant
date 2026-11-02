# Architecture

## Goal

Give a visually impaired person a short, timely spoken description of what is in front of them: objects, readable text and close obstacles. Everything runs on the user's own device.

## Layout

```
docs/                    The web app (served by GitHub Pages, also runnable locally)
  index.html, css/       Interface
  js/app.js              Camera loop, models, speech, sensor wiring (browser only)
  js/announcer.mjs       What to say about objects and text, and when        (pure, tested)
  js/proximity.mjs       Distance packets -> warning zones with hysteresis    (pure, tested)
  js/motion.mjs          Scene-change check that saves battery               (pure, tested)
  js/ocr-clean.mjs       Filters OCR garbage before it is spoken              (pure, tested)
  js/sensor-ble.mjs      Web Bluetooth link to the microcontroller
  sw.js                  Service worker: caches the app and model files after first use
firmware/                ESP32 + HC-SR04 reference sketch (not yet flashed)
test/                    Node unit tests for the four pure modules
```

The pure modules import nothing from the browser, which is why the interesting decisions can be tested in CI without a camera.

## Data flow

1. **Capture.** A 64×48 grayscale copy of the camera frame is compared with the previous one (`motion.mjs`). If the scene has not changed, the detector is skipped, except for a re-check every 8 seconds.
2. **Detect.** COCO-SSD (`lite_mobilenet_v2`) on TensorFlow.js returns labelled boxes. The box centre decides *left / ahead / right* (`positionFromBox`).
3. **Decide.** The announcer drops weak guesses (default below 60%), removes duplicates, respects a cooldown per label (30 s in live mode) and says at most three objects.
4. **Read text.** On request, Tesseract.js reads a frame of up to 1280 px; `cleanOcr` keeps words with confidence of at least 60 and drops noise before speech.
5. **Sense distance.** Packets such as `D:123` arrive over Bluetooth LE (or from the simulator). `ProximityMonitor` maps them to *clear / warn / danger*.
6. **Speak.** Speech synthesis says the sentence. Danger interrupts anything being said; other sentences are skipped if one is already queued, so the user never hears a backlog of stale sentences.

## Design decisions

- **Silence is a feature.** A confident wrong answer is worse than no answer, and repetition is noise. Thresholds, cooldowns and caps exist for that reason.
- **Hysteresis on distance.** A reading that jitters between 49 and 51 cm must not alternate between "stop" and "obstacle ahead". Leaving a zone needs a 15 cm margin; entering a more severe zone speaks immediately.
- **Out of range means clear.** HC-SR04 returns nothing beyond about 4 m; that is treated as free space, not as an error.
- **Battery.** Detection runs on change, not on a clock; an optional battery-saver mode slows the check interval; the loop pauses when the tab is hidden.
- **No keys, no servers.** The original course prototype used Google Cloud Vision, which needs an account and a paid API. This version trades some accuracy for something anyone can run offline for free.

## Constraints and limits

- COCO-SSD knows 80 object classes (person, chair, bus, bottle, …). It does not know doors, steps or kerbs.
- OCR needs good light, a steady camera and reasonably large print.
- Ultrasonic sensors miss soft, angled and very thin objects.
- Web Bluetooth is not available on iOS Safari.
- Models are fetched from public CDNs on first use; offline use depends on the service worker and has not been verified yet.

## Not built or not measured

- No measured latency, accuracy or battery figures
- Firmware not compiled or flashed
- No testing with blind or low-vision users
- No on-device OpenCV preprocessing yet
