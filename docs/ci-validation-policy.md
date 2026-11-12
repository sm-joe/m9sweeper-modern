# CI validation policy for m9sweeper modernization

Modernization uses **fast checks during implementation** and **full integration validation at a review gate**. Do not run the entire Kubernetes/Compose/Trivy/Helm matrix for every small commit.

## Automatic checks during PR iteration

- Changes to `platform/dash/backend/**`: **Backend NestJS fast checks** (SWC build, Jest, security contracts, route inventory).
- Changes to `platform/dash/frontend/**`: **Frontend Angular fast checks** (ESLint, client boundary, production compilation).
- Dedicated release and scanner workflows retain their own path-specific triggers.
- **Full m9sweeper platform source validation** does *not* run on ordinary PR open or synchronize events.

## Explicit full validation before merge

After finalizing a PR, run the full platform matrix against the **latest PR head SHA** using one of:

1. Add the `ci/full` label to the PR. For later commits, remove and re-add the label to trigger a fresh run.
2. Mark a draft PR **Ready for review**. This triggers the matrix once at that transition.
3. In **Actions > Full m9sweeper platform source validation > Run workflow**, select the PR branch, then run it (also possible with `gh workflow run revamp-platform-ci.yml --ref <branch>`).

**Always verify the run commit SHA matches the PR head before merging.**
An earlier successful run does not validate subsequent commits. If changes land after a full run, rerun the full gate. GitHub's `main` push integration run remains enabled as post-merge assurance.

If branch protection requires a full-platform check, ensure the repository's required status settings match this explicit gate policy. GitHub branch protection is not changed by this workflow. Do not bypass required checks.

## Fast, full, and runtime-verified are distinct

- Fast-green: component compilation and unit/security checks passed.
- Full-green: all applicable container, scanner, Kind, Helm, runtime, and packaging jobs passed at that SHA.
- Runtime-verified: the operator validated the relevant registered cluster, API/auth, or scanner path. This is not implied by either CI status.

Use an explicit full run for changes to authentication, authorization, scan result ingestion, policy compliance, database migrations, deployment/Helm, API contracts, and releases. For these security-critical changes, don't merge without full-green and targeted runtime verification.

## Useful commands

```powershell
# Fast checks run automatically on PR commits when their paths change.
gh pr checks <number>

# Full validation against a PR branch at the final commit:
gh workflow run revamp-platform-ci.yml --ref <branch>

# Review full run jobs and their commit:
gh run list --workflow revamp-platform-ci.yml --branch <branch> --limit 5
gh run view <run-id>
```

Local integration tests remain independent of CI and should use PowerShell for the Windows test setup. The delivered product targets Linux/Kubernetes.
