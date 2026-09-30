import type { SqlClient } from '../db/sql-client';
import type { SessionUser } from '../domain/types';
import { getCollectionBySlug, listPublishedCollectionItems, type CollectionDetail, type CollectionTapeItem } from '../repositories/collections.repo';

export interface CollectionDetailModel {
  collection: CollectionDetail;
  items: CollectionTapeItem[];
  /** The collection's own cover, else the first listed tape's cover thumbnail. */
  coverKey: string | null | undefined;
}

/** A collection and its published tapes; admins also see drafts. null when not found. */
export async function loadCollectionDetail(sql: SqlClient, slug: string, viewer?: Pick<SessionUser, 'role'> | null): Promise<CollectionDetailModel | null> {
  const admin = viewer?.role === 'admin';
  const collection = await getCollectionBySlug(sql, slug, admin);
  if (!collection) return null;
  const items = await listPublishedCollectionItems(sql, collection.id);
  const coverKey = collection.coverKey || items.find(item => item.coverThumbKey)?.coverThumbKey;
  return { collection, items, coverKey };
}
