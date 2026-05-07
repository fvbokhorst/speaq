/**
 * SPEAQ Call Service
 * WebRTC voice + video calling via relay signaling
 * Phase 3: 1-on-1 calls only
 */

import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from "react-native-webrtc";
import { relay } from "./relay";
import { getIdentity, sendRelayPayload } from "./speaq";
import { encryptCallBlob, decryptCallBlob } from "./crypto";
import { getIceServers } from "./turn";
import { connectSfu, type SfuSession } from "./sfu";
import InCallManager from "react-native-incall-manager";

export type CallState = "idle" | "calling" | "ringing" | "connected" | "ended";

type CallEventHandler = (data: any) => void;

// STUN-only fallback used when the relay /api/v1/turn-credentials lookup fails
// (offline, transient relay error). Cross-network calls without TURN will fail
// to negotiate over symmetric NAT, so we fetch real iceServers per-call below.
const ICE_SERVERS_FALLBACK = [
  { urls: "stun:turn.thespeaq.com:3478" },
];

// C2-N + C2.2-N audit fix (2026-04-26): every WebRTC signaling payload is now
// encrypted with AES-256-GCM keyed off the ratchet rootKey before being sent
// to the relay. Wire format (base64(iv12 ++ ct)) matches PWA so PWA<->native
// calls remain interoperable. If a peer has no ratchet yet (legacy or first
// contact), encryption falls back to an ID-derived key (relay-readable, only
// when no shared secret is available).
//
// Inbound handlers try msg.blob first; if absent or decrypt fails, fall back
// to legacy plaintext msg.sdp/msg.candidate with console.warn so we can spot
// remaining unpatched peers in the field.

async function tryDecryptCallBlob(peerId: string | undefined, msg: any, plaintextField: "sdp" | "candidate"): Promise<any | null> {
  const myId = getIdentity()?.speaqId;
  if (msg.blob && myId && peerId) {
    try {
      const plain = await decryptCallBlob(myId, peerId, msg.blob);
      return JSON.parse(plain);
    } catch (e) {
      console.error(`[SPEAQ] call signaling decrypt failed for ${plaintextField}:`, e);
      return null;
    }
  }
  if (msg[plaintextField] !== undefined) {
    console.warn(`[SPEAQ] call signaling received in legacy plaintext mode (${plaintextField}) from`, peerId);
    return { [plaintextField]: msg[plaintextField], video: msg.video };
  }
  return null;
}

class CallService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private callId: string | null = null;
  private callState: CallState = "idle";
  private contactId: string | null = null;
  private isVideo: boolean = false;
  private speakerOn: boolean = false;
  private handlers: Map<string, CallEventHandler[]> = new Map();
  private iceCandidateBuffer: RTCIceCandidate[] = [];
  // SFU room-based call state (replaces p2p+TURN flow for 1-on-1 calls).
  // PWA peers already use this since 2026-05-03; native joins the same room.
  private sfuSession: SfuSession | null = null;
  private sfuRoomId: string | null = null;

  constructor() {
    // Listen for call signaling from relay
    relay.on("CALL_OFFER", (msg) => this.handleOffer(msg));
    relay.on("CALL_ANSWER", (msg) => this.handleAnswer(msg));
    relay.on("ICE_CANDIDATE", (msg) => this.handleIceCandidate(msg));
    relay.on("CALL_END", (msg) => this.handleEnd(msg));
    relay.on("CALL_REJECT", (msg) => this.handleReject(msg));
    relay.on("CALL_UNAVAILABLE", (msg) => this.handleUnavailable(msg));
  }

  // --- Public API ---

  async startCall(contactId: string, video: boolean): Promise<void> {
    if (this.callState !== "idle") return;

    this.contactId = contactId;
    this.isVideo = video;
    this.callId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    this.sfuRoomId = this.callId;
    this.setState("calling");

    await this.getLocalMedia(video);

    try {
      InCallManager.start({ media: video ? "video" : "audio" });
      InCallManager.setForceSpeakerphoneOn(video);
      InCallManager.setKeepScreenOn(true);
      this.speakerOn = video;
    } catch (e) {
      console.warn("[SPEAQ] InCallManager.start failed:", (e as Error).message);
    }

    await this.joinSfuAndPublish(this.sfuRoomId, video);

    {
      const myId = getIdentity()?.speaqId;
      const blob = myId ? await encryptCallBlob(myId, contactId, JSON.stringify({ sfu: true, roomId: this.sfuRoomId, video })) : null;
      sendRelayPayload({
        type: "CALL_OFFER",
        to: contactId,
        ...(blob ? { blob } : { sfu: true, roomId: this.sfuRoomId, video }),
        callId: this.callId,
        sfu: true,
        roomId: this.sfuRoomId,
        video,
      });
      console.log("[SPEAQ-SFU] CALL_OFFER sent, room=", this.sfuRoomId);
    }
  }

  async acceptCall(): Promise<void> {
    if (this.callState !== "ringing" || !this.sfuRoomId) return;

    await this.getLocalMedia(this.isVideo);

    try {
      InCallManager.start({ media: this.isVideo ? "video" : "audio" });
      InCallManager.setForceSpeakerphoneOn(this.isVideo);
      InCallManager.setKeepScreenOn(true);
      this.speakerOn = this.isVideo;
    } catch (e) {
      console.warn("[SPEAQ] InCallManager.start (accept) failed:", (e as Error).message);
    }

    await this.joinSfuAndPublish(this.sfuRoomId, this.isVideo);

    {
      const myId = getIdentity()?.speaqId;
      const blob = myId && this.contactId ? await encryptCallBlob(myId, this.contactId, JSON.stringify({ sfu: true, accepted: true })) : null;
      sendRelayPayload({
        type: "CALL_ANSWER",
        to: this.contactId,
        ...(blob ? { blob } : { sfu: true, accepted: true }),
        callId: this.callId,
      });
    }
    this.setState("connected");

    // Flush buffered ICE candidates
    for (const candidate of this.iceCandidateBuffer) {
      await this.pc.addIceCandidate(candidate);
    }
    this.iceCandidateBuffer = [];

    this.setState("connected");
  }

  rejectCall(): void {
    if (this.callState !== "ringing") return;

    sendRelayPayload({
      type: "CALL_REJECT",
      to: this.contactId,
      callId: this.callId,
    });

    this.cleanup();
  }

  endCall(): void {
    if (this.callState === "idle") return;

    if (this.contactId) {
      sendRelayPayload({
        type: "CALL_END",
        to: this.contactId,
        callId: this.callId,
      });
    }

    this.cleanup();
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // returns true if now muted
    }
    return false;
  }

  toggleSpeaker(): void {
    // Toggle the iOS audio output between earpiece and speaker via
    // InCallManager (which calls AVAudioSession overrideOutputAudioPort
    // under the hood).
    try {
      this.speakerOn = !this.speakerOn;
      InCallManager.setForceSpeakerphoneOn(this.speakerOn);
      this.emit("speakerChanged", this.speakerOn);
    } catch (e) {
      console.warn("[SPEAQ] toggleSpeaker failed:", (e as Error).message);
    }
  }

  isSpeakerOn(): boolean {
    return this.speakerOn;
  }

  toggleCamera(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled;
    }
    return false;
  }

  async switchCamera(): Promise<void> {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack && typeof (videoTrack as any)._switchCamera === "function") {
      (videoTrack as any)._switchCamera();
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getCallState(): CallState {
    return this.callState;
  }

  getCallId(): string | null {
    return this.callId;
  }

  getContactId(): string | null {
    return this.contactId;
  }

  getIsVideo(): boolean {
    return this.isVideo;
  }

  on(event: string, handler: CallEventHandler): void {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  off(event: string, handler: CallEventHandler): void {
    const handlers = this.handlers.get(event) || [];
    this.handlers.set(event, handlers.filter((h) => h !== handler));
  }

  // --- Private ---

  private emit(event: string, data?: any): void {
    const handlers = this.handlers.get(event) || [];
    handlers.forEach((h) => h(data));
  }

  private setState(state: CallState): void {
    this.callState = state;
    this.emit("stateChange", state);
  }

  private async setupPeerConnection(): Promise<void> {
    const myId = getIdentity()?.speaqId || "";
    let iceServers = ICE_SERVERS_FALLBACK;
    try {
      const fetched = await getIceServers(myId);
      if (fetched && fetched.length > 0) {
        iceServers = fetched as any;
        console.log("[SPEAQ-DBG] iceServers fetched:", iceServers.length, "entries");
      }
    } catch (e) {
      console.warn("[SPEAQ] getIceServers failed, using STUN fallback:", (e as Error).message);
    }
    this.pc = new RTCPeerConnection({ iceServers });

    this.pc.onicecandidate = async (event: any) => {
      if (event.candidate && this.contactId) {
        const myId = getIdentity()?.speaqId;
        const blob = myId ? await encryptCallBlob(myId, this.contactId, JSON.stringify({ candidate: event.candidate })) : null;
        sendRelayPayload({
          type: "ICE_CANDIDATE",
          to: this.contactId,
          ...(blob ? { blob } : { candidate: event.candidate }),
          callId: this.callId,
        });
      }
    };

    this.pc.ontrack = (event: any) => {
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((t: any) => {
          console.log("[SPEAQ-DBG] remote track:", t.kind, "muted=", t.muted, "enabled=", t.enabled);
        });
        this.remoteStream = event.streams[0];
        this.emit("remoteStream", this.remoteStream);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log("[SPEAQ-DBG] iceConnectionState=", this.pc?.iceConnectionState);
    };

    this.pc.onconnectionstatechange = () => {
      console.log("[SPEAQ-DBG] connectionState=", this.pc?.connectionState);
      if (this.pc?.connectionState === "disconnected" || this.pc?.connectionState === "failed") {
        this.cleanup();
      }
    };
  }

  private async getLocalMedia(video: boolean): Promise<void> {
    const constraints: any = {
      audio: true,
      video: video ? { facingMode: "user", width: 640, height: 480 } : false,
    };

    this.localStream = await mediaDevices.getUserMedia(constraints) as MediaStream;

    // Log every track for diagnostics. SFU-pad does not need addTrack on a
    // p2p RTCPeerConnection; tracks are published via sfuSession.publish() in
    // joinSfuAndPublish() below.
    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => {
        console.log("[SPEAQ-DBG] local track:", track.kind, "muted=", track.muted, "enabled=", track.enabled);
      });
    }

    this.emit("localStream", this.localStream);
  }

  /**
   * SFU room join + publish lokale tracks. Mirrors PWA behaviour from
   * speaq-web-build/src/app/app/sfu.ts: each peer connects to the same
   * roomId (= callId) on wss://sfu.thespeaq.com and publishes their tracks.
   * Remote tracks bubble up to CallScreen via the existing remoteStream
   * event, wrapped in a fresh MediaStream per kind.
   */
  private async joinSfuAndPublish(roomId: string, _video: boolean): Promise<void> {
    if (!this.localStream) {
      throw new Error("joinSfuAndPublish: localStream missing");
    }
    const session = await connectSfu(roomId);
    this.sfuSession = session;
    console.log("[SPEAQ-SFU] joined room=", roomId, "as peerId=", session.ourPeerId);

    session.onRemoteTrack((peerId, track, kind) => {
      console.log("[SPEAQ-SFU] remote track from", peerId, kind);
      // Wrap into a MediaStream so CallScreen's RTCView (which expects a
      // streamURL) and AVAudioSession playback both work as before.
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream([track] as any);
      } else {
        try { (this.remoteStream as any).addTrack(track); } catch {}
      }
      this.emit("remoteStream", this.remoteStream);
    });

    session.onPeerLeft((peerId) => {
      console.log("[SPEAQ-SFU] peer left", peerId);
    });

    for (const track of this.localStream.getTracks()) {
      const kind = (track as any).kind === "video" ? "video" : "audio";
      await session.publish(track, kind as any);
      console.log("[SPEAQ-SFU] published", kind);
    }
  }

  // PUBLIC: dispatched by speaq.ts ws.onmessage (the relay-shared WS owned
  // by speaq.ts). The relay-service WS in relay.ts is never connected, so
  // these handlers must be reachable from outside this class. Behaviour is
  // unchanged - only visibility was widened.
  async handleOffer(msg: any): Promise<void> {
    if (this.callState !== "idle") {
      sendRelayPayload({ type: "CALL_REJECT", to: msg.from, callId: msg.callId });
      return;
    }

    // Try SFU-flow first: PWA peers carry { sfu: true, roomId, video } in the
    // encrypted blob (and as top-level msg.sfu/msg.roomId when relay strips
    // the blob for legacy pre-blob clients). If sfu is missing, fall back to
    // the p2p path for older callers.
    const decoded = await tryDecryptCallBlob(msg.from, msg, "sdp");
    const isSfu = (decoded && decoded.sfu) || msg.sfu === true;
    const sfuRoomId = (decoded && decoded.roomId) || msg.roomId;

    if (isSfu && sfuRoomId) {
      this.contactId = msg.from;
      this.callId = msg.callId;
      this.sfuRoomId = String(sfuRoomId);
      this.isVideo = (decoded && decoded.video) ?? msg.video ?? false;
      this.setState("ringing");
      this.emit("incomingCall", { from: msg.from, callId: msg.callId, video: this.isVideo });
      console.log("[SPEAQ-SFU] incoming SFU call, room=", this.sfuRoomId);
      return;
    }

    // Legacy p2p fallback (for callers running pre-1.0.6(4) builds).
    if (!decoded || !decoded.sdp) {
      console.error("[SPEAQ] CALL_OFFER without usable SDP or SFU room, ignoring");
      return;
    }
    this.contactId = msg.from;
    this.callId = msg.callId;
    this.isVideo = decoded.video ?? msg.video ?? false;
    this.setState("ringing");
    await this.setupPeerConnection();
    await this.pc!.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: decoded.sdp }));
    this.emit("incomingCall", { from: msg.from, callId: msg.callId, video: this.isVideo });
  }

  async handleAnswer(msg: any): Promise<void> {
    if (msg.callId !== this.callId) return;

    // SFU-flow: the answer just confirms the callee joined the same room.
    // No SDP processing needed - mediasoup already established the media path
    // when both sides called connectSfu(roomId).
    if (this.sfuSession) {
      console.log("[SPEAQ-SFU] CALL_ANSWER received, marking connected");
      this.setState("connected");
      return;
    }

    // Legacy p2p answer.
    if (!this.pc) return;
    const decoded = await tryDecryptCallBlob(msg.from || this.contactId || undefined, msg, "sdp");
    if (!decoded || !decoded.sdp) {
      console.error("[SPEAQ] CALL_ANSWER without usable SDP, ignoring");
      return;
    }
    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: decoded.sdp }));
    this.setState("connected");
  }

  async handleIceCandidate(msg: any): Promise<void> {
    if (msg.callId !== this.callId) return;
    // No-op for SFU calls (mediasoup handles its own ICE).
    if (this.sfuSession) return;

    const decoded = await tryDecryptCallBlob(msg.from || this.contactId || undefined, msg, "candidate");
    if (!decoded || !decoded.candidate) return;
    const candidate = new RTCIceCandidate(decoded.candidate);
    if (this.pc?.remoteDescription) {
      await this.pc.addIceCandidate(candidate);
    } else {
      this.iceCandidateBuffer.push(candidate);
    }
  }

  handleEnd(msg: any): void {
    if (msg.callId !== this.callId) return;
    this.cleanup();
  }

  handleReject(msg: any): void {
    if (msg.callId !== this.callId) return;
    this.emit("callRejected", msg);
    this.cleanup();
  }

  handleUnavailable(msg: any): void {
    if (msg.callId !== this.callId) return;
    this.emit("callUnavailable", msg);
    this.cleanup();
  }

  private cleanup(): void {
    this.stopQualityMonitor();
    // Release AVAudioSession back to system. Pairs with InCallManager.start()
    // in startCall + acceptCall. Without this the audio session stays in
    // PlayAndRecord and other apps cannot reclaim the speaker route.
    try {
      InCallManager.stop();
      InCallManager.setKeepScreenOn(false);
      this.speakerOn = false;
    } catch (e) {
      console.warn("[SPEAQ] InCallManager.stop failed:", (e as Error).message);
    }
    if (this.screenShareStream) {
      this.screenShareStream.getTracks().forEach((track: any) => track.stop());
      this.screenShareStream = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => track.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.sfuSession) {
      try { this.sfuSession.close(); } catch {}
      this.sfuSession = null;
    }
    this.sfuRoomId = null;
    // Cleanup group peers
    for (const [, pc] of this.groupPeers) {
      pc.close();
    }
    this.groupPeers.clear();
    this.groupMemberIds = [];
    this.callId = null;
    this.contactId = null;
    this.iceCandidateBuffer = [];
    this.setState("idle");
  }

  // --- Group Calls (stub - requires SFU server for production) ---

  private groupPeers: Map<string, RTCPeerConnection> = new Map();
  private groupMemberIds: string[] = [];
  private screenShareStream: MediaStream | null = null;
  private qualityMonitorInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Start a group call with multiple members.
   * Creates a mesh of peer connections (one per member).
   * Note: Real group calling requires an SFU server for scale.
   * This mesh approach works for small groups (2-4 members).
   */
  async startGroupCall(memberIds: string[], video: boolean): Promise<void> {
    if (this.callState !== "idle" || memberIds.length === 0) return;

    this.groupMemberIds = memberIds;
    this.isVideo = video;
    this.callId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    this.setState("calling");

    await this.getLocalMedia(video);

    const myIdGroup = getIdentity()?.speaqId || "";
    let groupIceServers: any = ICE_SERVERS_FALLBACK;
    try {
      const fetched = await getIceServers(myIdGroup);
      if (fetched && fetched.length > 0) groupIceServers = fetched;
    } catch {}

    // Create a peer connection for each member
    for (const memberId of memberIds) {
      const pc = new RTCPeerConnection({ iceServers: groupIceServers });

      pc.onicecandidate = async (event: any) => {
        if (event.candidate) {
          const myId = getIdentity()?.speaqId;
          const blob = myId ? await encryptCallBlob(myId, memberId, JSON.stringify({ candidate: event.candidate })) : null;
          sendRelayPayload({
            type: "ICE_CANDIDATE",
            to: memberId,
            ...(blob ? { blob } : { candidate: event.candidate }),
            callId: this.callId,
          });
        }
      };

      pc.ontrack = (event: any) => {
        if (event.streams && event.streams[0]) {
          this.emit("groupRemoteStream", { memberId, stream: event.streams[0] });
        }
      };

      // Add local tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach((track: any) => {
          pc.addTrack(track, this.localStream!);
        });
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: video,
      });
      await pc.setLocalDescription(offer);

      {
        const myId = getIdentity()?.speaqId;
        const blob = myId ? await encryptCallBlob(myId, memberId, JSON.stringify({ sdp: offer.sdp, video })) : null;
        sendRelayPayload({
          type: "CALL_OFFER",
          to: memberId,
          ...(blob ? { blob } : { sdp: offer.sdp, video }),
          callId: this.callId,
          video, // kept top-level so the receiver can render UI before decrypting
          group: true,
        });
      }

      this.groupPeers.set(memberId, pc);
    }

    this.startQualityMonitor();
  }

  getGroupMemberIds(): string[] {
    return [...this.groupMemberIds];
  }

  getGroupPeerCount(): number {
    return this.groupPeers.size;
  }

  isGroupCall(): boolean {
    return this.groupMemberIds.length > 0;
  }

  /**
   * Toggle screen sharing.
   * Uses getDisplayMedia on supported platforms.
   * Falls back gracefully on mobile (no getDisplayMedia support).
   */
  async toggleScreenShare(): Promise<boolean> {
    if (this.screenShareStream) {
      // Stop screen share, restore camera
      this.screenShareStream.getTracks().forEach((track: any) => track.stop());
      this.screenShareStream = null;
      if (this.isVideo) {
        await this.replaceVideoTrack(false);
      }
      this.emit("screenShareChanged", false);
      return false;
    }

    // Check if getDisplayMedia is available
    if (!mediaDevices || typeof (mediaDevices as any).getDisplayMedia !== "function") {
      this.emit("screenShareUnavailable", null);
      return false;
    }

    try {
      this.screenShareStream = await (mediaDevices as any).getDisplayMedia({
        video: true,
        audio: false,
      }) as MediaStream;

      // Replace the video track in all peer connections
      const screenTrack = this.screenShareStream.getVideoTracks()[0];
      if (screenTrack) {
        await this.replaceTrackInPeers(screenTrack);

        // When user stops sharing via system UI
        screenTrack.onended = () => {
          this.toggleScreenShare();
        };
      }

      this.emit("screenShareChanged", true);
      return true;
    } catch (e) {
      this.emit("screenShareUnavailable", null);
      return false;
    }
  }

  isScreenSharing(): boolean {
    return this.screenShareStream !== null;
  }

  private async replaceVideoTrack(useCamera: boolean): Promise<void> {
    if (!this.localStream) return;
    const oldTrack = this.localStream.getVideoTracks()[0];
    if (!oldTrack) return;

    if (useCamera) {
      const newStream = await mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      }) as MediaStream;
      const newTrack = newStream.getVideoTracks()[0];
      if (newTrack) {
        await this.replaceTrackInPeers(newTrack);
      }
    }
  }

  private async replaceTrackInPeers(newTrack: any): Promise<void> {
    // Replace in main peer connection
    if (this.pc) {
      const senders = (this.pc as any).getSenders?.() || [];
      for (const sender of senders) {
        if (sender.track?.kind === "video") {
          await sender.replaceTrack(newTrack);
        }
      }
    }
    // Replace in group peer connections
    for (const [, pc] of this.groupPeers) {
      const senders = (pc as any).getSenders?.() || [];
      for (const sender of senders) {
        if (sender.track?.kind === "video") {
          await sender.replaceTrack(newTrack);
        }
      }
    }
  }

  /**
   * Adaptive quality: monitors RTCPeerConnection stats and adjusts
   * video constraints when bandwidth drops below threshold.
   */
  private startQualityMonitor(): void {
    this.stopQualityMonitor();
    this.qualityMonitorInterval = setInterval(async () => {
      const pc = this.pc || this.groupPeers.values().next().value;
      if (!pc || !this.isVideo) return;

      try {
        const stats = await pc.getStats();
        let availableBandwidth = Infinity;

        stats.forEach((report: any) => {
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            if (report.availableOutgoingBitrate) {
              availableBandwidth = report.availableOutgoingBitrate;
            }
          }
        });

        // Adjust quality based on bandwidth
        if (availableBandwidth < 150000) {
          // Very low bandwidth: reduce to 320x240 @ 10fps
          this.applyVideoConstraints(320, 240, 10);
        } else if (availableBandwidth < 500000) {
          // Low bandwidth: reduce to 480x360 @ 15fps
          this.applyVideoConstraints(480, 360, 15);
        } else {
          // Normal: 640x480 @ 30fps
          this.applyVideoConstraints(640, 480, 30);
        }
      } catch (e) {
        // Stats not available on all platforms
      }
    }, 5000);
  }

  private stopQualityMonitor(): void {
    if (this.qualityMonitorInterval) {
      clearInterval(this.qualityMonitorInterval);
      this.qualityMonitorInterval = null;
    }
  }

  private applyVideoConstraints(width: number, height: number, frameRate: number): void {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack && typeof videoTrack.applyConstraints === "function") {
      videoTrack.applyConstraints({ width, height, frameRate }).catch(() => {});
    }
  }
}

// Singleton
export const callService = new CallService();
