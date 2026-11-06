import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePolicy, validateException } from '../src/policies/policy-store.ts';
const limits = Object.fromEntries(['CRITICAL','HIGH','MEDIUM','LOW','NEGLIGIBLE'].map(s=>[s,{fixable:0,unfixable:0}]));
const policy={id:'baseline',name:'Baseline policy',enabled:true,enforcement:true,scanners:[{id:'trivy',name:'Trivy',enabled:true,required:true,limits}]};
test('accepts persisted Trivy policy and preserves exact limits',()=>{
 const result=validatePolicy(policy,'local-preview');
 assert.equal(result.scanners[0].limits.CRITICAL.fixable,0);
 assert.equal(result.clusterId,'local-preview');
});
test('rejects unknown scanner and invalid settings',()=>{
 assert.throws(()=>validatePolicy({...policy,scanners:[{...policy.scanners[0],id:'other'}]},'cluster'),/Only Trivy/);
 assert.throws(()=>validatePolicy({...policy,scanners:[{...policy.scanners[0],limits:{...limits,CRITICAL:{fixable:-5,unfixable:0}}}]},'cluster'),/Invalid vulnerability limit/);
});
test('exception must have exact vulnerability id, reason, and expiry',()=>{
 assert.throws(()=>validateException({id:'e',title:'All',reason:'allow everything',expiresAt:new Date(Date.now()+86400000).toISOString()},'c','p'),/specific CVE/);
 const exception=validateException({id:'e',title:'Approved CVE',cve:'CVE-2026-12345',reason:'Accepted for 30 days by security',expiresAt:new Date(Date.now()+86400000).toISOString()},'c','p');
 assert.equal(exception.cve,'CVE-2026-12345');
 assert.throws(()=>validateException({...exception,expiresAt:'2000-01-01T00:00:00Z'},'c','p'),/within/);
});
