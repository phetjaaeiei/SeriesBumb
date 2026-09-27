export interface TapeReadiness {
  id: string;
  title: string;
  year: number | null;
  coverCount: number;
  artistCount: number;
  trackCount: number;
  issues: string[];
}

interface TapeReadinessRow extends Omit<TapeReadiness, 'issues'> {
  releaseType: string;
  description: string;
}

export async function getTapeReadiness(db: D1Database): Promise<TapeReadiness[]> {
  const result = await db.prepare(`SELECT t.id, t.title, t.year, t.releaseType, t.description,
    (SELECT COUNT(*) FROM tape_image i WHERE i.tapeId = t.id) AS coverCount,
    (SELECT COUNT(*) FROM tape_artist a WHERE a.tapeId = t.id) AS artistCount,
    (SELECT COUNT(*) FROM tape_track tr WHERE tr.tapeId = t.id) AS trackCount
    FROM tape t WHERE t.status = 'draft' ORDER BY t.updatedAt ASC, t.id ASC LIMIT 100`).all<TapeReadinessRow>();

  return result.results.map(row => {
    const issues: string[] = [];
    if (!row.coverCount) issues.push('ยังไม่มีรูป');
    if (!row.artistCount && !['compilation', 'soundtrack'].includes(row.releaseType)) issues.push('ยังไม่มีศิลปิน');
    if (!row.trackCount) issues.push('ยังไม่มีเพลงในเทป');
    if (row.year === null) issues.push('ปีที่ออกยังไม่ยืนยัน');
    if (/ยังไม่ยืนยัน|ต้องตรวจสอบ|ขัดกัน|ไม่ใช่รายชื่อเพลงครบ/u.test(row.description)) issues.push('บันทึกต้นทางระบุว่าต้องตรวจสอบ');
    return { id: row.id, title: row.title, year: row.year, coverCount: row.coverCount, artistCount: row.artistCount, trackCount: row.trackCount, issues };
  });
}
