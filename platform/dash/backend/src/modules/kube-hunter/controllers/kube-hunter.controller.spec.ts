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

  it('keeps legacy query authentication during the migration', async () => {
    await controller.saveKubeHunterReport({nodes: {}}, 1, 'legacy-key');
    expect(users.loadUserByApiKey).toHaveBeenCalledWith('legacy-key');
  });

  it('rejects missing credentials without saving a report', async () => {
    users.loadUserByApiKey.mockResolvedValue([]);
    await expect(controller.saveKubeHunterReport({}, 1, ''))
      .rejects.toMatchObject({status: 401});
    expect(reports.saveKubeHunterReport).not.toHaveBeenCalled();
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
      await expect(controller.saveKubeHunterReport({nodes: {}}, 3, 'scanner-key'))
        .rejects.toMatchObject({status: 401});
      expect(reports.saveKubeHunterReport).not.toHaveBeenCalled();
      expect(users.scannerHasClusterGrant).toHaveBeenCalledWith(17, 3);
    } finally {
      if (previous === undefined) delete process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS;
      else process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS = previous;
    }
  });
});
