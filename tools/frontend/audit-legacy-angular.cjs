#!/usr/bin/env node
// Inventory legacy Angular APIs in application source, excluding vendor assets.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../platform/dash/frontend/src');
const patterns = {
  ajsf: /@ajsf\/(core|material)|<json-schema-form\b|\bJsonSchemaFormModule\b|\bMaterialDesignFrameworkModule\b/g,
  flexLayout: /\b(?:fxLayout|fxFlex|fxHide|fxShow|fxLayoutGap|fxLayoutAlign|FlexLayoutModule)\b/g,
  customWebpack: /customWebpackConfig|@angular-builders\/custom-webpack|custom-webpack\.config/g,
  tslint: /\btslint\b|\bcodelyzer\b/g
};
const found = Object.fromEntries(Object.keys(patterns).map(key => [key, []]));

function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (item.isFile() && /\.(ts|html|scss|css)$/.test(item.name)) {
      const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        for (const [category, re] of Object.entries(patterns)) {
          re.lastIndex = 0;
          if (re.test(lines[i])) {
            found[category].push({
              file: path.relative(root, full).replace(/\\/g, '/'),
              line: i + 1,
              excerpt: lines[i].trim().slice(0, 180)
            });
          }
        }
      }
    }
  }
}
walk(root);
for (const [category, items] of Object.entries(found)) {
  console.log('\n' + category + ': ' + items.length + ' source references');
  for (const item of items) console.log('  ' + item.file + ':' + item.line + ' ' + item.excerpt);
}
if (process.argv.includes('--assert-no-legacy')) {
  const count = found.ajsf.length + found.flexLayout.length + found.customWebpack.length + found.tslint.length;
  if (count) {
    console.error('FAIL: legacy frontend APIs remain: ' + count);
    process.exitCode = 1;
  }
}
