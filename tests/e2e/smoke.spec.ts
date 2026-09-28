import { expect, test } from '@playwright/test';

test('home renders the Thai shell with security headers', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  const headers = response!.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toContain("default-src 'self'");
});

test('admin redirects guests to login with a safe next path', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
});

test('public pages load without CSP violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  for (const path of ['/', '/tapes', '/songs', '/artists', '/latest', '/search?q=%E0%B9%80%E0%B8%97%E0%B8%9B']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
  }
  expect(violations).toEqual([]);
});

test('unknown pages return the Thai 404', async ({ page }) => {
  const response = await page.goto('/no-such-page-for-smoke');
  expect(response?.status()).toBe(404);
});
