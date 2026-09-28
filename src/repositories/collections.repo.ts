import type { SqlClient } from '../db/sql-client';

export interface CollectionLink { slug: string; title: string }

export interface CollectionSummary { id: string; slug: string; title: string; description: string; displayCoverKey: string | null; tapeCount: number }

export interface CollectionDetail { id: string; title: string; description: string; coverKey: string | null; status: 'draft' | 'published'; createdAt: number; updatedAt: number; createdByName: string | null; updatedByName: string | null }

export interface CollectionTapeItem { position: number; note: string | null; slug: string; title: string; year: number | null; coverThumbKey: string | null }

/** Up to three featured published collections, in display order. */
export async function listFeaturedCollections(sql: SqlClient): Promise<CollectionLink[]> {
  return (await sql.prepare("SELECT slug, title FROM collection WHERE status = 'published' AND isFeatured = 1 ORDER BY position LIMIT 3").all<CollectionLink>()).results;
}

/** Published collections with their published tape count and a cover (own, else the first tape's). */
export async function listPublishedCollectionSummaries(sql: SqlClient): Promise<CollectionSummary[]> {
  return (await sql.prepare(`SELECT c.id, c.slug, c.title, c.description,
  COALESCE(c.coverKey, (SELECT firstTape.coverThumbKey FROM collection_item firstItem
    JOIN tape firstTape ON firstTape.id = firstItem.tapeId AND firstTape.status = 'published'
    WHERE firstItem.collectionId = c.id AND firstTape.coverThumbKey IS NOT NULL
    ORDER BY firstItem.position LIMIT 1)) AS displayCoverKey,
  COUNT(t.id) AS tapeCount
  FROM collection c LEFT JOIN collection_item ci ON ci.collectionId = c.id
  LEFT JOIN tape t ON t.id = ci.tapeId AND t.status = 'published'
  WHERE c.status = 'published' GROUP BY c.id ORDER BY c.position, c.id LIMIT 100`).all<CollectionSummary>()).results;
}

/** A collection by slug with creator/editor names; drafts only when `admin` is true. */
export async function getCollectionBySlug(sql: SqlClient, slug: string, admin: boolean): Promise<CollectionDetail | null> {
  return sql.prepare(`SELECT c.*, creator.name AS createdByName, editor.name AS updatedByName FROM collection c LEFT JOIN user creator ON creator.id = c.createdBy LEFT JOIN user editor ON editor.id = c.updatedBy WHERE c.slug = ? ${admin ? '' : "AND c.status = 'published'"}`).bind(slug).first<CollectionDetail>();
}

/** The collection's published tapes in collection order (at most 100). */
export async function listPublishedCollectionItems(sql: SqlClient, collectionId: string): Promise<CollectionTapeItem[]> {
  return (await sql.prepare(`SELECT ci.position, ci.note, t.slug, t.title, t.year, t.coverThumbKey FROM collection_item ci JOIN tape t ON t.id = ci.tapeId WHERE ci.collectionId = ? AND t.status = 'published' ORDER BY ci.position LIMIT 100`).bind(collectionId).all<CollectionTapeItem>()).results;
}

/** Published collections that contain this tape, in display order. */
export async function listPublishedCollectionsForTape(sql: SqlClient, tapeId: string): Promise<CollectionLink[]> {
  return (await sql.prepare(`SELECT c.slug, c.title FROM collection_item ci JOIN collection c ON c.id = ci.collectionId WHERE ci.tapeId = ? AND c.status = 'published' ORDER BY c.position`).bind(tapeId).all<CollectionLink>()).results;
}
