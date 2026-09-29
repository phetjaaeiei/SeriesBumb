// The private audio archive: audio_file reservations and their status changes, and the rolling
// download tally per provider. Every guard that must hold across simultaneous requests is one
// serialized statement here, so callers never read-then-write a quota.
import type { SqlClient } from '../db/sql-client';
import { AUDIO_LIMITS, type AudioFile, type AudioProvider, type AudioStatus } from '../domain/audio';

const FILE_FIELDS = 'id, title, filename, provider, size, contentType, createdAt, note, songId, tapeId, driveUrl, status';
// Reserve the bucket's maximum per-file size even before signing, so any
// pending file can receive a token later without exceeding the free cap.
// Recheck the real bucket limit before every signature to detect config drift.
// A deleting row without signedAt holds at most its size: it was verified ready,
// never signed, or uploaded through the Worker's size-checked stream.
const SUPABASE_CHARGED_SIZE = `CASE WHEN status = 'ready' OR (status = 'deleting' AND signedAt IS NULL) THEN size ELSE ${AUDIO_LIMITS.supabase.signedUpload} END`;

export interface AudioFileRow extends AudioFile { objectKey: string | null; updatedAt: number; signedAt: number | null }

export interface AudioUsageRows {
  /** Ready bytes and reserved bytes (Supabase rows charged as above) per provider. */
  totals: { provider: AudioProvider; usedBytes: number; reservedBytes: number }[];
  /** Downloaded bytes per provider since the window start. */
  downloads: { provider: AudioProvider; bytes: number }[];
  /** The site_stats image byte counter, undefined before that row exists. */
  imageBytes: number | undefined;
}

/** Storage and download totals per provider, and the site's image bytes, in one batch. */
export async function getAudioUsageRows(sql: SqlClient, downloadsSince: string): Promise<AudioUsageRows> {
  const results = await sql.batch([
    sql.prepare(`SELECT provider, SUM(CASE WHEN status = 'ready' THEN size ELSE 0 END) AS usedBytes,
      SUM(CASE WHEN status != 'ready' THEN CASE WHEN provider = 'supabase' THEN ${SUPABASE_CHARGED_SIZE} ELSE size END ELSE 0 END) AS reservedBytes FROM audio_file GROUP BY provider`),
    sql.prepare('SELECT provider, SUM(bytes) AS bytes FROM audio_download_usage WHERE day >= ? GROUP BY provider').bind(downloadsSince),
    sql.prepare('SELECT imageBytes FROM site_stats WHERE id = 1'),
  ]);
  return {
    totals: results[0].results as AudioUsageRows['totals'],
    downloads: results[1].results as AudioUsageRows['downloads'],
    imageBytes: (results[2].results as { imageBytes: number }[])[0]?.imageBytes,
  };
}

/**
 * Up to 51 files, newest first: whose title or filename matches the LIKE pattern `search` (escaped
 * with `\`) when given, and older than `before` ([createdAt, id]) when given.
 */
export async function listAudioFiles(sql: SqlClient, search: string | null, before: [number, string] | null): Promise<AudioFile[]> {
  const values: (string | number)[] = [];
  const conditions: string[] = [];
  if (search !== null) { conditions.push("(title LIKE ? ESCAPE '\\' OR filename LIKE ? ESCAPE '\\')"); values.push(search, search); }
  if (before) { conditions.push('(createdAt < ? OR (createdAt = ? AND id < ?))'); values.push(before[0], before[0], before[1]); }
  return (await sql.prepare(`SELECT ${FILE_FIELDS} FROM audio_file ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY createdAt DESC, id DESC LIMIT 51`).bind(...values).all<AudioFile>()).results;
}

export interface AudioReservation {
  id: string;
  title: string;
  filename: string;
  provider: AudioProvider;
  size: number;
  contentType: string;
  objectKey: string | null;
  driveUrl: string | null;
  note: string | null;
  songId: string | null;
  tapeId: string | null;
  status: AudioStatus;
  createdBy: string;
  now: number;
}

/**
 * Inserts the file while the archive holds fewer than `maxFiles` rows and, when `quota` is given, the
 * provider's charged bytes plus `quota.reserveBytes` (plus the site's image bytes on Firebase) stay
 * within `quota.storageLimit`. Returns the new file, or null when a cap refused it.
 */
export async function insertAudioReservation(sql: SqlClient, file: AudioReservation, maxFiles: number, quota: { reserveBytes: number; storageLimit: number } | null): Promise<AudioFile | null> {
  const charge = file.provider === 'supabase' ? SUPABASE_CHARGED_SIZE : 'size';
  const condition = !quota ? '' : `AND (SELECT COALESCE(SUM(${charge}), 0) FROM audio_file WHERE provider = ?) + ? ${file.provider === 'firebase' ? '+ (SELECT imageBytes FROM site_stats WHERE id = 1)' : ''} <= ?`;
  const bindings: (string | number | null)[] = [file.id, file.title, file.filename, file.provider, file.size, file.contentType, file.objectKey, file.driveUrl, file.note, file.songId, file.tapeId, file.status, file.createdBy, file.now, file.now, maxFiles];
  if (quota) bindings.push(file.provider, quota.reserveBytes, quota.storageLimit);
  return sql.prepare(`INSERT INTO audio_file (id,title,filename,provider,size,contentType,objectKey,driveUrl,note,songId,tapeId,status,createdBy,createdAt,updatedAt)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM audio_file) < ? ${condition} RETURNING ${FILE_FIELDS}`).bind(...bindings).first<AudioFile>();
}

/** One file with its storage key, last change and signing time, or null. */
export async function getAudioFileRow(sql: SqlClient, id: string): Promise<AudioFileRow | null> {
  return sql.prepare(`SELECT ${FILE_FIELDS}, objectKey, updatedAt, signedAt FROM audio_file WHERE id = ?`).bind(id).first<AudioFileRow>();
}

/**
 * Marks a Supabase file as signed and uploading when it is still in `status` with `signedAt` and the
 * provider's charged bytes stay within `storageLimit`. Returns the id, or null when nothing changed.
 */
export async function lockAudioForSigning(sql: SqlClient, id: string, signedAt: number, status: AudioStatus, previousSignedAt: number | null, storageLimit: number): Promise<{ id: string } | null> {
  return sql.prepare(`UPDATE audio_file SET status = 'uploading', signedAt = ?, updatedAt = ? WHERE id = ? AND provider = 'supabase'
      AND status = ? AND signedAt IS ?
      AND (SELECT COALESCE(SUM(${SUPABASE_CHARGED_SIZE}), 0) FROM audio_file WHERE provider = 'supabase') <= ? RETURNING id`)
    .bind(signedAt, signedAt, id, status, previousSignedAt, storageLimit).first<{ id: string }>();
}

/** Puts back the status and signing time a failed signature replaced, if that signature still holds the row. */
export async function restoreAudioSignState(sql: SqlClient, id: string, status: AudioStatus, signedAt: number | null, now: number, lockedSignedAt: number): Promise<void> {
  await sql.prepare("UPDATE audio_file SET status = ?, signedAt = ?, updatedAt = ? WHERE id = ? AND status = 'uploading' AND signedAt = ?")
    .bind(status, signedAt, now, id, lockedSignedAt).run();
}

/** Marks an uploading or failed file as failed. */
export async function markAudioCheckFailed(sql: SqlClient, id: string, now: number): Promise<void> {
  await sql.prepare("UPDATE audio_file SET status = 'failed', updatedAt = ? WHERE id = ? AND status IN ('uploading', 'failed')").bind(now, id).run();
}

/** Marks an uploading or failed file as ready; returns it, or null when its status had changed. */
export async function markCheckedAudioReady(sql: SqlClient, id: string, now: number): Promise<AudioFile | null> {
  return sql.prepare(`UPDATE audio_file SET status = 'ready', updatedAt = ? WHERE id = ? AND status IN ('uploading', 'failed') RETURNING ${FILE_FIELDS}`).bind(now, id).first<AudioFile>();
}

/** Moves a pending file to uploading; returns the id, or null when it was not pending. */
export async function lockPendingAudioUpload(sql: SqlClient, id: string, now: number): Promise<{ id: string } | null> {
  return sql.prepare("UPDATE audio_file SET status = 'uploading', updatedAt = ? WHERE id = ? AND status = 'pending' RETURNING id").bind(now, id).first<{ id: string }>();
}

/** Marks an uploading file as ready; returns it, or null when it was no longer uploading. */
export async function markUploadedAudioReady(sql: SqlClient, id: string, now: number): Promise<AudioFile | null> {
  return sql.prepare(`UPDATE audio_file SET status = 'ready', updatedAt = ? WHERE id = ? AND status = 'uploading' RETURNING ${FILE_FIELDS}`).bind(now, id).first<AudioFile>();
}

/** Marks an uploading file as failed. */
export async function markUploadingAudioFailed(sql: SqlClient, id: string, now: number): Promise<void> {
  await sql.prepare("UPDATE audio_file SET status = 'failed', updatedAt = ? WHERE id = ? AND status = 'uploading'").bind(now, id).run();
}

/**
 * Adds one download of `size` bytes to the provider's tally for `day` when the tally since `since`
 * stays within `byteLimit` bytes and under `requestLimit` requests. Returns null when a cap refused it.
 */
export async function reserveAudioDownload(sql: SqlClient, provider: 'supabase' | 'firebase', day: string, since: string, size: number, byteLimit: number, requestLimit: number): Promise<{ bytes: number } | null> {
  return sql.prepare(`INSERT INTO audio_download_usage (provider,day,bytes,requests)
    SELECT ?,?,?,1 WHERE (SELECT COALESCE(SUM(bytes), 0) FROM audio_download_usage WHERE provider = ? AND day >= ?) + ? <= ?
      AND (SELECT COALESCE(SUM(requests), 0) FROM audio_download_usage WHERE provider = ? AND day >= ?) < ?
    ON CONFLICT(provider,day) DO UPDATE SET bytes = bytes + excluded.bytes, requests = requests + 1 RETURNING bytes`)
    .bind(provider, day, size, provider, since, size, byteLimit, provider, since, requestLimit).first<{ bytes: number }>();
}

/**
 * Marks the file as deleting (dropping a ready file's signing time) unless it was signed after
 * `signedStaleBefore` or is an upload newer than `staleBefore`. Returns the id, or null.
 */
export async function lockAudioForDelete(sql: SqlClient, id: string, now: number, signedStaleBefore: number, staleBefore: number): Promise<{ id: string } | null> {
  return sql.prepare(`UPDATE audio_file SET status = 'deleting', signedAt = CASE WHEN status = 'ready' THEN NULL ELSE signedAt END, updatedAt = ?
    WHERE id = ? AND (signedAt IS NULL OR signedAt <= ?) AND (status != 'uploading' OR updatedAt <= ?) RETURNING id`).bind(now, id, signedStaleBefore, staleBefore).first<{ id: string }>();
}

/** Removes a file that is marked as deleting. */
export async function deleteDeletingAudio(sql: SqlClient, id: string): Promise<void> {
  await sql.prepare("DELETE FROM audio_file WHERE id = ? AND status = 'deleting'").bind(id).run();
}
