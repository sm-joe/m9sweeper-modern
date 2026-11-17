# Run m9sweeper-modern with Docker Compose

Docker Compose builds and runs the complete **core application** for local Linux development and integration testing: the Angular/NestJS Dash, the Java/Trivy Trawler, PostgreSQL 17, RabbitMQ 4.4, Kubesec and the one-time initialization job. You do not need to install Node.js, Maven or Trivy on the host to build these images.

For installing the Kubernetes product (including node-level scanners), use the [Helm installation guide](../../docs/installation.md). Docker Compose is not a substitute for a Kubernetes cluster.

## Requirements

- Docker Engine and Docker Compose v2 plugin on Linux
- Python 3 for secure first-install credential generation
- Internet access to pull base images and dependencies
- Enough free disk space for Node/Angular, Java, Trivy and database images

```bash
docker version
docker compose version
python3 --version
```

## First installation

### 1. Generate your private stack configuration

```bash
cd platform/docker-compose
umask 077
read -r -p 'Administrator email: ' ADMIN_EMAIL
python3 ./create-compose-env.py --admin-email "$ADMIN_EMAIL"
chmod 600 .env
```

The generator creates `.env` only if it doesn't already exist. It generates and synchronizes the database password, RabbitMQ password, JWT secret, administrator password and scanner API keys. It does **not** display their values. Back up `.env` securely: those credentials are persisted in the database and RabbitMQ volumes.

To customize optional SMTP, Cron schedule, or the external scanner report endpoint, edit `.env` before starting. The standard cluster inventory schedule is every five minutes.

### 2. Build and start the complete stack

```bash
docker compose -p m9sweeper config --quiet
docker compose -p m9sweeper up --build -d
docker compose -p m9sweeper ps -a
```

Compose starts PostgreSQL and RabbitMQ, waits for their health checks, starts Dash, and executes the database/bootstrap initialization. Trawler waits for **successful** initialization before consuming image scan jobs. If the first-install job exits nonzero, fix the error rather than forcing Trawler to start.

### 3. Verify the running services

```bash
docker compose -p m9sweeper ps -a
docker compose -p m9sweeper logs --tail=100 dash-init
docker compose -p m9sweeper logs --tail=100 dash trawler
docker compose -p m9sweeper exec -T rabbitmq rabbitmq-diagnostics -q check_running
docker compose -p m9sweeper exec -T rabbitmq \
  rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

**Expected:** PostgreSQL and RabbitMQ healthy; Dash, Trawler and Kubesec running; `dash-init` exited **0**; the health endpoint returns a successful JSON response. Once the scanner connects, RabbitMQ should show a consumer for `trawler_queue`. A consumer alone does not prove that scan results reached the Dashboard.

Open [http://localhost:3000](http://localhost:3000) and sign in with the administrator account configured in `.env`. On first install only, you can inspect the private `.env` locally to retrieve that password. Never paste it into public logs or issues.

## Build individual images

These commands use existing multi-stage Dockerfiles. Angular is compiled independently of NestJS and its static assets are packaged into the Dash image.

```bash
cd ../..
docker build --file platform/Dockerfile \
  --tag m9sweeper-dash:local platform
docker build --file platform/trawler/Dockerfile.jvm \
  --tag m9sweeper-trawler:local platform/trawler
```

Check their executable runtimes:

```bash
docker run --rm --entrypoint node m9sweeper-dash:local --version
docker run --rm --entrypoint java m9sweeper-trawler:local -version
docker run --rm --entrypoint trivy m9sweeper-trawler:local --version
```

The images run as non-root users. Base-image and scanner versions are controlled in the Dockerfiles; published Kubernetes release images are separately pinned to immutable digests.

## Scanner report ingestion from Kubernetes Jobs

If the Dashboard displays **"Not configured — scanner report uploads may fail"**, the Compose environment has no configured Pod-reachable `SCANNER_REPORT_INGESTION_URL`. This is expected on a fresh host-only installation. The browser can access `http://localhost:3000`, but **a Kubernetes Job cannot use that address to reach your Docker host**.

Choose an address based on actual cluster networking:

| Setup | Callback origin for `SCANNER_REPORT_INGESTION_URL` |
| --- | --- |
| Docker Compose on a reachable private Linux host | `http://<your-private-host-IP>:3000` for kube-bench only |
| kube-hunter or an HTTPS-only scanner | A real trusted HTTPS origin routed to Compose through an authorized internal TLS reverse proxy |
| Dash itself deployed inside Kubernetes | The actual Dash Kubernetes Service URL for kube-bench; private HTTPS gateway for kube-hunter |

**Do not copy the examples literally:** `<your-private-host-IP>` must be replaced with your real routable address. The backend checks URL syntax but cannot prove Pod-to-host reachability. Kubernetes Job callback traffic must be tested independently.

### 1. Allow scanner traffic to reach Dash (only when required)

Compose defaults to `127.0.0.1:3000:3000` so the Dashboard is **not** exposed on external network interfaces. For kube-bench on a trusted private network, set these existing keys in your **current** `.env` file without regenerating it:

```dotenv
SCANNER_REPORT_BIND_ADDRESS=<your-private-host-IP>
SCANNER_REPORT_BIND_PORT=3000
SCANNER_REPORT_INGESTION_URL=http://<your-private-host-IP>:3000
```

Use only a real interface address assigned to your Linux host and reachable from Kubernetes Pods. Restrict TCP 3000 at the host firewall/security group to authorized scanner Pods or cluster egress ranges; do not use `0.0.0.0` as a shortcut. The Dash UI and admin API share this port, so prefer a private reverse proxy with TLS and access controls for environments outside a trusted local test network.

For kube-hunter, set `SCANNER_REPORT_INGESTION_URL` to the trusted **HTTPS proxy origin** instead, not to plain HTTP. The HTTPS gateway must forward `/api/kubehunter/hunter/{clusterId}` to Compose Dash, preserve `X-API-Key`, and present a certificate trusted by the scanner relay. See the [private HTTPS gateway pattern](../../docs/eks-installation.md#6-kube-hunter-private-https-without-a-public-domain). A Kubernetes Service DNS name alone cannot route to an external Compose container.

### 2. Apply existing Compose settings safely

```bash
cd platform/docker-compose
docker compose -p m9sweeper config --quiet
docker compose -p m9sweeper up -d --no-deps --force-recreate dash
docker compose -p m9sweeper ps dash
docker compose -p m9sweeper exec -T dash printenv SCANNER_REPORT_INGESTION_URL
```

The last command must show your **configured callback origin**, not localhost or an empty line. It prints only the URL, not an API key. Credentials, volumes and the completed initialization Job are preserved.

From a Kubernetes Pod (not your browser), test the real origin before triggering a scan:

```bash
# Set to the SAME actual origin configured in Compose .env.
read -r -p 'Pod-reachable scanner callback origin: ' REPORT_URL
kubectl -n m9sweeper-system run m9-callback-probe \
  --image=curlimages/curl:8.16.0 --restart=Never \
  --env="REPORT_URL=$REPORT_URL" \
  --command -- sh -c 'curl --fail --show-error --silent --max-time 15 "$REPORT_URL/api/health"'
kubectl -n m9sweeper-system wait --for=jsonpath='{.status.phase}'=Succeeded \
  pod/m9-callback-probe --timeout=90s
kubectl -n m9sweeper-system logs m9-callback-probe
kubectl -n m9sweeper-system delete pod m9-callback-probe --ignore-not-found
```

Expected for a direct kube-bench callback: the Pod's `curl` command reaches the Dash health endpoint and returns its successful response. If an HTTPS proxy deliberately exposes only `/api/kubehunter/hunter/{clusterId}`, its `/api/health` URL may return 404 even when the relay path works. In that case test the actual report-ingestion path with an unauthenticated POST: HTTP **401/403** is expected and proves routing to the authentication layer without uploading a report. A DNS, timeout or TLS verification failure means routing or trust must be corrected before scanning. If you are using a private CA, mount the CA into the probe Pod and scanner relay and use certificate verification; **do not use `curl -k` or `--insecure`**.

### 3. Confirm in Dashboard

Refresh the scanner installation dialog. It reads `GET /common/get-config` (authenticated), which should now report a nonempty `data.reportIngestionUrl`. kube-bench accepts Pod-reachable HTTP on a private network; kube-hunter requires a validated HTTPS origin. Then run an authorized scan and confirm its **new report is ingested and rendered**, not just that the Job completed.

## Scanning a Kubernetes cluster from Compose

The Dash container must reach the target Kubernetes API hostname, trust its CA and have a restricted, valid Kubernetes credential. A local workstation `kubectl` connection does not automatically give the container the same access.

For Kind, the optional network override lets Dash resolve the Kind control-plane network hostname:

```bash
cd platform/docker-compose
docker network inspect kind >/dev/null
docker compose -p m9sweeper -f docker-compose.yml -f kind-network.override.yml \
  up -d --no-deps dash
```

Validate the actual API certificate and RBAC; do not disable TLS verification. Existing cluster inventory and image scanning run through the application schedule and queue rather than a manual sync command.

**Scanner boundary:** kube-bench needs Kubernetes node access; kube-hunter scans an authorized Kubernetes target; Falco needs a compatible Linux kernel sensor. Those integrations run using their Kubernetes/Helm deployments, not as equivalent sensor containers in a host-only Compose stack. Their authenticated reports can be sent to a properly reachable Dash ingestion endpoint. For kube-hunter, the relay requires trusted HTTPS (see [EKS guide](../../docs/eks-installation.md)).

## Persistence and upgrades

Compose stores PostgreSQL data in `m9sweeperDbData` and RabbitMQ data in `m9sweeperRabbitData`. Keep both, as well as the original `.env`, across container upgrades:

```bash
docker compose -p m9sweeper down
docker compose -p m9sweeper up --build -d
```

**Important:** Previous development Compose files used **PostgreSQL 15 and RabbitMQ 3.12**. Their existing on-disk data cannot be assumed compatible with PostgreSQL 17 and RabbitMQ 4.4. For a pre-existing stack, take verified logical database and RabbitMQ backups and follow the vendor-supported upgrade/migration path **before** applying the new images. Never point the new major-version containers at old volumes without migration; changing `.env` doesn't repair persisted roles/passwords.

Never run `docker compose down -v` to troubleshoot: it destroys volumes. Never regenerate or overwrite your `.env` for an existing stack. Avoid exposing database or broker ports beyond `127.0.0.1`; the defaults are intended for trusted local development only.

## Continuous integration

The full Platform CI validates Compose configuration and starts the real Dashboard, PostgreSQL, RabbitMQ, Trawler and authenticated scanner APIs in a disposable environment. It also performs browser and security regression checks. A passing image build alone is not proof of deployed scanner functionality.

[Project README](../../README.md) · [Kubernetes installation](../../docs/installation.md) · [EKS scanners](../../docs/eks-installation.md)
