import type { ArtistStatus, ArtistType, ReleaseType } from './enums';

export function toCeYear(input: number): number {
  return input > 2400 ? input - 543 : input;
}

export function formatYear(year: number | null): string {
  return year === null ? '—' : `พ.ศ. ${year + 543} · ${year}`;
}

export function yearSortOf(year: number | null): number {
  return year ?? 9999;
}

export function decadeOf(year: number | null): number | null {
  return year === null ? null : Math.floor(year / 10) * 10;
}

export function formatDuration(sec: number | null): string {
  if (sec === null) return '';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function parseDuration(text: string): number | null {
  const match = /^([0-5]?\d):([0-5]\d)$/u.exec(text.trim());
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds >= 1 && seconds <= 3599 ? seconds : null;
}

const bangkokDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDate(ms: number): string {
  const parts = Object.fromEntries(
    bangkokDate.formatToParts(new Date(ms)).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const artistTypeLabels: Record<ArtistType, string> = {
  band: 'วงดนตรี',
  solo: 'ศิลปินเดี่ยว',
  group: 'ดูโอ/กลุ่มนักร้อง',
};

export function artistTypeLabel(t: ArtistType | null): string {
  return t === null ? '—' : artistTypeLabels[t];
}

export function artistStatusLabel(s: ArtistStatus, t: ArtistType | null): string {
  switch (s) {
    case 'active': return 'ยังทำงาน';
    case 'inactive': return t === 'solo' ? 'หยุดงานเพลง' : 'แยกวง';
    case 'hiatus': return 'พักงาน';
    case 'deceased': return 'เสียชีวิต';
    case 'unknown': return 'ไม่ทราบ';
  }
}

const releaseTypeLabels: Record<ReleaseType, string> = {
  album: 'อัลบั้ม',
  compilation: 'รวมฮิต',
  soundtrack: 'เพลงประกอบ',
  single: 'ซิงเกิล',
  other: 'อื่นๆ',
};

export function releaseTypeLabel(t: ReleaseType): string {
  return releaseTypeLabels[t];
}
