# Kubernetes trawler image discovery

The agent can read all Pods through the Kubernetes API using its mounted service-account
token and cluster CA. It discovers regular, init, and ephemeral container image names,
deduplicates them, and scans the images with Trivy.

Set `M9_SCAN_SOURCE=kubernetes` and `M9_CLUSTER_ID=<stable-cluster-id>` on the
trawler **in a running Kubernetes cluster**. The RBAC role in
`deploy/helm/m9sweeper/templates/rbac.yaml` grants list pods.
Do not set this mode in local Compose without a Kubernetes service account.

Security/operational restrictions:
- list-only Kubernetes discovery, no mutating API requests
- server certificate verified against service-account CA
- no fallback to arbitrary image lists when discovery fails
- 500 unique images safety cap and paginated Pods API (500 per page)
- images discovered by *tag*, not resolved workload digests yet; do **not** use for admission enforcement
- Trivy scan execution remains sequential and runs every scan cycle
- no persisted workload→image→namespace relationships yet

The Helm chart is not yet a validated production installer, and no Kubernetes
end-to-end test has been performed. The default Docker Compose mode is still
`M9_SCAN_SOURCE=images` with `M9_SCAN_IMAGES`.
