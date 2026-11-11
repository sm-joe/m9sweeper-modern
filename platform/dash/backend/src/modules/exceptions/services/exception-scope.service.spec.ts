import {ForbiddenException} from '@nestjs/common';
import {ExceptionScopeService} from './exception-scope.service';

describe('P0 exception cluster isolation', () => {
    const user: any = {id: 40, authorities: [{type: 'ADMIN'}]};
    const superAdmin: any = {id: 1, authorities: [{type: 'SUPER_ADMIN'}]};
    function make(links: Array<{exception_id: number, cluster_id: number}> = []) {
        const lookup: any = {
            whereIn: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue(links)
        };
        const db: any = {getConnection: jest.fn().mockResolvedValue(
            jest.fn().mockReturnValue(lookup)
        )};
        return new ExceptionScopeService(db);
    }
    it('refuses global or unspecified cluster exceptions for ordinary admins', async () => {
        const scope = make();
        for (const clusters of [[], undefined, [0], [2, 2], ['2']]) {
            await expect(scope.assertRequested(user, clusters)).rejects.toBeInstanceOf(ForbiddenException);
        }
    });
    it('does not allow admin to create across any unauthorized cluster', async () => {
        const scope = make();
        (scope as any).authorizedClusterIds = jest.fn().mockResolvedValue(new Set([2]));
        await expect(scope.assertRequested(user, [2, 3])).rejects.toBeInstanceOf(ForbiddenException);
        await expect(scope.assertRequested(user, [2])).resolves.toBeUndefined();
    });
    it('permits super-admin global exceptions', async () => {
        await expect(make().assertRequested(superAdmin, undefined)).resolves.toBeUndefined();
    });
    it('excludes global and mixed-tenant exceptions from list results', async () => {
        const scope = make([
            {exception_id: 7, cluster_id: 2},
            {exception_id: 8, cluster_id: 2},
            {exception_id: 8, cluster_id: 3}
        ]);
        (scope as any).authorizedClusterIds = jest.fn().mockResolvedValue(new Set([2]));
        const allowed = await scope.visibleIds(user, [7, 8, 9]);
        expect([...allowed]).toEqual([7]);
    });
    it('does not expose an exception which spans a foreign cluster', async () => {
        const scope = make([{exception_id: 8, cluster_id: 2}, {exception_id: 8, cluster_id: 3}]);
        (scope as any).authorizedClusterIds = jest.fn().mockResolvedValue(new Set([2]));
        expect((await scope.visibleIds(user, [8])).size).toBe(0);
    });
    it('reserves full list access for super-admin', async () => {
        expect([...(await make().visibleIds(superAdmin, [7, 8]))]).toEqual([7, 8]);
    });
});
