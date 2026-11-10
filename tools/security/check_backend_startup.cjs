#!/usr/bin/env node
'use strict';

// Contract tests for two production regressions: duplicate response metric
// observation and a silently successful NestJS bootstrap failure.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(
  path.resolve(__dirname, '../../platform/dash/backend/src/main.ts'),
  'utf8'
);
const observer = /prometheusService\.responses\.labels\(req\.method, getRoute\(req\.url\), res\.statusCode\)\.observe\(time\)/g;
assert.equal(
  [...main.matchAll(observer)].length,
  1,
  'Exactly one response-time observer must be registered per request'
);
assert.match(
  main,
  /bootstrap\(\)\.catch\(error\s*=>\s*\{[\s\S]*?process\.exitCode\s*=\s*1\s*;/,
  'NestJS bootstrap failures must give the process a nonzero exit status'
);
console.log('PASS: backend startup and response-time registration contracts');
