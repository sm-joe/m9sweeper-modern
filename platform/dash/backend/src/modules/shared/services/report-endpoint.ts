/**
 * Validate the Pod-reachable scanner callback base URL before emitting Helm commands.
 * Never silently use a browser localhost URL for a Job running in Kubernetes.
 */
export function validateScannerReportEndpoint(candidate: unknown): string | null {
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  let url: URL;
  try { url = new URL(candidate.trim()); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || url.search || url.hash) return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host)) return null;
  if (host.startsWith('127.') || host.endsWith('.localhost')) return null;
  return url.toString().replace(/\/$/, '');
}
