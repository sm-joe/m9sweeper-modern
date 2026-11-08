import {ForbiddenException} from '@nestjs/common';
import {ClusterAccessGuard} from './cluster-access.guard';

describe('RC4 cluster-scoped access', () => {
    const context = (clusterId?: number, method = 'GET'): any => ({
        switchToHttp: () => ({getRequest: () => ({
            params: clusterId ? {clusterId: String(clusterId)} : {},
            query: {}, method, originalUrl: '/api/clusters/images'
        })})
    });

    function make(user: any, owner: boolean, canWrite: boolean | null) {
        const ownerQuery: any = {
            join: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
            whereNull: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(owner ? {id: 2} : undefined)
        };
        const grantQuery: any = {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(canWrite === null ? undefined : {can_write: canWrite})
        };
        const knex = jest.fn((table: string) =>
            table.startsWith('clusters') ? ownerQuery : grantQuery);
        return {
            guard: new ClusterAccessGuard(user, {getConnection: jest.fn().mockResolvedValue(knex)} as any),
            ownerQuery, grantQuery
        };
    }

    const user = {id: 44, authorities: [{type: 'ADMIN'}]};
    it('allows super admins without a scoped grant', async () => {
        const {guard} = make({id: 1, authorities: [{type: 'SUPER_ADMIN'}]}, false, null);
        await expect(guard.canActivate(context())).resolves.toBe(true);
    });
    it('allows explicit read-only cluster grants for GET', async () => {
        await expect(make(user, false, false).guard.canActivate(context(2))).resolves.toBe(true);
    });
    it('rejects writes using a read-only cluster grant', async () => {
        await expect(make(user, false, false).guard.canActivate(context(2, 'POST')))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
    it('permits writes with write grants', async () => {
        await expect(make(user, false, true).guard.canActivate(context(2, 'POST')))
            .resolves.toBe(true);
    });
    it('denies access to a different cluster', async () => {
        await expect(make(user, false, null).guard.canActivate(context(99)))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
    it('denies unscoped cross-cluster aggregate requests', async () => {
        await expect(make(user, false, true).guard.canActivate(context()))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
    it('allows the cluster group owner', async () => {
        await expect(make(user, true, null).guard.canActivate(context(2, 'POST')))
            .resolves.toBe(true);
    });
    it('rejects missing identity', async () => {
        await expect(make(null, false, null).guard.canActivate(context(2)))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
});


describe('RC5 resource-scoped cluster mismatch denial', () => {
    const actor: any = {id: 44, authorities: [{type: 'ADMIN'}]};
    function guardFor(imageCluster: number) {
        const images: any = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            whereNull: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({cluster_id: imageCluster})
        };
        const owner: any = {
            join: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            whereNull: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({id: 1})
        };
        const knex = jest.fn((table: string) =>
            table === 'images' ? images : owner);
        return new ClusterAccessGuard(actor, {
            getConnection: jest.fn().mockResolvedValue(knex)
        } as any);
    }
    function context(clusterId: number, imageId: number): any {
        return {switchToHttp: () => ({getRequest: () => ({
            params: {clusterId: String(clusterId), imageId: String(imageId)},
            query: {}, method: 'GET',
            originalUrl: '/api/clusters/' + clusterId + '/images/' + imageId
        })})};
    }
    it('blocks image from a different cluster even if request cluster is owned', async () => {
        await expect(guardFor(2).canActivate(context(1, 33)))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
    it('allows image with matching route cluster', async () => {
        await expect(guardFor(1).canActivate(context(1, 33)))
            .resolves.toBe(true);
    });
    it('rejects malformed image scope without querying database rows', async () => {
        await expect(guardFor(1).canActivate(context(1, 0)))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
});
