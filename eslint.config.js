// ESLint flat config: TypeScript + React hooks rules for app code, tests and scripts.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'public/ocr', 'node_modules', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}', '*.config.{js,ts}'],
    extends: [js.configs.recommended],
    // Scripts drive Playwright, whose page callbacks run in the browser.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
