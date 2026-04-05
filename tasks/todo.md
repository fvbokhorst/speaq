# SPEAQ Phase 3: Voice + Video Calling

## Aanpak
Voice eerst, simpel, werkend. Video daarna. Geen group calls, geen screen sharing, geen SFU -- dat is Stage 2.

## Stappen

### Relay Server (signaling toevoegen)
- [x] 1. Nieuwe WebSocket events: CALL_OFFER, CALL_ANSWER, ICE_CANDIDATE, CALL_END, CALL_REJECT
- [x] 2. Call routing: relay stuurt signaling door naar juiste ontvanger
- [x] 3. Deploy naar Cloud Run (revision speaq-relay-00004-zrp)

### React Native App
- [x] 4. `react-native-webrtc` installeren + pod install
- [x] 5. Call service (`src/services/call.ts`): WebRTC peer connection, signaling, ICE handling
- [x] 6. `CallScreen.tsx`: voice call UI (accept/reject/end, timer, mute, speaker) + video (RTCView, flip)
- [x] 7. Call buttons in ChatScreen header (P=phone, V=video)
- [x] 8. Incoming call handling in App.tsx
- [x] 9. Feature flags aanzetten (voiceCalls + videoCalls: true)
- [x] 10. Sync naar ~/speaq-build, pod install, build + test op simulator
- [x] 11. Info.plist fix: NSMicrophoneUsageDescription + NSCameraUsageDescription (crash fix)

### Video
- [x] 12. Video stream in CallScreen (RTCView remote + local PiP, camera toggle, flip)

## Phase 3 Review
- Phase 3 compleet: voice + video calling werkt
- Relay server gedeployed met 5 signaling events
- Info.plist crash gefixt (missing privacy descriptions)
- 3 commits: 0727e64, ee46ac6

---

## Fase 5: Quantum Pay + Advanced Features

### Wallet UI
- [ ] 1. WalletScreen.tsx: Q-Credits balance, send/receive, transaction history
- [ ] 2. Send Q-Credits flow: bedrag invoeren, contact kiezen, QR scannen
- [ ] 3. Receive flow: QR code tonen met betaalverzoek
- [ ] 4. Transaction history lijst

### Q-Credits Engine (speaq-core)
- [ ] 5. wallet/qcredits.ts: balance tracking, send/receive, transaction log
- [ ] 6. Lokale opslag van wallet data (encrypted via AES)

### In-Chat Payments
- [ ] 7. Betaal-knop in ChatScreen: stuur Q-Credits als bericht
- [ ] 8. Betaal-bericht rendering in chat bubbles

### Advanced Features
- [ ] 9. Ghost Groups: groep zonder ledenlijst, stealth invites
- [ ] 10. Witness Mode: 1-knop bewijs (encryptie + GPS + hash)
- [ ] 11. Dead Man's Switch: heartbeat + auto-send configuratie

### Settings + GDPR
- [ ] 12. SettingsScreen.tsx: profiel, privacy policy, data deletion, about
- [ ] 13. Privacy Policy tekst (in-app, geen cookies want native app)

## Review
_(wordt ingevuld na afronding)_
