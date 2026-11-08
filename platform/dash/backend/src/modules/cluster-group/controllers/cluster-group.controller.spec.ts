import {ForbiddenException} from '@nestjs/common';
import {ClusterGroupController} from './cluster-group.controller';

describe('P0 cluster-group tenant isolation', () => {
  function make(role: string, ownedIds: number[] = [1], grantedGroupIds: number[] = [3]) {
    const service: any = {
      getClusterGroups: jest.fn().mockResolvedValue([{id: 1}, {id: 2}, {id: 3}]),
      getClusterGroupById: jest.fn().mockResolvedValue({id: 1}),
      createClusterGroup: jest.fn(async value => value),
      updateClusterGroup: jest.fn().mockResolvedValue(1),
      deleteClusterGroup: jest.fn().mockResolvedValue(1),
    };
    const ownedQuery: any = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue(ownedIds.map(id => ({id}))),
      first: jest.fn().mockImplementation(async () =>
        ownedIds.includes(ownedQuery.where.mock.calls.at(-1)?.[0]?.id) ? {id: 1} : undefined),
    };
    const grants: any = {
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue(grantedGroupIds.map(group_id => ({group_id}))),
    };
    const knex = jest.fn((table: string) =>
      table.startsWith('clusters as ') ? grants : ownedQuery);
    const db = {getConnection: jest.fn().mockResolvedValue(knex)};
    const controller = new ClusterGroupController(
      {id: 44, authorities: [{type: role}]} as any,
      service, db as any
    );
    return {controller, service};
  }

  it('does not list unrelated groups', async () => {
    const {controller} = make('READ_ONLY');
    expect((await controller.getAllClusters()).map(g => g.id)).toEqual([1, 3]);
  });

  it('denies reading an unrelated group by ID', async () => {
    const {controller, service} = make('READ_ONLY');
    await expect(controller.getClusterGroupById(2)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.getClusterGroupById).not.toHaveBeenCalled();
  });

  it('sets an ordinary admin as owner when creating a group', async () => {
    const {controller, service} = make('ADMIN');
    await controller.createClusterGroup({name: 'new', userId: 999} as any);
    expect(service.createClusterGroup).toHaveBeenCalledWith(
      expect.objectContaining({userId: 44}));
  });

  it('denies updating groups not owned by the user', async () => {
    const {controller, service} = make('ADMIN');
    await expect(controller.updateClusterGroup({name: 'bad'} as any, 2))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(service.updateClusterGroup).not.toHaveBeenCalled();
  });
});
