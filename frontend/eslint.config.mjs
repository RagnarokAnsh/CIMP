import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// Flat-config ESLint for the Vite + React frontend. Conservative, mirroring the
// backend config: recommended presets plus the two react-hooks rules whose
// eslint-disable comments already exist (three exhaustive-deps disables across
// the reporter/issues/triage pages). NOT type-aware — same reasoning as the
// backend config; a first type-aware run would be slow and noisy.
//
// The hooks rules are enabled explicitly rather than via the plugin's own config
// preset, whose export shape shifted across react-hooks minor versions — two
// named rules are stable across all of them.
//
// NOTE: eslint and these plugins are declared in package.json but not installed
// until `npm install`. `npm run lint` will not work before that, and the rule
// set has never been executed, so the first run may surface findings to triage.
export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // The whole reason the disable-comments in this tree are worth anything.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
