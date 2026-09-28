import { toActionError } from '../errors/to-action-error';

// Each domain maps unexpected failures to one Thai fallback; AppError messages pass through.
export async function runCatalog<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) { throw toActionError(error, { code: 'BAD_REQUEST', message: 'บันทึกไม่สำเร็จ ตรวจข้อมูลแล้วลองอีกครั้ง', log: 'Catalog action failed' }); }
}

export async function runComment<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) { throw toActionError(error, { message: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', log: 'Comment action failed' }); }
}

export async function runReview<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) { throw toActionError(error, { message: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', log: 'Review action failed' }); }
}
