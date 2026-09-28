import { describe, expect, it } from 'vitest';
import {
  artistStatusLabel,
  artistTypeLabel,
  decadeOf,
  formatDate,
  formatDuration,
  formatYear,
  parseDuration,
  releaseTypeLabel,
  toCeYear,
  yearSortOf,
} from '../../src/domain/format';

describe('year and date formatting', () => {
  it('converts Buddhist years for storage and formats a stored CE year', () => {
    expect(toCeYear(2541)).toBe(1998);
    expect(toCeYear(1998)).toBe(1998);
    expect(formatYear(1998)).toBe('พ.ศ. 2541 · 1998');
    expect(formatYear(null)).toBe('—');
    expect(yearSortOf(null)).toBe(9999);
    expect(decadeOf(1998)).toBe(1990);
    expect(decadeOf(null)).toBeNull();
  });

  it('formats Unix milliseconds using the Bangkok calendar day', () => {
    expect(formatDate(Date.parse('2026-09-24T18:00:00.000Z'))).toBe('2026-09-25');
  });
});

describe('duration formatting', () => {
  it('round trips a song duration and leaves missing durations blank', () => {
    expect(formatDuration(252)).toBe('4:12');
    expect(formatDuration(null)).toBe('');
    expect(parseDuration(' 4:12 ')).toBe(252);
  });

  it.each(['', '0:00', '1:60', '60:00', 'abc', '-1:01', '4:2'])
    ('rejects invalid duration input %s', (input) => {
      expect(parseDuration(input)).toBeNull();
    });
});

describe('catalog labels', () => {
  it('labels all artist types, including an unspecified type', () => {
    expect(artistTypeLabel('band')).toBe('วงดนตรี');
    expect(artistTypeLabel('solo')).toBe('ศิลปินเดี่ยว');
    expect(artistTypeLabel('group')).toBe('ดูโอ/กลุ่มนักร้อง');
    expect(artistTypeLabel(null)).toBe('—');
  });

  it('labels inactive solo artists differently from groups and unspecified types', () => {
    expect(artistStatusLabel('inactive', 'solo')).toBe('หยุดงานเพลง');
    expect(artistStatusLabel('inactive', 'band')).toBe('แยกวง');
    expect(artistStatusLabel('inactive', 'group')).toBe('แยกวง');
    expect(artistStatusLabel('inactive', null)).toBe('แยกวง');
    expect(artistStatusLabel('active', null)).toBe('ยังทำงาน');
    expect(artistStatusLabel('hiatus', null)).toBe('พักงาน');
    expect(artistStatusLabel('deceased', null)).toBe('เสียชีวิต');
    expect(artistStatusLabel('unknown', null)).toBe('ไม่ทราบ');
  });

  it('labels every release type', () => {
    expect(releaseTypeLabel('album')).toBe('อัลบั้ม');
    expect(releaseTypeLabel('compilation')).toBe('รวมฮิต');
    expect(releaseTypeLabel('soundtrack')).toBe('เพลงประกอบ');
    expect(releaseTypeLabel('single')).toBe('ซิงเกิล');
    expect(releaseTypeLabel('other')).toBe('อื่นๆ');
  });
});
