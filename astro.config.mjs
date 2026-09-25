import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// The image origin is supplied at build time as well as in wrangler.jsonc.
const imageOrigin = (() => {
  if (!process.env.IMAGE_BASE_URL) return null;
  try {
    return new URL(process.env.IMAGE_BASE_URL).origin;
  } catch {
    throw new Error('IMAGE_BASE_URL must be an absolute URL');
  }
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
        "connect-src 'self' https://cloudflareinsights.com",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://static.cloudflareinsights.com'],
      },
    },
  },
});
