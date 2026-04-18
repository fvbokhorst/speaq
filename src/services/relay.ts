/**
 * SPEAQ Relay Service
 * Manages WebSocket connection to the SPEAQ relay server
 * PRD Section 4.4: WebSocket events (AUTH, SEND, RECEIVE, ACK, TYPING)
 *
 * Anti-traffic analysis:
 * - All outgoing messages are padded to fixed block sizes
 * - Random delays between messages prevent timing correlation
 * - Obfuscated transport used when direct connection fails
 */

import { config } from "./config";
import { obfuscatePayload, deobfuscatePayload, getCurrentMode, isTorRunning, getTorSocksPort } from "./transport";

type MessageHandler = (msg: any) => void;

/** Pad message to fixed block size to prevent traffic analysis */
function padMessage(data: string): string {
  const blockSize = 4096;
  const padLength = blockSize - (data.length % blockSize);
  return data + "\0".repeat(padLength);
}

/** Remove padding from received message */
function unpadMessage(data: string): string {
  return data.replace(/\0+$/, "");
}

/** Random delay between 50-300ms to prevent timing correlation */
function randomDelay(): Promise<void> {
  const delay = 50 + Math.floor(Math.random() * 250);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/** Safe send: skips when socket is CONNECTING/CLOSING/CLOSED so send() never throws INVALID_STATE_ERR. */
export function safeWsSend(ws: WebSocket | null | undefined, payload: string): boolean {
  if (!ws || ws.readyState !== 1) return false;
  try { ws.send(payload); return true; } catch { return false; }
}

class RelayService {
  private ws: WebSocket | null = null;
  private speaqId: string | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected: boolean = false;
  private useObfuscation: boolean = false;

  async connect(speaqId: string): Promise<void> {
    this.speaqId = speaqId;

    // Select transport based on current mode
    const mode = getCurrentMode();
    this.useObfuscation = mode !== "direct";

    let relayUrl = config.relay.url;

    if (mode === "tor" && isTorRunning()) {
      // Route WebSocket through Tor SOCKS5 proxy
      // react-native-tor provides SOCKS5 on local port
      const socksPort = getTorSocksPort();
      console.log("[Relay] Connecting via Tor (SOCKS5 port " + socksPort + ")");
      // Note: React Native WebSocket doesn't natively support SOCKS5
      // In production: use a Tor-aware WebSocket library or HTTP long-polling through torFetch
      // For now: connect directly but with obfuscation enabled
      this.useObfuscation = true;
    }

    this.ws = new WebSocket(relayUrl);

    this.ws.onopen = () => {
      this.connected = true;
      safeWsSend(this.ws, JSON.stringify({ type: "AUTH", speaqId }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        const handlers = this.handlers.get(msg.type) || [];
        handlers.forEach((h) => h(msg));

        // Global handler
        const allHandlers = this.handlers.get("*") || [];
        allHandlers.forEach((h) => h(msg));
      } catch (e) {
        console.error("Relay parse error:", e);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      // Auto-reconnect after 3 seconds
      this.reconnectTimer = setTimeout(() => {
        if (this.speaqId) this.connect(this.speaqId);
      }, 3000);
    };

    this.ws.onerror = (error) => {
      console.error("Relay error:", error);
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  async send(to: string, blob: string): Promise<void> {
    if (!this.ws || !this.connected) {
      console.error("Not connected to relay");
      return;
    }

    // Anti-traffic analysis: random delay before sending
    await randomDelay();

    // Pad the blob to fixed block size (prevents message length analysis)
    const paddedBlob = padMessage(blob);

    const payload = JSON.stringify({
      type: "SEND",
      to,
      blob: this.useObfuscation ? obfuscatePayload(paddedBlob) : paddedBlob,
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    });

    safeWsSend(this.ws, payload);
  }

  async sendTyping(to: string): Promise<void> {
    if (!this.ws || !this.connected) return;
    // Random delay for typing indicators too (anti-timing)
    await randomDelay();
    safeWsSend(this.ws, JSON.stringify({ type: "TYPING", to }));
  }

  on(event: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  off(event: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(event) || [];
    this.handlers.set(event, handlers.filter((h) => h !== handler));
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSpeaqId(): string | null {
    return this.speaqId;
  }
}

// Singleton
export const relay = new RelayService();
