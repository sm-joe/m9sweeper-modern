import {IKubeHunterVulnerabilities} from '../entities/IKubeHunterReport';

/** PostgreSQL JSON columns may arrive as JSON strings or already parsed objects. */
export function parseKubeHunterSection(value: unknown): any {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** kube-hunter's original JSON dispatcher nests findings under value.value. */
export function kubeHunterFindings(value: unknown): IKubeHunterVulnerabilities[] {
  let report = parseKubeHunterSection(value);
  // Older stored reports accidentally serialized class-transformer's metadata
  // envelope, not just the scanner JSON. Recover the original value in place
  // without modifying the historical database record.
  if (report?.key === 'vulnerabilities' && report?.value !== undefined && report?.obj) {
    report = parseKubeHunterSection(report.value);
  }
  const findings = report?.value?.value ?? report?.value ?? report;
  return Array.isArray(findings) ? findings : [];
}
