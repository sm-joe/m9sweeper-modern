import Link from 'next/link';
export const dynamic = 'force-dynamic';
type Scan = { cluster_id: string; scan_id: string; image_ref: string; scanned_at: string;
  severity_counts: Record<string, number>; risk_value: string | null; risk_algorithm: string };
async function getScans(): Promise<{ rows: Scan[]; error?: string }> {
  try {
    const response = await fetch((process.env.M9_BACKEND_URL ?? 'http://backend:8080') + '/v1/scans', {
      headers: { Authorization: 'Bearer ' + process.env.M9_AGENT_API_KEY }, cache: 'no-store'
    });
    if (!response.ok) throw new Error('Backend returned ' + response.status);
    const parsed = (await response.json()) as { data: Scan[] };
    return { rows: parsed.data };
  } catch {
    return { rows: [], error: 'Backend is unavailable. Check docker compose logs.' };
  }
}
export default async function Page() {
  const { rows, error } = await getScans();
  return <main>
    <header><span className="eyebrow">LOCAL DEVELOPMENT PREVIEW</span><h1>m9sweeper <em>modern</em></h1>
      <p>Kubernetes image vulnerability scan history · Trivy</p></header>
    {error && <section className="warning">{error}</section>}
    <section className="metrics">
      <div><small>Recent scans</small><strong>{rows.length}</strong></div>
      <div><small>Critical findings</small><strong>{rows.reduce((n,r) => n + (r.severity_counts.CRITICAL ?? 0),0)}</strong></div>
      <div><small>High findings</small><strong>{rows.reduce((n,r) => n + (r.severity_counts.HIGH ?? 0),0)}</strong></div>
    </section>
    <section className="panel"><div className="section-heading"><h2>Recent scans</h2><span>Refresh page to update</span></div>
      <div className="table-wrap"><table><thead><tr><th>Cluster</th><th>Image</th><th>Scanned at</th><th>Critical</th><th>High</th><th>Medium</th><th>Risk</th></tr></thead>
      <tbody>{rows.map(scan => <tr key={scan.cluster_id + scan.scan_id}>
        <td>{scan.cluster_id}</td><td title={scan.image_ref}><Link href={'/scans/' + encodeURIComponent(scan.cluster_id) + '/' + encodeURIComponent(scan.scan_id)}>{scan.image_ref}</Link></td>
        <td>{new Date(scan.scanned_at).toLocaleString('en-GB',{timeZone:'UTC'})} UTC</td>
        <td>{scan.severity_counts.CRITICAL ?? 0}</td><td>{scan.severity_counts.HIGH ?? 0}</td>
        <td>{scan.severity_counts.MEDIUM ?? 0}</td>
        <td>{scan.risk_value ?? 'Withheld (unverified model)'}</td>
      </tr>)}</tbody></table>{!rows.length && <p className="empty">No scans received. Configure M9_SCAN_IMAGES in .env and start the trawler.</p>}</div>
    </section>
    <footer>This preview deliberately has no internet-facing login. Bind it to localhost only. Do not expose it publicly.</footer>
  </main>;
}
