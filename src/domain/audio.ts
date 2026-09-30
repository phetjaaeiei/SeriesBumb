// The private audio archive's free-tier caps and the audio_file row shape, shared by the archive
// service and the audio repository.

/** Private audio files never participate in the public catalog/search index. */
export type AudioProvider = 'supabase' | 'firebase' | 'drive';
export type AudioStatus = 'pending' | 'uploading' | 'ready' | 'failed' | 'deleting';

export interface AudioFile {
  id: string;
  title: string;
  filename: string;
  provider: AudioProvider;
  size: number;
  contentType: string;
  createdAt: number;
  note: string | null;
  songId: string | null;
  tapeId: string | null;
  driveUrl: string | null;
  status: AudioStatus;
}

export const AUDIO_LIMITS = {
  supabase: { storage: 900_000_000, downloads: 4_000_000_000, file: 50_000_000, signedUpload: 52_428_800, requests: 20_000 },
  firebase: { storage: 4_000_000_000, downloads: 40_000_000_000, file: 50_000_000, requests: 20_000 },
} as const;
