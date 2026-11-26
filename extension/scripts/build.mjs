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
const firefox = process.argv.includes('--firefox');
const dist = join(extensionRoot, firefox ? 'dist-firefox' : 'dist');
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
    entryPoints: firefox
      ? {
          background: 'src/firefox-background.ts',
          content: 'src/firefox-content.ts',
          access: 'src/access.ts',
          'unfollow-confirmation': 'src/unfollow-confirmation.ts',
        }
      : ['src/background.ts', 'src/access.ts', 'src/unfollow-confirmation.ts'],
    alias: firefox
      ? {
          '@duofollow/extension/src/platform/current': join(
            extensionRoot,
            'src/platform/firefoxCurrent.ts',
          ),
        }
      : {},
    outdir: output,
    bundle: true,
    format: firefox ? 'iife' : 'esm',
    platform: 'browser',
    target: 'es2022',
    tsconfig: 'tsconfig.json',
  });
  const config = JSON.parse(readFileSync(manifest, 'utf8'));
  if (firefox) {
    delete config.externally_connectable;
    config.background = { scripts: ['background.js'] };
    config.content_scripts = [
      {
        matches: ['https://hedgerock.github.io/duofollow/*'],
        js: ['content.js'],
        run_at: 'document_start',
        all_frames: false,
      },
    ];
    config.browser_specific_settings = {
      gecko: {
        id: 'duofollow@hedgerock.github.io',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: [
            'authenticationInfo',
            'personallyIdentifyingInfo',
            'websiteContent',
            'websiteActivity',
          ],
        },
      },
      gecko_android: { strict_min_version: '142.0' },
    };
  }
  if (development && firefox) {
    config.content_scripts[0].matches.push(
      'http://localhost/duofollow/*',
      'http://127.0.0.1/duofollow/*',
    );
  } else if (development) {
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

  const filename = `duofollow-connector-${firefox ? 'firefox-' : ''}${version}.zip`;
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
    console.log(`Created ${firefox ? 'extension/dist-firefox' : 'extension/dist'}/${filename}`);
  } finally {
    removePackageDirectory(temporaryDirectory);
  }
}

if (process.argv.includes('--zip')) {
  createZip();
} else {
  build(dist, { development: true });
}
