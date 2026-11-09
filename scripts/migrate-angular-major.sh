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
# npm exec/npx can prefer the already-installed Angular 17 binary; install the
# target CLI locally without writing the lockfile before invoking migrations.
npm install --no-save --no-package-lock --legacy-peer-deps --no-audit --no-fund "@angular/cli@$target"
./node_modules/.bin/ng update "@angular/cli@^$target" "@angular/core@^$target"
npx ng update "@angular/material@^$target"
npm run build:prod
printf '\nPASS: Angular %s production build. Review migrations and commit generated lockfile.\n' "$target"
printf 'NEXT: execute Playwright acceptance and scanner regression before promotion.\n'
