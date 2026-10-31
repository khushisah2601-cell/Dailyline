import { LocalMusicTrack } from '../types';

const DB_NAME = 'dayline_device_music_v1';
const STORE_NAME = 'tracks';
const DB_VERSION = 1;

export interface StoredTrackRecord {
  id: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  durationSeconds?: number;
  addedAt: string;
  blob: Blob;
}

function openMusicDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function loadTracksFromDeviceLibrary(): Promise<LocalMusicTrack[]> {
  try {
    const db = await openMusicDb();
    return await new Promise<LocalMusicTrack[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result ?? []) as StoredTrackRecord[];
        const tracks: LocalMusicTrack[] = records.map((rec) => ({
          id: rec.id,
          name: rec.name,
          fileName: rec.fileName,
          sizeBytes: rec.sizeBytes,
          mimeType: rec.mimeType,
          durationSeconds: rec.durationSeconds,
          addedAt: rec.addedAt,
          objectUrl: URL.createObjectURL(rec.blob),
        }));
        resolve(tracks);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveTrackToDeviceLibrary(
  track: Omit<LocalMusicTrack, 'objectUrl'>,
  blob: Blob
): Promise<void> {
  try {
    const db = await openMusicDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StoredTrackRecord = {
        ...track,
        blob,
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to session-only playback if storage is restricted
  }
}

export async function removeTrackFromDeviceLibrary(id: string): Promise<void> {
  try {
    const db = await openMusicDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage cleanup errors
  }
}

export async function clearDeviceLibrary(): Promise<void> {
  try {
    const db = await openMusicDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage cleanup errors
  }
}

export function cleanTrackTitle(fileName: string): string {
  const withoutExt = fileName.replace(/\.[a-z0-9]{2,5}$/i, '');
  const normalized = withoutExt.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized || fileName;
}

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function probeAudioDuration(objectUrl: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const tempAudio = new Audio();
    tempAudio.preload = 'metadata';
    const cleanup = () => {
      tempAudio.removeAttribute('src');
      tempAudio.load();
    };
    tempAudio.onloadedmetadata = () => {
      const dur = Number.isFinite(tempAudio.duration) ? tempAudio.duration : undefined;
      cleanup();
      resolve(dur);
    };
    tempAudio.onerror = () => {
      cleanup();
      resolve(undefined);
    };
    tempAudio.src = objectUrl;
  });
}
