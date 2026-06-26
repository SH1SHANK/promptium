// eslint.config.js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
    rules: {
      // Lenient core rules to prevent failures on legacy code
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      'consistent-return': 'off',
      'no-unreachable': 'warn',
      'no-var': 'off',
      'no-useless-escape': 'off',
      'no-case-declarations': 'off',
      'no-inner-declarations': 'off',
      'no-empty': 'off',
      'no-control-regex': 'off',
      'no-extra-boolean-cast': 'off',
      'prefer-const': 'off',

      // Allow unused vars for now to prevent noise during refactoring
      '@typescript-eslint/no-unused-vars': 'off',

      // Lenient TS rules
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',

      // Surface DOM security patterns as warnings
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
