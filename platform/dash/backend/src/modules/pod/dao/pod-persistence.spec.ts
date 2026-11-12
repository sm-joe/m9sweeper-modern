import {PodDao} from './pod.dao';

describe('PodDao atomic Kubernetes inventory persistence', () => {
    function db(options: {insertPodFails?: boolean, linkFails?: boolean} = {}) {
        const inserts: string[] = [];
        const podsQuery: any = {
            insert: jest.fn().mockImplementation(() => {
                inserts.push('pod');
                return {
                    returning: options.insertPodFails
                        ? jest.fn().mockRejectedValue(new Error('pod constraint violation'))
                        : jest.fn().mockResolvedValue([{id: 51}])
                };
            })
        };
        const linksQuery: any = {
            insert: jest.fn().mockImplementation(() => {
                inserts.push('links');
                if (options.linkFails) return Promise.reject(new Error('link FK violation'));
                return Promise.resolve(1);
            }),
            where: jest.fn().mockReturnThis(),
            delete: jest.fn().mockResolvedValue(1)
        };
        const trx: any = jest.fn((table: string) => {
            if (table === 'kubernetes_pods') return podsQuery;
            if (table === 'pod_images') return linksQuery;
            throw new Error('Unexpected inventory table');
        });
        const connection: any = {
            transaction: jest.fn().mockImplementation(async (callback: any) => callback(trx))
        };
        const dao = new PodDao({getConnection: jest.fn().mockResolvedValue(connection)} as any, {} as any);
        return {dao, connection, podsQuery, linksQuery, inserts};
    }

    it('inserts pod and unique image links in one transaction', async () => {
        const {dao, connection, linksQuery} = db();
        await expect(dao.savePod({name: 'demo', clusterId: 2} as any, [11, 11, 12]))
            .resolves.toBe(51);
        expect(connection.transaction).toHaveBeenCalledTimes(1);
        expect(linksQuery.insert).toHaveBeenCalledWith([
            {pod_id: 51, image_id: 11}, {pod_id: 51, image_id: 12}
        ]);
    });

    it('refreshes pod metadata and associations in one transaction', async () => {
        const {dao, connection, podsQuery, linksQuery} = db();
        podsQuery.where = jest.fn().mockReturnThis();
        podsQuery.update = jest.fn().mockResolvedValue(1);
        await dao.refreshExistingPod(51, {clusterId: 2, name: 'demo', uid: 'new-uid'} as any, [11, 11, 12]);
        expect(connection.transaction).toHaveBeenCalledTimes(1);
        expect(podsQuery.where).toHaveBeenCalledWith({id: 51, cluster_id: 2});
        expect(podsQuery.update).toHaveBeenCalledWith(expect.objectContaining({uid: 'new-uid'}));
        expect(linksQuery.delete).toHaveBeenCalledTimes(1);
        expect(linksQuery.insert).toHaveBeenCalledWith([
            {pod_id: 51, image_id: 11}, {pod_id: 51, image_id: 12}
        ]);
    });

    it('fails closed if an existing pod vanishes before refresh', async () => {
        const {dao, podsQuery, linksQuery} = db();
        podsQuery.where = jest.fn().mockReturnThis();
        podsQuery.update = jest.fn().mockResolvedValue(0);
        await expect(dao.refreshExistingPod(51, {clusterId: 2} as any, [11]))
            .rejects.toThrow('disappeared');
        expect(linksQuery.delete).not.toHaveBeenCalled();
    });

    it('does not swallow PostgreSQL insert errors', async () => {
        const {dao, connection, linksQuery} = db({insertPodFails: true});
        await expect(dao.savePod({name: 'failed', clusterId: 2} as any, [11]))
            .rejects.toThrow('pod constraint violation');
        expect(connection.transaction).toHaveBeenCalledTimes(1);
        expect(linksQuery.insert).not.toHaveBeenCalled();
    });

    it('propagates image-link errors to roll back the pod transaction', async () => {
        const {dao} = db({linkFails: true});
        await expect(dao.savePod({name: 'failed-link', clusterId: 2} as any, [11]))
            .rejects.toThrow('link FK violation');
    });

    it('does not issue an invalid empty bulk-image insert', async () => {
        const {dao, linksQuery} = db();
        await expect(dao.savePod({name: 'no-image-status', clusterId: 2} as any, []))
            .resolves.toBe(51);
        expect(linksQuery.insert).not.toHaveBeenCalled();
    });

    it('replaces existing image associations atomically, including empty links', async () => {
        const {dao, connection, linksQuery} = db();
        await dao.linkExistingPodImages(51, [11, 11, 12]);
        expect(connection.transaction).toHaveBeenCalledTimes(1);
        expect(linksQuery.where).toHaveBeenCalledWith({pod_id: 51});
        expect(linksQuery.delete).toHaveBeenCalledTimes(1);
        expect(linksQuery.insert).toHaveBeenCalledWith([
            {pod_id: 51, image_id: 11}, {pod_id: 51, image_id: 12}
        ]);
        linksQuery.insert.mockClear();
        await dao.linkExistingPodImages(51, []);
        expect(linksQuery.insert).not.toHaveBeenCalled();
    });
});
