import {SecurityAuditKubeBenchService} from './security-audit-kube-bench.service';
import {SecurityAuditReportPdfHelpersService} from './security-audit-report-pdf-helpers.service';
import {KubeBenchDto} from '../../kube-bench/dto/kube-bench-dto';

describe('SecurityAuditKubeBenchService PDF resilience', () => {
  const service = new SecurityAuditKubeBenchService(
    new SecurityAuditReportPdfHelpersService(),
    {} as any,
  );

  it('shows an explicit unavailable-data message for incomplete historical reports', () => {
    const report = {resultsJson: {Controls: []}} as unknown as KubeBenchDto;
    const section = service.buildClusterSection(report) as any[];
    expect(section[0].text).toContain('Unscanned');
    expect(JSON.stringify(section)).toContain('No valid kube-bench assessment data available');
  });

  it('renders a valid placeholder table row when a section contains no checks', () => {
    const report = {
      resultsJson: {
        Totals: {total_pass: 0, total_fail: 0, total_warn: 0},
        Controls: [{
          id: '4', text: 'Worker', version: '1.2',
          detected_version: '1.37', tests: [{
            section: '4.1', desc: 'Empty group', results: []
          }]
        }]
      }
    } as unknown as KubeBenchDto;
    const result = service.buildClusterSection(report) as any[];
    const document = JSON.stringify(result);
    expect(document).toContain('No checks in section');
    expect(document).toContain('0/0 Checks Passed');
  });

  it('renders a not-run message when there is no report', () => {
    const result = service.buildClusterSection(undefined) as any[];
    expect(JSON.stringify(result)).toContain('kube-bench scan not run');
  });
});
