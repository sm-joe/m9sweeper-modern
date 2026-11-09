# Angular 17 → 22 migration: release gate

This is an in-progress, **unverified framework migration**, not a claim that Angular 22 is deployed. Source of truth for currently installed versions: `platform/dash/frontend/package.json` and its lockfile.

## Reproducible migration procedure

1. Use a dedicated worktree/branch based on current `main`; don't migrate on `main`.
2. For the first transition (17 → 18), select supported Node.js **20**. For later releases, select a compatible Node.js per https://angular.dev/reference/versions. Angular 22 on Node.js 22 requires at least **22.22.3**.
3. In a clean worktree run `bash scripts/migrate-angular-major.sh 18`. The script intentionally runs the official Angular migrations **without `--force`**. Resolve peer incompatibilities instead of suppressing them.
4. Ensure `npm run build:prod` passes and commit source transformations, `package.json`, and `package-lock.json` together; re-run baseline CI and real Chromium tests before proceeding.
5. Repeat for `19`, `20`, `21`, `22` from the previous passing commit. Do not skip versions.

## Known blockers requiring source migration

- `@angular-builders/custom-webpack` major 17 is coupled to Angular 17. The custom Webpack URL shim must be removed or migrated before a later build pipeline is considered supported.
- Vendored `@ajsf/material` 0.8.0 peers on deprecated `@angular/flex-layout` 14 beta, and its core package peers on RxJS 6. The app's schema-based forms must be migrated with equivalent validation, default values and submitted payloads before removal.
- Retire Protractor and TSLint from both dependency declarations and lockfile; replace TSLint builder with Angular ESLint. Playwright is already integrated at `tools/browser-e2e`, but coverage needs to expand beyond sign-in.
- Upgrade Material/CDK **with each Angular major** and visually inspect the custom M2 styles and dialogs.
- Browser regression must exercise authenticated dashboard, cluster onboarding/list/detail, scanner run and failure states, policy CRUD/authorization, and report rendering. CI green on a standalone frontend build is insufficient for those claims.

## Acceptance evidence per major

Record the exact commit SHA, Node version, CLI/core/Material/CDK/TypeScript versions, install outcome, `npm run build:prod` result, browser E2E result, and full-stack scanner regression result. Never merge an unverified major-version change.

The migration runner does not edit any database volumes or Docker/Kubernetes runtime, and will reject dirty worktrees and `main`.
