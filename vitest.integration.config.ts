import { fileURLToPath, URL } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const migrationsPath = fileURLToPath(new URL('./migrations', import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        compatibilityDate: '2026-09-25',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        bindings: {
          APP_ENV: 'development',
          SITE_URL: 'http://localhost:4321',
          IMAGE_BASE_URL: 'https://images.example.test',
          FIREBASE_STORAGE_BUCKET: 'seriesbumb-test.firebasestorage.app',
          CF_BEACON_TOKEN: '',
          BETTER_AUTH_SECRET: 'integration-test-secret-only',
          GOOGLE_CLIENT_ID: 'integration-test-client-id',
          GOOGLE_CLIENT_SECRET: 'integration-test-client-secret',
          ADMIN_EMAILS: '',
          TEST_MIGRATIONS: await readD1Migrations(migrationsPath),
        },
      },
    })),
  ],
  test: {
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
  },
});
