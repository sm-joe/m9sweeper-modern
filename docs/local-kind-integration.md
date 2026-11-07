# Local Kind integration: stable Docker network attachment

This optional Compose overlay automatically connects the m9sweeper-new Dash
container to the external Docker network named `kind`, while preserving
connections to Postgres, RabbitMQ and Kubesec on the default Compose network.

Prerequisites: Docker Engine, a Kind cluster named `kind` using the same Docker
daemon, and `platform/docker-compose/.env` with unique secrets.

```bash
cd platform/docker-compose
docker compose -f docker-compose.yml -f docker-compose.kind.yml up -d --build
docker inspect m9sweeper-dash --format '{{json .NetworkSettings.Networks}}'
```

The dashboard must show both `default` and `kind` network attachments.
For local RC testing, set `SCANNER_REPORT_INGESTION_URL` to a URL **actually
reachable from Kubernetes Pods**, validated by an in-cluster health request.
Do not blindly substitute the Compose network IP or use localhost.

The dashboard's Kind bridge IP can change when containers are recreated. This
overlay solves network **membership**, not stable service discovery. A real
Kubernetes deployment should expose the callback via a TLS-authenticated internal
Service. Do not expose Docker bridge ports to the public Internet.

Retain all original upstream license notices when redistributing this product.
