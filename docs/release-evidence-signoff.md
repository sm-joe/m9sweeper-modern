# Release sign-off evidence contract

**No production release is authorized merely by a green CI check.** Signed
candidate artifacts are nonproduction integration candidates. A public
production release requires independently reviewed operational evidence.

The following fields must be completed on a **disposable, approved Linux
Kubernetes staging environment** for the exact release commit. Do not commit
real credentials, raw kubeconfigs, PostgreSQL dumps, private DNS, or raw
application logs containing tokens.

Create a private `release-evidence.json` from the template and store it in
your approved secure artifact store. For the proposed release commit:

```sh
python3 tools/security/check_release_signoff.py /secure/release-evidence.json \
  --source-sha "$(git rev-parse HEAD)"
python3 -m unittest tools.security.test_release_signoff -v
```

Example structure (intentional placeholders cause the gate to fail):

```json
{
  "schemaVersion": 1,
  "releaseVersion": "v1.0.0",
  "sourceCommit": "REPLACE_WITH_EXACT_40_CHARACTER_COMMIT",
  "environment": {
    "linuxDistribution": "REQUIRED",
    "kernel": "REQUIRED",
    "kubernetesVersion": "REQUIRED",
    "helmVersion": "REQUIRED"
  },
  "artifacts": {
    "dashDigest": "sha256:REPLACE_WITH_VERIFIED_DIGEST",
    "trawlerDigest": "sha256:REPLACE_WITH_VERIFIED_DIGEST"
  },
  "gates": {
    "trivy_end_to_end": {"status": "pending", "evidence": []},
    "scanner_tenant_isolation": {"status": "pending", "evidence": []},
    "linux_falco_kubebench_kubesec_kubehunter": {"status": "pending", "evidence": []},
    "helm_upgrade_rollback": {"status": "pending", "evidence": []},
    "postgres_backup_restore": {"status": "pending", "evidence": []},
    "signed_images_chart_sbom": {"status": "pending", "evidence": []},
    "linux_docs_and_license_review": {"status": "pending", "evidence": []}
  }
}
```

## Evidence required per gate

- **Trivy:** same scan UUID across RabbitMQ, Java worker, PostgreSQL policy/CVE
  rows, and Angular; prove duplicate-result idempotency, HIGH/CRITICAL
  noncompliance, failure display, bounded retries and durable DLQ.
- **Scanner tenancy:** two distinct clusters and scanner identities; positive A,
  forbidden B, revoked credentials, HTTP status and unchanged PostgreSQL counts.
- **Linux scanners:** real native Falco detection and event display, readable
  kube-bench warnings/PDF, Kubesec scoring, kube-hunter scan report/UI proof.
  A synthetic webhook fixture is not a native Falco proof.
- **Helm:** staging-only fresh install, upgrade, rollback, deployment health and
  persistent volumes without loss. Schema downgrade is a separate operation.
- **PostgreSQL:** disposable scratch restore and source/restore row digests.
  Keep backups private and do not test recovery against live production.
- **Distribution:** source commit, chart and image digests, checksums, SBOM,
  provenance/signature verification from a separate trusted Linux environment.
- **Docs:** Linux-only install, configuration/Secrets, supported-version matrix,
  upgrade, rollback, recovery, limitations and upstream license attribution.

The checker verifies the shape/completeness of supplied evidence only. **It
cannot authenticate a URL, replay a test, verify a signing certificate, or
substitute for human release-owner review.** Store reviewed artifacts with
access-controlled retention, and obtain explicit operator sign-off before tag
publication.
