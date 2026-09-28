import { REAUTH_MESSAGE } from '../admin-session';

export function needsReauth(message: string): boolean {
  return message === REAUTH_MESSAGE;
}

export function reauthUrl(location: Pick<Location, 'pathname' | 'search'>): string {
  return `/login?reauth=1&next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
}

/** When the server asks for a fresh sign-in, offers to go there and come back. Returns true if it did. */
export function offerReauth(message: string): boolean {
  if (!needsReauth(message)) return false;
  if (window.confirm('รายการนี้ต้องยืนยันตัวตนอีกครั้ง ไปหน้าเข้าสู่ระบบตอนนี้ไหม? หลังยืนยันแล้วจะกลับมาหน้านี้')) {
    window.location.assign(reauthUrl(window.location));
    return true;
  }
  return false;
}
