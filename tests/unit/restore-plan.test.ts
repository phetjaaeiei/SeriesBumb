import { describe, expect, it } from 'vitest';
import { planRestoreParts, splitDumpByTable } from '../../scripts/lib/restore-plan';

const dump = [
  'PRAGMA defer_foreign_keys=TRUE;',
  'INSERT INTO "account" ("id","userId") VALUES(\'a1\',\'u1\');',
  'INSERT INTO "tape" ("id","coverImageId") VALUES(\'t1\',\'i1\');',
  'INSERT INTO "tape_image" ("id","tapeId") VALUES(\'i1\',\'t1\');',
  'INSERT INTO "user" ("id") VALUES(\'u1\');',
  'INSERT INTO "user" ("id") VALUES(\'u2\');',
].join('\n');

describe('restore plan', () => {
  it('groups INSERT lines by table, ignoring look-alikes inside values', () => {
    const tricky = `${dump}\nINSERT INTO "comment" ("body") VALUES('hi INSERT INTO "session" x');`;
    const byTable = splitDumpByTable(tricky);
    expect([...byTable.keys()]).toEqual(['account', 'tape', 'tape_image', 'user', 'comment']);
    expect(byTable.get('user')).toHaveLength(2);
    expect(byTable.has('session')).toBe(false);
  });

  it('orders parents first, keeps FK cycles together and packs parts under the daily write budget', () => {
    const byTable = splitDumpByTable(dump);
    // child -> parents
    const references = new Map([['account', ['user']], ['tape', ['tape_image']], ['tape_image', ['tape']]]);
    const indexes = new Map([['account', 1], ['tape', 3], ['tape_image', 1], ['user', 1]]);
    const parts = planRestoreParts(byTable, references, indexes, 6);
    // tape: 1 row x (1 + 3 indexes) + tape_image: 1 x 2 = 6; user: 2 x 2 = 4; account: 1 x 2 = 2
    expect(parts.map((part) => part.tables)).toEqual([['tape', 'tape_image'], ['user', 'account']]);
    expect(parts.map((part) => part.estimatedWrites)).toEqual([6, 6]);
    expect(parts[1].lines).toHaveLength(3);
    const whole = planRestoreParts(byTable, references, indexes, 12);
    expect(whole.map((part) => part.tables)).toEqual([['tape', 'tape_image', 'user', 'account']]);
  });

  it('refuses a cycle that alone exceeds the budget', () => {
    const byTable = splitDumpByTable(dump);
    expect(() => planRestoreParts(byTable, new Map([['tape', ['tape_image']], ['tape_image', ['tape']]]), new Map([['tape', 9]]), 5))
      .toThrow(/tape, tape_image/);
  });
});
