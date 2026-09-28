import { AppError, appErrorCodeForStatus } from '../errors/app-error';
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

export interface AudioUsage {
  provider: AudioProvider;
  label: string;
  enabled: boolean;
  limitBytes: number | null;
  usedBytes: number;
  reservedBytes: number;
  downloadLimitBytes: number | null;
  downloadBytes: number;
  maxFileBytes: number | null;
  reason?: string;
}

export class AudioArchiveError extends AppError {
  constructor(status: number, message: string) { super(message, appErrorCodeForStatus(status), { status }); }
}
