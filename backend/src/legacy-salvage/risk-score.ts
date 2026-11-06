import type { CountedSeverity, Counts } from '../contracts/trivy.js';

/**
 * Upstream m9sweeper stores severity counts and historical snapshot dates.
 * No canonical weighted risk formula was verified in the inspected upstream main branch.
 * Therefore weights MUST be explicitly configured; otherwise the historical risk
 * value is null (not a misleading invented value).
 */
export const LEGACY_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NEGLIGIBLE'] as const;
export type SeverityWeights = Record<CountedSeverity, number>;
export interface RiskModel { algorithm: string; weights: SeverityWeights }
export function weightedRisk(counts: Counts, model?: RiskModel): number | null {
  if (!model) return null;
  if (!model.algorithm || !/^legacy-verified-v[0-9]+$|^custom-v[0-9]+$/.test(model.algorithm)) {
    throw new Error('An explicit versioned risk algorithm is required');
  }
  let score = 0;
  for (const severity of LEGACY_SEVERITIES) {
    const weight = model.weights[severity];
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`Invalid weight: ${severity}`);
    score += counts[severity] * weight;
  }
  if (!Number.isSafeInteger(score) && !Number.isFinite(score)) throw new Error('Invalid calculated risk score');
  return score;
}
