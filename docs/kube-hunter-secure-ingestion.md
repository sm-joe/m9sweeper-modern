# kube-hunter report-ingestion acceptance (development integration)

The kube-hunter Pod must never send results to browser localhost. The Angular UI uses the validated `SCANNER_REPORT_INGESTION_URL` and refuses to produce a command when it is missing or loopback. The chart requires an existing Kubernetes Secret for the complete callback URL; the deprecated plain `dispatchUrl` value is ignored.

## Configure and test

1. Configure `SCANNER_REPORT_INGESTION_URL` on Dash using a URL reachable from the target Kubernetes cluster. The browser `SERVER_BASE_URL` may differ.
2. Rotate any ingestion API key that was printed in logs, Helm commands or pasted into a conversation. Use a dedicated least-privilege credential.
3. Create the Secret in the namespace of the kube-hunter Job, without typing the token into shell command arguments. For example, store the complete URL (including the currently required query token) in a restricted-permission local file and run:

   ```sh
   kubectl -n m9sweeper-system create secret generic m9sweeper-kube-hunter-dispatch --from-file=dispatchUrl=./restricted-kube-hunter-callback-url.txt
   ```

   Do not commit this file. Securely delete it once the Secret is created; Kubernetes Secret data is not encrypted unless at-rest encryption is enabled. Restrict Secret read permissions.
4. Confirm the endpoint is reachable from a Pod in the target cluster using an uncredentialed health endpoint; use HTTPS with a trusted CA outside isolated development. A health response does **not** verify ingestion authentication or persistence.
5. Install the checked-out local chart, not the historical upstream published chart:

   ```sh
   helm upgrade --install kube-hunter ./platform/manifests/charts/kube-hunter -n m9sweeper-system --create-namespace --set-string dispatchAuth.existingSecret=m9sweeper-kube-hunter-dispatch --set cronjob.enabled=false
   ```
6. Check kube-hunter Job logs, expect an HTTP 2xx response on report delivery, and verify a new cluster-scoped report persisted in the database and appeared on the dashboard.
7. Negative test: an unreachable endpoint or invalid credential must **not** display a new, clean report; verify no misleading status is persisted.

## Security and production limitations

- The legacy kube-hunter dispatcher supports a URL-based token; secret-backed environment injection prevents exposing it in the generated Helm command and rendered `env.value`, but does not remove URL/query-string exposure inside the container, kube-hunter error logs, reverse-proxy logs or some monitoring tools.
- A dedicated relay using header-based authentication and restrictive report submission authorization is needed before production release.
- `GET /api/kubehunter` response authorization and cluster isolation require a separate security audit.
- kube-hunter 0.6.8 is an old image; security findings and API access permissions need manual review.
- This is a development acceptance path only. Do not claim a scanner run succeeded until actual delivery and database persistence are verified.
