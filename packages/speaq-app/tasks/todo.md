# SPEAQ Native App - Match PWA Functionality

## Tasks
- [x] 1. ChatScreen.tsx - Load profile photo on mount, save received contact photos
- [x] 2. speaq.ts - sendMessage: include profile photo in first message per session
- [x] 3. speaq.ts - sendQCPayment: include profile photo in payload
- [x] 4. GroupsScreen.tsx - Already has group photo + settings (verified existing code)
- [x] 5. SettingsScreen.tsx - Update version from build 70 to build 74

## Review

### Changes Made

**ChatScreen.tsx:**
- Added AsyncStorage import
- Added `profilePhotoRef` and `photoSentRef` refs to track profile photo and sent status
- Added useEffect to load profile photo from AsyncStorage key "speaq_profile_photo" on mount
- Added logic in message receive handler: when `data.photo` and `data.senderId` are present, saves the sender's photo to AsyncStorage key "speaq_contact_photos" (JSON object keyed by speaqId)

**speaq.ts - sendMessage:**
- Added `photoSentThisSession` Set to track which contacts already received photo this session
- On first message per session to each contact, loads profile photo from AsyncStorage and includes it in the plaintext payload as `photo` field (before encryption)

**speaq.ts - sendQCPayment:**
- Loads profile photo from AsyncStorage and includes it in the plaintext payload as `photo` field (before encryption)

**GroupsScreen.tsx:**
- No changes needed -- already has full group settings: rename, change photo, remove photo, delete group, cancel (via handleGroupActions + Alert.alert menu), group photo picker via launchImageLibrary, group photo display in list

**SettingsScreen.tsx:**
- Version bumped from "1.0.0 build 70" to "1.0.0 build 74"

### Notes
- All photo data is included in the plaintext payload BEFORE encryption (inside the sealed sender blob)
- Profile photo is only sent with the first message per session per contact to avoid unnecessary bandwidth
- Payment messages always include photo since they are less frequent
- No existing code was removed or broken
