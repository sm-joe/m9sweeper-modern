import {kubeHunterFindings, parseKubeHunterSection} from './kube-hunter-report-parser';

describe('kube-hunter report section parser', () => {
  const findings = [{location: 'worker-1', vulnerability: 'test evidence', severity: 'medium'}];
  const payload = {value: {value: findings}};

  it('reads the existing nested JSON string format', () => {
    expect(kubeHunterFindings(JSON.stringify(payload))).toEqual(findings as any);
  });

  it('accepts already parsed JSON objects', () => {
    expect(kubeHunterFindings(payload)).toEqual(findings as any);
  });

  it('shows no findings for a valid empty scan', () => {
    expect(kubeHunterFindings({value: {value: []}})).toEqual([]);
  });

  it('does not throw on malformed scanner JSON', () => {
    expect(parseKubeHunterSection('{')).toBeNull();
    expect(kubeHunterFindings('{')).toEqual([]);
  });
});
