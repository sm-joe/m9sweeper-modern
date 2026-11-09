import {UnauthorizedException} from '@nestjs/common';
import {KubeHunterController} from './kube-hunter.controller';

describe('kube-hunter ingestion authentication', () => {
  let controller: KubeHunterController;
  let users: any;
  let auth: any;
  let reports: any;

  beforeEach(() => {
    users = {loadUserByApiKey: jest.fn().mockResolvedValue([{authorities: ['KUBEHUNTER']}])};
    auth = {checkAuthority: jest.fn().mockReturnValue(true)};
    reports = {saveKubeHunterReport: jest.fn().mockResolvedValue([101])};
    controller = new KubeHunterController(reports, users, auth, {} as any, {log: jest.fn()} as any);
  });

  it('prefers X-API-Key over legacy query key', async () => {
    await controller.saveKubeHunterReport({nodes: {}}, 1, 'old-key', 'header-key');
    expect(users.loadUserByApiKey).toHaveBeenCalledWith('header-key');
    expect(reports.saveKubeHunterReport).toHaveBeenCalled();
  });

  it('denies legacy query authentication by default', async () => {
    const previous = process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS;
    delete process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS;
    users.loadUserByApiKey.mockResolvedValueOnce([]);
    try {
      await expect(controller.saveKubeHunterReport({nodes: {}}, 1, 'legacy-key'))
        .rejects.toMatchObject({status: 401});
      expect(users.loadUserByApiKey).not.toHaveBeenCalled();
      expect(reports.saveKubeHunterReport).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS;
      else process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS = previous;
    }
  });

  it('allows legacy query authentication only with explicit temporary opt-in', async () => {
    const previous = process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS;
    process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS = 'true';
    try {
      await controller.saveKubeHunterReport({nodes: {}}, 1, 'legacy-key');
      expect(users.loadUserByApiKey).toHaveBeenCalledWith('legacy-key');
    } finally {
      if (previous === undefined) delete process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS;
      else process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS = previous;
    }
  });

  it('rejects missing credentials without saving a report', async () => {
    users.loadUserByApiKey.mockResolvedValue([]);
    await expect(controller.saveKubeHunterReport({}, 1, ''))
      .rejects.toMatchObject({status: 401});
    expect(reports.saveKubeHunterReport).not.toHaveBeenCalled();
  });

  it('rejects authenticated empty or malformed reports instead of recording clean scans', async () => {
    for (const invalid of [{}, {nodes: null}, {vulnerabilities: 'not-a-section'}, []]) {
      await expect(controller.saveKubeHunterReport(invalid, 1, undefined, 'valid-key'))
        .rejects.toMatchObject({status: 400});
    }
    expect(reports.saveKubeHunterReport).not.toHaveBeenCalled();
  });

  it('only persists report sections, regenerates UUID and never trusts client DB metadata', async () => {
    await controller.saveKubeHunterReport({
      nodes: {}, services: {}, vulnerabilities: {},
      id: 9999, uuid: 'caller-forgery', clusterId: 333,
      createdAt: 0, maliciousColumn: 'must-not-persist'
    }, 1, undefined, 'valid-key');
    const saved = reports.saveKubeHunterReport.mock.calls[0][0];
    expect(saved.clusterId).toBe(1);
    expect(saved.uuid).not.toBe('caller-forgery');
    expect(saved).not.toHaveProperty('id');
    expect(saved).not.toHaveProperty('createdAt');
    expect(saved).not.toHaveProperty('maliciousColumn');
    expect(Object.keys(saved).sort()).toEqual(
      ['clusterId', 'nodes', 'services', 'uuid', 'vulnerabilities'].sort()
    );
  });

  it('disables raw scanner key export by default', async () => {
    const original = process.env.SCANNER_ALLOW_LEGACY_KEY_EXPORT;
    delete process.env.SCANNER_ALLOW_LEGACY_KEY_EXPORT;
    try {
      await expect(controller.getApiKey()).rejects.toMatchObject({status: 410});
    } finally {
      if (original === undefined) delete process.env.SCANNER_ALLOW_LEGACY_KEY_EXPORT;
      else process.env.SCANNER_ALLOW_LEGACY_KEY_EXPORT = original;
    }
  });

  it('rejects a scanner credential without a grant for the selected cluster in enforced mode', async () => {
    const previous = process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS;
    process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS = 'true';
    users.loadUserByApiKey.mockResolvedValue([{
      id: 17, authorities: ['SCANNER'], isActive: true
    }]);
    users.scannerHasClusterGrant = jest.fn().mockResolvedValue(false);
    try {
      await expect(controller.saveKubeHunterReport({nodes: {}}, 3, undefined, 'scanner-key'))
        .rejects.toMatchObject({status: 401});
      expect(reports.saveKubeHunterReport).not.toHaveBeenCalled();
      expect(users.scannerHasClusterGrant).toHaveBeenCalledWith(17, 3);
    } finally {
      if (previous === undefined) delete process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS;
      else process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS = previous;
    }
  });
});
