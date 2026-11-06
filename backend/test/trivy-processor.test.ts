import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { processTrivyBatch } from '../dist/processors/trivy-processor.js';
const input = [{ clusterId: 'cluster-1', scanId: 'scan-1', image: 'repo/app@sha256:abc', scannedAt: '2026-11-06T00:00:00Z',
  report: { Results: [{ Target: 'os', Vulnerabilities: [
    { VulnerabilityID: 'CVE-1', Severity: 'CRITICAL', FixedVersion: '1.2' },
    { VulnerabilityID: 'CVE-2', Severity: 'HIGH' },
    { VulnerabilityID: 'CVE-3', Severity: 'WEIRD' }
  ] }] } }];
test('normalizes raw Trivy JSON, fixability and unknown severity', () => {
 const [r] = processTrivyBatch(input);
 assert.equal(r.counts.CRITICAL,1); assert.equal(r.counts.HIGH,1);
 assert.equal(r.counts.UNKNOWN,1); assert.equal(r.risk.value,null);
 assert.equal(r.vulnerabilities[0].isFixable,true);
 assert.equal(r.vulnerabilities[1].isFixable,false);
});
test('risk weights require explicit version', () => {
 const [r] = processTrivyBatch(input, { algorithm:'custom-v1', weights:{CRITICAL:10,HIGH:5,MEDIUM:2,LOW:1,NEGLIGIBLE:0} });
 assert.equal(r.risk.value,15);
});
test('malformed scans fail rather than become empty compliant reports', () => {
 assert.throws(()=>processTrivyBatch([{...input[0],report:{} }]),/Malformed/);
});
