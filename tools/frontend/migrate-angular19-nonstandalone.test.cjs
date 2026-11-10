const assert = require('node:assert/strict');
const { transform } = require('./migrate-angular19-nonstandalone.cjs');
const original = [
  "import { Component, Directive, Pipe } from '@angular/core';",
  "@Component({ selector: 'app-legacy', template: '{{x}}' }) class Legacy {}",
  "@Component({ standalone: true, selector: 'app-modern', template: '' }) class Modern {}",
  "@Directive({ selector: '[legacy]' }) class LegacyDirective {}",
  "@Pipe({ name: 'formatValue' }) class LegacyPipe {}",
].join('\n');
const updated = transform(original);
assert.match(updated, /@Component\(\{\s*standalone: false,\s*selector: 'app-legacy'/);
assert.match(updated, /@Directive\(\{\s*standalone: false,\s*selector: '\[legacy\]'/);
assert.match(updated, /@Pipe\(\{\s*standalone: false,\s*name: 'formatValue'/);
assert.match(updated, /@Component\(\{ standalone: true, selector: 'app-modern'/);
assert.equal(transform(updated), updated, 'migration must be idempotent');
console.log('PASS: Angular 19 AST migration preserves explicit standalone declarations');
