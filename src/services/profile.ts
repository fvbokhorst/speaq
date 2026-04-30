/**
 * SPEAQ Profile Service
 * Profile photos + display settings
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchImageLibrary } from "react-native-image-picker";
import RNFS from "react-native-fs";

const PHOTO_KEY = "speaq_profile_photo";
const CONTACT_PHOTOS_KEY = "speaq_contact_photos";

let profilePhotoUri: string | null = null;
let contactPhotos: Record<string, string> = {};

export async function loadProfile(): Promise<void> {
  try {
    const [photo, photos] = await Promise.all([
      AsyncStorage.getItem(PHOTO_KEY),
      AsyncStorage.getItem(CONTACT_PHOTOS_KEY),
    ]);
    if (photo) profilePhotoUri = photo;
    if (photos) contactPhotos = JSON.parse(photos);
  } catch (e) {}
}

export function getProfilePhoto(): string | null {
  return profilePhotoUri;
}

export async function pickProfilePhoto(): Promise<string | null> {
  try {
    const result = await launchImageLibrary({ mediaType: "photo", selectionLimit: 1, quality: 0.5 });
    if (result.assets && result.assets[0]?.uri) {
      const srcUri = result.assets[0].uri;
      const destPath = `${RNFS.DocumentDirectoryPath}/profile_photo.jpg`;

      // Remove existing file first
      const exists = await RNFS.exists(destPath);
      if (exists) await RNFS.unlink(destPath);

      // Copy -- try with and without file:// prefix
      try {
        await RNFS.copyFile(srcUri, destPath);
      } catch {
        const stripped = srcUri.replace("file://", "");
        await RNFS.copyFile(stripped, destPath);
      }

      profilePhotoUri = `file://${destPath}`;
      await AsyncStorage.setItem(PHOTO_KEY, profilePhotoUri);
      return profilePhotoUri;
    }
  } catch (e) {
    console.error("Pick profile photo error:", e);
  }
  return null;
}

export function getContactPhoto(speaqId: string): string | null {
  return contactPhotos[speaqId] || null;
}

export async function setContactPhoto(speaqId: string, uri: string): Promise<void> {
  contactPhotos[speaqId] = uri;
  await AsyncStorage.setItem(CONTACT_PHOTOS_KEY, JSON.stringify(contactPhotos));
}
