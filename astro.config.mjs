import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// CSP origins follow the Worker vars in wrangler.jsonc unless the build environment overrides them.
const wranglerConfig = JSON.parse(readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gmu, ''));
const selectedEnv = process.env.CLOUDFLARE_ENV;
const workerVars = { ...(wranglerConfig.vars ?? {}), ...(selectedEnv ? wranglerConfig.env?.[selectedEnv]?.vars ?? {} : {}) };

const imageOrigin = (() => {
  try {
    return new URL(process.env.IMAGE_BASE_URL || workerVars.IMAGE_BASE_URL || 'https://firebasestorage.googleapis.com').origin;
  } catch {
    throw new Error('IMAGE_BASE_URL must be an absolute URL');
  }
})();

// Admin audio uploads PUT straight to the project's Supabase Storage origin.
const supabaseOrigin = (() => {
  const configured = process.env.SUPABASE_URL || workerVars.SUPABASE_URL;
  if (!configured) return '';
  const url = new URL(configured);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/u.test(url.hostname)) {
    throw new Error('SUPABASE_URL must be an https://<project>.supabase.co URL');
  }
  return url.origin;
})();

export default defineConfig({
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  session: false,
  security: {
    actionBodySizeLimit: 4 * 1024 * 1024,
    csp: {
      directives: [
        "default-src 'self'",
        `img-src 'self' data: https://*.googleusercontent.com${imageOrigin ? ` ${imageOrigin}` : ''}`,
        `connect-src 'self' https://cloudflareinsights.com${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://static.cloudflareinsights.com'],
      },
    },
  },
});
