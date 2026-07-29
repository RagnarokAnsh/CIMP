// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Flat-config ESLint for the NestJS backend. Deliberately conservative: the
// recommended presets plus the one rule (no-console) whose eslint-disable
// comments already live in the tree, so those directives finally mean something.
//
// NOT type-aware on purpose — no `parserOptions.project`. Type-aware linting is
// slow and would flood a first run over ~13k lines with findings to triage,
// which is not what this is for. It exists to gate obvious hook/style
// regressions, not to re-audit the codebase.
//
// NOTE: eslint and these plugins are declared in package.json but are not
// installed until you run `npm install`. `npm run lint` will not work before
// that. The rule set has never been executed, so expect the first run to surface
// findings that need triage.
export default tseslint.config(
  // `.agents/` is vendored Claude Code skill scripts (bundled/minified third-party
  // JS), not our source — linting it produced ~1800 meaningless errors. dist/ is
  // build output; frontend/ has its own config.
  { ignores: ['dist/', 'node_modules/', 'coverage/', 'test-results/', '.agents/', 'frontend/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // TypeScript already resolves identifiers, and far more accurately — the
      // typescript-eslint project's own guidance is to disable no-undef outright
      // for TS files, or every type reference reads as an "undefined" global.
      'no-undef': 'off',
      // Server code logs through Nest's Logger, never console; the two deliberate
      // console lines (the bootstrap banner and the config warning) carry an
      // eslint-disable-next-line, which this rule is what makes meaningful.
      'no-console': 'warn',
      // A handful of unavoidable `any`s sit at the TypeORM driver boundary and in
      // error narrowing. Keep them allowed rather than churn the whole tree.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
