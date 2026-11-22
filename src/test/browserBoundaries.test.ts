import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(resolve(directory, entry.name))
      : entry.name.endsWith('.ts')
        ? [resolve(directory, entry.name)]
        : [],
  );

describe('browser dependency boundaries', () => {
  it('keeps SDK globals out of the extension outside the Chromium adapter and out of the protocol client', () => {
    const sources = [
      ...files(resolve(root, 'extension/src')).filter(
        (file) => !file.endsWith('platform\\chromium.ts') && !file.endsWith('platform/chromium.ts'),
      ),
      resolve(root, 'src/api/extension/DuoFollowConnector.ts'),
    ];
    const violations: string[] = [];
    for (const file of sources) {
      const ast = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node) && ['chrome', 'browser'].includes(node.text))
          violations.push(file + ':' + node.text);
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    expect(violations).toEqual([]);
  });
  it('does not let core imports reach a browser implementation or a browser entry point', () => {
    const visited = new Set<string>(),
      violations: string[] = [];
    const visit = (file: string) => {
      if (visited.has(file) || !file.endsWith('.ts')) return;
      visited.add(file);
      const ast = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      for (const statement of ast.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
          continue;
        const value = statement.moduleSpecifier.text;
        if (!value.startsWith('@duofollow/')) continue;
        if (
          value.includes('/platform/chromium') ||
          ['/background', '/access', '/unfollow-confirmation', '/extensionLocalization'].some(
            (suffix) => value.endsWith(suffix),
          )
        )
          violations.push(file + ' -> ' + value);
        const dependency = resolve(root, value.slice('@duofollow/'.length) + '.ts');
        if (!value.endsWith('.json')) visit(dependency);
      }
    };
    for (const file of files(resolve(root, 'extension/src/core'))) visit(file);
    expect(violations).toEqual([]);
  });
});
