import type { CountedSeverity, VulnerabilityRow } from '../contracts/trivy.js';
// Adapted from upstream policy compliance: -1 means unrestricted; distinguish fixable vs unfixable.
export interface Limits { fixable: number; unfixable: number }
export type Thresholds = Record<CountedSeverity, Limits>;
export function evaluatePolicy(issues: VulnerabilityRow[], limits: Thresholds): { compliant: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NEGLIGIBLE'] as const) {
    for (const fixable of [true, false]) {
      const count = issues.filter(x => x.severity === severity && x.isFixable === fixable).length;
      const limit = fixable ? limits[severity].fixable : limits[severity].unfixable;
      if (!Number.isInteger(limit) || limit < -1) throw new Error('Invalid policy threshold');
      if (limit !== -1 && count > limit) reasons.push(`${severity}: ${count} ${fixable ? 'fixable' : 'unfixable'} exceeds ${limit}`);
    }
  }
  return { compliant: reasons.length === 0, reasons };
}
// Admission integration additionally MUST fail closed when an immutable image digest has no fresh scan,
// preserve namespace exceptions, and evaluate every init/regular/ephemeral container.
