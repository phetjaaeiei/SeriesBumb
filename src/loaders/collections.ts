import type { SqlClient } from '../db/sql-client';
import { listPublishedCollectionSummaries, type CollectionSummary } from '../repositories/collections.repo';

export interface CollectionsModel { collections: CollectionSummary[] }

export async function loadCollections(sql: SqlClient): Promise<CollectionsModel> {
  return { collections: await listPublishedCollectionSummaries(sql) };
}
