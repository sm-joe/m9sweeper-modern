# Local development with Docker Compose

This Compose configuration runs local m9sweeper dependencies and application components for development and integration testing. For a Kubernetes installation use the published [Helm guide](../../docs/installation.md), not Docker Compose.

## Requirements

- Linux with Docker Engine and the Docker Compose plugin
- Git, Node.js and the build tools required by the checked-out application
- Available local ports used by the Compose configuration

## Configure

```bash
cd platform/docker-compose
cp .env.sample .env
chmod 600 .env
```

Edit `.env` and provide unique passwords, signing secrets and scanner API keys. Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` before initializing your local database. The `.env` file must remain outside version control. Check `docker compose config` before starting.

## Start and verify

```bash
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 dash trawler
```

The local Dashboard normally listens at **http://localhost:3000**. Compose uses PostgreSQL for persistent application data and RabbitMQ for image-scan job delivery. Dash serves the UI and API; Trawler consumes scan jobs; Kubesec analyzes Kubernetes configuration.

Local application scheduling uses Node/NestJS task scheduling, whereas Kubernetes installations use CronJobs. Change scheduling using the documented environment settings only after inspecting the current `.env.sample`.

## Safety and data retention

- Keep database, broker and Dashboard ports bound to localhost or a private trusted development network.
- Never copy private credentials into README examples or Git history.
- Do not run `docker compose down -v` as a troubleshooting step; it destroys Compose volumes.
- A healthy Compose stack does not prove EKS access, runtime Falco detection, kube-bench node coverage or cluster-report ingestion.

## Optional Kind connectivity

A Kind Kubernetes API hostname may resolve only inside the Docker `kind` network. If inventory sync reports `ENOTFOUND`, confirm network connectivity, certificate SANs and Kubernetes RBAC before changing credentials.

```bash
docker network inspect kind >/dev/null
docker compose -f docker-compose.yml -f kind-network.override.yml config --quiet
docker compose -f docker-compose.yml -f kind-network.override.yml up -d --no-deps dash
```

Only use the override when the `kind` network actually exists. The saved Kubernetes API endpoint must be reachable from Dash and validated with its trusted CA. Do not disable TLS verification.

[Project README](../../README.md) · [Kubernetes installation](../../docs/installation.md)
