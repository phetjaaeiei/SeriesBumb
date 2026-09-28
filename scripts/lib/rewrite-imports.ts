import { dirname, relative, resolve } from 'node:path';

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bvi\.mock\(\s*)(['"])(\.{1,2}\/[^'"]*)\2/gu;
const EXTENSIONS = ['.ts', '.tsx', '.astro', '.js', '.mjs'];

function resolveTarget(spec: string, importer: string, exists: (path: string) => boolean): { target: string; style: 'exact' | 'bare' | 'index' } {
  const base = resolve(dirname(importer), spec);
  if (exists(base)) return { target: base, style: 'exact' };
  for (const extension of EXTENSIONS) if (exists(`${base}${extension}`)) return { target: `${base}${extension}`, style: 'bare' };
  for (const extension of EXTENSIONS) if (exists(`${base}/index${extension}`)) return { target: `${base}/index${extension}`, style: 'index' };
  throw new Error(`Cannot resolve '${spec}' from ${importer}`);
}

function specifierFor(target: string, importer: string, style: 'exact' | 'bare' | 'index'): string {
  const path = style === 'index' ? dirname(target) : style === 'bare' ? target.replace(/\.[^./]+$/u, '') : target;
  const rel = relative(dirname(importer), path).split('\\').join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * Rewrites relative import specifiers in `source` for a file moving from `oldFile` to `newFile`,
 * given every module move (old absolute path → new absolute path). `exists` answers for the OLD tree.
 */
export function rewriteImports(source: string, oldFile: string, newFile: string, moved: Map<string, string>, exists: (path: string) => boolean): string {
  return source.replace(SPECIFIER, (match, lead: string, quote: string, spec: string) => {
    const { target, style } = resolveTarget(spec, oldFile, exists);
    const next = specifierFor(moved.get(target) ?? target, newFile, style);
    return next === spec ? match : `${lead}${quote}${next}${quote}`;
  });
}
