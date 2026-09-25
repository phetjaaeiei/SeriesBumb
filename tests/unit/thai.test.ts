import { describe, expect, it } from 'vitest';
import { normalizeThai, stripThaiMarks, thaiSortKey } from '../../src/lib/thai';

describe('normalizeThai', () => {
  it('normalizes Unicode, zero-width characters, sara am, case and Thai digits', () => {
    expect(normalizeThai('  A\u200bB\u200cC\u200d\ufeff ๑๒\u0e4d\u0e32 Cafe\u0301 '))
      .toBe('  abc 12ำ café ');
  });

  it('leaves Thai tone marks intact for display and slugs', () => {
    expect(normalizeThai('ซีรี่ย์บั้ม')).toBe('ซีรี่ย์บั้ม');
    expect(stripThaiMarks('ซีรี่ย์บั้ม')).toBe('ซีรียบัม');
  });
});

describe('thaiSortKey', () => {
  it('puts numbers before Thai before Latin and moves leading vowels behind consonants', () => {
    expect(thaiSortKey('  - เกศรา')).toMatch(/^1กเ/);
    expect(thaiSortKey('๑๐ ชุด')).toMatch(/^0/);
    const names = ['Apple', 'กล้วย', '๒ ชุด'];
    expect(names.sort((a, b) =>
      thaiSortKey(a) < thaiSortKey(b) ? -1 : thaiSortKey(a) > thaiSortKey(b) ? 1 : 0,
    ))
      .toEqual(['๒ ชุด', 'กล้วย', 'Apple']);
  });

  it('sorts digit runs naturally and uses tone marks only to break ties', () => {
    expect(thaiSortKey('ชุดที่ 2') < thaiSortKey('ชุดที่ 10')).toBe(true);
    expect(thaiSortKey('กา') < thaiSortKey('ก่า')).toBe(true);
  });

  it('agrees with the Thai collator for more than 100 real Thai names', () => {
    const names = `
      กนก กรรณิการ์ กัลยา กาญจนา กิตติ กุลธิดา เกศรา เกรียงไกร
      ขวัญ ขวัญใจ ขจร เขม ขนิษฐา คมสัน คณิต คีรี คุณากร
      จันทร์ จารุวรรณ จิราพร จิราวัฒน์ จุฑามาศ เจนจิรา
      ฉัตรชัย ฉวีวรรณ ฉันทนา ชลธิชา ชัยพร ชาญชัย ชุติมา เชษฐา
      ดวงใจ ดารณี ดิเรก ดุจดาว เดชา ตระการ ตรีรัตน์ ตุลย์ ตะวัน
      ถาวร ถนอม ถิรพันธ์ ทศพล ทวีศักดิ์ ทิพย์ ทรงพล เทียนชัย
      ธนพร ธนวัฒน์ ธัญญา ธิดารัตน์ นภา นพรัตน์ นรินทร์ นิรชา เนตรนภา
      บงกช บัณฑิต บุษบา เบญจพร ปกรณ์ ปณิธาน ปราณี ปิยะ เปรม
      ผกามาศ ผจง ผ่องศรี ฝน ฝ้าย พงศกร พรรณี พิมพ์ พิชญา เพ็ญนภา
      ฟ้า ฟ้ารุ่ง ฟาง ภัทร ภาคิน ภูมิ มณี มนตรี มาลัย มิ่งขวัญ เมธา
      ยศ ยุพา เยาวเรศ รัตนา รุ่งโรจน์ เรวัติ ลลิตา ลักษณา ลำดวน เลิศ
      วราภรณ์ วัฒนา วิชัย วีระ เวียง ศักดิ์ ศิริพร เศรษฐา
      สกุล สง่า สมชาย สุชาดา เสถียร หทัย หรรษา หิมะ เหม
      อธิชา อนันต์ อรุณ อัจฉรา อิทธิ เอกราช
    `.trim().split(/\s+/u);
    expect(names.length).toBeGreaterThanOrEqual(100);
    const collator = new Intl.Collator('th');
    const byThai = [...names].sort(collator.compare);
    const byKey = [...names].sort((a, b) =>
      thaiSortKey(a) < thaiSortKey(b) ? -1 : thaiSortKey(a) > thaiSortKey(b) ? 1 : 0,
    );
    expect(byKey).toEqual(byThai);
  });
});
