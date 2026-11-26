import { realpath, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  removeFirefoxTestDirectory,
  stopFirefoxRunner,
} from '@duofollow/scripts/test-firefox-extension';

vi.mock('node:fs/promises', () => ({ realpath: vi.fn(), rm: vi.fn() }));

beforeEach(() => vi.resetAllMocks());
describe('Firefox native test shutdown', () => {
  it('waits for process closure after web-ext exit has already resolved', async () => {
    let onClosed;
    const runner = {
      registerCleanup: (callback) => {
        onClosed = callback;
      },
      exit: vi.fn(async () => {}),
    };
    const finished = vi.fn();
    const shutdown = stopFirefoxRunner(runner).then(finished);
    await Promise.resolve();
    expect(runner.exit).toHaveBeenCalledOnce();
    expect(finished).not.toHaveBeenCalled();
    onClosed();
    await shutdown;
    expect(finished).toHaveBeenCalledOnce();
  });
  it('fails visibly instead of deleting a profile while the process is still running', async () => {
    await expect(
      stopFirefoxRunner({ registerCleanup() {}, exit: async () => {} }, { timeoutMs: 5 }),
    ).rejects.toThrow('did not finish shutting down');
  });
  it('removes only the owned test directory and retries transient Windows locks', async () => {
    const root = resolve('firefox-test-results'),
      directory = resolve(root, 'native-fixture');
    realpath.mockImplementation(async (value) => value);
    await removeFirefoxTestDirectory(directory, root);
    expect(rm).toHaveBeenCalledWith(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });
  it('rejects cleanup outside the results directory', async () => {
    realpath.mockImplementation(async (value) => value);
    await expect(
      removeFirefoxTestDirectory(resolve('unrelated-profile'), resolve('firefox-test-results')),
    ).rejects.toThrow('outside Firefox test results');
    expect(rm).not.toHaveBeenCalled();
  });
});
