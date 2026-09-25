/** Shared normalization for stored sort keys, search documents, and slugs. */
export function normalizeThai(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u200b-\u200d\ufeff]/gu, '')
    .replace(/\u0e4d\u0e32/gu, '\u0e33')
    .toLowerCase()
    .replace(/[๐-๙]/gu, (digit) => String(digit.codePointAt(0)! - 0x0e50));
}

export function stripThaiMarks(s: string): string {
  return s.replace(/[\u0e47-\u0e4e]/gu, '');
}

/** A binary-comparable approximation of Thai dictionary order for SQLite. */
export function thaiSortKey(s: string): string {
  const normalized = normalizeThai(s).replace(/^[\p{White_Space}\p{P}\p{S}]+/u, '');
  const movedVowels = normalized.replace(/([เ-ไ])([ก-ฮ])/gu, '$2$1');
  const numbered = movedVowels.replace(/\d+/gu, (digits) => digits.padStart(6, '0'));
  const first = numbered[0];
  const group = first && /[0-9]/u.test(first)
    ? '0'
    : first && /[ก-๛]/u.test(first) ? '1' : '2';
  return group + stripThaiMarks(numbered) + '\u0001' + numbered;
}
