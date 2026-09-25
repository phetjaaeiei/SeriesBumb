import astro from 'eslint-plugin-astro';
import react from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['.astro/**', 'dist/**', 'node_modules/**', 'worker-configuration.d.ts', 'playwright-report/**', 'test-results/**'],
  },
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],
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
    },
  },
];
