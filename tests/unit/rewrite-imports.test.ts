import { describe, expect, it } from 'vitest';
import { rewriteImports } from '../../scripts/lib/rewrite-imports';

const files = new Set([
  '/r/src/lib/thai.ts',
  '/r/src/lib/slug.ts',
  '/r/src/lib/services/catalog.ts',
  '/r/src/db/enums.ts',
  '/r/src/components/ui/TapeList.astro',
  '/r/src/components/admin/AudioArchive.css',
  '/r/src/lib/middleware/index.ts',
  '/r/src/pages/index.astro',
]);
const exists = (path: string) => files.has(path);
const moved = new Map([
  ['/r/src/lib/thai.ts', '/r/src/domain/thai.ts'],
  ['/r/src/lib/slug.ts', '/r/src/domain/slug.ts'],
  ['/r/src/lib/services/catalog.ts', '/r/src/services/catalog.ts'],
  ['/r/src/lib/middleware/index.ts', '/r/src/http/middleware/index.ts'],
]);

describe('rewriteImports', () => {
  it('re-points an unmoved importer at a moved target', () => {
    expect(rewriteImports("import { normalizeThai } from '../lib/thai';", '/r/src/pages/index.astro', '/r/src/pages/index.astro', moved, exists))
      .toBe("import { normalizeThai } from '../domain/thai';");
  });

  it('re-relativises a moved importer with unmoved and moved targets', () => {
    const source = "import type { ReleaseType } from '../../db/enums';\nimport { slugify } from '../slug';";
    expect(rewriteImports(source, '/r/src/lib/services/catalog.ts', '/r/src/services/catalog.ts', moved, exists))
      .toBe("import type { ReleaseType } from '../db/enums';\nimport { slugify } from '../domain/slug';");
  });

  it('keeps explicit extensions, side-effect imports, dynamic imports and vi.mock', () => {
    const source = [
      "import TapeList from '../components/ui/TapeList.astro';",
      "import '../components/admin/AudioArchive.css';",
      "const m = await import('../lib/thai');",
      "vi.mock('../lib/slug', () => ({}));",
    ].join('\n');
    expect(rewriteImports(source, '/r/src/pages/index.astro', '/r/src/pages/x/index.astro', moved, exists)).toBe([
      "import TapeList from '../../components/ui/TapeList.astro';",
      "import '../../components/admin/AudioArchive.css';",
      "const m = await import('../../domain/thai');",
      "vi.mock('../../domain/slug', () => ({}));",
    ].join('\n'));
  });

  it('resolves directory index imports and leaves packages alone', () => {
    const source = "import { a } from '../lib/middleware';\nimport { z } from 'astro/zod';\nimport { env } from 'cloudflare:workers';";
    expect(rewriteImports(source, '/r/src/pages/index.astro', '/r/src/pages/index.astro', moved, exists))
      .toBe("import { a } from '../http/middleware';\nimport { z } from 'astro/zod';\nimport { env } from 'cloudflare:workers';");
  });

  it('uses ./ for same-directory targets and throws on unresolvable relative imports', () => {
    expect(rewriteImports("import { x } from './thai';", '/r/src/lib/slug.ts', '/r/src/domain/slug.ts', moved, exists)).toBe("import { x } from './thai';");
    expect(() => rewriteImports("import { x } from './missing';", '/r/src/lib/slug.ts', '/r/src/domain/slug.ts', moved, exists)).toThrow(/missing/);
  });
});
