'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Limit={fixable:number;unfixable:number};
type Severity='CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'NEGLIGIBLE';
type Scanner={id:string;name:string;enabled:boolean;required:boolean;limits:Record<Severity,Limit>};
type Policy={id:string;cluster_id?:string;name:string;enabled:boolean;enforcement:boolean;scanners:Scanner[]};
type Cluster={id:string;name:string};
type Scan={cluster_id:string;scan_id:string;image_ref:string;scanned_at:string};
type Exception={id:string;title:string;reason:string;cve:string;expires_at:string;scanner_id:string|null};
type Decision={compliant:boolean;reasons:string[];excepted:number;checked:number;mode:string;enforced:boolean};
const SEVERITIES:Severity[]=['CRITICAL','HIGH','MEDIUM','LOW','NEGLIGIBLE'];
function defaults():Record<Severity,Limit>{
 return {CRITICAL:{fixable:0,unfixable:0},HIGH:{fixable:0,unfixable:0},
 MEDIUM:{fixable:-1,unfixable:-1},LOW:{fixable:-1,unfixable:-1},NEGLIGIBLE:{fixable:-1,unfixable:-1}};
}
function newPolicy():Policy{
 return {id:'',name:'',enabled:true,enforcement:true,
 scanners:[{id:'trivy',name:'Trivy',enabled:true,required:true,limits:defaults()}]};
}
function query(resource:string,params:Record<string,string>={}){
 const q=new URLSearchParams({resource,...params});
 return '/api/security?'+q.toString();
}
async function api<T>(resource:string,method:'GET'|'PUT'|'POST'|'DELETE',params:Record<string,string>={},data?:unknown,key?:string):Promise<T>{
 const response=await fetch(query(resource,params),{
  method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(key?{'x-m9-admin-key':key}:{})},
  ...(data?{body:JSON.stringify(data)}:{}),cache:'no-store'
 });
 const parsed=await response.json() as {error?:string}&T;
 if(!response.ok)throw new Error(parsed.error??'Request failed ('+response.status+')');
 return parsed;
}
export default function PolicyManager(){
 const [clusters,setClusters]=useState<Cluster[]>([]);
 const [clusterId,setClusterId]=useState('');
 const [policies,setPolicies]=useState<Policy[]>([]);
 const [scans,setScans]=useState<Scan[]>([]);
 const [selected,setSelected]=useState('');
 const [policy,setPolicy]=useState<Policy>(newPolicy());
 const [adminKey,setAdminKey]=useState('');
 const [clusterDraft,setClusterDraft]=useState({id:'',name:''});
 const [exceptions,setExceptions]=useState<Exception[]>([]);
 const [exceptionDraft,setExceptionDraft]=useState({id:'',title:'',reason:'',cve:'',expiresAt:''});
 const [selectedScan,setSelectedScan]=useState('');
 const [decision,setDecision]=useState<Decision|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const loadClusters=useCallback(async()=>{
  const [c,s]=await Promise.all([api<{data:Cluster[]}>('clusters','GET'),api<{data:Scan[]}>('scans','GET')]);
  setClusters(c.data);setScans(s.data);
  setClusterId(current=>current||c.data[0]?.id||'');
 },[]);
 const loadPolicies=useCallback(async(id:string)=>{
  if(!id){setPolicies([]);return;}
  const result=await api<{data:Policy[]}>('policies','GET',{clusterId:id});
  setPolicies(result.data);
 },[]);
 const loadExceptions=useCallback(async(id:string,pid:string)=>{
  if(!id||!pid){setExceptions([]);return;}
  const result=await api<{data:Exception[]}>('exceptions','GET',{clusterId:id,policyId:pid});
  setExceptions(result.data);
 },[]);
 useEffect(()=>{void loadClusters().catch(e=>setError(String(e)));},[loadClusters]);
 useEffect(()=>{void loadPolicies(clusterId).catch(e=>setError(String(e)));setSelected('');setPolicy(newPolicy());setDecision(null);},[clusterId,loadPolicies]);
 useEffect(()=>{void loadExceptions(clusterId,selected).catch(e=>setError(String(e)));},[clusterId,selected,loadExceptions]);
 async function execute(fn:()=>Promise<void>){
  setError('');setMessage('');setBusy(true);
  try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }
 function edit(p:Policy){
  setSelected(p.id);setPolicy(structuredClone(p));setDecision(null);
 }
 function fresh(){setSelected('');setPolicy(newPolicy());setDecision(null);}
 function setLimit(severity:Severity,field:keyof Limit,value:string){
  const number=Number(value);
  setPolicy(prev=>({...prev,scanners:prev.scanners.map(s=>({...s,limits:{...s.limits,[severity]:{...s.limits[severity],[field]:number}}}))}));
 }
 async function savePolicy(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  await execute(async()=>{
   if(!clusterId)throw new Error('Select a cluster');
   const result=await api<{data:Policy}>('policies','PUT',{clusterId},policy,adminKey);
   await loadPolicies(clusterId);
   setSelected(result.data.id);setPolicy(result.data);setMessage('Policy saved in PostgreSQL');
  });
 }
 async function deletePolicy(){
  if(!selected||!window.confirm('Permanently delete policy '+selected+' and all its exceptions?'))return;
  await execute(async()=>{
   await api('policies','DELETE',{clusterId,policyId:selected},undefined,adminKey);
   await loadPolicies(clusterId);fresh();setExceptions([]);setMessage('Policy deleted');
  });
 }
 async function registerCluster(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  await execute(async()=>{
   await api('clusters','PUT',{},clusterDraft,adminKey);
   await loadClusters();setClusterId(clusterDraft.id);
   setClusterDraft({id:'',name:''});setMessage('Cluster record saved (Kubernetes connection not yet configured)');
  });
 }
 async function saveException(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  await execute(async()=>{
   if(!selected)throw new Error('Save and select a policy first');
   await api('exceptions','PUT',{clusterId,policyId:selected},{
    ...exceptionDraft,expiresAt:new Date(exceptionDraft.expiresAt).toISOString(),
    ...(exceptionDraft.id?{}:{id:'exception-'+Date.now()})
   },adminKey);
   await loadExceptions(clusterId,selected);
   setExceptionDraft({id:'',title:'',reason:'',cve:'',expiresAt:''});
   setMessage('Exception saved');
  });
 }
 async function deleteException(id:string){
  if(!window.confirm('Delete exception '+id+'?'))return;
  await execute(async()=>{
   await api('exceptions','DELETE',{clusterId,policyId:selected,exceptionId:id},undefined,adminKey);
   await loadExceptions(clusterId,selected);setMessage('Exception deleted');
  });
 }
 async function evaluate(){
  await execute(async()=>{
   if(!selected||!selectedScan)throw new Error('Select an existing policy and scan');
   const result=await api<Decision>('evaluate','POST',{},{
    clusterId,policyId:selected,scanId:selectedScan
   });
   setDecision(result);setMessage('Evaluation completed using persisted scan findings');
  });
 }
 const availableScans=scans.filter(s=>s.cluster_id===clusterId);
 return <main className="manager">
  <nav className="app-nav"><Link href="/">Scan history</Link><Link href="/policies">Policies</Link></nav>
  <header><span className="eyebrow">POSTGRESQL-BACKED POLICY MANAGEMENT</span><h1>Security <em>policies</em></h1>
   <p>Create thresholds, save policies, manage CVE exceptions, and evaluate real Trivy findings.</p></header>
  <section className="panel admin-panel">
   <label htmlFor="admin-key">Administrator API key — required to save or delete</label>
   <input id="admin-key" type="password" autoComplete="off" value={adminKey}
    onChange={e=>setAdminKey(e.target.value)} placeholder="M9_ADMIN_API_KEY from your local .env"/>
   <small>Kept only in this page's memory. Never saved in browser storage. For local development only.</small>
  </section>
  {error&&<div role="alert" className="warning">{error}</div>}
  {message&&<div role="status" className="notice">{message}</div>}
  <section className="panel">
   <h2>1. Cluster</h2>
   <div className="control-row"><label htmlFor="cluster">Active cluster</label>
    <select id="cluster" value={clusterId} onChange={e=>setClusterId(e.target.value)}>
     <option value="">Select a cluster</option>
     {clusters.map(c=><option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
    </select><button type="button" className="secondary-button" onClick={()=>void execute(loadClusters)} disabled={busy}>Refresh clusters</button>
   </div>
   <details><summary>Register a cluster record</summary>
    <p className="hint">Creates a database record only. This does not connect Kubernetes credentials or deploy an agent.</p>
    <form onSubmit={registerCluster} className="form-grid">
     <label>Cluster ID<input required pattern="[A-Za-z0-9_.-]+" maxLength={80} value={clusterDraft.id} onChange={e=>setClusterDraft({...clusterDraft,id:e.target.value})}/></label>
     <label>Display name<input required maxLength={200} value={clusterDraft.name} onChange={e=>setClusterDraft({...clusterDraft,name:e.target.value})}/></label>
     <button disabled={busy||!adminKey}>Save cluster record</button>
    </form>
   </details>
  </section>
  <section className="panel">
   <div className="section-heading"><h2>2. Managed policies ({policies.length})</h2><button type="button" onClick={fresh} disabled={!clusterId}>New policy</button></div>
   <div className="policy-list">{policies.map(p=><button type="button" className={'policy-choice'+(selected===p.id?' active':'')} key={p.id} onClick={()=>edit(p)}>
    <strong>{p.name}</strong><small>{p.id} · {p.enabled?'Enabled':'Disabled'} · {p.enforcement?'Required scanners':'Any scanner'}</small>
   </button>)}</div>
   {!policies.length&&<p className="empty">No policies saved in this cluster. Use the form below to create the first one.</p>}
   <form onSubmit={savePolicy}>
    <h3>{selected?'Edit saved policy':'Create policy'}</h3>
    <div className="form-grid">
     <label>Policy ID<input required disabled={Boolean(selected)} pattern="[A-Za-z0-9_-]+" maxLength={80} value={policy.id} onChange={e=>setPolicy({...policy,id:e.target.value})} placeholder="production-baseline"/></label>
     <label>Policy name<input required maxLength={200} value={policy.name} onChange={e=>setPolicy({...policy,name:e.target.value})} placeholder="Production Trivy baseline"/></label>
     <label className="check-label"><input type="checkbox" checked={policy.enabled} onChange={e=>setPolicy({...policy,enabled:e.target.checked})}/>Enabled</label>
     <label className="check-label"><input type="checkbox" checked={policy.enforcement} onChange={e=>setPolicy({...policy,enforcement:e.target.checked})}/>Require all mandatory scanners</label>
    </div>
    <h3>Trivy severity limits</h3>
    <p className="hint">Set 0 to prohibit findings; -1 means unlimited. Limits apply separately to fixable and unfixable vulnerabilities.</p>
    <div className="table-wrap"><table><thead><tr><th>Severity</th><th>Maximum fixable</th><th>Maximum unfixable</th></tr></thead>
    <tbody>{SEVERITIES.map(severity=><tr key={severity}><th scope="row">{severity}</th>
     <td><input aria-label={severity+' fixable threshold'} type="number" min={-1} max={1000000} required value={policy.scanners[0].limits[severity].fixable} onChange={e=>setLimit(severity,'fixable',e.target.value)}/></td>
     <td><input aria-label={severity+' unfixable threshold'} type="number" min={-1} max={1000000} required value={policy.scanners[0].limits[severity].unfixable} onChange={e=>setLimit(severity,'unfixable',e.target.value)}/></td>
    </tr>)}</tbody></table></div>
    <div className="control-row actions"><button type="submit" disabled={busy||!clusterId||!adminKey}>{busy?'Saving…':'Save policy'}</button>
      {selected&&<button type="button" className="danger-button" disabled={busy||!adminKey} onClick={()=>void deletePolicy()}>Delete policy</button>}
    </div>
   </form>
  </section>
  {selected&&<section className="panel">
   <h2>3. CVE exceptions for {selected}</h2>
   <p className="hint">Exceptions apply to a specific vulnerability ID and expire within 90 days. No catch-all exemptions are permitted.</p>
   <div className="table-wrap"><table><thead><tr><th>CVE</th><th>Reason</th><th>Expires</th><th>Action</th></tr></thead>
   <tbody>{exceptions.map(e=><tr key={e.id}><td>{e.cve}</td><td>{e.reason}</td><td>{new Date(e.expires_at).toLocaleDateString()}</td>
     <td><button type="button" className="danger-button" disabled={busy||!adminKey} onClick={()=>void deleteException(e.id)}>Remove</button></td></tr>)}</tbody></table></div>
   {!exceptions.length&&<p className="empty">No exceptions for this policy.</p>}
   <form onSubmit={saveException} className="form-grid">
    <label>Exception ID (optional)<input pattern="[A-Za-z0-9_-]+" maxLength={80} value={exceptionDraft.id} onChange={e=>setExceptionDraft({...exceptionDraft,id:e.target.value})}/></label>
    <label>Title<input required maxLength={200} value={exceptionDraft.title} onChange={e=>setExceptionDraft({...exceptionDraft,title:e.target.value})}/></label>
    <label>Vulnerability ID<input required placeholder="CVE-2026-12345" value={exceptionDraft.cve} onChange={e=>setExceptionDraft({...exceptionDraft,cve:e.target.value})}/></label>
    <label>Expiration<input required type="datetime-local" value={exceptionDraft.expiresAt} onChange={e=>setExceptionDraft({...exceptionDraft,expiresAt:e.target.value})}/></label>
    <label className="wide">Justification<textarea required minLength={10} maxLength={1000} rows={3} value={exceptionDraft.reason} onChange={e=>setExceptionDraft({...exceptionDraft,reason:e.target.value})}/></label>
    <button disabled={busy||!adminKey}>Save exception</button>
   </form>
  </section>}
  {selected&&<section className="panel">
   <h2>4. Evaluate a real scan against {selected}</h2>
   <div className="control-row"><select aria-label="Scan to evaluate" value={selectedScan} onChange={e=>{setSelectedScan(e.target.value);setDecision(null);}}>
    <option value="">Choose a stored Trivy scan</option>
    {availableScans.map(s=><option key={s.scan_id} value={s.scan_id}>{s.image_ref} · {s.scan_id}</option>)}
   </select><button disabled={busy||!selectedScan} onClick={()=>void evaluate()}>Evaluate compliance</button></div>
   {decision&&<div className={'assessment '+(decision.compliant?'pass':'fail')} role="status">
    <h3>{decision.compliant?'Policy compliant':'Policy not compliant'}</h3>
    <p>{decision.checked} findings evaluated · {decision.excepted} excepted</p>
    {decision.reasons.length>0&&<ul>{decision.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>}
    <small>Evaluation only. Kubernetes admission enforcement is disabled.</small>
   </div>}
  </section>}
  <footer>Local development UI. Production authentication, multi-user RBAC, and active Kubernetes policy admission are not implemented.</footer>
 </main>;
}
