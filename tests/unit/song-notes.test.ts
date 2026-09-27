import { describe, expect, it } from 'vitest';
import { presentSongNotes } from '../../src/lib/song-notes';

describe('presentSongNotes', () => {
  it('keeps import provenance private while showing readable duration and uncertainty', () => {
    const notes = 'แหล่งไฟล์: archive/01-เพลง.MP3\nความยาว 246.491 วินาที\nID3 เดิม: {"TDRC":["2540"]}\nปีในชื่อโฟลเดอร์ พ.ศ. 2539 แต่ ID3 ระบุ 2540 จึงยังไม่กำหนดปี';
    expect(presentSongNotes(notes)).toEqual({
      duration: '4:06',
      publicNotes: ['ปีจากชื่อชุดไฟล์ พ.ศ. 2539 แต่ข้อมูลในไฟล์ระบุ 2540 จึงยังไม่ยืนยันปีที่ออก'],
      sourceNotes: notes,
    });
  });

  it('preserves ordinary editorial notes', () => {
    expect(presentSongNotes('บันทึกการออกเทป\nฉบับแรก')).toEqual({
      duration: null,
      publicNotes: ['บันทึกการออกเทป', 'ฉบับแรก'],
      sourceNotes: null,
    });
  });
});
