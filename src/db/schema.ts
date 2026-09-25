import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import {
  ARTIST_STATUSES,
  ARTIST_TYPES,
  IMAGE_KINDS,
  RELEASE_TYPES,
  ROLES,
  SEARCH_KINDS,
  SIDES,
  TAPE_STATUSES,
} from './enums';

// Better Auth stores Date values; application timestamps below are plain unix milliseconds.
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  role: text('role', { enum: ROLES }).notNull().default('member'),
  commentBanned: integer('commentBanned', { mode: 'boolean' }).notNull().default(false),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [index('session_user_id_idx').on(table.userId)]);

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('account_user_id_idx').on(table.userId),
  index('account_provider_account_idx').on(table.providerId, table.accountId),
]);

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }),
}, (table) => [index('verification_identifier_idx').on(table.identifier)]);

const auditColumns = () => ({
  createdBy: text('createdBy').references(() => user.id, { onDelete: 'set null' }),
  createdAt: integer('createdAt').notNull(),
  updatedBy: text('updatedBy').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: integer('updatedAt').notNull(),
});

export const artist = sqliteTable('artist', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  nameAlt: text('nameAlt'),
  nameSort: text('nameSort').notNull(),
  artistType: text('artistType', { enum: ARTIST_TYPES }),
  status: text('status', { enum: ARTIST_STATUSES }).notNull().default('unknown'),
  province: text('province'),
  yearsActive: text('yearsActive'),
  bio: text('bio').notNull().default(''),
  imageKey: text('imageKey'),
  imageBytes: integer('imageBytes').notNull().default(0),
  publishedTapeCount: integer('publishedTapeCount').notNull().default(0),
  ...auditColumns(),
}, (table) => [
  index('artist_name_sort_id_idx').on(table.nameSort, table.id),
  index('artist_province_name_sort_id_idx').on(table.province, table.nameSort, table.id),
]);

export const artistMember = sqliteTable('artist_member', {
  id: text('id').primaryKey(),
  artistId: text('artistId').notNull().references(() => artist.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role').notNull().default(''),
  years: text('years'),
  isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull().default(false),
  position: integer('position').notNull(),
}, (table) => [index('artist_member_artist_position_idx').on(table.artistId, table.position)]);

export const label = sqliteTable('label', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  nameAlt: text('nameAlt'),
  nameSort: text('nameSort').notNull(),
  description: text('description').notNull().default(''),
  logoKey: text('logoKey'),
  imageBytes: integer('imageBytes').notNull().default(0),
  publishedTapeCount: integer('publishedTapeCount').notNull().default(0),
  ...auditColumns(),
}, (table) => [index('label_name_sort_id_idx').on(table.nameSort, table.id)]);

export const genre = sqliteTable('genre', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  publishedTapeCount: integer('publishedTapeCount').notNull().default(0),
}, (table) => [index('genre_position_idx').on(table.position)]);

export const tape = sqliteTable('tape', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  slugLocked: integer('slugLocked', { mode: 'boolean' }).notNull().default(false),
  title: text('title').notNull(),
  titleAlt: text('titleAlt'),
  titleSort: text('titleSort').notNull(),
  labelId: text('labelId').references(() => label.id, { onDelete: 'restrict' }),
  year: integer('year'),
  yearSort: integer('yearSort').notNull().default(9999),
  decade: integer('decade'),
  releaseType: text('releaseType', { enum: RELEASE_TYPES }).notNull(),
  catalogNo: text('catalogNo'),
  description: text('description').notNull().default(''),
  reelUrl: text('reelUrl'),
  isRare: integer('isRare', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: TAPE_STATUSES }).notNull().default('draft'),
  publishedAt: integer('publishedAt'),
  coverImageId: text('coverImageId').references((): AnySQLiteColumn => tapeImage.id, { onDelete: 'set null' }),
  coverThumbKey: text('coverThumbKey'),
  ogImageKey: text('ogImageKey'),
  ogImageBytes: integer('ogImageBytes').notNull().default(0),
  ogSourceImageId: text('ogSourceImageId').references((): AnySQLiteColumn => tapeImage.id, { onDelete: 'set null' }),
  ogSourceTitle: text('ogSourceTitle'),
  likeCount: integer('likeCount').notNull().default(0),
  ownerCount: integer('ownerCount').notNull().default(0),
  commentCount: integer('commentCount').notNull().default(0),
  ...auditColumns(),
}, (table) => [
  index('tape_status_published_at_id_idx').on(table.status, table.publishedAt, table.id),
  index('tape_status_year_sort_id_idx').on(table.status, table.yearSort, table.id),
  index('tape_status_title_sort_id_idx').on(table.status, table.titleSort, table.id),
  index('tape_status_owner_count_published_at_id_idx').on(table.status, table.ownerCount, table.publishedAt, table.id),
  index('tape_status_updated_at_id_idx').on(table.status, table.updatedAt, table.id),
  index('tape_updated_at_id_idx').on(table.updatedAt, table.id),
  index('tape_status_decade_published_at_id_idx').on(table.status, table.decade, table.publishedAt, table.id),
  index('tape_label_status_published_at_id_idx').on(table.labelId, table.status, table.publishedAt, table.id),
  index('tape_label_status_year_sort_id_idx').on(table.labelId, table.status, table.yearSort, table.id),
  index('tape_status_release_type_published_at_id_idx').on(table.status, table.releaseType, table.publishedAt, table.id),
]);

export const tapeArtist = sqliteTable('tape_artist', {
  tapeId: text('tapeId').notNull().references(() => tape.id, { onDelete: 'cascade' }),
  artistId: text('artistId').notNull().references(() => artist.id, { onDelete: 'restrict' }),
  position: integer('position').notNull(),
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(false),
  yearSort: integer('yearSort').notNull().default(9999),
}, (table) => [
  primaryKey({ columns: [table.tapeId, table.artistId] }),
  index('tape_artist_artist_published_year_tape_idx').on(table.artistId, table.isPublished, table.yearSort, table.tapeId),
  index('tape_artist_tape_position_idx').on(table.tapeId, table.position),
]);

export const tapeGenre = sqliteTable('tape_genre', {
  tapeId: text('tapeId').notNull().references(() => tape.id, { onDelete: 'cascade' }),
  genreId: text('genreId').notNull().references(() => genre.id, { onDelete: 'restrict' }),
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(false),
  publishedAt: integer('publishedAt'),
}, (table) => [
  primaryKey({ columns: [table.tapeId, table.genreId] }),
  index('tape_genre_genre_published_at_tape_idx').on(table.genreId, table.isPublished, table.publishedAt, table.tapeId),
]);

export const tapeImage = sqliteTable('tape_image', {
  id: text('id').primaryKey(),
  tapeId: text('tapeId').notNull().references(() => tape.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: IMAGE_KINDS }).notNull(),
  fullKey: text('fullKey').notNull(),
  thumbKey: text('thumbKey').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  position: integer('position').notNull(),
}, (table) => [index('tape_image_tape_position_idx').on(table.tapeId, table.position)]);

export const song = sqliteTable('song', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  titleAlt: text('titleAlt'),
  titleSort: text('titleSort').notNull(),
  lyricist: text('lyricist'),
  composer: text('composer'),
  arranger: text('arranger'),
  notes: text('notes'),
  lyrics: text('lyrics'),
  likeCount: integer('likeCount').notNull().default(0),
  commentCount: integer('commentCount').notNull().default(0),
  publishedTapeCount: integer('publishedTapeCount').notNull().default(0),
  ...auditColumns(),
}, (table) => [index('song_updated_at_id_idx').on(table.updatedAt, table.id)]);

export const songArtist = sqliteTable('song_artist', {
  songId: text('songId').notNull().references(() => song.id, { onDelete: 'cascade' }),
  artistId: text('artistId').notNull().references(() => artist.id, { onDelete: 'restrict' }),
  position: integer('position').notNull(),
}, (table) => [
  primaryKey({ columns: [table.songId, table.artistId] }),
  index('song_artist_artist_song_idx').on(table.artistId, table.songId),
  index('song_artist_song_position_idx').on(table.songId, table.position),
]);

export const tapeTrack = sqliteTable('tape_track', {
  id: text('id').primaryKey(),
  tapeId: text('tapeId').notNull().references(() => tape.id, { onDelete: 'cascade' }),
  songId: text('songId').notNull().references(() => song.id, { onDelete: 'restrict' }),
  side: text('side', { enum: SIDES }).notNull(),
  position: integer('position').notNull(),
  durationSec: integer('durationSec'),
  note: text('note'),
}, (table) => [
  uniqueIndex('tape_track_tape_side_position_uq').on(table.tapeId, table.side, table.position),
  index('tape_track_song_idx').on(table.songId),
  check('tape_track_position_positive', sql`${table.position} >= 1`),
]);

export const collection = sqliteTable('collection', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  coverKey: text('coverKey'),
  imageBytes: integer('imageBytes').notNull().default(0),
  isFeatured: integer('isFeatured', { mode: 'boolean' }).notNull().default(false),
  position: integer('position').notNull(),
  status: text('status', { enum: TAPE_STATUSES }).notNull().default('draft'),
  ...auditColumns(),
}, (table) => [index('collection_status_position_idx').on(table.status, table.position)]);

export const collectionItem = sqliteTable('collection_item', {
  collectionId: text('collectionId').notNull().references(() => collection.id, { onDelete: 'cascade' }),
  tapeId: text('tapeId').notNull().references(() => tape.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  note: text('note'),
}, (table) => [
  primaryKey({ columns: [table.collectionId, table.tapeId] }),
  index('collection_item_tape_idx').on(table.tapeId),
  index('collection_item_collection_position_idx').on(table.collectionId, table.position),
]);

export const tapeLike = sqliteTable('tape_like', {
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  tapeId: text('tapeId').notNull().references(() => tape.id, { onDelete: 'cascade' }),
  createdAt: integer('createdAt').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.tapeId] }),
  index('tape_like_tape_idx').on(table.tapeId),
  index('tape_like_user_created_tape_idx').on(table.userId, table.createdAt, table.tapeId),
]);

export const songLike = sqliteTable('song_like', {
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  songId: text('songId').notNull().references(() => song.id, { onDelete: 'cascade' }),
  createdAt: integer('createdAt').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.songId] }),
  index('song_like_song_idx').on(table.songId),
  index('song_like_user_created_song_idx').on(table.userId, table.createdAt, table.songId),
]);

export const tapeOwner = sqliteTable('tape_owner', {
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  tapeId: text('tapeId').notNull().references(() => tape.id, { onDelete: 'cascade' }),
  createdAt: integer('createdAt').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.tapeId] }),
  index('tape_owner_tape_idx').on(table.tapeId),
  index('tape_owner_user_created_tape_idx').on(table.userId, table.createdAt, table.tapeId),
]);

export const comment = sqliteTable('comment', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  tapeId: text('tapeId').references(() => tape.id, { onDelete: 'cascade' }),
  songId: text('songId').references(() => song.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: integer('createdAt').notNull(),
  deletedAt: integer('deletedAt'),
  deletedBy: text('deletedBy').references(() => user.id, { onDelete: 'set null' }),
  deletedByAdmin: integer('deletedByAdmin', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  check('comment_exactly_one_target', sql`(${table.tapeId} IS NOT NULL) <> (${table.songId} IS NOT NULL)`),
  index('comment_tape_created_id_idx').on(table.tapeId, table.createdAt, table.id),
  index('comment_song_created_id_idx').on(table.songId, table.createdAt, table.id),
  index('comment_user_created_idx').on(table.userId, table.createdAt),
  index('comment_created_id_idx').on(table.createdAt, table.id),
]);

export const searchDoc = sqliteTable('search_doc', {
  docId: integer('docId').primaryKey({ autoIncrement: true }),
  kind: text('kind', { enum: SEARCH_KINDS }).notNull(),
  refId: text('refId').notNull(),
  isPublic: integer('isPublic', { mode: 'boolean' }).notNull().default(false),
  nameKey: text('nameKey').notNull(),
}, (table) => [
  uniqueIndex('search_doc_kind_ref_uq').on(table.kind, table.refId),
  index('search_doc_public_kind_name_idx').on(table.isPublic, table.kind, table.nameKey),
]);

export const searchQueue = sqliteTable('search_queue', {
  kind: text('kind', { enum: SEARCH_KINDS }).notNull(),
  refId: text('refId').notNull(),
}, (table) => [primaryKey({ columns: [table.kind, table.refId] })]);

export const redirect = sqliteTable('redirect', {
  fromPath: text('fromPath').primaryKey(),
  toPath: text('toPath').notNull(),
  createdAt: integer('createdAt').notNull(),
}, (table) => [index('redirect_to_path_idx').on(table.toPath)]);

export const siteStats = sqliteTable('site_stats', {
  id: integer('id').primaryKey(),
  tapeCount: integer('tapeCount').notNull().default(0),
  publishedTapeCount: integer('publishedTapeCount').notNull().default(0),
  songCount: integer('songCount').notNull().default(0),
  userCount: integer('userCount').notNull().default(0),
  imageBytes: integer('imageBytes').notNull().default(0),
  reindexCursor: text('reindexCursor'),
  reindexDay: text('reindexDay'),
  reindexRowsWritten: integer('reindexRowsWritten').notNull().default(0),
  updatedAt: integer('updatedAt').notNull(),
}, (table) => [check('site_stats_single_row', sql`${table.id} = 1`)]);
