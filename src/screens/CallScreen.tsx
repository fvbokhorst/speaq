/**
 * SPEAQ - Call Screen
 * Voice + Video calling via WebRTC
 * Phase 3: 1-on-1 calls
 */

import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from "react-native";
import { RTCView } from "react-native-webrtc";
import { colors } from "../theme/brand";
import { callService, CallState } from "../services/call";

interface Props {
  contactName: string;
  isVideo: boolean;
  isIncoming: boolean;
  onEnd: () => void;
}

export default function CallScreen({ contactName, isVideo, isIncoming, onEnd }: Props) {
  const [callState, setCallState] = useState<CallState>(callService.getCallState());
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [localStreamURL, setLocalStreamURL] = useState<string | null>(null);
  const [remoteStreamURL, setRemoteStreamURL] = useState<string | null>(null);
  const [screenSharing, setScreenSharing] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const onStateChange = (state: CallState) => {
      setCallState(state);
      if (state === "connected" && !timerRef.current) {
        timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      }
      if (state === "idle") {
        if (timerRef.current) clearInterval(timerRef.current);
        onEnd();
      }
    };

    const onLocalStream = (stream: any) => {
      setLocalStreamURL(stream?.toURL() || null);
    };

    const onRemoteStream = (stream: any) => {
      setRemoteStreamURL(stream?.toURL() || null);
    };

    const onScreenShareChanged = (sharing: boolean) => {
      setScreenSharing(sharing);
    };

    const onScreenShareUnavailable = () => {
      Alert.alert("Not Available", "Screen sharing is not available on this device.");
    };

    callService.on("stateChange", onStateChange);
    callService.on("localStream", onLocalStream);
    callService.on("remoteStream", onRemoteStream);
    callService.on("screenShareChanged", onScreenShareChanged);
    callService.on("screenShareUnavailable", onScreenShareUnavailable);

    // If already connected, get streams
    const ls = callService.getLocalStream();
    const rs = callService.getRemoteStream();
    if (ls) setLocalStreamURL((ls as any).toURL());
    if (rs) setRemoteStreamURL((rs as any).toURL());

    // Track participant count for group calls
    if (callService.isGroupCall()) {
      setParticipantCount(callService.getGroupPeerCount() + 1); // +1 for self
    }

    return () => {
      callService.off("stateChange", onStateChange);
      callService.off("localStream", onLocalStream);
      callService.off("remoteStream", onRemoteStream);
      callService.off("screenShareChanged", onScreenShareChanged);
      callService.off("screenShareUnavailable", onScreenShareUnavailable);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [onEnd]);

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }

  function handleMute() {
    const nowMuted = callService.toggleMute();
    setMuted(nowMuted);
  }

  function handleCamera() {
    const nowOff = callService.toggleCamera();
    setCameraOff(nowOff);
  }

  function handleFlip() {
    callService.switchCamera();
  }

  function handleScreenShare() {
    callService.toggleScreenShare();
  }

  function handleEnd() {
    callService.endCall();
  }

  function handleAccept() {
    callService.acceptCall();
  }

  function handleReject() {
    callService.rejectCall();
  }

  const statusText = callState === "calling" ? "Calling..." :
    callState === "ringing" ? "Incoming Call" :
    callState === "connected" ? formatTime(elapsed) : "";

  return (
    <View style={st.container}>
      {/* Video feeds */}
      {isVideo && remoteStreamURL && (
        <RTCView streamURL={remoteStreamURL} style={st.remoteVideo} objectFit="cover" />
      )}
      {isVideo && localStreamURL && callState === "connected" && (
        <RTCView streamURL={localStreamURL} style={st.localVideo} objectFit="cover" mirror />
      )}

      {/* Overlay UI */}
      <View style={st.overlay}>
        {/* Top */}
        <View style={st.top}>
          <View style={st.encBadge}>
            <Text style={st.encText}>Quantum Encrypted</Text>
          </View>
        </View>

        {/* Center */}
        <View style={st.center}>
          {!isVideo && (
            <View style={st.avatar}>
              <Text style={st.avatarText}>{contactName.charAt(0)}</Text>
            </View>
          )}
          <Text style={st.contactName}>{contactName}</Text>
          {callService.isGroupCall() && callState === "connected" && (
            <Text style={st.participantCount}>{participantCount} participants</Text>
          )}
          <Text style={st.status}>{statusText}</Text>
        </View>

        {/* Bottom controls */}
        <View style={st.controls}>
          {callState === "ringing" && isIncoming ? (
            <View style={st.incomingRow}>
              <TouchableOpacity style={st.rejectBtn} onPress={handleReject}>
                <Text style={st.btnIcon}>X</Text>
                <Text style={st.btnLabel}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.acceptBtn} onPress={handleAccept}>
                <Text style={st.btnIcon}>P</Text>
                <Text style={st.btnLabel}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={st.activeRow}>
              <TouchableOpacity style={[st.ctrlBtn, muted && st.ctrlActive]} onPress={handleMute}>
                <Text style={st.ctrlIcon}>M</Text>
                <Text style={st.ctrlLabel}>{muted ? "Unmute" : "Mute"}</Text>
              </TouchableOpacity>

              {isVideo && (
                <>
                  <TouchableOpacity style={[st.ctrlBtn, cameraOff && st.ctrlActive]} onPress={handleCamera}>
                    <Text style={st.ctrlIcon}>C</Text>
                    <Text style={st.ctrlLabel}>{cameraOff ? "Camera On" : "Camera Off"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.ctrlBtn} onPress={handleFlip}>
                    <Text style={st.ctrlIcon}>F</Text>
                    <Text style={st.ctrlLabel}>Flip</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity style={[st.ctrlBtn, screenSharing && st.ctrlActive]} onPress={handleScreenShare}>
                <Text style={st.ctrlIcon}>S</Text>
                <Text style={st.ctrlLabel}>{screenSharing ? "Stop Share" : "Share"}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={st.endBtn} onPress={handleEnd}>
                <Text style={st.endIcon}>X</Text>
                <Text style={st.ctrlLabel}>End</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void },
  remoteVideo: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  localVideo: { position: "absolute", top: 60, right: 16, width: 120, height: 160, borderRadius: 12, overflow: "hidden", borderWidth: 2, borderColor: colors.voice.gold, zIndex: 10 },
  overlay: { flex: 1, justifyContent: "space-between" },
  top: { alignItems: "center", paddingTop: 60 },
  encBadge: { backgroundColor: "rgba(45,212,191,0.15)", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  encText: { color: colors.quantum.teal, fontSize: 11, letterSpacing: 1 },
  center: { alignItems: "center" },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.voice.gold, marginBottom: 16 },
  avatarText: { color: colors.voice.gold, fontSize: 40, fontWeight: "600" },
  contactName: { color: colors.signal.white, fontSize: 24, fontWeight: "600" },
  participantCount: { color: colors.quantum.teal, fontSize: 12, marginTop: 4, letterSpacing: 0.5 },
  status: { color: colors.signal.steel, fontSize: 14, marginTop: 8 },
  controls: { paddingBottom: 60, paddingHorizontal: 24 },
  incomingRow: { flexDirection: "row", justifyContent: "space-around" },
  rejectBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.signal.red, alignItems: "center", justifyContent: "center" },
  acceptBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center" },
  btnIcon: { color: colors.signal.white, fontSize: 24, fontWeight: "600" },
  btnLabel: { color: colors.signal.white, fontSize: 10, marginTop: 4 },
  activeRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  ctrlBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.depth.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border.subtle },
  ctrlActive: { backgroundColor: colors.voice.gold },
  ctrlIcon: { color: colors.signal.white, fontSize: 18, fontWeight: "600" },
  ctrlLabel: { color: colors.signal.steel, fontSize: 9, marginTop: 4 },
  endBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.signal.red, alignItems: "center", justifyContent: "center" },
  endIcon: { color: colors.signal.white, fontSize: 20, fontWeight: "600" },
});
