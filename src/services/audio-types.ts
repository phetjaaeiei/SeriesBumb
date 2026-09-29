import { AppError, appErrorCodeForStatus } from '../errors/app-error';
import type { AudioProvider } from '../domain/audio';

export type { AudioFile, AudioProvider, AudioStatus } from '../domain/audio';

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
