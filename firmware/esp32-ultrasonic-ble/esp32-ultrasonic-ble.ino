/*
 * ESP32 + HC-SR04 ultrasonic distance sensor -> Bluetooth LE -> IoT Blind Assistant app.
 *
 * STATUS: reference sketch. It follows the standard ESP32 Arduino BLE examples and the
 * packet format the web app parses ("D:123"), but it has NOT been compiled or flashed by
 * the author of this repository yet. Treat the first flash as a test.
 *
 * Wiring (ESP32 DevKit):
 *   HC-SR04 VCC  -> 5V (VIN)
 *   HC-SR04 GND  -> GND
 *   HC-SR04 TRIG -> GPIO 5
 *   HC-SR04 ECHO -> GPIO 18 through a voltage divider (e.g. 1k + 2k) because ECHO is 5V
 *                   and the ESP32 inputs are 3.3V
 *
 * Board: "ESP32 Dev Module" in the Arduino IDE (Espressif ESP32 core 2.x or 3.x).
 */
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Nordic UART service: the same UUIDs the web app looks for.
#define SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define TX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

const int TRIG_PIN = 5;
const int ECHO_PIN = 18;
const unsigned long SAMPLE_INTERVAL_MS = 250;  // 4 readings per second
const unsigned long ECHO_TIMEOUT_US = 30000;   // ~5 m round trip; beyond this, "nothing seen"

BLECharacteristic *txCharacteristic = nullptr;
bool clientConnected = false;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *) override { clientConnected = true; }
  void onDisconnect(BLEServer *server) override {
    clientConnected = false;
    server->getAdvertising()->start();  // let the phone reconnect
  }
};

// One distance reading in centimetres, or -1 when the echo times out.
float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long duration = pulseIn(ECHO_PIN, HIGH, ECHO_TIMEOUT_US);
  if (duration == 0) return -1;
  return duration * 0.0343f / 2.0f;  // speed of sound ~343 m/s
}

// Median of three readings removes single-sample spikes.
float medianDistanceCm() {
  float a = readDistanceCm();
  delay(15);
  float b = readDistanceCm();
  delay(15);
  float c = readDistanceCm();
  if (a > b) { float t = a; a = b; b = t; }
  if (b > c) { float t = b; b = c; c = t; }
  if (a > b) { float t = a; a = b; b = t; }
  return b;
}

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  BLEDevice::init("BlindAssistant-Sensor");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService *service = server->createService(SERVICE_UUID);
  txCharacteristic = service->createCharacteristic(TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  txCharacteristic->addDescriptor(new BLE2902());
  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);  // the web app filters on this UUID
  advertising->start();
}

void loop() {
  if (clientConnected) {
    float cm = medianDistanceCm();
    char packet[16];
    // -1 (no echo) is sent as 999 so the app treats it as "nothing in range".
    snprintf(packet, sizeof(packet), "D:%d", cm < 0 ? 999 : (int)(cm + 0.5f));
    txCharacteristic->setValue((uint8_t *)packet, strlen(packet));
    txCharacteristic->notify();
    delay(SAMPLE_INTERVAL_MS);
  } else {
    // Nobody listening: sample rarely instead of burning power. (Deep sleep with BLE
    // wake-up is a further improvement, not implemented here.)
    delay(1000);
  }
}
