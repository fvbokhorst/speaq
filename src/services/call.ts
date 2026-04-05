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

export type CallState = "idle" | "calling" | "ringing" | "connected" | "ended";

type CallEventHandler = (data: any) => void;

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

class CallService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private callId: string | null = null;
  private callState: CallState = "idle";
  private contactId: string | null = null;
  private isVideo: boolean = false;
  private handlers: Map<string, CallEventHandler[]> = new Map();
  private iceCandidateBuffer: RTCIceCandidate[] = [];

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
    this.setState("calling");

    await this.setupPeerConnection();
    await this.getLocalMedia(video);

    const offer = await this.pc!.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: video,
    });
    await this.pc!.setLocalDescription(offer);

    relay.on("__raw_send", () => {});
    const ws = (relay as any).ws;
    if (ws) {
      ws.send(JSON.stringify({
        type: "CALL_OFFER",
        to: contactId,
        sdp: offer.sdp,
        callId: this.callId,
        video,
      }));
    }
  }

  async acceptCall(): Promise<void> {
    if (this.callState !== "ringing" || !this.pc) return;

    await this.getLocalMedia(this.isVideo);

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    const ws = (relay as any).ws;
    if (ws) {
      ws.send(JSON.stringify({
        type: "CALL_ANSWER",
        to: this.contactId,
        sdp: answer.sdp,
        callId: this.callId,
      }));
    }

    // Flush buffered ICE candidates
    for (const candidate of this.iceCandidateBuffer) {
      await this.pc.addIceCandidate(candidate);
    }
    this.iceCandidateBuffer = [];

    this.setState("connected");
  }

  rejectCall(): void {
    if (this.callState !== "ringing") return;

    const ws = (relay as any).ws;
    if (ws) {
      ws.send(JSON.stringify({
        type: "CALL_REJECT",
        to: this.contactId,
        callId: this.callId,
      }));
    }

    this.cleanup();
  }

  endCall(): void {
    if (this.callState === "idle") return;

    const ws = (relay as any).ws;
    if (ws && this.contactId) {
      ws.send(JSON.stringify({
        type: "CALL_END",
        to: this.contactId,
        callId: this.callId,
      }));
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
    // Handled by react-native-webrtc InCallManager or system audio routing
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
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (event: any) => {
      if (event.candidate && this.contactId) {
        const ws = (relay as any).ws;
        if (ws) {
          ws.send(JSON.stringify({
            type: "ICE_CANDIDATE",
            to: this.contactId,
            candidate: event.candidate,
            callId: this.callId,
          }));
        }
      }
    };

    this.pc.ontrack = (event: any) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.emit("remoteStream", this.remoteStream);
      }
    };

    this.pc.onconnectionstatechange = () => {
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

    if (this.pc && this.localStream) {
      this.localStream.getTracks().forEach((track: any) => {
        this.pc!.addTrack(track, this.localStream!);
      });
    }

    this.emit("localStream", this.localStream);
  }

  private async handleOffer(msg: any): Promise<void> {
    if (this.callState !== "idle") {
      // Already in a call, reject
      const ws = (relay as any).ws;
      if (ws) {
        ws.send(JSON.stringify({ type: "CALL_REJECT", to: msg.from, callId: msg.callId }));
      }
      return;
    }

    this.contactId = msg.from;
    this.callId = msg.callId;
    this.isVideo = msg.video || false;
    this.setState("ringing");

    await this.setupPeerConnection();
    await this.pc!.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: msg.sdp }));

    this.emit("incomingCall", { from: msg.from, callId: msg.callId, video: msg.video });
  }

  private async handleAnswer(msg: any): Promise<void> {
    if (!this.pc || msg.callId !== this.callId) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: msg.sdp }));
    this.setState("connected");
  }

  private async handleIceCandidate(msg: any): Promise<void> {
    if (msg.callId !== this.callId) return;
    const candidate = new RTCIceCandidate(msg.candidate);
    if (this.pc?.remoteDescription) {
      await this.pc.addIceCandidate(candidate);
    } else {
      this.iceCandidateBuffer.push(candidate);
    }
  }

  private handleEnd(msg: any): void {
    if (msg.callId !== this.callId) return;
    this.cleanup();
  }

  private handleReject(msg: any): void {
    if (msg.callId !== this.callId) return;
    this.emit("callRejected", msg);
    this.cleanup();
  }

  private handleUnavailable(msg: any): void {
    if (msg.callId !== this.callId) return;
    this.emit("callUnavailable", msg);
    this.cleanup();
  }

  private cleanup(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => track.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.callId = null;
    this.contactId = null;
    this.iceCandidateBuffer = [];
    this.setState("idle");
  }
}

// Singleton
export const callService = new CallService();
