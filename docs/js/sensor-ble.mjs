/**
 * Bluetooth LE link to the microcontroller (for example an ESP32 + HC-SR04).
 *
 * The device exposes the standard "Nordic UART" service and sends the distance
 * as short ASCII packets such as "D:123" on the TX characteristic. Web
 * Bluetooth works in Chrome and Edge on Android and desktop (not iOS Safari).
 */
import { parseDistancePacket } from "./proximity.mjs";

export const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const TX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

export function bluetoothSupported() {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Prompts the user to pick the device, then streams distances to `onDistance`.
 * @returns {Promise<{ name: string, disconnect: () => void }>}
 */
export async function connectDistanceSensor(onDistance, onStatus = () => {}) {
  if (!bluetoothSupported()) {
    throw new Error("Web Bluetooth is not available in this browser. Use Chrome or Edge on Android or desktop.");
  }
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE_UUID] }] });
  device.addEventListener("gattserverdisconnected", () => onStatus("Distance sensor disconnected."));

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  const characteristic = await service.getCharacteristic(TX_CHARACTERISTIC_UUID);
  await characteristic.startNotifications();

  const decoder = new TextDecoder();
  characteristic.addEventListener("characteristicvaluechanged", (event) => {
    const distance = parseDistancePacket(decoder.decode(event.target.value));
    if (distance !== null) onDistance(distance);
  });

  const name = device.name || "distance sensor";
  onStatus(`Connected to ${name}.`);
  return { name, disconnect: () => device.gatt.disconnect() };
}
