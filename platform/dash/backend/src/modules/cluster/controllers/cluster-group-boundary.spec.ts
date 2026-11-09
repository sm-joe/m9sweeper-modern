import {ForbiddenException} from '@nestjs/common';
import {ClusterController} from './cluster.controller';

describe('P0 cluster-group write boundary', () => {
  const make = (role: string, ownsGroup: boolean) => {
    const ownerQuery: any = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(ownsGroup ? {id: 9} : undefined)
    };
    const knex = jest.fn().mockReturnValue(ownerQuery);
    const db = {getConnection: jest.fn().mockResolvedValue(knex)};
    const service = {
      createCluster: jest.fn().mockResolvedValue({id: 5}),
      getClusterById: jest.fn().mockResolvedValue({id: 5}),
      updateCluster: jest.fn().mockResolvedValue({id: 5}),
      calculateClusterMetaData: jest.fn().mockResolvedValue({})
    };
    const kubeService = {sync: jest.fn().mockResolvedValue(null)};
    const logger = {log: jest.fn(), error: jest.fn()};
    const ctrl = new ClusterController(
      {id: 12, authorities: [{type: role}]} as any,
      service as any, kubeService as any, {} as any, logger as any, db as any
    );
    return {ctrl, ownerQuery, service, db};
  };

  it('denies ordinary admin creating a cluster in a foreign group', async () => {
    const {ctrl, service} = make('ADMIN', false);
    await expect(ctrl.createCluster({groupId: 9, installWebhook: 'manually'} as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(service.createCluster).not.toHaveBeenCalled();
  });

  it('allows normal admin onboarding to their own group', async () => {
    const {ctrl, service, ownerQuery} = make('ADMIN', true);
    await expect(ctrl.createCluster({groupId: 9, installWebhook: 'manually'} as any))
      .resolves.toMatchObject({id: 5});
    expect(ownerQuery.where).toHaveBeenCalledWith({id: 9, user_id: 12});
    expect(service.createCluster).toHaveBeenCalledTimes(1);
  });

  it('blocks moving an existing cluster into another tenant group', async () => {
    const {ctrl, service} = make('ADMIN', false);
    await expect(ctrl.updateCluster({groupId: 9} as any, 5))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(service.updateCluster).not.toHaveBeenCalled();
  });

  it('requires a valid group ID before using Kubernetes credentials', async () => {
    const {ctrl, service} = make('ADMIN', true);
    await expect(ctrl.createCluster({groupId: 0} as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(service.createCluster).not.toHaveBeenCalled();
  });

  it('preserves global group management for SUPER_ADMIN', async () => {
    const {ctrl, db, service} = make('SUPER_ADMIN', false);
    await expect(ctrl.createCluster({groupId: 9, installWebhook: 'manually'} as any))
      .resolves.toMatchObject({id: 5});
    expect(db.getConnection).not.toHaveBeenCalled();
    expect(service.createCluster).toHaveBeenCalledTimes(1);
  });
});
