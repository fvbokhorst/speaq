# SPEAQ Phase 3: Voice + Video Calling

## Aanpak
Voice eerst, simpel, werkend. Video daarna. Geen group calls, geen screen sharing, geen SFU -- dat is Stage 2.

## Stappen

### Relay Server (signaling toevoegen)
- [ ] 1. Nieuwe WebSocket events: CALL_OFFER, CALL_ANSWER, ICE_CANDIDATE, CALL_END, CALL_REJECT
- [ ] 2. Call routing: relay stuurt signaling door naar juiste ontvanger
- [ ] 3. Deploy naar Cloud Run

### React Native App
- [ ] 4. `react-native-webrtc` installeren + pod install
- [ ] 5. Call service (`src/services/call.ts`): WebRTC peer connection, signaling, ICE handling
- [ ] 6. `CallScreen.tsx`: voice call UI (accept/reject/end, timer, mute, speaker)
- [ ] 7. Call buttons in ChatScreen header (voice + video icons)
- [ ] 8. Incoming call handling in App.tsx (modal overlay)
- [ ] 9. Feature flags aanzetten (voiceCalls: true)
- [ ] 10. Sync naar ~/speaq-build, pod install, build + test op simulator

### Video (na voice werkt)
- [ ] 11. Video stream toevoegen aan CallScreen (camera feed, switch front/back)
- [ ] 12. Test video calling

## Review
_(wordt ingevuld na afronding)_
