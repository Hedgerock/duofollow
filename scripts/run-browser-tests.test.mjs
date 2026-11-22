import { spawnSync } from 'node:child_process';
import { error, log } from 'node:console';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runBrowserTests } from '@duofollow/scripts/run-browser-tests';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
vi.mock('node:console', () => ({ error: vi.fn(), log: vi.fn() }));
vi.mock('node:fs', () => ({ mkdirSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  spawnSync.mockReturnValue({ status: 0 });
  readFileSync.mockImplementation(() => {
    throw new Error('No cgroup files');
  });
});

const report = () => JSON.parse(writeFileSync.mock.calls[0][1]);

describe('browser container runner', () => {
  it('forwards Playwright options and writes an honest report outside cgroups', () => {
    const args = ['--project=visual', '--update-snapshots=all'];
    expect(runBrowserTests(args)).toBe(0);
    const call = spawnSync.mock.calls[0];
    expect(call[1][0]).toMatch(/playwright[\\/]cli\.js$/);
    expect(call[1].slice(1)).toEqual(['test', ...args]);
    expect(mkdirSync).toHaveBeenCalledWith('test-results', { recursive: true });
    expect(writeFileSync.mock.calls[0][0]).toBe('test-results/container-resources.json');
    expect(report()).toMatchObject({
      peakMemoryBytes: null,
      memoryLimitBytes: null,
      exitCode: 0,
      arguments: args,
    });
    expect(report().durationMs).toBeGreaterThanOrEqual(0);
    expect(log).toHaveBeenCalledOnce();
  });

  it('reads peak and limit from cgroup v2', () => {
    readFileSync.mockImplementation((path) => {
      if (path.endsWith('/memory.peak')) return '104857600\n';
      if (path.endsWith('/memory.max')) return '3221225472\n';
      throw new Error('Unexpected cgroup file');
    });
    runBrowserTests([]);
    expect(report()).toMatchObject({ peakMemoryBytes: 104857600, memoryLimitBytes: 3221225472 });
  });

  it('uses cgroup v1 counters when v2 is absent and keeps the failed test status', () => {
    readFileSync.mockImplementation((path) => {
      if (path.endsWith('memory.max_usage_in_bytes')) return '209715200';
      if (path.endsWith('memory.limit_in_bytes')) return '3221225472';
      throw new Error('Not cgroup v2');
    });
    spawnSync.mockReturnValue({ status: 7 });
    expect(runBrowserTests(['--workers=1'])).toBe(7);
    expect(report()).toMatchObject({ peakMemoryBytes: 209715200, exitCode: 7 });
  });

  it('reports unlimited or malformed counters as unavailable', () => {
    readFileSync.mockImplementation((path) => (path.endsWith('/memory.max') ? 'max' : 'broken'));
    runBrowserTests([]);
    expect(report()).toMatchObject({ peakMemoryBytes: null, memoryLimitBytes: null });
  });

  it('keeps an interrupted process unsuccessful', () => {
    spawnSync.mockReturnValue({ status: null, signal: 'SIGKILL' });
    expect(runBrowserTests([])).toBe(137);
    expect(report()).toMatchObject({ exitCode: 137, signal: 'SIGKILL' });
  });

  it('reports launch errors instead of returning success', () => {
    spawnSync.mockReturnValue({ status: null, error: new Error('launch failed') });
    expect(runBrowserTests([])).toBe(1);
    expect(error).toHaveBeenCalledWith('launch failed');
  });
});
