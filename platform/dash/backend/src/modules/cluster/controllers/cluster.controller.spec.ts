import {ClusterController} from './cluster.controller';

describe('P0 cluster inventory tenant filtering', () => {
  const clusters = [
    {id: 1, name: 'permitted', kubeConfig: 'private'},
    {id: 2, name: 'foreign', kubeConfig: 'private'},
    {id: 3, name: 'granted', kubeConfig: 'private'},
  ];
  function make(role: string) {
    const service = {getAllClusters: jest.fn().mockImplementation(async () =>
      clusters.map(cluster => ({...cluster})))};
    const owned = {
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([{id: 1}]),
    };
    const grant = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([{cluster_id: 3}]),
    };
    const connection = jest.fn((table: string) =>
      table === 'cluster_user_access' ? grant : owned);
    const database = {getConnection: jest.fn().mockResolvedValue(connection)};
    const controller = new ClusterController(
      {id: 9, authorities: [{type: role}]} as any,
      service as any, {} as any, {} as any, {} as any, database as any
    );
    return {controller, database};
  }

  it('filters the cluster list to owned and granted clusters', async () => {
    const {controller} = make('READ_ONLY');
    const result = await controller.getAllClusters();
    expect(result.map(cluster => cluster.id)).toEqual([1, 3]);
    expect(result.every(cluster => !cluster.kubeConfig)).toBe(true);
  });

  it('preserves super-admin visibility while removing kubeconfig', async () => {
    const {controller, database} = make('SUPER_ADMIN');
    const result = await controller.getAllClusters();
    expect(result.map(cluster => cluster.id)).toEqual([1, 2, 3]);
    expect(result.every(cluster => !cluster.kubeConfig)).toBe(true);
    expect(database.getConnection).not.toHaveBeenCalled();
  });
});
