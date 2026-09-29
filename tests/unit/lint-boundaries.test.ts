import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Guards the layer rules in eslint.config.mjs against silent regressions.
const eslint = new ESLint({ cwd: process.cwd() });
async function restricted(filePath: string, code: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-imports' || message.ruleId === 'no-restricted-syntax').length;
}

describe('layer boundary lint rules', () => {
  it.each([
    ['src/services/x.ts', "import { env } from 'cloudflare:workers'; export { env };"],
    ['src/services/x.ts', "const m = await import('cloudflare:workers'); export { m };"],
    ['src/pages/api/x.ts', "export type E = import('cloudflare:workers').WorkerEntrypoint;"],
    ['src/pages/x.js', "export { env } from 'cloudflare:workers';"],
    ['src/components/X.astro', "---\nconst { env } = await import('cloudflare:workers');\nvoid env;\n---\n<p />"],
    ['src/actions/x.ts', "import { getDb } from '../db/client'; export { getDb };"],
    ['src/services/x.tsx', "import { ActionError } from 'astro:actions'; export { ActionError };"],
    ['src/repositories/x.ts', "export async function f() { return import('astro:actions'); }"],
    ['src/domain/x.ts', "import { sql } from 'drizzle-orm'; export { sql };"],
    ['src/domain/x.ts', "import { db } from '../platform/runtime'; export { db };"],
    ['src/loaders/x.ts', "import { ActionError } from 'astro:actions'; export { ActionError };"],
    ['src/repositories/x.repo.ts', "import { saveTape } from '../services/catalog'; export { saveTape };"],
    ['src/actions/x.ts', "import { lookupAdminChoices } from '../repositories/admin.repo'; export { lookupAdminChoices };"],
    ['src/actions/x.ts', "export async function f() { return import('../repositories/admin.repo'); }"],
    ['src/pages/x.astro', "---\nimport { getTapePage } from '../repositories/tapes.repo';\nvoid getTapePage;\n---\n<p />"],
    ['src/pages/admin/x.ts', "import type { AdminChoice } from '../../repositories/admin.repo'; export type { AdminChoice };"],
    ['src/components/X.tsx', "import type { AdminChoice } from '../repositories/admin.repo'; export const x: AdminChoice[] = [];"],
    ['src/components/admin/X.tsx', "export type { AdminChoice } from '../../repositories/admin.repo';"],
    ['src/components/X.astro', "---\ntype C = import('../repositories/admin.repo').AdminChoice;\nconst c: C[] = [];\nvoid c;\n---\n<p />"],
  ])('rejects %s: %s', async (file, code) => {
    expect(await restricted(file, code)).toBeGreaterThan(0);
  });

  it.each([
    ['src/platform/x.ts', "import { env } from 'cloudflare:workers'; export { env };"],
    ['src/http/x.ts', "import { ActionError } from 'astro:actions'; export { ActionError };"],
    ['src/domain/x.ts', "import { AppError } from '../errors/app-error'; import { normalizeThai } from './thai'; export { AppError, normalizeThai };"],
    ['src/pages/x.ts', "import { db } from '../platform/runtime'; export { db };"],
    ['src/loaders/x.ts', "import { getTapePage } from '../repositories/tapes.repo'; import type { SqlClient } from '../db/sql-client'; export { getTapePage }; export type { SqlClient };"],
    ['src/services/x.ts', "import { runBatch } from '../repositories/batch.repo'; export { runBatch };"],
    ['src/http/middleware/x.ts', "import { getRedirectTarget } from '../../repositories/redirects.repo'; export { getRedirectTarget };"],
    ['src/components/admin/X.tsx', "import type { AdminChoice } from '../../loaders/admin/editor'; export const x: AdminChoice[] = [];"],
    ['src/actions/x.ts', "import { loadAdminLookup } from '../loaders/admin/lookup'; export { loadAdminLookup };"],
  ])('allows %s: %s', async (file, code) => {
    expect(await restricted(file, code)).toBe(0);
  });
}, 30_000);
