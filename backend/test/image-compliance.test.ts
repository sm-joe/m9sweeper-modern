import test from 'node:test';
import assert from 'node:assert/strict';
import { assessImageCompliance, assessPodImages, legacySettingsToLimits, type PolicyInput } from '../src/legacy-salvage/image-compliance.ts';
const settings = { fixableCritical:0, unFixableCritical:0, fixableMajor:0, unFixableMajor:0,
fixableNormal:-1, unFixableNormal:-1, fixableLow:-1, unFixableLow:-1, fixableNegligible:-1, unFixableNegligible:-1 };
const limits = legacySettingsToLimits(settings);
const base: PolicyInput = { policy:{id:'p1',name:'Default',enabled:true,enforcement:true}, scanners:[
  {id:'trivy',name:'Trivy',required:true,enabled:true,limits}], findings:[] };
test('upstream default: zero critical allowed, -1 means unlimited medium', () => {
 const r=assessImageCompliance({...base,findings:[{scannerId:'trivy',cve:'CVE-A',severity:'CRITICAL',fixable:true},
 {scannerId:'trivy',cve:'CVE-B',severity:'MEDIUM',fixable:false}]});
 assert.equal(r.compliant,false);assert.match(r.reasons.join(' '),/CRITICAL/);
 assert.equal(assessImageCompliance({...base,findings:[{scannerId:'trivy',cve:'CVE-B',severity:'MEDIUM',fixable:false}]}).compliant,true);
});
test('scoped CVE exception is applied only to matching scanner and CVE', () => {
 const findings=[{scannerId:'trivy',cve:'CVE-A',severity:'CRITICAL',fixable:false}];
 const ok=assessImageCompliance({...base,findings,exceptions:[{title:'approved',scannerId:'trivy',cve:'CVE-A'}]});
 assert.equal(ok.compliant,true);assert.equal(ok.excepted,1);
 assert.equal(assessImageCompliance({...base,findings,exceptions:[{title:'other',scannerId:'trivy',cve:'CVE-B'}]}).compliant,false);
});
test('disabled policy passes; scanner error fails closed', () => {
 assert.equal(assessImageCompliance({...base,policy:{...base.policy,enabled:false},scanError:false}).compliant,true);
 assert.equal(assessImageCompliance({...base,scanError:true}).compliant,false);
});
test('required-only enforcement preserves upstream rule',()=>{
 const optional={...base.scanners[0],id:'optional',name:'Optional',required:false};
 const finding={scannerId:'optional',cve:'CVE-1',severity:'CRITICAL',fixable:true};
 assert.equal(assessImageCompliance({...base,scanners:[...base.scanners,optional],findings:[finding]}).compliant,true);
 assert.equal(assessImageCompliance({...base,policy:{...base.policy,enforcement:false},scanners:[...base.scanners,optional],findings:[finding]}).compliant,true);
});
test('unknown scanner and malformed threshold are rejected',()=>{
 assert.throws(()=>assessImageCompliance({...base,findings:[{scannerId:'other',cve:'CVE-1',severity:'HIGH',fixable:true}]}),/missing scanner/);
 assert.throws(()=>assessImageCompliance({...base,scanners:[{...base.scanners[0],limits:{...limits,CRITICAL:{fixable:-2,unfixable:0}}}]}),/Malformed/);
});
test('admission logic blocks unscanned or noncompliant images, not approved exceptions',()=>{
 assert.equal(assessPodImages([{ref:'x',scanned:false,compliant:false}],true).allowed,false);
 assert.equal(assessPodImages([{ref:'x',scanned:false,compliant:false,exempted:true}],true).allowed,true);
 assert.equal(assessPodImages([{ref:'x',scanned:true,compliant:false}],true).allowed,false);
 assert.equal(assessPodImages([{ref:'x',scanned:false,compliant:false}],false).allowed,true);
});
