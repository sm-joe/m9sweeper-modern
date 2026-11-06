import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw new Error('DATABASE_URL required');
const pool=new pg.Pool({connectionString:databaseUrl});
const admin='a'.repeat(64), agent='b'.repeat(64);
const port=18881;
const base='http://127.0.0.1:'+port;
const backend=spawn(process.execPath,['dist/server.js'],{
 cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
 env:{...process.env,PORT:String(port),M9_ADMIN_API_KEY:admin,M9_AGENT_API_KEY:agent}
});
let output='';
backend.stdout.on('data',b=>output+=b.toString());
backend.stderr.on('data',b=>output+=b.toString());
async function call(path,method='GET',body,credential=admin){
 const response=await fetch(base+path,{
  method,headers:{Authorization:'Bearer '+credential,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 return {status:response.status,data:await response.json()};
}
try {
 await pool.query(readFileSync('src/db/migrations/001_initial.sql','utf8'));
 for(let i=0;i<75;i++){
  if(backend.exitCode!==null)throw new Error('Backend died: '+output);
  try{const response=await fetch(base+'/readyz');if(response.ok)break;}catch{}
  if(i===74)throw new Error('Backend did not start: '+output);
  await delay(150);
 }
 const initial=await call('/v1/clusters','PUT',{id:'ci-cluster',name:'CI Cluster'});
 assert.equal(initial.status,200);
 const policy={id:'ci-baseline',name:'CI baseline',enabled:true,enforcement:true,
  scanners:[{id:'trivy',name:'Trivy',enabled:true,required:true,limits:{
   CRITICAL:{fixable:0,unfixable:0},HIGH:{fixable:0,unfixable:0},
   MEDIUM:{fixable:-1,unfixable:-1},LOW:{fixable:-1,unfixable:-1},
   NEGLIGIBLE:{fixable:-1,unfixable:-1}
  }}]};
 const unauthorized=await call('/v1/policies?clusterId=ci-cluster','PUT',policy,agent);
 assert.equal(unauthorized.status,403);
 const put=await call('/v1/policies?clusterId=ci-cluster','PUT',policy);
 assert.equal(put.status,200);
 const list=await call('/v1/policies?clusterId=ci-cluster');
 assert.equal(list.status,200);assert.equal(list.data.data.length,1);
 await pool.query(`INSERT INTO scan_runs(cluster_id,scan_id,image_ref,scanned_at,status,severity_counts,raw_report,risk_algorithm)
 VALUES ('ci-cluster','ci-scan','alpine:test',now(),'complete','{}'::jsonb,'{}'::jsonb,'unverified')`);
 await pool.query(`INSERT INTO vulnerabilities(cluster_id,scan_id,image_ref,target,vulnerability_id,package_name,installed_version,severity,is_fixable,raw)
 VALUES ('ci-cluster','ci-scan','alpine:test','os','CVE-2026-12345','example','1.0','CRITICAL',true,'{}'::jsonb)`);
 const req={clusterId:'ci-cluster',scanId:'ci-scan',policyId:'ci-baseline'};
 const failed=await call('/v1/compliance/evaluate','POST',req,agent);
 assert.equal(failed.status,200);assert.equal(failed.data.compliant,false);
 const expiresAt=new Date(Date.now()+86400000).toISOString();
 const exception={id:'ci-exception',title:'Approved test exception',reason:'Integration test accepted exception',cve:'CVE-2026-12345',expiresAt};
 const putEx=await call('/v1/policy-exceptions?clusterId=ci-cluster&policyId=ci-baseline','PUT',exception);
 assert.equal(putEx.status,200);
 const passed=await call('/v1/compliance/evaluate','POST',req,agent);
 assert.equal(passed.status,200);assert.equal(passed.data.compliant,true);assert.equal(passed.data.excepted,1);
 const delEx=await call('/v1/policy-exceptions?clusterId=ci-cluster&policyId=ci-baseline&exceptionId=ci-exception','DELETE');
 assert.equal(delEx.status,200);
 const afterRemoval=await call('/v1/compliance/evaluate','POST',req,agent);
 assert.equal(afterRemoval.data.compliant,false);
 const delPolicy=await call('/v1/policies?clusterId=ci-cluster&policyId=ci-baseline','DELETE');
 assert.equal(delPolicy.status,200);
 const final=await call('/v1/policies?clusterId=ci-cluster');
 assert.equal(final.data.data.length,0);
 console.log('PASS: PostgreSQL policy CRUD, separate admin credentials, exceptions and real scan evaluation');
}finally{
 backend.kill('SIGTERM');
 await pool.end();
}
