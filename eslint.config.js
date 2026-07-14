import js from '@eslint/js';
import nounsanitized from 'eslint-plugin-no-unsanitized';

// Minimal, security-first lint. The key rule is no-unsanitized, which locks in
// the extension's textContent-only DOM discipline (no innerHTML/insertAdjacentHTML
// with untrusted tab titles/URLs). Run advisory in CI until fully tuned.
export default [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    plugins: { 'no-unsanitized': nounsanitized },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        chrome: 'readonly', OffscreenCanvas: 'readonly', document: 'readonly', window: 'readonly',
        navigator: 'readonly', fetch: 'readonly', AbortController: 'readonly', URL: 'readonly',
        Blob: 'readonly', btoa: 'readonly', atob: 'readonly', console: 'readonly', globalThis: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        Buffer: 'readonly', process: 'readonly', structuredClone: 'readonly', TextEncoder: 'readonly',
        TextDecoder: 'readonly', crypto: 'readonly', indexedDB: 'readonly', queueMicrotask: 'readonly',
      },
    },
    rules: {
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-empty-pattern': 'off', // `async ({}, use) =>` is the Playwright fixture idiom
    },
  },
  { ignores: ['node_modules/', 'test-results/', 'playwright-report/'] },
];
