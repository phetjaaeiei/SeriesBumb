import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(new URL('./tests/unit/stubs/cloudflare-workers.ts', import.meta.url)),
      'astro:actions': fileURLToPath(new URL('./tests/unit/stubs/astro-actions.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
