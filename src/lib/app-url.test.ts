import { afterEach, describe, expect, it, vi } from 'vitest';
import { appBaseUrl } from './app-url';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('appBaseUrl', () => {
  it('uses NEXT_PUBLIC_APP_URL when set, without a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://crm.example.com/');
    vi.stubEnv('NODE_ENV', 'production');
    expect(appBaseUrl()).toBe('https://crm.example.com');
  });

  it('falls back to the live portal in production', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');
    expect(appBaseUrl()).toBe('https://portal.luxwebstudio.dev');
  });

  it('links a preview deployment to itself', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'luxweb-crm-abc123.vercel.app');
    vi.stubEnv('NODE_ENV', 'production');
    expect(appBaseUrl()).toBe('https://luxweb-crm-abc123.vercel.app');
  });

  it('is empty in local dev without the variable', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(appBaseUrl()).toBe('');
  });
});
