import type { Pool } from 'pg';
import { SEVERITIES, type Limits, type PolicyInput, type Scanner, type Exception } from '../legacy-salvage/image-compliance.js';

export type StoredPolicy = {
  id: string; clusterId: string; name: string; enabled: boolean;
  enforcement: boolean; scanners: Scanner[];
};
export type StoredException = Exception & { id: string; clusterId: string; policyId: string; expiresAt: string; reason: string };

export function validatePolicy(input: unknown, clusterId: string): StoredPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid policy input');
  const p = input as Record<string, unknown>;
  if (typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id)) throw new Error('Invalid policy id');
  if (typeof p.name !== 'string' || p.name.trim().length < 1 || p.name.length > 200) throw new Error('Invalid policy name');
  if (typeof p.enabled !== 'boolean' || typeof p.enforcement !== 'boolean') throw new Error('Invalid policy flags');
  if (!Array.isArray(p.scanners) || p.scanners.length < 1 || p.scanners.length > 20) throw new Error('Policy requires 1-20 scanners');
  const ids = new Set<string>();
  const scanners: Scanner[] = p.scanners.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid scanner');
    const s = value as Record<string, unknown>;
    if (typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(s.id) || ids.has(s.id)) throw new Error('Invalid or duplicate scanner id');
    ids.add(s.id);
    if (s.id !== 'trivy') throw new Error('Only Trivy scanner is supported by the current evidence model');
    if (typeof s.name !== 'string' || s.name.length < 1 || s.name.length > 200 ||
        typeof s.enabled !== 'boolean' || typeof s.required !== 'boolean') throw new Error('Invalid scanner settings');
    const limits = s.limits as Limits | undefined;
    for (const severity of SEVERITIES) {
      for (const limit of [limits?.[severity]?.fixable, limits?.[severity]?.unfixable]) {
        if (!Number.isInteger(limit) || limit! < -1 || limit! > 1000000) throw new Error('Invalid vulnerability limit: ' + severity);
      }
    }
    return { id: s.id, name: s.name, enabled: s.enabled, required: s.required, limits };
  });
  if (!scanners.some(s => s.enabled)) throw new Error('Policy requires an enabled scanner');
  return { id: p.id, clusterId, name: p.name.trim(), enabled: p.enabled, enforcement: p.enforcement, scanners };
}

export function validateException(input: unknown, clusterId: string, policyId: string): StoredException {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid exception input');
  const e = input as Record<string, unknown>;
  if (typeof e.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(e.id)) throw new Error('Invalid exception id');
  if (typeof e.title !== 'string' || e.title.trim().length < 1 || e.title.length > 200) throw new Error('Invalid exception title');
  if (typeof e.reason !== 'string' || e.reason.trim().length < 10 || e.reason.length > 1000) throw new Error('Exception requires an auditable reason of at least 10 characters');
  if (e.scannerId !== undefined && e.scannerId !== 'trivy') throw new Error('Unsupported scanner exception');
  if (typeof e.cve !== 'string' || !/^(CVE-\d{4}-\d{4,}|GHSA-[\w-]+|[A-Za-z0-9_.:-]{5,100})$/.test(e.cve)) {
    throw new Error('Exception must target one specific CVE or advisory identifier');
  }
  if (typeof e.expiresAt !== 'string' || !Number.isFinite(Date.parse(e.expiresAt))) throw new Error('Exception expiration required');
  const expiry = new Date(e.expiresAt);
  if (expiry.getTime() <= Date.now() || expiry.getTime() > Date.now() + 90 * 86400000) {
    throw new Error('Exception expiration must be within the next 90 days');
  }
  return { id:e.id, clusterId, policyId, title:e.title.trim(), reason:e.reason.trim(), scannerId:e.scannerId as string | undefined,
    cve:e.cve, expiresAt:expiry.toISOString() };
}

export async function loadPolicy(pool: Pool, clusterId: string, policyId: string): Promise<StoredPolicy | null> {
  const result = await pool.query(
    'SELECT id,cluster_id,name,enabled,enforcement,scanners FROM managed_policies WHERE cluster_id=$1 AND id=$2',
    [clusterId, policyId]);
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {id:row.id,clusterId:row.cluster_id,name:row.name,enabled:row.enabled,enforcement:row.enforcement,scanners:row.scanners};
}

export async function loadCurrentExceptions(pool: Pool, clusterId: string, policyId: string): Promise<Exception[]> {
  const result = await pool.query(
    'SELECT title,scanner_id,cve FROM policy_exceptions WHERE cluster_id=$1 AND policy_id=$2 AND expires_at > now()',
    [clusterId, policyId]);
  return result.rows.map(row => ({title:row.title,scannerId:row.scanner_id ?? undefined,cve:row.cve}));
}

export async function putPolicy(pool: Pool, policy: StoredPolicy): Promise<void> {
  await pool.query('INSERT INTO managed_policies(cluster_id,id,name,enabled,enforcement,scanners) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(cluster_id,id) DO UPDATE SET name=EXCLUDED.name,enabled=EXCLUDED.enabled,enforcement=EXCLUDED.enforcement,scanners=EXCLUDED.scanners,updated_at=now()',
    [policy.clusterId,policy.id,policy.name,policy.enabled,policy.enforcement,JSON.stringify(policy.scanners)]);
}

export async function putException(pool: Pool, exception: StoredException): Promise<void> {
  await pool.query('INSERT INTO policy_exceptions(cluster_id,policy_id,id,title,reason,scanner_id,cve,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (cluster_id,policy_id,id) DO UPDATE SET title=EXCLUDED.title,reason=EXCLUDED.reason,scanner_id=EXCLUDED.scanner_id,cve=EXCLUDED.cve,expires_at=EXCLUDED.expires_at',
    [exception.clusterId,exception.policyId,exception.id,exception.title,exception.reason,exception.scannerId ?? null,exception.cve,exception.expiresAt]);
}
