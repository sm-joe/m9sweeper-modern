const assert = require('node:assert/strict');
const { transform } = require('./migrate-material-m2.cjs');
const original = [
  '@use "@angular/material" as mat;',
  '$primary: mat.define-palette(mat.$indigo-palette, 800);',
  '$theme: mat.define-light-theme((color:(primary:$primary)));',
  'color: mat.get-color-from-palette(mat.$gray-palette, 300);'
].join('\n');
const expected = [
  '@use "@angular/material" as mat;',
  '$primary: mat.m2-define-palette(mat.$m2-indigo-palette, 800);',
  '$theme: mat.m2-define-light-theme((color:(primary:$primary)));',
  'color: mat.m2-get-color-from-palette(mat.$m2-grey-palette, 300);'
].join('\n');
assert.equal(transform(original), expected);
assert.equal(transform(expected), expected, 'migration must be idempotent');
console.log('PASS: Angular Material M2 Sass API migration and idempotency');
