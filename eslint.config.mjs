import astro from 'eslint-plugin-astro';
import react from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

// Layer boundaries (docs/superpowers/specs/2026-09-28-seriesbumb-free-production-ready-design.md §3).
// Flat config does not merge one rule across blocks, so each block repeats the restrictions it inherits.
// no-restricted-imports covers static imports and re-exports; no-restricted-syntax covers import()
// expressions and `import('x')` type references, which that rule never inspects.
const cloudflare = { group: ['cloudflare:*'], message: 'Only src/platform/ touches Cloudflare bindings: use db(), config() and friends from platform/runtime.' };
const astroModules = { group: ['astro:*'], message: 'domain/, services/ and repositories/ stay framework-free: map errors in actions/ or http/.' };
const database = { regex: String.raw`(^|/)db/`, message: 'Pages, components and actions reach the database through services and loaders, never db/.' };
const upperLayers = { regex: String.raw`(^|/)(services|loaders|actions|pages|components|http|auth)/`, message: 'repositories/ is the bottom layer: SQL only, no imports from services, loaders or the web layer.' };
const outsideDomain = { regex: String.raw`^(?!\./)(?!\.\./errors/app-error$)`, message: 'domain/ holds pure rules: import only other domain modules (and ../errors/app-error), no packages.' };
const dynamic = (prefix, message) => [
  { selector: `ImportExpression[source.value=/^${prefix}:/]`, message },
  { selector: `TSImportType[argument.literal.value=/^${prefix}:/]`, message },
];
const restrict = (...patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
  'no-restricted-syntax': ['error', ...patterns.flatMap((pattern) => (pattern === cloudflare ? dynamic('cloudflare', pattern.message) : pattern === astroModules ? dynamic('astro', pattern.message) : []))],
});
const SOURCE = '{ts,tsx,mts,js,jsx,mjs,astro}';

export default [
  {
    ignores: ['.astro/**', 'dist/**', 'node_modules/**', 'worker-configuration.d.ts', 'playwright-report/**', 'test-results/**'],
  },
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],
  { files: [`src/**/*.${SOURCE}`], ignores: ['src/platform/**'], rules: restrict(cloudflare) },
  { files: [`src/{pages,components,actions}/**/*.${SOURCE}`], rules: restrict(cloudflare, database) },
  { files: [`src/{services,loaders}/**/*.${SOURCE}`], rules: restrict(cloudflare, astroModules) },
  { files: [`src/repositories/**/*.${SOURCE}`], rules: restrict(cloudflare, astroModules, upperLayers) },
  { files: [`src/domain/**/*.${SOURCE}`], rules: restrict(cloudflare, astroModules, outsideDomain) },
  {
    files: ['**/*.astro'],
    plugins: { astro },
    rules: { 'astro/no-set-html-directive': 'error' },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    ...react.configs.flat.recommended,
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      'react/no-danger': 'error',
      'react/react-in-jsx-scope': 'off',
    },
  },
];
