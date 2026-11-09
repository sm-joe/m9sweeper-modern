#!/usr/bin/env node
// Mechanical compatibility migration for the Angular Material 18 M2 Sass rename.
// Only runs during 17 -> 18; limited to mat.* identifiers in project Sass files.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../platform/dash/frontend/src');
const mappings = new Map([
  ['define-palette', 'm2-define-palette'],
  ['define-light-theme', 'm2-define-light-theme'],
  ['define-dark-theme', 'm2-define-dark-theme'],
  ['define-typography-config', 'm2-define-typography-config'],
  ['define-typography-level', 'm2-define-typography-level'],
  ['get-color-from-palette', 'm2-get-color-from-palette'],
  ['get-color-config', 'm2-get-color-config'],
  ['get-typography-config', 'm2-get-typography-config'],
  ['get-typography-level', 'm2-get-typography-level']
]);
const palettes = [
  'red', 'pink', 'purple', 'deep-purple', 'indigo', 'blue', 'light-blue',
  'cyan', 'teal', 'green', 'light-green', 'lime', 'yellow', 'amber',
  'orange', 'deep-orange', 'brown', 'grey', 'blue-grey', 'gray'
];
function transform(source) {
  let output = source;
  for (const [oldName, newName] of mappings) {
    output = output.split('mat.' + oldName + '(').join('mat.' + newName + '(');
  }
  for (const color of palettes) {
    output = output.split('mat.$' + color + '-palette').join(
      'mat.$m2-' + (color === 'gray' ? 'grey' : color) + '-palette'
    );
  }
  return output;
}
function visit(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(full, files);
    else if (full.endsWith('.scss')) files.push(full);
  }
}
if (require.main === module) {
  const files = [];
  visit(root, files);
  let changed = 0;
  for (const file of files) {
    const input = fs.readFileSync(file, 'utf8');
    const output = transform(input);
    if (input !== output) {
      fs.writeFileSync(file, output);
      changed++;
      console.log('MIGRATED', path.relative(root, file));
    }
  }
  console.log('Angular Material M2 Sass files modified:', changed);
}
module.exports = { transform };
