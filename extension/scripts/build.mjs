import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = fileURLToPath(new URL('../', import.meta.url));
const dist = join(extensionRoot, 'dist');
const manifest = join(extensionRoot, 'manifest.json');
const require = createRequire(import.meta.url);

function build(output, { development = false } = {}) {
  const tsc = require.resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tsc, '--outDir', output], {
    cwd: extensionRoot,
    stdio: 'inherit',
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
    const resolvedTemporaryDirectory = realpathSync(temporaryDirectory);
    if (dirname(resolvedTemporaryDirectory) !== realpathSync(dist)) {
      throw new Error(`Refusing to remove a directory outside dist: ${resolvedTemporaryDirectory}`);
    }
    rmSync(resolvedTemporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv.includes('--zip')) {
  createZip();
} else {
  build(dist, { development: true });
}
