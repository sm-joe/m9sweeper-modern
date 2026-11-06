/**
 * Framework-independent port of upstream ImageComplianceService.
 * Source: m9sweeper/m9sweeper dash/backend/src/modules/policy/services/image-compliance-service.ts
 * Semantics retained: -1 unlimited, <= thresholds, required scanners for enforcement,
 * global/policy/scanner/CVE exceptions, fail on scanner error or missing scanner.
 * Intentional safety corrections: no unknown scanner, malformed limits or unknown severity
 * silently accepted; explicit audit trail of exceptions and failures.
 */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NEGLIGIBLE';
export type Limits = Record<Severity, { fixable: number; unfixable: number }>;
export type Policy = { id: string; name: string; enabled: boolean; enforcement: boolean };
export type Scanner = { id: string; name: string; enabled: boolean; required: boolean; limits: Limits };
export type Finding = { scannerId: string; cve: string; severity: string; fixable: boolean };
export type Exception = { title: string; scannerId?: string; cve?: string };
export type PolicyInput = { policy: Policy; scanners: Scanner[]; findings: Finding[]; exceptions?: Exception[]; scanError?: boolean };
export type Decision = { compliant: boolean; reasons: string[]; excepted: number; checked: number; policyId: string };
export const SEVERITIES = ['CRITICAL','HIGH','MEDIUM','LOW','NEGLIGIBLE'] as const;
export function legacySettingsToLimits(settings: Record<string, number>): Limits {
  return Object.fromEntries(SEVERITIES.map((s, i) => {
    const names = ['Critical','Major','Normal','Low','Negligible'];
    return [s, { fixable: settings['fixable' + names[i]], unfixable: settings['unFixable' + names[i]] }];
  })) as Limits;
}
function validateLimits(limits: Limits): void {
  for (const severity of SEVERITIES) {
    const limitsForSeverity = limits?.[severity];
    for (const limit of [limitsForSeverity?.fixable, limitsForSeverity?.unfixable]) {
      if (!Number.isInteger(limit) || limit! < -1) throw new Error('Malformed scanner threshold: ' + severity);
    }
  }
}
export function assessImageCompliance(input: PolicyInput): Decision {
  const { policy, scanners, findings, exceptions = [], scanError = false } = input;
  if (!policy || !Array.isArray(scanners) || !Array.isArray(findings) || !Array.isArray(exceptions)) {
    throw new Error('Invalid policy evaluation input');
  }
  const decision: Decision = { compliant: false, reasons: [], excepted: 0, checked: 0, policyId: policy.id };
  if (scanError) { decision.reasons.push('Error encountered scanning image'); return decision; }
  if (!policy.enabled) { decision.compliant = true; decision.reasons.push('Policy disabled'); return decision; }
  if (scanners.length === 0) { decision.compliant = true; decision.reasons.push('Policy has no scanners'); return decision; }
  const map = new Map(scanners.map(s => [s.id, s]));
  if (map.size !== scanners.length) throw new Error('Duplicate scanner id');
  // Upstream groups findings by scanner, then only assesses scanners with findings.
  for (const finding of findings) {
    if (!map.has(finding.scannerId)) throw new Error('Finding references missing scanner');
    if (!SEVERITIES.includes(finding.severity.toUpperCase() as Severity)) throw new Error('Unknown finding severity');
  }
  const selected = policy.enforcement ? scanners.filter(s => s.required) : scanners;
  let passing = 0;
  for (const scanner of selected) {
    validateLimits(scanner.limits);
    if (!scanner.enabled) { passing++; continue; }
    const buckets = new Map<string, number>();
    let scannerPassed = true;
    for (const finding of findings.filter(f => f.scannerId === scanner.id)) {
      const excepted = exceptions.find(e => (!e.scannerId || e.scannerId === scanner.id) &&
        (!e.cve || e.cve === finding.cve));
      if (excepted) { decision.excepted++; continue; }
      decision.checked++;
      const severity = finding.severity.toUpperCase() as Severity;
      const key = severity + ':' + (finding.fixable ? 'fixable' : 'unfixable');
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    for (const severity of SEVERITIES) {
      for (const fixable of [true,false]) {
        const count = buckets.get(severity + ':' + (fixable ? 'fixable' : 'unfixable')) ?? 0;
        const allowed = fixable ? scanner.limits[severity].fixable : scanner.limits[severity].unfixable;
        if (allowed >= 0 && count > allowed) {
          decision.reasons.push(`${scanner.name}: ${severity} ${fixable ? 'fixable' : 'unfixable'} count ${count} exceeds ${allowed}`);
          scannerPassed = false;
        }
      }
    }
    if (scannerPassed) passing++;
  }
  // Upstream: enforced=all required scanners; not enforced=any enabled scanner; no findings passes.
  decision.compliant = policy.enforcement ? passing === selected.length : passing > 0 || selected.length === 0;
  return decision;
}
/** Original admission webhook: unknown/unscanned images are denied unless exempted. */
export function assessPodImages(images: Array<{ ref: string; scanned: boolean; compliant: boolean; exempted?: boolean }>, enforcement: boolean) {
  if (!enforcement) return { allowed: true, reasons: ['Enforcement disabled'] };
  if (images.length === 0) return { allowed: false, reasons: ['Pod has no assessable images'] };
  const reasons = images.flatMap(i => i.exempted ? [] : !i.scanned ? [`Unscanned image: ${i.ref}`] : !i.compliant ? [`Non-compliant image: ${i.ref}`] : []);
  return { allowed: reasons.length === 0, reasons };
}
