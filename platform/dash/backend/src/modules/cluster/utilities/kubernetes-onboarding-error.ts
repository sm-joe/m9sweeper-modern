/** Safely categorize Kubernetes onboarding failures without leaking kubeconfigs or credentials. */
export function classifyKubernetesOnboardingError(error: any): {message: string; httpStatus?: number; networkCode?: string} {
  const status = Number(error?.statusCode ?? error?.response?.statusCode ?? error?.response?.status ?? error?.status ?? error?.cause?.statusCode);
  const code = String(error?.code ?? error?.cause?.code ?? '').toUpperCase();
  const reason = String(error?.message ?? '');
  let message = 'Kubernetes onboarding failed: check Dash connectivity, trusted CA, credentials and service-account RBAC.';
  if (/Kubeconfig API server is localhost/i.test(reason))
    message = 'Kubernetes API localhost endpoint is unreachable from Dash; use a Docker-reachable, CA-verified endpoint.';
  else if (/Kubeconfig uses an external exec/i.test(reason))
    message = 'Kubernetes external exec credentials cannot be used by the Dash container.';
  else if (/Invalid kubeconfig|Kubeconfig.*(CA|current context|certificate authority)|trusted cluster CA|TLS verification.*bypass/i.test(reason))
    message = 'Kubeconfig is incomplete or has invalid trusted Kubernetes CA data.';
  else if (/service.account token not yet provisioned/i.test(reason))
    message = 'Kubernetes service-account token is not ready; check the m9sweeper Secret and Kubernetes token controller.';
  else if (status === 401) message = 'Kubernetes authentication failed (401); update credentials.';
  else if (status === 403) message = 'Kubernetes authorization denied (403); check service-account and RBAC provisioning permissions.';
  else if (status === 404) message = 'Kubernetes API returned 404; inspect API endpoint and configured namespace.';
  else if (['ENOTFOUND', 'EAI_AGAIN'].includes(code))
    message = 'Kubernetes API DNS failed inside Dash; check its Docker/Kind network and stored kubeconfig hostname.';
  else if (['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code))
    message = 'Kubernetes API is unreachable from Dash; inspect network and server port.';
  else if (/CERT_|UNABLE_TO_VERIFY|SELF_SIGNED|ERR_TLS|ALTNAME/i.test(code) || /certificate verify|self.signed|TLS handshake/i.test(reason))
    message = 'Kubernetes TLS certificate verification failed; verify trusted CA and server hostname.';
  return {message, httpStatus: Number.isFinite(status) ? status : undefined,
    networkCode: /^[A-Z_]+$/.test(code) && code.length < 50 ? code : undefined};
}
