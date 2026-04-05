/**
 * SPEAQ Audio Recording Service
 * Record and play voice messages
 */

import RNFS from "react-native-fs";

const RECORDINGS_DIR = `${RNFS.DocumentDirectoryPath}/voice_messages`;

let recordingPath: string | null = null;

export async function initAudioDir(): Promise<void> {
  const exists = await RNFS.exists(RECORDINGS_DIR);
  if (!exists) await RNFS.mkdir(RECORDINGS_DIR);
}

export function getRecordingPath(): string {
  const id = Date.now().toString(36);
  recordingPath = `${RECORDINGS_DIR}/${id}.m4a`;
  return recordingPath;
}

export function getLastRecordingPath(): string | null {
  return recordingPath;
}

export async function deleteRecording(path: string): Promise<void> {
  try {
    await RNFS.unlink(path);
  } catch (e) {}
}
