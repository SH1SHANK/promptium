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
      'prefer-const': 'warn',

      // Allow unused vars for now to prevent noise during refactoring, but warn
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // Lenient TS rules
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',

      // Surface DOM security patterns as warnings
      'no-restricted-syntax': [
        'warn',
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message:
            'Avoid innerHTML. Prefer textContent or safe DOM construction to prevent XSS vulnerabilities in browser extensions.',
        },
        {
          selector: "MemberExpression[property.name='outerHTML']",
          message: 'Avoid outerHTML. Prefer safer DOM manipulation strategies.',
        },
        {
          selector: "MemberExpression[property.name='insertAdjacentHTML']",
          message: 'Avoid insertAdjacentHTML. Prefer safer DOM construction APIs.',
        },
      ],
    },
  }
);
