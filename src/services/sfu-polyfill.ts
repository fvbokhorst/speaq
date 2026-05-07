/**
 * Polyfill browser-style WebRTC globals from react-native-webrtc so that
 * mediasoup-client's ReactNative106 handler can find RTCPeerConnection etc.
 * at module-init time. This file MUST be imported BEFORE mediasoup-client
 * (and before sfu.ts which imports mediasoup-client). ES module imports are
 * hoisted, so importing this file at the top of sfu.ts puts the polyfill
 * before mediasoup-client's own import.
 */

import {
  RTCPeerConnection as RNRTCPeerConnection,
  RTCSessionDescription as RNRTCSessionDescription,
  RTCIceCandidate as RNRTCIceCandidate,
  MediaStream as RNMediaStream,
  MediaStreamTrack as RNMediaStreamTrack,
  mediaDevices as RNMediaDevices,
} from "react-native-webrtc";

const g: any = globalThis;
if (!g.RTCPeerConnection) g.RTCPeerConnection = RNRTCPeerConnection;
if (!g.RTCSessionDescription) g.RTCSessionDescription = RNRTCSessionDescription;
if (!g.RTCIceCandidate) g.RTCIceCandidate = RNRTCIceCandidate;
if (!g.MediaStream) g.MediaStream = RNMediaStream;
if (!g.MediaStreamTrack) g.MediaStreamTrack = RNMediaStreamTrack;
if (!g.navigator) g.navigator = {};
if (!g.navigator.mediaDevices) g.navigator.mediaDevices = RNMediaDevices;

export {};
