# m9sweeper-modern Angular dashboard

The dashboard is an **Angular 22 / TypeScript** application using Angular Material, RxJS and the modern Angular application build system. The NestJS API lives in `../backend/`, and must not be imported into the frontend build as backend DTO source code.

## Linux development

```bash
cd platform/dash/frontend
npm ci
npm run
```

Select the script appropriate to the checked-out revision. For a production Angular build, run the project's build script (typically `npm run build`); confirm the output path in `angular.json` before publishing anything.

## Application responsibilities

- Authentication and authorization-aware navigation
- Cluster inventory, image and vulnerability results, policy and exception interfaces
- Kube-bench, kube-hunter, Kubesec, Falco and Gatekeeper integrations
- Cluster registration, including validation of trusted Kubernetes API endpoints

## Managed cloud Kubernetes

The administration UI can read an operator-supplied kubeconfig and select a context, but cloud CLI `exec` authentication blocks in EKS, AKS and GKE kubeconfigs **cannot** be executed securely by the released backend. Native workload identity and token refresh in the backend are prerequisites for unattended managed-cluster enrollment; uploading a file in the browser does not provide that identity.

See [Cloud Kubernetes installation and acceptance](../../../docs/cloud-kubernetes.md) and [Helm installation](../../../docs/installation.md).

For new features, keep cloud credential logic in dedicated backend providers and avoid logging kubeconfigs or tokens. Changes must be covered by Angular build tests, backend auth/RBAC tests and real EKS/AKS/GKE acceptance before a public release.
