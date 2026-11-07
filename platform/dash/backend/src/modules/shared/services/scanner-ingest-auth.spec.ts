import {parseScannerClusterId, selectScannerIngestKey} from './scanner-ingest-auth';

describe('RC4 scanner ingestion credentials', () => {
  it('prefers header-based authentication', () => {
    expect(selectScannerIngestKey('header-value', 'legacy-value', true)).toBe('header-value');
    expect(selectScannerIngestKey('header-value', 'legacy-value', false)).toBe('header-value');
  });

  it('allows legacy query keys only when explicitly permitted', () => {
    expect(selectScannerIngestKey(undefined, 'legacy-value', true)).toBe('legacy-value');
    expect(selectScannerIngestKey(undefined, 'legacy-value', false)).toBe('');
  });

  it.each(['', 'token\nsecret', 'token\rsecret', 'token\0secret', 'x'.repeat(4097)])(
    'rejects missing or unsafe token', token => {
      expect(selectScannerIngestKey(token, undefined, false)).toBe('');
    }
  );

  it('returns no credential when neither source exists', () => {
    expect(selectScannerIngestKey(undefined, undefined, false)).toBe('');
  });

  it('accepts only positive integer scanner cluster IDs', () => {
    expect(parseScannerClusterId('3')).toBe(3);
    expect(parseScannerClusterId(17)).toBe(17);
    for (const invalid of ['', '0', '-1', '1.2', '1e3', ' 1', '1x', '9999999999999999999999']) {
      expect(Number.isNaN(parseScannerClusterId(invalid))).toBe(true);
    }
  });
});
