import { describe, expect, it } from 'vitest';
import { checkMigrations } from '../../scripts/lib/migrations';

describe('checkMigrations', () => {
  const allowUnjournaled = ['0006_artist_profile'];

  it('accepts files that match the journal plus the allowlisted hand-written file', () => {
    expect(checkMigrations({
      files: ['0000_a.sql', '0001_b.sql', '0006_artist_profile.sql', 'meta'],
      journalTags: ['0000_a', '0001_b'],
      allowUnjournaled,
    })).toEqual([]);
  });

  it('reports a sql file missing from the journal', () => {
    expect(checkMigrations({ files: ['0000_a.sql', '0001_x.sql'], journalTags: ['0000_a'], allowUnjournaled }))
      .toEqual(['0001_x.sql ไม่อยู่ใน migrations/meta/_journal.json (สร้างด้วย npm run db:generate เท่านั้น)']);
  });

  it('reports a journal entry without a file', () => {
    expect(checkMigrations({ files: ['0000_a.sql'], journalTags: ['0000_a', '0001_b'], allowUnjournaled }))
      .toEqual(['journal อ้าง 0001_b แต่ไม่มีไฟล์ 0001_b.sql']);
  });

  it('reports a duplicated numeric prefix among journaled files', () => {
    expect(checkMigrations({ files: ['0007_a.sql', '0007_b.sql'], journalTags: ['0007_a', '0007_b'], allowUnjournaled }))
      .toEqual(['เลข migration 0007 ซ้ำกัน: 0007_a.sql, 0007_b.sql']);
  });
});
