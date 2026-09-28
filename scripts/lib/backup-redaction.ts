// Backups travel outside Cloudflare, so they carry nothing that can impersonate a user:
// sessions and OAuth state expire anyway, and provider tokens are not used by the site.
export const BACKUP_EXCLUDED_TABLES: readonly string[] = ['session', 'verification'];

const ACCOUNT_SECRETS = ['accessToken', 'refreshToken', 'idToken', 'accessTokenExpiresAt', 'refreshTokenExpiresAt', 'password'];

export function redactBackupValues<T extends Record<string, unknown>>(table: string, values: T): T {
  if (table !== 'account') return values;
  const copy: Record<string, unknown> = { ...values };
  for (const column of ACCOUNT_SECRETS) if (column in copy) copy[column] = null;
  return copy as T;
}

/** Backups made before sessions were excluded still list them; restore treats them as absent. */
export function restorableTables<T extends { name: string }>(tables: T[]): T[] {
  return tables.filter((table) => !BACKUP_EXCLUDED_TABLES.includes(table.name));
}
