import { describe, expect, it } from 'vitest';
import { parseCreateTable } from '../../scripts/lib/sqlite-schema';

// Stored SQL as drizzle-kit writes it, including a column added later by ALTER TABLE.
const comment = 'CREATE TABLE `comment` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`userId` text NOT NULL,\n\t`tapeId` text,\n\t`songId` text,\n\t`body` text NOT NULL,\n\t`createdAt` integer NOT NULL,\n\t`deletedAt` integer,\n\t`deletedBy` text, `deletedByAdmin` integer DEFAULT false NOT NULL,\n\tFOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`tapeId`) REFERENCES `tape`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`songId`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`deletedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,\n\tCONSTRAINT "comment_exactly_one_target" CHECK(("comment"."tapeId" IS NOT NULL) <> ("comment"."songId" IS NOT NULL))\n)';

describe('parseCreateTable', () => {
  it('lists columns with types and the tables they reference', () => {
    const parsed = parseCreateTable(comment);
    expect(parsed.columns.map((column) => column.name)).toEqual(['id', 'userId', 'tapeId', 'songId', 'body', 'createdAt', 'deletedAt', 'deletedBy', 'deletedByAdmin']);
    expect(parsed.columns.filter((column) => /text/iu.test(column.type)).map((column) => column.name)).toEqual(['id', 'userId', 'tapeId', 'songId', 'body', 'deletedBy']);
    expect(parsed.references).toEqual(['user', 'tape', 'song']);
  });

  it('handles column-level references, quoted names, defaults with commas and CHECK constraints', () => {
    const parsed = parseCreateTable('CREATE TABLE "a b" ("x" TEXT DEFAULT \'1,2\' REFERENCES "p q"("id"), y INTEGER CHECK (y IN (1, 2)), PRIMARY KEY (x))');
    expect(parsed.columns).toEqual([{ name: 'x', type: 'TEXT' }, { name: 'y', type: 'INTEGER' }]);
    expect(parsed.references).toEqual(['p q']);
  });
});
