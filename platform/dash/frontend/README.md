# Angular dashboard

The m9sweeper-modern Dashboard uses **Angular 22, TypeScript, Angular Material and RxJS**. The separate NestJS 11 backend serves the production Angular build and owns authorization, cluster connectivity and report persistence.

## Linux development

From a clean checkout:

```bash
cd platform/dash/frontend
npm ci --legacy-peer-deps
npm run check:client-boundary
npm run lint
npm run build:prod
```

The Angular application is built into `platform/dash/backend/dist/public/index.html`; do not package a second `browser/` level and do not import NestJS DTO files or backend-only dependencies into the frontend compiler.

## Product areas

- Dashboard navigation, authenticated routes and role-aware UI
- Kubernetes cluster and workload inventory
- Image and vulnerability results, history, policy management and exceptions
- kube-bench, kube-hunter, Kubesec and Falco reports
- Cluster registration and scanner settings

## Report-rendering contract

Scanner report APIs use the NestJS `{success, message, data}` envelope. HTTP services normalize responses before components render them. **Asynchronous report pages must always resolve loading, error and empty states**, including timeouts and cluster metadata lookup failures. Guard malformed stored scanner JSON and present clear errors rather than leaving indefinite spinners.

A successful scan Job is not proof of UI acceptance. Verify a **newly ingested report** with a matching cluster ID and visible findings.

## Managed Kubernetes authentication

Cloud CLI `exec` helpers in operator kubeconfigs must not be executed by the backend. Credential acquisition, token refresh and Kubernetes authorization belong to trusted server-side components. See [EKS](../../../docs/eks-installation.md), [Installation](../../../docs/installation.md) and [Cloud Kubernetes](../../../docs/cloud-kubernetes.md).

For contributions, run the Angular fast checks and include tests for report loading and response formatting.
