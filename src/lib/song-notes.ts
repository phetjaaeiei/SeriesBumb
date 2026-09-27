export function presentSongNotes(notes: string | null): { duration: string | null; publicNotes: string[]; sourceNotes: string | null } {
  if (!notes) return { duration: null, publicNotes: [], sourceNotes: null };

  const lines = notes.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const imported = lines.some(line => line.startsWith('แหล่งไฟล์:')) && lines.some(line => line.startsWith('ID3 เดิม:'));
  if (!imported) return { duration: null, publicNotes: lines, sourceNotes: null };

  const seconds = Number(lines.find(line => line.startsWith('ความยาว '))?.match(/^ความยาว ([\d.]+) วินาที$/)?.[1]);
  const duration = Number.isFinite(seconds) && seconds > 0
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
    : null;

  const publicNotes = lines.filter(line => !/^(แหล่งไฟล์:|ความยาว |ID3 เดิม:|TRCK=)/.test(line)).map(line =>
    line.replaceAll('แต่ ID3 ระบุ', 'แต่ข้อมูลในไฟล์ระบุ')
      .replaceAll('ID3 ของเพลง', 'ข้อมูลในไฟล์เพลง')
      .replaceAll('ID3', 'ข้อมูลในไฟล์')
      .replaceAll('ปีในชื่อโฟลเดอร์', 'ปีจากชื่อชุดไฟล์')
      .replaceAll('ชื่อโฟลเดอร์', 'ชื่อชุดไฟล์')
      .replaceAll('ชื่อไฟล์', 'ข้อมูลชื่อเพลง')
      .replaceAll('ไฟล์ข้อความ', 'รายการต้นทาง')
      .replaceAll('จึงยังไม่กำหนดปี', 'จึงยังไม่ยืนยันปีที่ออก')
  );
  return { duration, publicNotes, sourceNotes: notes };
}
