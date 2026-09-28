import { describe, expect, it } from 'vitest';
import { FOREIGN, isProvince, PROVINCE_NAMES, PROVINCES, REGIONS } from '../../src/domain/provinces';

describe('provinces', () => {
  it('contains each of Thailand\'s 77 province names exactly once, plus foreign', () => {
    expect(PROVINCES).toHaveLength(77);
    expect(new Set(PROVINCES.map(({ name }) => name)).size).toBe(77);
    expect(PROVINCE_NAMES).toHaveLength(78);
    expect(new Set(PROVINCE_NAMES).size).toBe(78);
    expect(PROVINCE_NAMES).toContain('กรุงเทพมหานคร');
    expect(PROVINCE_NAMES).toContain('บึงกาฬ');
    expect(PROVINCE_NAMES).toContain(FOREIGN);
  });

  it('groups provinces into the specified six regions', () => {
    expect(REGIONS).toEqual(['เหนือ', 'อีสาน', 'กลาง', 'ตะวันออก', 'ตะวันตก', 'ใต้']);
    expect(new Set(PROVINCES.map(({ region }) => region))).toEqual(new Set(REGIONS));
    expect(PROVINCES.find(({ name }) => name === 'บึงกาฬ')?.region).toBe('อีสาน');
    expect(PROVINCES.find(({ name }) => name === 'ภูเก็ต')?.region).toBe('ใต้');
  });

  it('recognizes only exact province or foreign names', () => {
    expect(isProvince('เชียงใหม่')).toBe(true);
    expect(isProvince('ต่างประเทศ')).toBe(true);
    expect(isProvince('เชียงไหม่')).toBe(false);
    expect(isProvince(' เชียงใหม่ ')).toBe(false);
  });
});
