# Runtime and browser modernization — first integrated milestone

The **public m9sweeper-modern** project is migrating the inherited platform without discarding its real scanner and CIS functionality.

## Implemented runtime baseline

- Java scanner/trawler: **Java 21 LTS**, compiled with Maven `--release 21`; the existing JVM container already uses Temurin 21. CI verifies every compiled scanner class is Java 21 bytecode and runs the original scanner tests.
- NestJS application: **Node 22 LTS** for the runtime container and standalone backend CI tests. The production runner and release runner use Node 22.
- Angular: still Angular 17, temporarily built with Node 20 because **Angular 17 does not officially support Node 22**. This Node 20 *build toolchain* is isolated from the Node 22 running backend and must be eliminated when the Angular framework is upgraded. Do not claim the Angular upgrade is complete.
- Replaces the old Selenium/Protractor-only acceptance approach with a **standalone Playwright 1.65 Chromium test harness** for the full real Angular app. Browser tests check public sign-in, protected route redirect, and real admin sign-in to the security dashboard backed by the disposable CI Compose PostgreSQL instance. Credentials are read from the CI-generated private environment, not hardcoded.

## Linux developer checks

Java: `cd platform/trawler && ./mvnw -B -ntp test` (requires Java 21). For Java image: `docker build -f platform/trawler/Dockerfile.jvm -t m9-trawler:dev platform/trawler`.

Angular browser acceptance, with a **disposable running** Linux Compose install and test account: `cd tools/browser-e2e && npm install && npx playwright install chromium && npm test`. Requires Node 22 or newer. Do not aim these tests at production: real login credentials and cluster inventory are used.

The primary app CI runs the browser tests after starting the real NestJS/Angular/Postgres/RabbitMQ Compose stack and before destroying it. Failed Playwright traces are uploaded for debugging. The working user's Compose and Kind environments are not affected.

## Next required modernization milestones

1. Upgrade Angular 17 through supported intermediate major versions, eliminate Angular 14 Flex Layout/AJSF and Protractor/TSLint, regenerate lockfile and replace obsolete webpack tooling. Modernize to standalone components and Signals incrementally.
2. Upgrade NestJS 10 and its integrations to a maintained release, migrate AWS SDK v2 and legacy OAuth/LDAP and Kubernetes clients; update and test lockfiles.
3. Remove the legacy GraalVM Java 17 build route or rebuild it on a supported native-image toolchain, preserve working Java21 scanner engine and RabbitMQ reliability.
4. Publish supported Kubernetes versions, deploy/upgrade/restore evidence, SBOM/signature/security policy and a reproducible public release.

Passing the CI milestone proves the specific tested runtimes and browser workflows. It does not certify all scanners or production readiness.
