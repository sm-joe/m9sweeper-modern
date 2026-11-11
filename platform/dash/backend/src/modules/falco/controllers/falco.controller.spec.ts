import {UnauthorizedException} from '@nestjs/common';
import {FalcoController} from './falco.controller';

describe('Falco ingestion authentication', () => {
  let controller: FalcoController;
  let users: any;
  let falco: any;
  let auth: any;

  beforeEach(() => {
    users = {loadUserByApiKey: jest.fn().mockResolvedValue([{authorities: ['FALCO']}])};
    auth = {checkAuthority: jest.fn().mockReturnValue(true)};
    falco = {
      checkRules: jest.fn().mockResolvedValue('NONE'),
      createFalcoLog: jest.fn().mockResolvedValue({id: 12})
    };
    controller = new FalcoController(falco, {} as any, users, auth, {log: jest.fn()} as any);
  });

  it('applies nonzero default pagination to the real Falco history endpoint', async () => {
    falco.getFalcoLogs = jest.fn().mockResolvedValue({logCount: 1, list: [{id: 12}]});
    const result = await controller.getFalcoLogs(3);
    expect(falco.getFalcoLogs).toHaveBeenCalledWith(
      3, 20, 0, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined
    );
    expect(result.logCount).toBe(1);
  });

  it('rejects invalid pagination values by applying safe defaults', async () => {
    falco.getFalcoLogs = jest.fn().mockResolvedValue({logCount: 0, list: []});
    await controller.getFalcoLogs(3, -5, Number.NaN);
    expect(falco.getFalcoLogs).toHaveBeenCalledWith(
      3, 20, 0, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined
    );
  });

  it('uses the header in preference to the query token', async () => {
    await controller.createFalcoLog(3, {rule: 'test', priority: 'Warning', output: 'test', outputFields: {}} as any, 'legacy-token', 'header-token');
    expect(users.loadUserByApiKey).toHaveBeenCalledWith('header-token');
  });

  it('rejects an empty API key lookup without writing a Falco event', async () => {
    users.loadUserByApiKey.mockResolvedValue([]);
    await expect(controller.createFalcoLog(3, {rule: 'test', priority: 'Warning', output: 'test', outputFields: {}} as any, 'bad-token'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(falco.createFalcoLog).not.toHaveBeenCalled();
  });

  it('rejects missing credentials before identity lookup or malformed-event parsing', async () => {
    await expect(controller.createFalcoLog(3, {rule: 'incomplete'} as any, undefined))
      .rejects.toMatchObject({status: 401});
    expect(users.loadUserByApiKey).not.toHaveBeenCalled();
    expect(falco.checkRules).not.toHaveBeenCalled();
    expect(falco.createFalcoLog).not.toHaveBeenCalled();
  });

  it('rejects an invalid credential on malformed event before returning payload validation errors', async () => {
    users.loadUserByApiKey.mockResolvedValue([]);
    await expect(controller.createFalcoLog(3, {rule: 'incomplete'} as any, 'invalid-key'))
      .rejects.toMatchObject({status: 401});
    expect(falco.checkRules).not.toHaveBeenCalled();
    expect(falco.createFalcoLog).not.toHaveBeenCalled();
  });

  it('rejects revoked scanner credentials before parsing malformed events', async () => {
    users.loadUserByApiKey.mockResolvedValue([{id: 9, authorities: ['FALCO'], isActive: false}]);
    await expect(controller.createFalcoLog(3, {rule: 'incomplete'} as any, 'revoked-key'))
      .rejects.toMatchObject({status: 401});
    expect(falco.createFalcoLog).not.toHaveBeenCalled();
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

  it('rejects malformed events before invoking the Falco persistence service', async () => {
    await expect(controller.createFalcoLog(3, {rule: 'incomplete'} as any, 'token'))
      .rejects.toMatchObject({status: 400});
    expect(falco.createFalcoLog).not.toHaveBeenCalled();
  });

  it('rejects invalid cluster IDs before persisting events', async () => {
    await expect(controller.createFalcoLog('invalid' as any,
      {rule: 'test', priority: 'Warning', output: 'test', outputFields: {}} as any, 'token'))
      .rejects.toMatchObject({status: 400});
    expect(falco.createFalcoLog).not.toHaveBeenCalled();
  });

  it('rejects a scanner credential without a grant for the selected cluster in enforced mode', async () => {
    const previous = process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS;
    process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS = 'true';
    users.loadUserByApiKey.mockResolvedValue([{
      id: 17, authorities: ['SCANNER'], isActive: true
    }]);
    users.scannerHasClusterGrant = jest.fn().mockResolvedValue(false);
    try {
      await expect(controller.createFalcoLog(3,
        {rule: 'test', priority: 'Warning', output: 'test', outputFields: {}} as any,
        'scanner-key')).rejects.toMatchObject({status: 401});
      expect(falco.createFalcoLog).not.toHaveBeenCalled();
      expect(users.scannerHasClusterGrant).toHaveBeenCalledWith(17, 3);
    } finally {
      if (previous === undefined) delete process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS;
      else process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS = previous;
    }
  });
});
