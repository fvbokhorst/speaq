/**
 * SPEAQ SFU helper - native (iOS / Android via react-native-webrtc).
 *
 * Mirrors the PWA helper at speaq-web-build/src/app/app/sfu.ts so native
 * callers go through the same mediasoup-SFU instead of the brittle p2p+TURN
 * path. Cross-network audio (LTE<->WiFi) only works reliably via the SFU.
 *
 * Server: ~/speaq-mediasoup on speaq-mediasoup VM (eu-west1-b),
 * wss://sfu.thespeaq.com.
 *
 * Signaling (CALL_OFFER / CALL_ANSWER) still goes via SPEAQ-relay; the SFU
 * only routes media. Both peers join the same roomId (= callId).
 */

// MUST be the first import: polyfills RTCPeerConnection / MediaStream onto
// globalThis from react-native-webrtc, so mediasoup-client's ReactNative106
// handler can resolve them at module-init time. Order matters; ES modules
// are hoisted in import order.
import "./sfu-polyfill";
import { Device } from "mediasoup-client";
import type { types as msTypes } from "mediasoup-client";

type Transport = msTypes.Transport;
type Producer = msTypes.Producer;
type Consumer = msTypes.Consumer;
type RtpCapabilities = msTypes.RtpCapabilities;
type RtpParameters = msTypes.RtpParameters;

const SFU_URL = "wss://sfu.thespeaq.com";

export type RemoteTrackHandler = (peerId: string, track: any, kind: "audio" | "video") => void;
export type PeerLeftHandler = (peerId: string) => void;

export interface SfuSession {
  ourPeerId: string;
  publish(track: any, kind: "audio" | "video"): Promise<void>;
  onRemoteTrack(cb: RemoteTrackHandler): void;
  onPeerLeft(cb: PeerLeftHandler): void;
  close(): void;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  expectedType: string;
}

export async function connectSfu(roomId: string): Promise<SfuSession> {
  const ws = new WebSocket(SFU_URL);
  await new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error("sfu websocket failed to open"));
  });

  let nextId = 1;
  const pending = new Map<number, PendingRequest>();
  const remoteHandlers: RemoteTrackHandler[] = [];
  const peerLeftHandlers: PeerLeftHandler[] = [];
  const bufferedTracks: Array<{ peerId: string; track: any; kind: "audio" | "video" }> = [];

  function emitRemote(peerId: string, track: any, kind: "audio" | "video") {
    if (remoteHandlers.length === 0) {
      bufferedTracks.push({ peerId, track, kind });
    } else {
      for (const h of remoteHandlers) h(peerId, track, kind);
    }
  }

  let device: Device | null = null;
  let recvTransport: Transport | null = null;

  ws.onmessage = (e: any) => {
    let m: { id?: number; type: string; [k: string]: any };
    try { m = JSON.parse(typeof e.data === "string" ? e.data : ""); } catch { return; }
    if (typeof m.id === "number" && pending.has(m.id)) {
      const p = pending.get(m.id)!;
      pending.delete(m.id);
      if (m.type === p.expectedType) p.resolve(m);
      else if (m.type === "error") p.reject(new Error(String(m.error || "sfu error")));
      else p.reject(new Error("unexpected sfu type " + m.type));
      return;
    }
    if (m.type === "newProducer") {
      const producerId = String(m.producerId);
      const peerId = String(m.peerId);
      const kind = (m.kind === "video" ? "video" : "audio") as "audio" | "video";
      void consumeRemote(producerId, peerId, kind);
    } else if (m.type === "peerLeft") {
      const peerId = String(m.peerId);
      for (const h of peerLeftHandlers) h(peerId);
    }
  };

  function rpc<T>(req: Record<string, unknown>, expectedType: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolve as (v: any) => void, reject, expectedType });
      ws.send(JSON.stringify({ ...req, id }));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error("sfu rpc timeout for " + expectedType));
        }
      }, 10000);
    });
  }

  async function consumeRemote(producerId: string, peerId: string, kind: "audio" | "video") {
    if (!device || !recvTransport) return;
    try {
      const m = await rpc<{ params: { id: string; producerId: string; kind: "audio" | "video"; rtpParameters: RtpParameters } }>(
        { type: "consume", producerId, rtpCapabilities: device.rtpCapabilities },
        "consumed"
      );
      const consumer: Consumer = await recvTransport.consume(m.params as any);
      emitRemote(peerId, consumer.track, kind);
    } catch (err) {
      console.error("[SPEAQ-SFU] consumeRemote failed", producerId, err);
    }
  }

  const joined = await rpc<{
    peerId: string;
    rtpCapabilities: RtpCapabilities;
    existingProducers: Array<{ peerId: string; producerId: string; kind: "audio" | "video" }>;
  }>({ type: "join", roomId }, "joined");

  // React Native handler tells mediasoup-client to use react-native-webrtc's
  // RTCPeerConnection / MediaStreamTrack instead of browser globals.
  // ReactNative106 is the correct handler for react-native-webrtc 100+ which
  // we use (124.0.7).
  device = new Device({ handlerName: "ReactNative106" });
  await device.load({ routerRtpCapabilities: joined.rtpCapabilities });

  type TransportParams = {
    id: string;
    iceParameters: unknown;
    iceCandidates: unknown[];
    dtlsParameters: unknown;
  };
  const sParams = (await rpc<{ params: TransportParams }>({ type: "createSendTransport" }, "sendTransportCreated")).params;
  const sendTransport: Transport = device.createSendTransport(sParams as any);
  sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
    rpc({ type: "connectSendTransport", dtlsParameters }, "sendTransportConnected")
      .then(() => callback())
      .catch((err) => errback(err as Error));
  });
  sendTransport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
    try {
      const m = await rpc<{ producerId: string }>({ type: "produce", kind, rtpParameters }, "produced");
      callback({ id: m.producerId });
    } catch (err) {
      errback(err as Error);
    }
  });

  const rParams = (await rpc<{ params: TransportParams }>({ type: "createRecvTransport" }, "recvTransportCreated")).params;
  recvTransport = device.createRecvTransport(rParams as any);
  recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
    rpc({ type: "connectRecvTransport", dtlsParameters }, "recvTransportConnected")
      .then(() => callback())
      .catch((err) => errback(err as Error));
  });

  const producers: Producer[] = [];

  async function publish(track: any, kind: "audio" | "video") {
    const producer = await sendTransport.produce({ track });
    producers.push(producer);
    void kind;
  }

  for (const ep of joined.existingProducers) {
    await consumeRemote(ep.producerId, ep.peerId, ep.kind);
  }

  function close() {
    for (const p of producers) { try { p.close(); } catch {} }
    try { sendTransport.close(); } catch {}
    try { recvTransport?.close(); } catch {}
    try { ws.close(); } catch {}
    pending.clear();
  }

  return {
    ourPeerId: joined.peerId,
    publish,
    onRemoteTrack(cb) {
      remoteHandlers.push(cb);
      for (const buf of bufferedTracks) cb(buf.peerId, buf.track, buf.kind);
      bufferedTracks.length = 0;
    },
    onPeerLeft(cb) { peerLeftHandlers.push(cb); },
    close,
  };
}
