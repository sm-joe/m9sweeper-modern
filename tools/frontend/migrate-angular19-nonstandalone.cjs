#!/usr/bin/env node
// Angular 19 defaults components, directives and pipes to standalone.
// Preserve existing NgModule declarations by explicitly writing standalone:false
// when the metadata does not already contain a standalone property.
const fs = require('node:fs');
const path = require('node:path');
const frontend = path.resolve(__dirname, '../../platform/dash/frontend');
const ts = require(path.join(frontend, 'node_modules/typescript'));
const root = path.join(frontend, 'src');
const angularDecorators = new Set(['Component', 'Directive', 'Pipe']);

function transform(text, fileName = 'component.ts') {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits = [];
  function walk(node) {
    if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      if (ts.isIdentifier(call.expression) && angularDecorators.has(call.expression.text)) {
        const literal = call.arguments[0];
        if (literal && ts.isObjectLiteralExpression(literal)) {
          const hasStandalone = literal.properties.some(prop => {
            if (!prop.name) return false;
            return (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
              && prop.name.text === 'standalone';
          });
          if (!hasStandalone) edits.push(literal.getStart(source) + 1);
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
  let result = text;
  for (const index of edits.sort((a, b) => b - a)) {
    result = result.slice(0, index) + '\n  standalone: false,' + result.slice(index);
  }
  return result;
}
function files(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
}
if (require.main === module) {
  const entries = [];
  files(root, entries);
  let count = 0;
  for (const file of entries) {
    const old = fs.readFileSync(file, 'utf8');
    const updated = transform(old, file);
    if (old !== updated) {
      fs.writeFileSync(file, updated);
      count++;
      console.log('MIGRATED', path.relative(root, file));
    }
  }
  console.log('Angular 19 non-standalone source files updated:', count);
}
module.exports = { transform };
