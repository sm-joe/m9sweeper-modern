import type { PreparedScan } from '../contracts/trivy.js';
export interface QueryClient { query(sql: string, args?: unknown[]): Promise<unknown> }
/** Caller uses BEGIN/COMMIT around this and inserts cluster ownership after authentication. */
export async function savePreparedScan(client: QueryClient, s: PreparedScan): Promise<void> {
  await client.query(`INSERT INTO scan_runs
   (cluster_id,scan_id,image_ref,image_digest,scanned_at,status,severity_counts,raw_report,risk_value,risk_algorithm,risk_weights)
   VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb)
   ON CONFLICT (cluster_id,scan_id) DO NOTHING`,
  [s.clusterId,s.scanId,s.image,s.imageDigest,s.scannedAt,s.status,JSON.stringify(s.counts),
   JSON.stringify(s.rawReport),s.risk.value,s.risk.algorithm,JSON.stringify(s.risk.weights)]);
  // On retries: only insert vulnerabilities if missing, with the same locked scan context.
  const existing = await client.query(`SELECT COUNT(*) AS n FROM vulnerabilities WHERE cluster_id=$1 AND scan_id=$2`,[s.clusterId,s.scanId]);
  const n = Number((existing as {rows?:Array<{n:string}>}).rows?.[0]?.n ?? NaN);
  if (!Number.isFinite(n)) throw new Error('Database driver must return row count');
  if (n !== 0) return;
  for (const row of s.vulnerabilities) {
    await client.query(`INSERT INTO vulnerabilities
     (cluster_id,scan_id,image_ref,target,vulnerability_id,package_name,installed_version,fixed_version,severity,is_fixable,title,primary_url,raw)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
     [row.clusterId,row.scanId,row.image,row.target,row.vulnerabilityId,row.packageName,row.installedVersion,
      row.fixedVersion,row.severity,row.isFixable,row.title,row.primaryUrl,JSON.stringify(row.raw)]);
  }
}
