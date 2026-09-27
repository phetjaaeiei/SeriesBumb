import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { getTapeReadiness } from '../../src/lib/queries/tape-readiness';

describe('admin tape readiness', () => {
  it('shows missing structure without treating uncertain source notes as verified', async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO tape (id, slug, title, titleSort, releaseType, status, description, createdAt, updatedAt) VALUES (?, ?, 'ตัวอย่าง', 'ตัวอย่าง', 'album', 'draft', 'ยังไม่ยืนยันหน้า A/B', 1, 1)")
      .bind(id, id).run();

    const row = (await getTapeReadiness(env.DB)).find(item => item.id === id);
    expect(row).toMatchObject({ title: 'ตัวอย่าง', coverCount: 0, artistCount: 0, trackCount: 0, year: null });
    expect(row?.issues).toEqual(expect.arrayContaining(['ยังไม่มีรูป', 'ยังไม่มีศิลปิน', 'ยังไม่มีเพลงในเทป', 'ปีที่ออกยังไม่ยืนยัน', 'บันทึกต้นทางระบุว่าต้องตรวจสอบ']));
  });
});
