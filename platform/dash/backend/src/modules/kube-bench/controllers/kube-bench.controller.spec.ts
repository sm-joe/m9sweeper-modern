import { HttpException } from '@nestjs/common';
import { KubeBenchController } from './kube-bench.controller';

describe('kube-bench report ingestion credential and evidence gates', () => {
  const userDao = {loadUserByApiKey: jest.fn()};
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
  it('returns 401 when lookup returns no rows', async () => {
    userDao.loadUserByApiKey.mockResolvedValue([]);
    await expect(controller.saveKubeBenchReport(valid, 1, 'wrong'))
      .rejects.toMatchObject({status: 401});
    expect(benchService.saveKubeBenchReport).not.toHaveBeenCalled();
  });
  it('does not store a report without scanner authority', async () => {
    userDao.loadUserByApiKey.mockResolvedValue([{authorities: []}]);
    authService.checkAuthority.mockReturnValue(false);
    await expect(controller.saveKubeBenchReport(valid, 1, 'valid-but-unprivileged'))
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
  it('rejects malformed scans instead of inserting fabricated findings', async () => {
    userDao.loadUserByApiKey.mockResolvedValue([{authorities: []}]);
    authService.checkAuthority.mockReturnValue(true);
    await expect(controller.saveKubeBenchReport({Totals: {total_pass: 3}}, 1, 'valid'))
      .rejects.toMatchObject({status: 400});
    expect(benchService.saveKubeBenchReport).not.toHaveBeenCalled();
  });
  it('rejects invalid cluster IDs before credential lookup', async () => {
    await expect(controller.saveKubeBenchReport(valid, -1, 'key'))
      .rejects.toMatchObject({status: 400});
    expect(userDao.loadUserByApiKey).not.toHaveBeenCalled();
  });
});
