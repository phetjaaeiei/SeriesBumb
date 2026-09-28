export const env: Record<string, unknown> = {
  APP_ENV: 'development',
  SITE_URL: 'http://localhost:4321',
  IMAGE_BASE_URL: 'https://images.example.test',
  CF_BEACON_TOKEN: '',
  ADMIN_EMAILS: '',
  BETTER_AUTH_SECRET: 'test-only-not-a-real-secret',
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
};

export function waitUntil(_promise: Promise<unknown>): void {
  // Tests that need execution-context behavior belong in workerd.
  void _promise;
}
