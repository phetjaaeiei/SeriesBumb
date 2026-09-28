import astro from 'eslint-plugin-astro';
import react from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

// Layer boundaries (docs/superpowers/specs/2026-09-28-seriesbumb-free-production-ready-design.md §3).
// Flat config does not merge one rule across blocks, so each block repeats the restrictions it inherits.
const cloudflare = { group: ['cloudflare:*'], message: 'Only src/platform/ touches Cloudflare bindings: use db(), config() and friends from platform/runtime.' };
const astroModules = { group: ['astro:*'], message: 'domain/, services/ and repositories/ stay framework-free: map errors in actions/ or http/.' };
const database = { regex: String.raw`(^|/)db/`, message: 'Pages, components and actions reach the database through services and loaders, never db/.' };
const outsideDomain = { regex: String.raw`^\.\./(?!errors/app-error$)`, message: 'domain/ holds pure rules: import only other domain modules (and errors/app-error).' };
const restrict = (...patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });

export default [
  {
    ignores: ['.astro/**', 'dist/**', 'node_modules/**', 'worker-configuration.d.ts', 'playwright-report/**', 'test-results/**'],
  },
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],
  { files: ['src/**/*.{ts,tsx,astro}'], ignores: ['src/platform/**'], rules: restrict(cloudflare) },
  { files: ['src/{pages,components,actions}/**/*.{ts,tsx,astro}'], rules: restrict(cloudflare, database) },
  { files: ['src/{services,repositories}/**/*.ts'], rules: restrict(cloudflare, astroModules) },
  { files: ['src/domain/**/*.ts'], rules: restrict(cloudflare, astroModules, outsideDomain) },
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
