# Field test protocol

The numbers below have **not been collected yet**. Every result cell is empty on purpose: this file is the protocol and the place to record real measurements, so the README never has to guess.

Use the live app: <https://waqasulhaqqureshi.github.io/iot-blind-assistant/>

## A. Phone and browser

| Item | Result |
| --- | --- |
| Phone model and Android version | |
| Browser and version (Chrome or Edge recommended) | |
| Network during the test (Wi-Fi or mobile data) | |
| Date and place (indoor or outdoor, lighting) | |

## B. Camera and speech

1. **First load.** Time from tapping *Start camera* until the app says "Ready". Note Wi-Fi or mobile data. Run it once on a fresh install (empty cache) and once again afterwards.
2. **Delay.** Point the phone at a chair or a person and note how long until it speaks. Repeat 5 times and record each: roughly 1 s, 3 s or 5 s is enough.
3. **Accuracy of objects.** Point it at 10 everyday things, one at a time, in normal light. Record what it said and whether that was correct.
4. **Text reading.** Try 3 signs or labels with the *Read text* button. Record what it read and whether it was right.
5. **Battery.** Note the battery percentage, run the camera for 10 minutes with the screen on, note it again.
6. **Anything that broke.** The camera did not start, the voice was too fast, it kept repeating, and so on.

| Test | Result |
| --- | --- |
| First load, fresh install (seconds, network) | |
| First load, second time (seconds) | |
| Delay, 5 repeats (seconds each) | |
| Objects named correctly (x of 10) | |
| Objects it got wrong (what it said vs what it was) | |
| Signs or labels read correctly (x of 3) | |
| Battery, start and after 10 minutes (%) | |
| Problems noticed | |

Object log (one row per thing you point at):

| # | What it really was | What the app said | Correct? |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |
| 9 | | | |
| 10 | | | |

## C. Distance sensor (only if you have the ESP32 and an HC-SR04)

Flash `firmware/esp32-ultrasonic-ble` first and wire it as in Figure 4 of the README. Web Bluetooth works in Chrome or Edge on Android, not on iPhone.

| Test | Result |
| --- | --- |
| Did it connect? (yes or no, phone and browser) | |
| App reading with a wall at 50 cm (ruler) | |
| App reading with a wall at 100 cm (ruler) | |
| Did it say "Obstacle ahead" at about 100 cm? | |
| Did it say "Stop" at about 40 cm? | |
| Did the message flip back and forth while standing still? | |

## D. After the test

Copy the real results into the README's "What was tested" table, and remove the matching line from "Not verified yet". Do not fill a cell from memory or from the simulator.
