export async function createOgImage(source: Blob, title: string): Promise<File> {
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('เบราว์เซอร์นี้ไม่รองรับภาพแชร์');
    context.fillStyle = '#14110e';
    context.fillRect(0, 0, 1200, 630);
    context.fillStyle = '#231e19';
    context.fillRect(40, 45, 540, 540);
    const scale = Math.min(540 / bitmap.width, 540 / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, 40 + (540 - width) / 2, 45 + (540 - height) / 2, width, height);
    await document.fonts.ready;
    context.fillStyle = '#d4a24c';
    context.font = '500 26px "Noto Serif Thai", serif';
    context.fillText('ซีรี่ย์บั้ม', 635, 100);
    context.fillStyle = '#f0e6d2';
    context.font = '500 54px "Noto Serif Thai", serif';
    const maxWidth = 515;
    const lines: string[] = [];
    let line = '';
    for (const char of title.trim()) {
      if (context.measureText(line + char).width > maxWidth && line) { lines.push(line); line = char; }
      else line += char;
      if (lines.length >= 3) break;
    }
    if (line && lines.length < 4) lines.push(line);
    for (const [index, text] of lines.slice(0, 4).entries()) context.fillText(text, 635, 205 + index * 74, maxWidth);
    context.fillStyle = '#a89c8a';
    context.font = '400 24px "IBM Plex Sans Thai", sans-serif';
    context.fillText('คลังเทปเพลงไทย', 635, 545);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.87));
    if (!blob) throw new Error('สร้างภาพแชร์ไม่สำเร็จ');
    return new File([blob], 'seriesbumb-og.jpg', { type: 'image/jpeg' });
  } finally { bitmap.close(); }
}
