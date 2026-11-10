// Flat ESLint configuration for the Angular 22 frontend.
// Start with a small correctness baseline; tighten rules only with verified source fixes.
import tsParser from '@typescript-eslint/parser';
import angular from '@angular-eslint/eslint-plugin';
import templateParser from '@angular-eslint/template-parser';
import angularTemplate from '@angular-eslint/eslint-plugin-template';

export default [
  {
    ignores: ['dist/**', 'out-tsc/**', 'node_modules/**', 'vendor/**', 'coverage/**']
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }
    },
    plugins: { '@angular-eslint': angular },
    rules: {
      'constructor-super': 'error',
      'no-unsafe-finally': 'error',
      'no-unreachable': 'error'
    }
  },
  {
    files: ['src/**/*.html'],
    languageOptions: {
      parser: templateParser
    },
    plugins: { '@angular-eslint/template': angularTemplate },
    rules: {
      '@angular-eslint/template/no-negated-async': 'error'
    }
  }
];
