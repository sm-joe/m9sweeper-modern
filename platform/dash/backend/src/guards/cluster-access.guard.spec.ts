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

describe('RC5 Falco event resource-scope enforcement', () => {
    const actor: any = {id: 14, authorities: [{type: 'ADMIN'}]};
    const context = (clusterId: number, eventId: number): any => ({
        switchToHttp: () => ({getRequest: () => ({
            params: {clusterId: String(clusterId), eventId: String(eventId)},
            query: {}, method: 'GET',
            originalUrl: '/api/falco/' + clusterId + '/events/' + eventId
        })})
    });
    function guardFor(eventClusterId: number) {
        const event: any = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({cluster_id: eventClusterId})
        };
        const owner: any = {
            join: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            whereNull: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({id: 1})
        };
        return new ClusterAccessGuard(actor, {
            getConnection: jest.fn().mockResolvedValue(jest.fn((table: string) =>
                table === 'project_falco_logs' ? event : owner))
        } as any);
    }
    it('denies a Falco event from another cluster even if the route cluster is owned', async () => {
        await expect(guardFor(2).canActivate(context(1, 33)))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
    it('allows event belonging to the authorized route cluster', async () => {
        await expect(guardFor(1).canActivate(context(1, 33)))
            .resolves.toBe(true);
    });
});


describe('P0 kube-bench report ID isolation', () => {
    const actor: any = {id: 44, authorities: [{type: 'READ_ONLY'}]};
    const context = (id: string): any => ({
        switchToHttp: () => ({getRequest: () => ({
            params: {id}, query: {}, method: 'GET',
            originalUrl: '/api/kube-bench/' + id
        })})
    });
    function makeGuard(reportCluster: number, grantedCluster: number) {
        const report = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({cluster_id: reportCluster})
        };
        const owner = {
            join: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            whereNull: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(undefined)
        };
        const grant = {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockImplementation(async () =>
                reportCluster === grantedCluster ? {can_write: false} : undefined)
        };
        const knex = jest.fn((table: string) =>
            table === 'kube_bench' ? report :
            table === 'cluster_user_access' ? grant : owner);
        return {guard: new ClusterAccessGuard(actor, {
            getConnection: jest.fn().mockResolvedValue(knex)
        } as any), report};
    }
    it('allows reading a kube-bench report belonging to a granted cluster', async () => {
        await expect(makeGuard(2, 2).guard.canActivate(context('17'))).resolves.toBe(true);
    });
    it('denies a report from another cluster', async () => {
        await expect(makeGuard(3, 2).guard.canActivate(context('17')))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
    it('rejects invalid report IDs before persistence queries', async () => {
        const {guard, report} = makeGuard(2, 2);
        await expect(guard.canActivate(context('0'))).rejects.toBeInstanceOf(ForbiddenException);
        expect(report.select).not.toHaveBeenCalled();
    });
});


describe('P0 multi-cluster PDF export authorization', () => {
    const actor: any = {id: 44, authorities: [{type: 'READ_ONLY'}]};
    const context = (clusterIds: any): any => ({
        switchToHttp: () => ({getRequest: () => ({
            params: {}, query: clusterIds === undefined ? {} : {clusterIds},
            method: 'GET', originalUrl: '/api/reports/security-audit-report'
        })})
    });
    function make(granted: number[]) {
        const owners: any = {
            join: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
            whereNull: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(undefined)
        };
        let activeCluster = 0;
        const grants: any = {
            where: jest.fn().mockImplementation(function (where: any) {
                activeCluster = where.cluster_id;
                return this;
            }),
            first: jest.fn().mockImplementation(async () =>
                granted.includes(activeCluster) ? {can_write: false} : undefined)
        };
        const knex = jest.fn((table: string) =>
            table === 'cluster_user_access' ? grants : owners);
        return new ClusterAccessGuard(actor, {
            getConnection: jest.fn().mockResolvedValue(knex)
        } as any);
    }
    it('allows an export only when all cluster IDs are granted', async () => {
        await expect(make([1, 2]).canActivate(context(['1', '2']))).resolves.toBe(true);
    });
    it('rejects mixed owned and foreign cluster IDs', async () => {
        await expect(make([1]).canActivate(context(['1', '2'])))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
    it('rejects missing cluster scope, malformed IDs and blank lists', async () => {
        for (const ids of [undefined, [], [''], ['1', '0'], ['1x'], ['-1']]) {
            await expect(make([1]).canActivate(context(ids)))
                .rejects.toBeInstanceOf(ForbiddenException);
        }
    });
});
