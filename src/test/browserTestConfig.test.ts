import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Config rules are tested independently; browser integration runs load the real runtime.
vi.mock('playwright/test', () => ({ defineConfig: (config: unknown) => config }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('CI', '');
  vi.stubEnv('DUOFOLLOW_TEST_WORKERS', '');
  vi.stubEnv('DUOFOLLOW_TEST_PREBUILT', '');
});

afterEach(() => vi.unstubAllEnvs());

describe('browser test scheduling', () => {
  it('uses two local workers and parallelizes isolated integration cases', async () => {
    const { default: config } = await import('@duofollow/playwright.config');
    expect(config.workers).toBe(2);
    expect(config.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'integration', fullyParallel: true }),
        expect.objectContaining({ name: 'visual', workers: 1 }),
      ]),
    );
  });

  it('keeps one CI worker unless the container explicitly requests two', async () => {
    vi.stubEnv('CI', 'true');
    let config = (await import('@duofollow/playwright.config')).default;
    expect(config.workers).toBe(1);
    vi.stubEnv('DUOFOLLOW_TEST_WORKERS', '2');
    vi.resetModules();
    config = (await import('@duofollow/playwright.config')).default;
    expect(config.workers).toBe(2);
  });

  it.each(['0', '-1', 'two', '1.5', '9007199254740992'])(
    'rejects an invalid worker limit %s',
    async (value) => {
      vi.stubEnv('DUOFOLLOW_TEST_WORKERS', value);
      await expect(import('@duofollow/playwright.config')).rejects.toThrow('positive integer');
    },
  );

  it('serves a prebuilt image without compiling during the browser run', async () => {
    vi.stubEnv('DUOFOLLOW_TEST_PREBUILT', '1');
    const { default: config } = await import('@duofollow/playwright.config');
    expect(config.webServer).toMatchObject({
      command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    });
  });

  it('builds the site for a normal host run and keeps load measurement at one worker', async () => {
    vi.stubEnv('DUOFOLLOW_TEST_WORKERS', '4');
    const { default: config } = await import('@duofollow/playwright.config');
    expect(config.webServer).toMatchObject({
      command: expect.stringContaining('npm run build &&'),
    });
    const { default: load } = await import('@duofollow/playwright.load.config');
    expect(load.workers).toBe(1);
  });
});
