import { describe, expect, it } from 'vitest';
import { ConfigError, getConfig, isProduction } from '../../src/config/config';

const base = {
  SITE_URL: 'https://seriesbumb.phetjaa.workers.dev',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  GOOGLE_CLIENT_ID: 'client',
  GOOGLE_CLIENT_SECRET: 'secret',
};

describe('getConfig', () => {
  it('parses the minimal production env with safe defaults', () => {
    const config = getConfig({ ...base });
    expect(config.appEnv).toBe('production');
    expect(config.siteOrigin).toBe('https://seriesbumb.phetjaa.workers.dev');
    expect(config.images).toEqual({ baseUrl: null, uploadsEnabled: false, supabase: null });
    expect(config.audio).toEqual({ supabase: null, firebaseEnabled: false });
    expect(isProduction(config)).toBe(true);
  });

  it('turns string flags and admin emails into typed values', () => {
    const config = getConfig({ ...base, ADMIN_EMAILS: ' A@x.com, b@x.com ,', SUPABASE_IMAGE_UPLOADS_ENABLED: 'true', CF_BEACON_TOKEN: '' });
    expect([...config.auth.adminEmails]).toEqual(['a@x.com', 'b@x.com']);
    expect(config.images.uploadsEnabled).toBe(true);
    expect(config.analytics.beaconToken).toBeNull();
  });

  it('builds separate supabase targets that fall back to the shared project', () => {
    const config = getConfig({
      ...base,
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_shared',
      SUPABASE_IMAGE_BUCKET: 'Images',
      SUPABASE_AUDIO_BUCKET: 'Audio',
      SUPABASE_AUDIO_URL: 'https://def.supabase.co',
      SUPABASE_AUDIO_SECRET_KEY: 'sb_secret_audio',
    });
    expect(config.images.supabase).toEqual({ url: 'https://abc.supabase.co', secretKey: 'sb_secret_shared', bucket: 'Images' });
    expect(config.audio.supabase).toEqual({ url: 'https://def.supabase.co', secretKey: 'sb_secret_audio', bucket: 'Audio' });
  });

  it('rejects an insecure public SITE_URL and lists only key names', () => {
    let error: unknown;
    try { getConfig({ ...base, SITE_URL: 'http://example.com', GOOGLE_CLIENT_SECRET: '' }); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).issues).toEqual(['GOOGLE_CLIENT_SECRET', 'SITE_URL']);
    expect((error as Error).message).not.toContain('example.com');
  });

  it('allows http for localhost development', () => {
    expect(getConfig({ ...base, SITE_URL: 'http://localhost:4321', APP_ENV: 'development' }).siteOrigin).toBe('http://localhost:4321');
  });

  it('memoizes per env object', () => {
    const env = { ...base };
    expect(getConfig(env)).toBe(getConfig(env));
  });

  it('keeps Access and Turnstile off until both of their values are set', () => {
    const off = getConfig({ ...base, ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com', TURNSTILE_SITE_KEY: '0x4AAA' });
    expect(off.access).toBeNull();
    expect(off.turnstile).toBeNull();
    const on = getConfig({ ...base, ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com/', ACCESS_AUD: 'aud', TURNSTILE_SITE_KEY: '0x4AAA', TURNSTILE_SECRET_KEY: '0x4BBB' });
    expect(on.access).toEqual({ teamDomain: 'https://team.cloudflareaccess.com', audience: 'aud' });
    expect(on.turnstile).toEqual({ siteKey: '0x4AAA', secretKey: '0x4BBB' });
  });

  it('only accepts a Cloudflare Access team domain', () => {
    expect(() => getConfig({ ...base, ACCESS_TEAM_DOMAIN: 'https://evil.example', ACCESS_AUD: 'aud' })).toThrow(ConfigError);
  });

  it('treats blank optional URLs as not configured instead of failing the whole site', () => {
    const config = getConfig({ ...base, ACCESS_TEAM_DOMAIN: ' ', ACCESS_AUD: 'aud', IMAGE_BASE_URL: '', SUPABASE_URL: '' });
    expect(config.access).toBeNull();
    expect(config.images.baseUrl).toBeNull();
  });
});
