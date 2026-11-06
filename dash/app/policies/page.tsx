import Link from 'next/link';
export const dynamic = 'force-dynamic';
type Policy={id:string;cluster_id:string;name:string;enabled:boolean;enforcement:boolean;scanners:Array<{id:string;name:string;required:boolean;enabled:boolean}>};
async function getData():Promise<{clusters:Array<{id:string;name:string}>;policies:Policy[];error?:string}>{
 const backend=process.env.M9_BACKEND_URL??'http://backend:8080';
 const headers={Authorization:'Bearer '+process.env.M9_AGENT_API_KEY};
 try{
  const response=await fetch(backend+'/v1/clusters',{headers,cache:'no-store'});
  if(!response.ok)throw new Error('Clusters unavailable');
  const clusters=(await response.json() as {data:Array<{id:string;name:string}>}).data;
  const results=await Promise.all(clusters.map(c=>fetch(backend+'/v1/policies?clusterId='+encodeURIComponent(c.id),{headers,cache:'no-store'})));
  if(results.some(r=>!r.ok))throw new Error('Policies unavailable');
  const grouped=await Promise.all(results.map(r=>r.json() as Promise<{data:Policy[]}>));
  return {clusters,policies:grouped.flatMap(x=>x.data)};
 }catch{return {clusters:[],policies:[],error:'Could not fetch stored policies from the backend'};}
}
export default async function Policies(){
 const data=await getData();
 return <main><nav className="app-nav"><Link href="/">Scan history</Link><Link href="/policies">Policies</Link></nav>
 <header><span className="eyebrow">POLICY MANAGEMENT</span><h1>Security <em>policies</em></h1>
 <p>Persisted policy definitions, scoped to Kubernetes clusters. Administration requires a separate API key.</p></header>
 {data.error && <section className="warning">{data.error}</section>}
 <section className="metrics"><div><small>Managed clusters</small><strong>{data.clusters.length}</strong></div>
 <div><small>Policies</small><strong>{data.policies.length}</strong></div>
 <div><small>Enabled policies</small><strong>{data.policies.filter(p=>p.enabled).length}</strong></div></section>
 <section className="panel"><h2>Stored policies</h2><div className="table-wrap"><table>
 <thead><tr><th>Cluster</th><th>Name</th><th>Enabled</th><th>Enforcement mode</th><th>Scanners</th></tr></thead>
 <tbody>{data.policies.map(p=><tr key={p.cluster_id+':'+p.id}>
 <td>{p.cluster_id}</td><td>{p.name}</td><td>{p.enabled?'Yes':'No'}</td>
 <td>{p.enforcement?'All required scanners':'Any scanner'}</td>
 <td>{p.scanners.map(s=>s.name).join(', ')}</td></tr>)}</tbody></table>
 {!data.policies.length && <p className="empty">No managed policies yet. Create policies through the admin API.</p>}</div></section>
 <footer>Read-only local preview. Policies are not wired to Kubernetes admission enforcement.</footer></main>;
}
