# Angular 17 → 22 migration: release gate

## Angular 22 compiled candidate (not yet a general-availability release)

The branch now declares Angular Core 22.2.5, Material/CDK 22.2.6 and TypeScript 6.0.2. The Angular 22 compatibility probe built the upgraded dependency graph successfully and promoted the source/lockfile candidate. The separate full-platform CI (including the Docker image and authenticated Playwright tests) must pass on the **promoted commit** before any merge.

The Gatekeeper constraint editor no longer imports the vendored AJSF Angular components. It uses an Angular-native schema-property editor with required-field, numeric, enum and structured JSON validation. Runtime equivalence for arbitrary OpenAPI schemas still requires explicit cluster-level acceptance testing; do not claim complete schema coverage based on compilation alone.

TypeScript 6 enables stricter defaults for old projects. The migration currently records `strict: false` explicitly to preserve the earlier TypeScript 5 checking baseline; it retains Angular template and DI checking. Treat incremental strict typing as separate tech debt, not as a completed quality improvement. The legacy `baseUrl` resolution is retained under the TypeScript 6 deprecation compatibility setting until the imports are migrated.

**Remaining technical debt:** dependency declarations still include vendored AJSF/Flex Layout, Protractor and TSLint; the custom Webpack builder and source migration collections are not fully retired. The compatibility probes set `M9_SKIP_ANGULAR_MIGRATIONS=1`; they verify compilation, not execution of all official `ng update` transformations. Do not mark the six-step platform modernization as wholly complete on this basis.

This is an in-progress, **unverified framework migration**, not a claim that Angular 22 is deployed. Source of truth for currently installed versions: `platform/dash/frontend/package.json` and its lockfile.

## Candidate checkpoint: Angular 18

On migration branch `modernize/angular-sequential-migrations`, commit `817ab771` introduced Angular Core/Material/CDK 18.2.14, CLI 18.2.21, TypeScript 5.5.4, and codemodded legacy M2 Sass references. A disposable production compile succeeded in GitHub Actions run `42693374489` before the branch promotion. **Official `ng update` source migrations were not executed in that compatibility run**; the source change is an intermediate compatibility candidate and must not be represented as the completed upgrade.

Future acceptance requires full branch CI and browser tests against this committed dependency graph, then the official Angular migration steps and each subsequent major. Do not merge solely on the one build-probe result.

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
