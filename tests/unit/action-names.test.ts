import { describe, expect, it } from 'vitest';
import { server } from '../../src/actions/index';

// Client code calls actions by these dotted names (actions.admin.tapes.save, ?_action=...).
// Splitting or moving action files must never rename one.
function flatten(tree: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => (value && typeof value === 'object' && 'handler' in value
    ? [`${prefix}${key}:${(value as { accept?: string }).accept ?? 'json'}`]
    : flatten(value as Record<string, unknown>, `${prefix}${key}.`)));
}

describe('action names', () => {
  it('keeps every action at its public name and input type', () => {
    expect(flatten(server).sort()).toEqual([
    'admin.artists.create:json',
    'admin.artists.save:json',
    'admin.collections.create:json',
    'admin.collections.save:json',
    'admin.comments.delete:json',
    'admin.comments.restore:json',
    'admin.credits.add:json',
    'admin.credits.delete:json',
    'admin.deleteCatalog:json',
    'admin.genres.create:json',
    'admin.genres.save:json',
    'admin.health:json',
    'admin.images.deleteTapeImage:json',
    'admin.images.upload:form',
    'admin.labels.create:json',
    'admin.labels.save:json',
    'admin.lookup:json',
    'admin.people.create:json',
    'admin.people.link:json',
    'admin.relations.addArtist:json',
    'admin.relations.addEdition:json',
    'admin.relations.deleteArtist:json',
    'admin.relations.deleteEdition:json',
    'admin.reviews.moderate:json',
    'admin.reviews.moderateCorrection:json',
    'admin.search.continue:json',
    'admin.search.rebuild:json',
    'admin.songs.create:json',
    'admin.songs.save:json',
    'admin.sources.add:json',
    'admin.sources.delete:json',
    'admin.tapes.createDraft:json',
    'admin.tapes.save:json',
    'admin.users.setCommentBan:json',
    'admin.users.setRole:json',
    'comments.create:json',
    'comments.delete:json',
    'comments.list:json',
    'engagement.setSongLike:json',
    'engagement.setTapeLike:json',
    'engagement.setTapeOwned:json',
    'reviews.correct:json',
    'reviews.submit:json',
    ]);
  });
});
