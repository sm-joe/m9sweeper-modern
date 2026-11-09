# Kind staging: private TLS for the kube-hunter report relay

**Scope:** isolated local Kind acceptance only. This is not a production ingress and does not terminate TLS between the proxy and Dash. The working `kube-hunter` release and Compose networks must remain unchanged during staging.

The Docker-connected Dash instance responds to `http://172.24.0.3:3000/api/health` from Kind. A dedicated ClusterIP proxy named `m9-dash-tls` will present a short-lived, privately signed certificate at `https://m9-dash-tls.m9sweeper-system.svc.cluster.local:443`. The proxy then forwards to the existing private HTTP Dash endpoint. If the Dash Kind-network IP changes, update `DASH_HTTP_UPSTREAM` in the proxy Deployment after verifying the new IP; do not replace the Compose Dash container.

## 1. Create a two-day local CA and DNS certificate

From the repository root, on a Linux machine with OpenSSL:

```sh
sh deploy/kind/generate-proxy-certs.sh deploy/kind/private-tls
```

On the existing Windows Docker Desktop test machine, use PowerShell:

```powershell
cd D:\AWS\repos\m9sweeper-modern
git fetch origin
git switch security/p0-retire-query-key-default
git pull --ff-only origin security/p0-retire-query-key-default
docker run --rm -v "${PWD}:/work" -w /work alpine:3.21 sh -c "apk add --no-cache openssl >/dev/null && sh deploy/kind/generate-proxy-certs.sh /work/deploy/kind/private-tls"
```

These are disposable lab certificates. Private keys reside in the ignored `deploy/kind/private-tls/` directory. Keep the CA key outside Kubernetes; do not commit or share it.

## 2. Install only a separate staging proxy

PowerShell:

```powershell
$ns = "m9sweeper-system"
$certs = ".\deploy\kind\private-tls"
kubectl -n $ns create secret tls m9-dash-tls --cert="$certs\tls.crt" --key="$certs\tls.key" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n $ns create secret generic m9-dash-relay-ca --from-file="ca.crt=$certs\ca.crt" --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f .\deploy\kind\m9-dash-tls-proxy.yaml
kubectl -n $ns rollout status deployment/m9-dash-tls-proxy --timeout=120s
kubectl -n $ns get svc m9-dash-tls
```

The proxy has no externally exposed LoadBalancer or NodePort.

## 3. Validate TLS with a Pod (never use -k or skip certificate verification)

Run a temporary Kubernetes Pod with the public CA Secret mounted as a file:

```powershell
@'
apiVersion: v1
kind: Pod
metadata:
  name: m9-dash-tls-probe
  namespace: m9sweeper-system
spec:
  restartPolicy: Never
  automountServiceAccountToken: false
  containers:
    - name: curl
      image: curlimages/curl:8.11.1
      command: ["sh", "-c"]
      args:
        - 'curl --fail --show-error --silent --cacert /tls/ca.crt https://m9-dash-tls.m9sweeper-system.svc.cluster.local/api/health'
      volumeMounts:
        - name: ca
          mountPath: /tls
          readOnly: true
  volumes:
    - name: ca
      secret:
        secretName: m9-dash-relay-ca
'@ | kubectl apply -f -
kubectl -n m9sweeper-system wait --for=jsonpath='{.status.phase}'=Succeeded pod/m9-dash-tls-probe --timeout=90s
kubectl -n m9sweeper-system logs pod/m9-dash-tls-probe
kubectl -n m9sweeper-system delete pod m9-dash-tls-probe
```

Expected response is the same PostgreSQL health JSON obtained through the existing HTTP endpoint. A nonzero curl result, hostname mismatch, invalid CA, or upstream failure **must stop migration**.

## 4. Stage new kube-hunter release, not the existing one

Create a dedicated KUBEHUNTER-authorized scanner identity with an explicit write grant for the test cluster, and write its newly issued API key into an access-restricted local file. Do not echo the secret or put it in a CLI argument, URL, ConfigMap or Helm values.

```powershell
kubectl -n m9sweeper-system create secret generic m9sweeper-kube-hunter-relay-auth --from-file=apiKey=C:\secure\kube-hunter-scanner-token --dry-run=client -o yaml | kubectl apply -f -
helm upgrade --install kube-hunter-secure-probe .\platform\manifests\charts\kube-hunter -n m9sweeper-system --set cronjob.enabled=false --set reportRelay.enabled=true --set-string reportRelay.existingSecret=m9sweeper-kube-hunter-relay-auth --set-string reportRelay.caSecret=m9-dash-relay-ca --set-string reportRelay.targetUrl=https://m9-dash-tls.m9sweeper-system.svc.cluster.local/api/kubehunter/hunter/1
```

Use the **actual numeric cluster ID** in the target URL (1 is an example). Do not copy a legacy `?key=` token into the target. Inspect the new Job and native relay init container; check report persistence in PostgreSQL and Angular; ensure a rejected token does not create a false success. Keep the old `kube-hunter` release untouched.

The Python relay currently returns HTTP 502 on upstream failure; kube-hunter reporter error handling must be checked in live staging to prove failure is not silently classified as a complete scan. The native relay init-container design requires a Kubernetes release supporting restartable sidecars (Kubernetes 1.29+). Staging is not complete until CA trust, API authorization, database persistence and denial tests all succeed.

## Rollback / cleanup

Delete only staging resources, never the existing working release or storage:

```powershell
helm uninstall kube-hunter-secure-probe -n m9sweeper-system
kubectl -n m9sweeper-system delete deployment m9-dash-tls-proxy --ignore-not-found
kubectl -n m9sweeper-system delete svc m9-dash-tls --ignore-not-found
kubectl -n m9sweeper-system delete configmap m9-dash-tls-proxy-config --ignore-not-found
kubectl -n m9sweeper-system delete secret m9-dash-tls m9-dash-relay-ca m9sweeper-kube-hunter-relay-auth --ignore-not-found
```

Record redacted evidence and commit SHA before approving PR #11. Do not merge solely on Helm rendering, health or scanner output from the legacy callback.
