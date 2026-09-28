import { expect, test } from '@playwright/test';

// Starts Google sign-in without completing it: the flow must reach accounts.google.com whether or not
// Turnstile is on (staging runs Cloudflare's always-pass test keys, production has it off).
test('sign-in button reaches Google, through Turnstile when it is configured', async ({ page }) => {
  // Hold the navigation to Google so the login page keeps running while we watch the button.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let googleUrl = '';
  await page.route('https://accounts.google.com/**', async (route) => {
    googleUrl = route.request().url();
    await held;
    await route.fulfill({ status: 200, contentType: 'text/plain', body: 'google' });
  });
  // Locators and evaluate() wait for a pending navigation, so the page reports button changes on the console.
  const states: string[] = [];
  page.on('console', (message) => { if (message.text().startsWith('sign-in-button:')) states.push(message.text()); });
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const button = document.querySelector('[data-google-login]');
      if (!button) return;
      new MutationObserver(() => console.log(`sign-in-button:${button.hasAttribute('disabled')}`)).observe(button, { attributes: true, attributeFilter: ['disabled'] });
    });
  });
  await page.goto('/login');
  const button = page.locator('[data-google-login]');
  await expect(button).toBeEnabled({ timeout: 15_000 });
  const signIn = page.waitForResponse((response) => response.url().endsWith('/api/auth/sign-in/social'));
  await button.click();
  expect((await signIn).status()).toBe(200);
  await expect.poll(() => googleUrl).toMatch(/^https:\/\/accounts\.google\.com\//u);
  await page.waitForTimeout(1_000);
  // The spent Turnstile token must not be sendable twice while the browser leaves for Google.
  expect(states.at(-1)).toBe('sign-in-button:true');
  release();
});

test('sign-in without a Turnstile token is refused when Turnstile is configured', async ({ page, request }) => {
  await page.goto('/login');
  const turnstileOn = await page.locator('[data-turnstile-sitekey]').count() > 0;
  test.skip(!turnstileOn, 'Turnstile is off in this environment');
  const response = await request.post('/api/auth/sign-in/social', {
    data: { provider: 'google', callbackURL: '/' },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(response.status()).toBe(403);
});
