import { z } from 'astro/zod';
import { ARTIST_STATUSES, ARTIST_TYPES, IMAGE_KINDS, RELEASE_TYPES, SIDES, TAPE_STATUSES } from '../db/enums';
import { PROVINCE_NAMES } from './provinces';
import { SLUG_MAX, SLUG_RE } from './slug';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const title = z.string().trim().min(1).max(200);
const slug = z.string().max(SLUG_MAX).regex(SLUG_RE).nullable().optional();
const uuid = z.uuid();
const ids = z.array(uuid).max(20);
const year = z.number().int().min(1950).max(3000).nullable().optional();

export const artistSaveSchema = z.object({
  id: uuid, name: title, nameAlt: optionalText(200), slug,
  artistType: z.enum(ARTIST_TYPES).nullable().optional(),
  status: z.enum(ARTIST_STATUSES).optional(),
  province: z.enum(PROVINCE_NAMES).nullable().optional(),
  yearsActive: optionalText(100), bio: z.string().max(5000).optional(),
  imageKey: optionalText(400),
  members: z.array(z.object({ name: z.string().trim().min(1).max(100), role: z.string().max(100).optional(), years: optionalText(50), isCurrent: z.boolean().optional() })).max(40).optional(),
});

export const labelSaveSchema = z.object({
  id: uuid, name: title, nameAlt: optionalText(200), slug,
  description: z.string().max(5000).optional(), logoKey: optionalText(400),
});

export const songSaveSchema = z.object({
  id: uuid, title, titleAlt: optionalText(200), slug, artistIds: ids.optional(),
  lyricist: optionalText(200), composer: optionalText(200), arranger: optionalText(200),
  lyrics: optionalText(10000), notes: optionalText(1000),
});

export const tapeSaveSchema = z.object({
  id: uuid, title, titleAlt: optionalText(200), slug, year,
  releaseType: z.enum(RELEASE_TYPES), catalogNo: optionalText(50),
  description: z.string().max(5000).optional(), reelUrl: z.url().nullable().optional().refine(value => {
    if (!value) return true;
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.watch'].includes(parsed.hostname);
  }, 'ลิงก์รีวิวต้องเป็น Facebook แบบ https'),
  isRare: z.boolean().optional(), labelId: uuid.nullable().optional(), artistIds: ids.optional(),
  genreIds: z.array(uuid).max(20).optional(),
  tracks: z.array(z.object({ songId: uuid, side: z.enum(SIDES), position: z.number().int().min(1), durationSec: z.number().int().min(1).max(3599).nullable().optional(), note: optionalText(50) })).max(60).optional(),
  images: z.array(z.object({ id: uuid, kind: z.enum(IMAGE_KINDS) })).max(40).optional(),
  status: z.enum(TAPE_STATUSES), ogImageKey: optionalText(400), ogSourceImageId: uuid.nullable().optional(), ogSourceTitle: optionalText(200),
});

export const collectionSaveSchema = z.object({
  id: uuid, title, slug, description: z.string().max(5000).optional(), coverKey: optionalText(400),
  isFeatured: z.boolean().optional(), status: z.enum(TAPE_STATUSES),
  items: z.array(z.object({ tapeId: uuid, note: optionalText(1000) })).max(100).optional(),
});

export const uploadSchema = z.object({
  entityType: z.enum(['tapes', 'artists', 'labels', 'collections']),
  entityId: uuid,
  variant: z.enum(['full', 'thumb', 'og']),
  uuid: uuid.optional(),
  kind: z.enum(IMAGE_KINDS).optional(),
  width: z.coerce.number().int().min(1).optional(),
  height: z.coerce.number().int().min(1).optional(),
  file: z.instanceof(File),
});
