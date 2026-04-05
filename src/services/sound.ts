/**
 * SPEAQ Sound Service
 * System sounds for messages and calls
 * Uses iOS system sounds (no external library needed)
 */

import { Platform, NativeModules } from "react-native";

// iOS system sound IDs
const SOUNDS = {
  messageReceived: 1007,  // Tink
  messageSent: 1004,      // Key press (subtle)
  callIncoming: 1005,     // Alarm
  paymentReceived: 1025,  // New mail
  paymentSent: 1001,      // Received (subtle)
};

/**
 * Play a system sound by ID (iOS only, silent on Android for now)
 */
function playSystemSound(soundId: number): void {
  if (Platform.OS === "ios") {
    try {
      // AudioServicesPlaySystemSound via native bridge
      const { AudioServices } = NativeModules;
      if (AudioServices?.playSystemSound) {
        AudioServices.playSystemSound(soundId);
      }
    } catch (e) {
      // Fallback: no sound, only vibration (already handled elsewhere)
    }
  }
}

export function playMessageReceived(): void {
  playSystemSound(SOUNDS.messageReceived);
}

export function playMessageSent(): void {
  playSystemSound(SOUNDS.messageSent);
}

export function playCallIncoming(): void {
  playSystemSound(SOUNDS.callIncoming);
}

export function playPaymentReceived(): void {
  playSystemSound(SOUNDS.paymentReceived);
}

export function playPaymentSent(): void {
  playSystemSound(SOUNDS.paymentSent);
}
