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

  it('uses the header in preference to the query token', async () => {
    await controller.createFalcoLog(3, {rule: 'test'} as any, 'legacy-token', 'header-token');
    expect(users.loadUserByApiKey).toHaveBeenCalledWith('header-token');
  });

  it('rejects an empty API key lookup without writing a Falco event', async () => {
    users.loadUserByApiKey.mockResolvedValue([]);
    await expect(controller.createFalcoLog(3, {rule: 'test'} as any, 'bad-token'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(falco.createFalcoLog).not.toHaveBeenCalled();
  });
});
