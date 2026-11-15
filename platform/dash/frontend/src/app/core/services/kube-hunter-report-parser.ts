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
  const report = parseKubeHunterSection(value);
  const findings = report?.value?.value ?? report?.value ?? report;
  return Array.isArray(findings) ? findings : [];
}
