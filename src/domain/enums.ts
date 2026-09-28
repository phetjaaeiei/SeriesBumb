export const RELEASE_TYPES = ['album', 'compilation', 'soundtrack', 'single', 'other'] as const;
export const TAPE_STATUSES = ['draft', 'published'] as const;
export const IMAGE_KINDS = ['front', 'back', 'inside', 'cassette', 'other'] as const;
export const SIDES = ['A', 'B', 'C', 'D'] as const;
export const ARTIST_TYPES = ['band', 'solo', 'group'] as const;
export const ARTIST_STATUSES = ['active', 'inactive', 'hiatus', 'deceased', 'unknown'] as const;
export const ROLES = ['member', 'admin'] as const;
export const SEARCH_KINDS = ['tape', 'song', 'artist', 'label', 'collection'] as const;

export type ReleaseType = (typeof RELEASE_TYPES)[number];
export type TapeStatus = (typeof TAPE_STATUSES)[number];
export type ImageKind = (typeof IMAGE_KINDS)[number];
export type Side = (typeof SIDES)[number];
export type ArtistType = (typeof ARTIST_TYPES)[number];
export type ArtistStatus = (typeof ARTIST_STATUSES)[number];
export type Role = (typeof ROLES)[number];
export type SearchKind = (typeof SEARCH_KINDS)[number];
