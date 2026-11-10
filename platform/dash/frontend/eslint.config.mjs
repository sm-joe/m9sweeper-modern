// Flat ESLint configuration for the Angular 22 frontend.
// Enforce low-risk correctness checks on legacy code without altering framework behavior.
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
      'no-unreachable': 'error',
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-sparse-arrays': 'error',
      'no-compare-neg-zero': 'error'
    }
  },
  {
    files: ['src/**/*.html'],
    languageOptions: {
      parser: templateParser
    },
    plugins: { '@angular-eslint/template': angularTemplate },
    rules: {
      // Parser checks Angular template syntax; strict template rules will be
      // enabled after the matching ESLint/Angular plugin combination is verified.
    }
  }
];
