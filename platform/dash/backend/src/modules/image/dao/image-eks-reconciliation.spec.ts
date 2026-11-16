import {ImageDao} from './image.dao';

describe('EKS image identity reconciliation', () => {
  const host = '602401143452.dkr.ecr.us-east-1.amazonaws.com';
  const imageHash = 'a'.repeat(64);

  it('refuses to rewrite images from untrusted registries without accessing the database', async () => {
    const database = {getConnection: jest.fn()};
    const dao = new ImageDao(database as any, {} as any);
    expect(await dao.reconcileLegacyEcrImage(1, imageHash, 'amazon-k8s-cni',
      'v1.22.4-eksbuild.10', 'docker.io')).toBeUndefined();
    expect(await dao.reconcileLegacyEcrImage(1, imageHash, 'amazon-k8s-cni',
      'v1.22.4-eksbuild.10', host + '.evil.com')).toBeUndefined();
    expect(database.getConnection).not.toHaveBeenCalled();
  });

  it('repairs the existing image ID only for a matching digest, tag and Docker Hub fallback', async () => {
    const query: any = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      whereNot: jest.fn().mockReturnThis(),
      forUpdate: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce({id: 1}),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{id: 1}])
    };
    const trx = jest.fn().mockReturnValue(query);
    const knex: any = {transaction: jest.fn(async callback => callback(trx))};
    const dao = new ImageDao({getConnection: jest.fn().mockResolvedValue(knex)} as any, {} as any);
    expect(await dao.reconcileLegacyEcrImage(1, imageHash, 'amazon-k8s-cni',
      'v1.22.4-eksbuild.10', host)).toBe(1);
    expect(query.where).toHaveBeenCalledWith({
      cluster_id: 1, docker_image_id: imageHash, url: 'docker.io',
      name: 'amazon-k8s-cni', tag: 'v1.22.4-eksbuild.10'
    });
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      url: host, image: host + '/amazon-k8s-cni:v1.22.4-eksbuild.10'
    }));
    expect(query.whereNot).toHaveBeenCalledWith('scan_queued', true);
  });
});
