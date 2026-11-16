import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { buildSync } from 'esbuild';

const extensionRoot = fileURLToPath(new URL('../', import.meta.url));
const dist = join(extensionRoot, 'dist');
const manifest = join(extensionRoot, 'manifest.json');
const require = createRequire(import.meta.url);

function build(output, { development = false } = {}) {
  const tsc = require.resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tsc, '--noEmit'], {
    cwd: extensionRoot,
    stdio: 'inherit',
  });
  buildSync({
    absWorkingDir: extensionRoot,
    entryPoints: ['src/background.ts', 'src/access.ts'],
    outdir: output,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    tsconfig: 'tsconfig.json',
  });
  const config = JSON.parse(readFileSync(manifest, 'utf8'));
  if (development) {
    config.externally_connectable.matches.push('http://localhost/*', 'http://127.0.0.1/*');
  }
  writeFileSync(join(output, 'manifest.json'), JSON.stringify(config, null, 2) + '\n');
  cpSync(join(extensionRoot, 'assets'), output, { recursive: true });
  cpSync(join(extensionRoot, '_locales'), join(output, '_locales'), { recursive: true });
  copyFileSync(join(extensionRoot, '..', 'LICENSE'), join(output, 'LICENSE'));
  cpSync(join(extensionRoot, 'icons'), join(output, 'icons'), { recursive: true });
}

function removePackageDirectory(directory) {
  const resolvedDirectory = realpathSync(directory);
  if (dirname(resolvedDirectory) !== realpathSync(dist)) {
    throw new Error(`Refusing to remove a directory outside dist: ${resolvedDirectory}`);
  }
  rmSync(resolvedDirectory, { recursive: true, force: true });
}

function createZip() {
  const { version } = JSON.parse(readFileSync(manifest, 'utf8'));
  if (typeof version !== 'string' || !/^\d+(?:\.\d+){0,3}$/.test(version)) {
    throw new Error('Expected a numeric extension version in manifest.json');
  }

  const filename = `duofollow-connector-${version}.zip`;
  mkdirSync(dist, { recursive: true });
  const temporaryDirectory = mkdtempSync(join(dist, '.package-'));

  try {
    const output = join(temporaryDirectory, 'extension');
    const archive = join(temporaryDirectory, filename);
    build(output);

    const entries = readdirSync(output);
    if (process.platform === 'win32') {
      execFileSync('tar.exe', ['-a', '-c', '-f', archive, '-C', output, ...entries], {
        stdio: 'inherit',
      });
    } else {
      execFileSync('zip', ['-q', '-r', archive, ...entries], { cwd: output, stdio: 'inherit' });
    }

    renameSync(archive, join(dist, filename));
    console.log(`Created extension/dist/${filename}`);
  } finally {
    removePackageDirectory(temporaryDirectory);
  }
}

if (process.argv.includes('--zip')) {
  createZip();
} else {
  build(dist, { development: true });
}
