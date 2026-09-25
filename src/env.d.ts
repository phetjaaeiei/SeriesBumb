/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import('./lib/types').SessionUser | null;
    session: { id: string; expiresAt: Date } | null;
  }
}
