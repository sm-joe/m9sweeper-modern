import { HttpException } from '@nestjs/common';
import { KubeBenchController } from './kube-bench.controller';

describe('kube-bench report ingestion credential and evidence gates', () => {
  const userDao = {loadUserByApiKey: jest.fn(), scannerHasClusterGrant: jest.fn()};
  const authService = {checkAuthority: jest.fn()};
  const benchService = {saveKubeBenchReport: jest.fn()};
  const logger = {log: jest.fn()};
  let controller: KubeBenchController;
  beforeEach(() => {
    jest.clearAllMocks();
    controller = new KubeBenchController({} as any, benchService as any,
      userDao as any, authService as any, {} as any, logger as any);
  });
  const valid = {
    Controls: [{id: '1', tests: []}],
    Totals: {total_pass: 2, total_fail: 1, total_warn: 0, total_info: 0}
  };
  it('returns 401 when no key is supplied', async () => {
    await expect(controller.saveKubeBenchReport(valid, 1, undefined))
      .rejects.toMatchObject({status: 401});
    expect(userDao.loadUserByApiKey).not.toHaveBeenCalled();
  });
  it('rejects legacy query credentials by default before database lookup', async () => {
    const previous = process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS;
    delete process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS;
    try {
      await expect(controller.saveKubeBenchReport(valid, 1, 'query-only'))
        .rejects.toMatchObject({status: 401});
      expect(userDao.loadUserByApiKey).not.toHaveBeenCalled();
      expect(benchService.saveKubeBenchReport).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS;
      else process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS = previous;
    }
  });
  it('returns 401 when lookup returns no rows', async () => {
    userDao.loadUserByApiKey.mockResolvedValue([]);
    await expect(controller.saveKubeBenchReport(valid, 1, undefined, 'wrong'))
      .rejects.toMatchObject({status: 401});
    expect(benchService.saveKubeBenchReport).not.toHaveBeenCalled();
  });
  it('does not store a report without scanner authority', async () => {
    userDao.loadUserByApiKey.mockResolvedValue([{authorities: []}]);
    authService.checkAuthority.mockReturnValue(false);
    await expect(controller.saveKubeBenchReport(valid, 1, undefined, 'valid-but-unprivileged'))
      .rejects.toMatchObject({status: 401});
    expect(benchService.saveKubeBenchReport).not.toHaveBeenCalled();
  });
  it('prefers the x-api-key header over a legacy query key', async () => {
    userDao.loadUserByApiKey.mockResolvedValue([{authorities: []}]);
    authService.checkAuthority.mockReturnValue(true);
    benchService.saveKubeBenchReport.mockResolvedValue([{id: 19}]);
    await controller.saveKubeBenchReport(valid, 1, 'legacy', 'header-credential');
    expect(userDao.loadUserByApiKey).toHaveBeenCalledWith('header-credential');
    expect(benchService.saveKubeBenchReport).toHaveBeenCalledTimes(1);
  });
  it('does not downgrade malformed header credentials to legacy query credentials', async () => {
    await expect(controller.saveKubeBenchReport(valid, 1, 'query-only', ''))
      .rejects.toMatchObject({status: 401});
    expect(userDao.loadUserByApiKey).not.toHaveBeenCalled();
  });
  it('requires an explicit per-cluster grant in enforced mode', async () => {
    const previous = process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS;
    process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS = 'true';
    userDao.loadUserByApiKey.mockResolvedValue([{id: 18, authorities: [], isActive: true}]);
    userDao.scannerHasClusterGrant.mockResolvedValue(false);
    authService.checkAuthority.mockReturnValue(true);
    try {
      await expect(controller.saveKubeBenchReport(valid, 2, undefined, 'header-key'))
        .rejects.toMatchObject({status: 401});
      expect(userDao.scannerHasClusterGrant).toHaveBeenCalledWith(18, 2);
      expect(benchService.saveKubeBenchReport).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS;
      else process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS = previous;
    }
  });
  it('rejects raw-key export unless compatibility is explicitly enabled', async () => {
    const previous = process.env.SCANNER_ALLOW_LEGACY_KEY_EXPORT;
    delete process.env.SCANNER_ALLOW_LEGACY_KEY_EXPORT;
    try { await expect(controller.getApiKey()).rejects.toMatchObject({status: 410}); }
    finally {
      if (previous === undefined) delete process.env.SCANNER_ALLOW_LEGACY_KEY_EXPORT;
      else process.env.SCANNER_ALLOW_LEGACY_KEY_EXPORT = previous;
    }
  });
  it('rejects malformed scans instead of inserting fabricated findings', async () => {
    userDao.loadUserByApiKey.mockResolvedValue([{authorities: []}]);
    authService.checkAuthority.mockReturnValue(true);
    await expect(controller.saveKubeBenchReport({Totals: {total_pass: 3}}, 1, undefined, 'valid'))
      .rejects.toMatchObject({status: 400});
    expect(benchService.saveKubeBenchReport).not.toHaveBeenCalled();
  });
  it('rejects invalid cluster IDs before credential lookup', async () => {
    await expect(controller.saveKubeBenchReport(valid, -1, undefined, 'key'))
      .rejects.toMatchObject({status: 400});
    expect(userDao.loadUserByApiKey).not.toHaveBeenCalled();
  });
});
