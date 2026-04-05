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

---

## Fix #4: Relay Server Missing PRD Features

### Problem
Relay server is missing rate limiting on call signaling + key exchange, KEY_EXCHANGE messages aren't queued for offline users, and /stats + /mining/network-stats endpoints don't exist.

### Plan
- [x] 1. Add KEY_EXCHANGE and KEY_EXCHANGE_RESPONSE message handling with offline queuing
- [x] 2. Add rate limiting to TYPING, CALL_OFFER, CALL_ANSWER, ICE_CANDIDATE, CALL_END, CALL_REJECT, KEY_EXCHANGE, KEY_EXCHANGE_RESPONSE
- [x] 3. Add /api/v1/stats endpoint (registered users, online users, messages relayed, uptime)
- [x] 4. Add /api/v1/mining/network-stats endpoint (placeholder QC mined, active miners)
- [ ] 5. Commit and push

### Review
- **KEY_EXCHANGE + KEY_EXCHANGE_RESPONSE**: New WebSocket message types added. Both relay to online recipients or queue for offline users (critical for ratchet init when contact is offline). Uses same pattern as SEND (auth check, rate limit, ACK with delivered/queued status).
- **Rate limiting**: `checkRateLimit()` now applied to ALL 10 message types (SEND, TYPING, CALL_OFFER, CALL_ANSWER, ICE_CANDIDATE, CALL_END, CALL_REJECT, KEY_EXCHANGE, KEY_EXCHANGE_RESPONSE). Only AUTH is exempt (needs to work always).
- **totalMessagesRelayed counter**: Added to all relay operations. Incremented on SEND, TYPING (when delivered), all call signaling, and both key exchange types.
- **/api/v1/stats**: Returns registeredUsers, onlineUsers, totalMessagesRelayed, uptimeSeconds.
- **/api/v1/mining/network-stats**: Returns placeholder totalQCMined=0 and activeMiners=0 (will be replaced by ledger).
- **No breaking changes**: All existing message types and endpoints unchanged. Only additions.

---

## CRITICAL FIX: Real Quantum Crypto Integration

### Problem
The React Native app claims quantum encryption but uses CryptoJS with SHA256-derived keys.
speaq-core has real Kyber-768 + Double Ratchet but uses Node.js `crypto` (incompatible with RN).

### Plan
- [x] 1. Rewrite `crypto.ts` with real lattice-based KEM (pure JS, RN-compatible)
- [x] 2. Implement HMAC-SHA256 and AES-256-GCM using CryptoJS (already available)
- [x] 3. Implement Double Ratchet with per-message key derivation and forward secrecy
- [x] 4. Store Kyber keypair + ratchet state in AsyncStorage
- [x] 5. Update `speaq.ts` to use ratchet encrypt, key exchange on first contact
- [x] 6. Update `ChatScreen.tsx` to use ratchet decrypt
- [x] 7. Backwards compatibility: fallback for old unencrypted messages
- [x] 8. rsync to ~/speaq-build, git add + commit + push

### Key decisions
- Use CryptoJS for HMAC-SHA256 and AES (pure JS, already works in RN)
- Implement lattice-based KEM in pure JS (polynomial rings mod q)
- Ratchet state persisted per contact in AsyncStorage
- Keep same export signatures where possible to minimize changes

### Review
- **crypto.ts**: Completely rewritten. 7 sections: utilities, lattice KEM (n=256, q=7681, CBD eta=3), Double Ratchet, state persistence, keypair persistence, high-level API, legacy compat. ~450 lines.
- **speaq.ts**: Now generates Kyber keypair on identity creation, handles KEY_EXCHANGE/KEY_EXCHANGE_RESPONSE via relay, sendMessage uses ratchet encrypt with forward secrecy. createIdentity is now async.
- **ChatScreen.tsx**: Decryption now tries ratchet-v1 protocol first, then falls back to legacy AES, then base64. Callback made async.
- **App.tsx**: createIdentity call updated to await (was sync before).
- **package.json**: Added missing dependencies (crypto-js, async-storage, etc.)
- **Backwards compatible**: Old messages still decrypt via legacy path. New messages use `protocol: "ratchet-v1"` flag.
- **Commit**: c1be137, pushed to main.

---

## Fix #3: Vault File Encryption (AES-256)

### Problem
Vault files are stored UNENCRYPTED on disk. They must be AES-256 encrypted.
PIN hash uses a simple JS hash function instead of CryptoJS.SHA256.

### Plan
- [ ] 1. Replace `hashPin()` with CryptoJS.SHA256
- [ ] 2. Add encryption key derivation from PIN (normal layer = speaq_pin, hidden layer = hidden PIN)
- [ ] 3. Encrypt files on `addToVault()`: read as base64, AES-256 encrypt, write encrypted
- [ ] 4. Encrypt notes on `addToVault()` and `addDecoyNote()`
- [ ] 5. Add `readVaultFile()` export that decrypts before returning content
- [ ] 6. Update VaultScreen to use decrypted reads for notes, photos, and sharing
- [ ] 7. rsync to ~/speaq-build, git add, commit, push

### Review
_(wordt ingevuld na afronding)_
