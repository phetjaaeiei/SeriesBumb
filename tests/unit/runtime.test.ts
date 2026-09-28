import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { audioEnvironment, config, db, imageBaseUrl } from '../../src/platform/runtime';

describe('platform runtime', () => {
  it('exposes bindings and parsed config through getters', () => {
    expect(db()).toBe(env.DB);
    expect(config().siteUrl).toBe('http://localhost:4321');
    expect(imageBaseUrl()).toBe('https://images.example.test');
    expect(audioEnvironment()).toBe(env);
  });
});
