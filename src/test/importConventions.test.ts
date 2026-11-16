import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const filePath = 'src/test/import-policy.fixture.ts';
const eslint = new ESLint({ fix: true });

beforeAll(async () => {
  await eslint.calculateConfigForFile(filePath);
}, 30_000);

describe('import conventions', () => {
  it('fixes the group order and preserves side-effect import order', async () => {
    const source = [
      "import '@duofollow/src/z.css';",
      "import type { Locale } from '@duofollow/extension/src/locales';",
      "import { isConnectorErrorCode } from '@duofollow/extension/src/dto/ConnectorError';",
      "import '@duofollow/src/a.css';",
      "import { expect } from 'vitest';",
      "import { basename } from 'node:path';",
      'export { basename, expect, isConnectorErrorCode };',
      'export type { Locale };',
    ].join('\n');
    const [result] = await eslint.lintText(source, { filePath });

    expect(result.messages).toEqual([]);
    expect(result.output).toBe(
      [
        "import { basename } from 'node:path';",
        '',
        "import { expect } from 'vitest';",
        '',
        "import { isConnectorErrorCode } from '@duofollow/extension/src/dto/ConnectorError';",
        '',
        "import type { Locale } from '@duofollow/extension/src/locales';",
        '',
        "import '@duofollow/src/z.css';",
        "import '@duofollow/src/a.css';",
        'export { basename, expect, isConnectorErrorCode };',
        'export type { Locale };',
      ].join('\n'),
    );
  });

  it('rejects relative imports and source extensions on aliased modules', async () => {
    const source = [
      "import './style.css';",
      "export { Workspace } from '@duofollow/src/App.tsx';",
      "export const load = () => import('./fixture');",
    ].join('\n');
    const [result] = await eslint.lintText(source, { filePath });

    expect(result.messages.map(({ ruleId }) => ruleId)).toEqual([
      'no-restricted-imports',
      'no-restricted-imports',
      'no-restricted-syntax',
    ]);
  });
});
