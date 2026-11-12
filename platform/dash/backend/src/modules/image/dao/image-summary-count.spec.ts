import {ImageDao} from './image.dao';

describe('image count dashboard SQL scoping', () => {
    it('uses whereIn for Angular-selected cluster arrays instead of equality against an array', async () => {
        const query: any = {
            count: jest.fn().mockReturnThis(),
            whereIn: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis()
        };
        const knex: any = jest.fn().mockReturnValue(query);
        const dao = new ImageDao({getConnection: jest.fn().mockResolvedValue(knex)} as any, {} as any);
        await dao.getCountOfTotalImagesRunningCount({
            cluster_id: [5, 7],
            running_in_cluster: false
        });
        expect(query.whereIn).toHaveBeenCalledWith('cluster_id', [5, 7]);
        expect(query.where).toHaveBeenCalledWith('running_in_cluster', false);
        expect(query.where).not.toHaveBeenCalledWith(expect.objectContaining({cluster_id: [5, 7]}));
    });

    it('never runs an unfiltered image count when no cluster is selected', async () => {
        const knex: any = jest.fn();
        const dao = new ImageDao({getConnection: jest.fn().mockResolvedValue(knex)} as any, {} as any);
        expect(await dao.getCountOfTotalImagesRunningCount({cluster_id: []}))
            .toEqual([{count: 0}]);
        expect(knex).not.toHaveBeenCalled();
    });
});
