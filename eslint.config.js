import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['extension/scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          // The sorter prefixes side-effect imports and suffixes type imports with a NUL.
          groups: [
            ['^node:[^\\u0000]+$'],
            ['^(?!node:|@duofollow/)[^\\u0000]+$'],
            ['^@duofollow/[^\\u0000]+$'],
            ['^[^\\u0000]+\\u0000$'],
            ['^\\u0000'],
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/^\\.{1,2}(\\/|$)/]',
          message: 'Use @duofollow/ for local dynamic imports.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^\\.{1,2}(/|$)', message: 'Use @duofollow/ for local imports.' },
            {
              regex: '^@duofollow/.*\\.[cm]?[jt]sx?$',
              message: 'Omit the source extension from a @duofollow/ module import.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports', disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  prettierConfig,
];
