#!/usr/bin/env bash
# Upgrade only one Angular major per invocation on a clean migration branch.
set -euo pipefail

usage() {
  echo 'Usage: bash scripts/migrate-angular-major.sh <18|19|20|21|22> [--preflight]' >&2
  exit 2
}
[[ $# -ge 1 && $# -le 2 ]] || usage
target="$1"
[[ "$target" =~ ^(18|19|20|21|22)$ ]] || usage
mode="${2:-}"
[[ -z "$mode" || "$mode" == '--preflight' ]] || usage

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
frontend='platform/dash/frontend'
[[ -f "$frontend/angular.json" && -f "$frontend/package-lock.json" ]] || {
  echo 'ERROR: Expected m9sweeper frontend workspace is missing.' >&2; exit 1;
}
current="$(node -p "require('./$frontend/package.json').dependencies['@angular/core'].match(/\\d+/)[0]")"
if [[ "$current" -ne $((target-1)) ]]; then
  echo "ERROR: Angular $current -> $target is invalid. Upgrade one major at a time." >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
node_minor="$(node -p 'process.versions.node.split(".")[1]')"
node_patch="$(node -p 'process.versions.node.split(".")[2]')"
if [[ "$target" -eq 18 && "$node_major" -ne 20 ]]; then
  echo 'ERROR: Use Node.js 20 for Angular 17 -> 18. Angular 17 does not support Node.js 22.' >&2; exit 1
fi
if [[ "$target" -eq 22 && "$node_major" != 22 && "$node_major" != 24 && "$node_major" != 26 ]]; then
  echo 'ERROR: Angular 22 requires Node.js 22, 24 or 26 on supported minimum patches.' >&2; exit 1
fi
if [[ "$target" -eq 22 && "$node_major" -eq 22 ]] && {
  [[ "$node_minor" -lt 22 ]] || { [[ "$node_minor" -eq 22 && "$node_patch" -lt 3 ]]; }; }; then
  echo 'ERROR: Angular 22 requires Node.js >=22.22.3 in the Node 22 line.' >&2; exit 1
fi
if [[ "$target" -ge 20 ]] && [[ "$node_major" -eq 20 ]] && [[ "$node_minor" -lt 19 ]]; then
  echo 'ERROR: Angular 20+ requires Node.js >=20.19.0 in the Node 20 line.' >&2; exit 1
fi

if [[ "$mode" == '--preflight' ]]; then
  echo "PASS: Angular $current -> $target major transition and Node $node_major.$node_minor.$node_patch preflight"
  echo 'NOTICE: This does not verify third-party peer dependencies or compilation.'
  exit 0
fi

[[ -z "$(git status --porcelain)" ]] || {
  echo 'ERROR: Worktree is dirty. Commit/stash changes on your migration branch first.' >&2; exit 1
}
[[ "$(git branch --show-current)" != 'main' ]] || {
  echo 'ERROR: Never execute migrations directly on main.' >&2; exit 1
}

cd "$frontend"
echo "UPGRADING Angular $current -> $target. No --force: resolve dependency conflicts instead."
npm ci --legacy-peer-deps --no-audit --no-fund
# A legacy Angular CLI sometimes downloads the latest CLI, even for a targeted
# update. Install matching packages first, then run each versioned migration.
case "$target" in
  18) ts_version='~5.5.4' ;;
  19) ts_version='~5.8.3' ;;
  20|21) ts_version='~5.9.3' ;;
  22) ts_version='~6.0.2' ;;
esac
ng_packages=(
  @angular/animations @angular/common @angular/core @angular/forms
  @angular/platform-browser @angular/platform-browser-dynamic @angular/router
  @angular/cdk @angular/material
)
prod_versions=()
for pkg in "${ng_packages[@]}"; do prod_versions+=("$pkg@$target"); done
npm install --save --legacy-peer-deps --no-audit --no-fund "${prod_versions[@]}"
npm install --save-dev --legacy-peer-deps --no-audit --no-fund \
  "@angular/cli@$target" "@angular/compiler@$target" "@angular/compiler-cli@$target" \
  "@angular/language-service@$target" "@angular-devkit/build-angular@$target" \
  "@angular-builders/custom-webpack@$target" "typescript@$ts_version"
if [[ "$target" -eq 22 ]]; then
  # ngx-charts 20.x imports removed ComponentFactoryResolver; 25.x supports Angular 22.
  npm install --save --legacy-peer-deps --no-audit --no-fund '@swimlane/ngx-charts@^25.0.3'
fi
if [[ "$target" -ge 21 ]]; then
  # Angular 21 packages expose secondary entrypoints through package exports.
  # Resolve these under TypeScript's supported bundler resolution mode.
  node - <<'JS'
const fs = require('node:fs');
const path = 'tsconfig.json';
const config = JSON.parse(fs.readFileSync(path, 'utf8'));
config.compilerOptions.moduleResolution = 'bundler';
fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
JS
fi
if [[ "$target" -eq 22 ]]; then
  # TypeScript 6 defaults strict=true where this legacy TS 5 workspace had
  # implicit strict=false. Preserve the existing baseline during the framework
  # upgrade; incremental strict typing remains a separate acceptance task.
  # Remove now-obsolete flags rather than silencing deprecation diagnostics.
  node - <<'JS'
const fs = require('node:fs');
const path = 'tsconfig.json';
const config = JSON.parse(fs.readFileSync(path, 'utf8'));
// Retain baseUrl: legacy 'src/app/...' imports depend on it. TypeScript 6
// deprecates this setting, but replacement paths are a separate migration.
config.compilerOptions.baseUrl = './';
config.compilerOptions.ignoreDeprecations = '6.0';
delete config.compilerOptions.downlevelIteration;
config.compilerOptions.strict = false;
fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
JS
fi
if [[ "$target" -ge 19 ]]; then
  # TypeScript 5.8 must not compile the legacy Node 18 declaration package.
  npm install --save-dev --legacy-peer-deps --no-audit --no-fund '@types/node@^20'
fi
if [[ "$target" -ge 19 ]]; then
  # Angular 19+ build tooling expects AJV 8; vendored AJSF still declares AJV 6.
  # npm must preserve AJV 6 underneath AJSF or the candidate is not acceptable.
  npm install --save --legacy-peer-deps --no-audit --no-fund 'ajv@^8'
  node - <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const legacyDir = path.resolve(root, 'vendor/@ajsf/core');
const legacyResolved = require.resolve('ajv/package.json', { paths: [legacyDir] });
const legacy = require(legacyResolved).version;
if (!legacy.startsWith('6.')) {
  throw new Error('AJSF requires AJV 6 but resolved ' + legacy + ' at ' + legacyResolved);
}
const modern = require('./node_modules/ajv/package.json').version;
if (!modern.startsWith('8.')) throw new Error('Angular build requires AJV 8; found ' + modern);
console.log('PASS: Angular build AJV', modern, 'and isolated AJSF AJV', legacy);
JS
fi
if [[ "$target" -eq 19 ]]; then
  node "$repo_root/tools/frontend/migrate-angular19-nonstandalone.test.cjs"
  node "$repo_root/tools/frontend/migrate-angular19-nonstandalone.cjs"
fi
if [[ "$target" -eq 18 ]]; then
  # Angular Material 18 namespaces legacy Material 2 Sass APIs under m2-*.
  node "$repo_root/tools/frontend/migrate-material-m2.cjs"
fi
if [[ "${M9_SKIP_ANGULAR_MIGRATIONS:-0}" == "1" ]]; then
  echo 'PROBE ONLY: checking upgraded dependency compilation; official source migrations are NOT executed.'
else
  for pkg in @angular/cli @angular/core @angular/material; do
    ./node_modules/.bin/ng update "$pkg@$target" --migrate-only --from="$current" --to="$target" --allow-dirty
  done
fi
npm run build:prod
printf '\nPASS: Angular %s production build. Review migrations and commit generated lockfile.\n' "$target"
printf 'NEXT: execute Playwright acceptance and scanner regression before promotion.\n'
