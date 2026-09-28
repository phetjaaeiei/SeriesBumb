import { describe, expect, it, vi } from 'vitest';
import { ActionError } from 'astro:actions';
import { AppError, appErrorCodeForStatus } from '../../src/errors/app-error';
import { D1_QUOTA_MESSAGE, toActionError } from '../../src/errors/to-action-error';
import { toJsonError } from '../../src/errors/to-response';
import { CatalogError } from '../../src/services/catalog-delete';
import { CommentError } from '../../src/services/comments';
import { ReviewError } from '../../src/services/reviews';
import { AudioArchiveError } from '../../src/services/audio-types';

const quota = new Error('D1_ERROR', { cause: new Error("Exceeded D1's free tier daily row read limit") });

describe('AppError taxonomy', () => {
  it('carries a code and the matching HTTP status', () => {
    const error = new AppError('ไม่พบ', 'NOT_FOUND');
    expect(error).toBeInstanceOf(Error);
    expect([error.code, error.status, error.message]).toEqual(['NOT_FOUND', 404, 'ไม่พบ']);
    expect(new AppError('x').code).toBe('BAD_REQUEST');
  });

  it('keeps every domain error an AppError with its old code', () => {
    expect(new CatalogError('x')).toBeInstanceOf(AppError);
    expect(new CatalogError('x').code).toBe('BAD_REQUEST');
    expect(new CommentError('x', 'FORBIDDEN').code).toBe('FORBIDDEN');
    expect(new ReviewError('x', 'NOT_FOUND').status).toBe(404);
    const audio = new AudioArchiveError(413, 'ใหญ่เกินไป');
    expect(audio).toBeInstanceOf(AppError);
    expect([audio.status, audio.code]).toEqual([413, 'CONTENT_TOO_LARGE']);
  });

  it.each([[400, 'BAD_REQUEST'], [409, 'CONFLICT'], [415, 'UNSUPPORTED_MEDIA_TYPE'], [429, 'TOO_MANY_REQUESTS'], [502, 'BAD_GATEWAY'], [503, 'SERVICE_UNAVAILABLE'], [418, 'INTERNAL_SERVER_ERROR']])('maps status %i to %s', (status, code) => {
    expect(appErrorCodeForStatus(status)).toBe(code);
  });
});

describe('toActionError', () => {
  it('passes AppError code and message through', () => {
    const error = toActionError(new CommentError('ห้ามคอมเมนต์', 'FORBIDDEN'), { message: 'fallback' });
    expect(error).toBeInstanceOf(ActionError);
    expect([error.code, error.message]).toEqual(['FORBIDDEN', 'ห้ามคอมเมนต์']);
  });

  it('returns an existing ActionError unchanged', () => {
    const original = new ActionError({ code: 'TOO_MANY_REQUESTS', message: 'ช้าลงหน่อย' });
    expect(toActionError(original, { message: 'fallback' })).toBe(original);
  });

  it('turns the D1 daily quota into 503 with a Thai message', () => {
    const error = toActionError(quota, { message: 'fallback' });
    expect([error.code, error.message]).toEqual(['SERVICE_UNAVAILABLE', D1_QUOTA_MESSAGE]);
  });

  it('hides unknown errors behind the fallback and logs only a label', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = toActionError(new Error('SQLITE secret detail'), { code: 'BAD_REQUEST', message: 'บันทึกไม่สำเร็จ', log: 'Catalog action failed' });
    expect([error.code, error.message]).toEqual(['BAD_REQUEST', 'บันทึกไม่สำเร็จ']);
    expect(spy.mock.calls[0][0]).toBe('Catalog action failed');
    spy.mockRestore();
  });
});

describe('toJsonError', () => {
  it('uses the AppError status and message', async () => {
    const response = toJsonError(new AudioArchiveError(409, 'ชนกัน'), 'fallback');
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'ชนกัน' });
  });

  it('never reflects unknown error text', async () => {
    const response = toJsonError(new Error('provider credential leak'), 'จัดการไม่สำเร็จ');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'จัดการไม่สำเร็จ' });
  });

  it('maps the D1 quota to 503', async () => {
    const response = toJsonError(quota, 'fallback');
    expect(response.status).toBe(503);
  });
});
