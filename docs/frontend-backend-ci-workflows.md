# Frontend / backend development and CI lanes

The original full-platform workflow built Angular, NestJS, Docker, JVM trawler, database/broker, Playwright, Trivy, Kubesec, Helm and three Kind clusters on **every** frontend-only PR. This slowed routine UI and API development and duplicated operator Docker rebuilds.

## Focused pull requests

| Change type | Fast PR workflow | Full integration |
| --- | --- | --- |
| Angular UI, TypeScript, styles, components | `frontend-ci.yml`: Angular 22 boundary, ESLint and production SPA build | Automatically on merge to `main`; full PR gate only if other integration paths change |
| NestJS non-security modules, DTO and supporting code | `backend-ci.yml`: Node 22, SWC build, Jest, route inventory | Automatically on merge to `main`; full PR gate for security-critical routes, providers and database migrations |
| Authentication, cluster authorization, scanners, security reports/policies/exceptions and migrations | `backend-ci.yml` **and** `revamp-platform-ci.yml` | Full PR gate before merge |
| Java trawler, Compose, Helm, Docker, Kubernetes, Linux scripts and integration tests | `revamp-platform-ci.yml` | Full PR gate before merge |
| Backend DTOs used by Angular | Angular workflow also runs to catch cross-boundary regressions | Full gate when security-critical modules change |
| Release candidates | Signed candidate artifact workflow is manually dispatched after full `main` checks | Signed OCI/Helm, runtime, storage and real native Linux gates remain separate |

The frontend workflow still installs locked backend Node dependencies because some legacy DTOs are consumed during Angular compilation. **Removing that frontend/backend coupling is the next architectural improvement**, but should be validated with a dedicated shared browser-safe contract package first; do not silently remove the dependency and break the build.

## Local Windows PowerShell

For Angular-only changes:

```powershell
Set-Location D:\AWS\repos\m9sweeper-modern\platform\dash\frontend
npm ci --legacy-peer-deps
npm run check:client-boundary
npm run lint
npm run build:prod
```

For NestJS-only changes:

```powershell
Set-Location D:\AWS\repos\m9sweeper-modern\platform\dash\backend
npm ci --legacy-peer-deps
npm run build:api
npm test -- --runInBand
```

No Docker rebuild is necessary for local source-only lint/build/unit test loops. Rebuild **affected images** only for integration/release validation or when deployment/runtime behavior changes.

## Safety and merge policy

- Backend security/authorization and scanner code still require the complete integration gate **before** merge.
- A pure UI or non-security backend PR can use fast checks, but the full platform continues to execute on `main` after merge. Protect `main` with required focused jobs; do not bypass failed or pending checks.
- Build status is not evidence of full scanner behavior, production Falco kernel detection or Helm data recovery.
- This change adjusts CI routing only. It does not modify product services, existing runtime containers, cluster registrations, PVCs or credentials.
