import Link from 'next/link';
export const dynamic = 'force-dynamic';
type Finding = { vulnerability_id: string; target: string; package_name: string; installed_version: string; fixed_version: string | null; severity: string; is_fixable: boolean; title: string | null; primary_url: string | null };
type Scan = { image_ref: string; cluster_id: string; scan_id: string; scanned_at: string; severity_counts: Record<string, number> };
export default async function ScanDetail({params}:{params:Promise<{clusterId:string;scanId:string}>}) {
 const {clusterId,scanId}=await params;
 let data: {scan:Scan;findings:Finding[];limit:number}|null=null;
 try {
  const url=(process.env.M9_BACKEND_URL ?? 'http://backend:8080') + '/v1/scan-detail?clusterId='+encodeURIComponent(clusterId)+'&scanId='+encodeURIComponent(scanId);
  const response=await fetch(url,{headers:{Authorization:'Bearer '+process.env.M9_AGENT_API_KEY},cache:'no-store'});
  if(response.ok) data=await response.json();
 } catch {}
 return <main><Link href="/" className="back-link">← Back to scan history</Link>
 <header><span className="eyebrow">TRIVY IMAGE SCAN</span><h1>Vulnerability details</h1><p>{data?.scan.image_ref ?? 'Scan unavailable'}</p></header>
 {!data ? <section className="warning">Scan not found or backend unavailable.</section> : <>
 <section className="metrics">
  <div><small>Critical</small><strong>{data.scan.severity_counts.CRITICAL??0}</strong></div>
  <div><small>High</small><strong>{data.scan.severity_counts.HIGH??0}</strong></div>
  <div><small>Medium</small><strong>{data.scan.severity_counts.MEDIUM??0}</strong></div>
 </section>
 <section className="panel"><div className="section-heading"><h2>Findings ({data.findings.length}{data.findings.length===data.limit ? '+' : ''})</h2><span>{data.scan.cluster_id} · {data.scan.scanned_at}</span></div>
 <div className="table-wrap"><table><thead><tr><th>Severity</th><th>CVE</th><th>Package</th><th>Installed</th><th>Fixed</th><th>Target</th></tr></thead>
 <tbody>{data.findings.map((f,i)=><tr key={i}>
 <td>{f.severity}</td><td>{f.primary_url?.startsWith('https://') ? <a href={f.primary_url} target="_blank" rel="noopener noreferrer">{f.vulnerability_id}</a> : f.vulnerability_id}</td>
 <td>{f.package_name}</td><td>{f.installed_version}</td><td>{f.fixed_version??'Not available'}</td><td>{f.target}</td></tr>)}</tbody></table></div></section></>}
 <footer>Findings are stored scanner evidence, not a verified compliance assessment.</footer></main>;
}
