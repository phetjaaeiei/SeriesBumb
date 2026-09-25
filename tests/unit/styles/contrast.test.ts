import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../../src/styles/global.css', import.meta.url), 'utf8');
function color(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match) throw new Error(`Missing design token: ${name}`);
  return match[1];
}
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r, g, b] = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
}
function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

describe('approved design tokens', () => {
  it.each([
    ['text', 'bg'],
    ['text-soft', 'bg'],
    ['text-muted', 'bg'],
    ['label', 'bg'],
    ['accent', 'bg'],
    ['status', 'bg'],
    ['success', 'bg'],
    ['text', 'surface'],
    ['text-muted', 'surface'],
    ['accent-ink', 'accent'],
  ])('%s on %s meets WCAG AA for normal text', (foreground, background) => {
    expect(contrast(color(foreground), color(background))).toBeGreaterThanOrEqual(4.5);
  });
});
