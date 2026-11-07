import {validateScannerReportEndpoint} from './report-endpoint';

describe('scanner report-ingestion endpoint (Kubernetes Pod network)', () => {
  it.each(['', 'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://[::1]:3000', 'http://127.7.0.3:3000', 'file:///etc/passwd',
    'http://user:pass@internal:3000', 'http://dash:3000?key=secret',
    'http://dash:3000#hash', 'not a URL', 'http://0.0.0.0:3000'])(
      'rejects invalid or Pod-local endpoint %s', value => {
        expect(validateScannerReportEndpoint(value)).toBeNull();
      });
  it.each([
    ['http://m9sweeper-dash.m9sweeper-system.svc.cluster.local:3000/', 'http://m9sweeper-dash.m9sweeper-system.svc.cluster.local:3000'],
    ['https://scanner-api.example.org/', 'https://scanner-api.example.org'],
    ['http://172.24.0.3:3000', 'http://172.24.0.3:3000']
  ])('accepts an explicit reachable endpoint %s', (input, expected) => {
    expect(validateScannerReportEndpoint(input)).toBe(expected);
  });
});
