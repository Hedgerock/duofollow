import { spawnSync } from 'node:child_process';
import { error, log } from 'node:console';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function readBytes(paths) {
  for (const path of paths) {
    try {
      const text = readFileSync(path, 'utf8').trim();
      const value = Number(text);
      if (/^\d+$/.test(text) && Number.isSafeInteger(value)) return value;
    } catch {
      // cgroup files are unavailable outside supported Linux container environments.
    }
  }
  return null;
}

/** Runs Playwright, preserves failure status, and records container-wide resource usage. */
export function runBrowserTests(args) {
  const started = performance.now();
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/playwright/cli.js'), 'test', ...args],
    { stdio: 'inherit', env: process.env },
  );
  const exitCode =
    result.status ?? (result.signal ? 128 + (constants.signals[result.signal] ?? 0) : 1);
  const report = {
    durationMs: Math.round(performance.now() - started),
    peakMemoryBytes: readBytes([
      '/sys/fs/cgroup/memory.peak',
      '/sys/fs/cgroup/memory/memory.max_usage_in_bytes',
    ]),
    memoryLimitBytes: readBytes([
      '/sys/fs/cgroup/memory.max',
      '/sys/fs/cgroup/memory/memory.limit_in_bytes',
    ]),
    arguments: args,
    exitCode,
    signal: result.signal ?? null,
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/container-resources.json', JSON.stringify(report, null, 2) + '\n');
  log('Browser test resources', JSON.stringify(report));
  if (result.error) error(result.error.message);
  return exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = runBrowserTests(process.argv.slice(2));
}
