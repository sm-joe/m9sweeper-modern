// Verify browser code never imports decorated server DTOs or other backend modules.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../src');
const violations = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
    } else if (entry.isFile() && /\\.(?:ts|tsx|js)$/.test(entry.name)) {
      const source = fs.readFileSync(absolute, 'utf8');
      const imports = /(?:\\b(?:from|import|require)\\s*\\(?\\s*|\\bimport\\s*\\(\\s*)['"`]([^'"`]+)['"`]/g;
      for (const match of source.matchAll(imports)) {
        const specifier = match[1].replace(/\\\\/g, '/');
        if (/(?:^|\\/)backend(?:\\/|$)/.test(specifier)) {
          violations.push(path.relative(root, absolute) + ': ' + specifier);
        }
      }
    }
  }
}
walk(root);
if (violations.length) {
  console.error('Angular source must use browser-side interfaces, not NestJS/backend imports:\\n' + violations.join('\\n'));
  process.exitCode = 1;
} else {
  console.log('PASS: Angular/backend source boundary');
}
