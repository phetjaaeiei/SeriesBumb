/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import('./domain/types').SessionUser | null;
    session: { id: string; expiresAt: Date; createdAt: Date } | null;
  }
}
