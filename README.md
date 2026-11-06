# m9sweeper Modernization Foundation

This is a **source-grounded architecture and executable TypeScript parser slice**, not a completed replacement platform. Frontend, API transport, scanner runners and admission webhook still need implementations and published images. The Helm chart is deliberately fail-closed until image references and a pre-created secret are supplied.

## Run parser tests

```bash
cd backend
npm install
npm run build
npm test
```

## Install chart after building/publishing all three images

```bash
kubectl apply -f deploy/manifests/namespace.yaml
kubectl -n m9sweeper-system create secret generic m9sweeper-credentials \
  --from-literal=jwt-secret='REPLACE_WITH_RANDOM_32+_BYTES' \
  --from-literal=agent-api-key='REPLACE_WITH_RANDOM_VALUE' \
  --from-literal=super-admin-email='admin@example.com' \
  --from-literal=super-admin-password='REPLACE_WITH_RANDOM_VALUE' \
  --from-literal=postgres-password='REPLACE_WITH_RANDOM_VALUE'
helm lint deploy/helm/m9sweeper --set dash.image.repository=registry.example/m9-dash --set dash.image.tag=VERSION --set backend.image.repository=registry.example/m9-backend --set backend.image.tag=VERSION --set trawler.image.repository=registry.example/m9-trawler --set trawler.image.tag=VERSION
helm upgrade --install m9 deploy/helm/m9sweeper -n m9sweeper-system -f deploy/helm/m9sweeper/values.yaml \
  --set dash.image.repository=registry.example/m9-dash --set dash.image.tag=VERSION \
  --set backend.image.repository=registry.example/m9-backend --set backend.image.tag=VERSION \
  --set trawler.image.repository=registry.example/m9-trawler --set trawler.image.tag=VERSION
```

For real deployments provide secrets via sealed/external secrets, not literal command-line history; use a managed external PostgreSQL and private image digests. Never install example VAP in real clusters without testing its scope and exemptions. The Helm chart is an infrastructure skeleton; it does **not** provision scanners, migrations, network policies, cert-manager issuers or running service implementations.

Legacy configuration field names retained: `dash.init.superAdminEmail`, `dash.init.superAdminPassword`, `global.jwtSecret`, `global.apiKey`; their secret values should be supplied by corresponding Kubernetes Secret keys and `values.yaml` should remain empty.
