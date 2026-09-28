export interface MigrationCheckInput {
  files: string[];
  journalTags: string[];
  allowUnjournaled: string[];
}

export function checkMigrations({ files, journalTags, allowUnjournaled }: MigrationCheckInput): string[] {
  const problems: string[] = [];
  const sqlFiles = files.filter((file) => file.endsWith('.sql')).sort();
  const tags = new Set(journalTags);
  const allowed = new Set(allowUnjournaled);
  const fileTags = new Set(sqlFiles.map((file) => file.slice(0, -4)));

  for (const file of sqlFiles) {
    const tag = file.slice(0, -4);
    if (!tags.has(tag) && !allowed.has(tag)) problems.push(`${file} ไม่อยู่ใน migrations/meta/_journal.json (สร้างด้วย npm run db:generate เท่านั้น)`);
  }
  for (const tag of journalTags) {
    if (!fileTags.has(tag)) problems.push(`journal อ้าง ${tag} แต่ไม่มีไฟล์ ${tag}.sql`);
  }
  const byPrefix = new Map<string, string[]>();
  for (const file of sqlFiles) {
    if (allowed.has(file.slice(0, -4))) continue;
    const prefix = file.split('_')[0];
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), file]);
  }
  for (const [prefix, group] of byPrefix) {
    if (group.length > 1) problems.push(`เลข migration ${prefix} ซ้ำกัน: ${group.join(', ')}`);
  }
  return problems;
}
