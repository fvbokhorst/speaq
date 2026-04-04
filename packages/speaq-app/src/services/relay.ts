/**
 * SPEAQ Relay Service
 * Manages WebSocket connection to the SPEAQ relay server
 * PRD Section 4.4: WebSocket events (AUTH, SEND, RECEIVE, ACK, TYPING)
 */

import { config } from "./config";

type MessageHandler = (msg: any) => void;

class RelayService {
  private ws: WebSocket | null = null;
  private speaqId: string | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected: boolean = false;

  connect(speaqId: string): void {
    this.speaqId = speaqId;
    this.ws = new WebSocket(config.relay.url);

    this.ws.onopen = () => {
      this.connected = true;
      this.ws?.send(JSON.stringify({ type: "AUTH", speaqId }));
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

  send(to: string, blob: string): void {
    if (!this.ws || !this.connected) {
      console.error("Not connected to relay");
      return;
    }
    this.ws.send(JSON.stringify({
      type: "SEND",
      to,
      blob,
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    }));
  }

  sendTyping(to: string): void {
    if (!this.ws || !this.connected) return;
    this.ws.send(JSON.stringify({ type: "TYPING", to }));
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
