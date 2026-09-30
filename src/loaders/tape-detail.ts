import type { SqlClient } from '../db/sql-client';
import type { SessionUser } from '../domain/types';
import { listPublishedCollectionsForTape, type CollectionLink } from '../repositories/collections.repo';
import { listPublishedTapeReviews, type PublishedReview } from '../repositories/community.repo';
import { creditsForTarget } from '../repositories/credits.repo';
import { publicTapeEditions } from '../repositories/relations.repo';
import { listCatalogSources, type CatalogSource } from '../repositories/sources.repo';
import { getTapeBySlug, getTapeViewerEngagement, listRelatedTapesByArtist, listRelatedTapesByLabel, type RelatedTape, type TapeDetail, type TapeViewerEngagement } from '../repositories/tapes.repo';
import { listComments } from '../services/comments';

export type { TapeDetail };

export interface TapeDetailModel {
  tape: TapeDetail;
  /** Drafts are only loaded for admins; they get no editions, engagement, comments or reviews. */
  unpublished: boolean;
  catalogSources: CatalogSource[];
  credits: Awaited<ReturnType<typeof creditsForTarget>>;
  editions: Awaited<ReturnType<typeof publicTapeEditions>>;
  collections: CollectionLink[];
  /** Other tapes by the first artist, else from the same label. */
  related: RelatedTape[];
  engagement: TapeViewerEngagement | null;
  firstComments: Awaited<ReturnType<typeof listComments>> | null;
  publicReviews: PublishedReview[];
}

/** A tape page; admins also see drafts. null when not found. */
export async function loadTapeDetail(sql: SqlClient, slug: string, viewer?: Pick<SessionUser, 'id' | 'role'> | null): Promise<TapeDetailModel | null> {
  const isAdmin = viewer?.role === 'admin';
  const tape = await getTapeBySlug(sql, slug, isAdmin);
  if (!tape) return null;
  const unpublished = tape.status !== 'published';
  const catalogSources = await listCatalogSources(sql, 'tape', tape.id);
  const credits = await creditsForTarget(sql, 'tape', tape.id);
  const editions = !unpublished ? await publicTapeEditions(sql, tape.id) : [];
  const [collections, related] = await Promise.all([
    listPublishedCollectionsForTape(sql, tape.id),
    tape.artists[0]
      ? listRelatedTapesByArtist(sql, tape.artists[0].slug, tape.id)
      : tape.labelId ? listRelatedTapesByLabel(sql, tape.labelId, tape.id) : Promise.resolve([] as RelatedTape[]),
  ]);
  const viewerId = viewer?.id;
  const engagement = !unpublished && viewerId ? await getTapeViewerEngagement(sql, viewerId, tape.id) : null;
  const firstComments = !unpublished ? await listComments(sql, { tapeId: tape.id }, null, viewerId) : null;
  const publicReviews = !unpublished ? await listPublishedTapeReviews(sql, tape.id) : [];
  return { tape, unpublished, catalogSources, credits, editions, collections, related, engagement, firstComments, publicReviews };
}
