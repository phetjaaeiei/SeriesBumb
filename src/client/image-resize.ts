export interface ResizedImage {
  file: File;
  width: number;
  height: number;
}

async function canvasFile(canvas: HTMLCanvasElement, baseName: string): Promise<File> {
  const encode = (type: string, quality: number) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  let blob = await encode('image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg', 0.85);
  if (!blob) throw new Error('เบราว์เซอร์นี้ไม่สามารถแปลงรูปได้');
  return new File([blob], `${baseName}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: blob.type });
}

export async function resizeImage(source: File, maxSide: number): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('เบราว์เซอร์นี้ไม่รองรับการปรับขนาดรูป');
    context.drawImage(bitmap, 0, 0, width, height);
    return { file: await canvasFile(canvas, source.name.replace(/\.[^.]+$/u, '')), width, height };
  } finally {
    bitmap.close();
  }
}
