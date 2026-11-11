import {ForbiddenException} from '@nestjs/common';
import {PolicyReadScopeService} from './policy-read-scope.service';

describe('PolicyReadScopeService / tenant-safe inventory', () => {
    const admin: any = {id: 14, authorities: [{type: 'ADMIN'}]};
    const readOnly: any = {id: 14, authorities: [{type: 'READ_ONLY'}]};
    const superAdmin: any = {id: 1, authorities: [{type: 'SUPER_ADMIN'}]};

    function subject() {
        const rows: Record<string, any[]> = {
            policies: [
                {id: 1, relevant_for_all_clusters: false},
                {id: 2, relevant_for_all_clusters: false},
                {id: 3, relevant_for_all_clusters: true},
                {id: 4, relevant_for_all_clusters: false}
            ],
            policy_cluster: [
                {policy_id: 1, cluster_id: 10},
                {policy_id: 2, cluster_id: 10},
                {policy_id: 2, cluster_id: 20}
            ],
            'clusters as c': [{id: 10}],
            'cluster_user_access as a': []
        };
        const knex: any = jest.fn((table: string) => {
            const query: any = {};
            for (const name of ['whereNull', 'whereIn', 'where', 'join']) {
                query[name] = jest.fn().mockReturnValue(query);
            }
            query.select = jest.fn().mockImplementation(async () => rows[table] || []);
            return query;
        });
        const db: any = {getConnection: jest.fn().mockResolvedValue(knex)};
        return {scope: new PolicyReadScopeService(db), db, rows};
    }

    it('hides unmapped and mixed-tenant policies while allowing global read-only policies', async () => {
        const {scope} = subject();
        expect(await scope.visiblePolicyIds(admin)).toEqual([1, 3]);
        expect(await scope.visiblePolicyIds(readOnly)).toEqual([1, 3]);
    });

    it('never reveals mixed-cluster policy or foreign policy mappings by identifier', async () => {
        const {scope} = subject();
        await expect(scope.assertRead(admin, 2)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(scope.assertRead(readOnly, 4)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(scope.assertRead(admin, 1)).resolves.toBeUndefined();
    });

    it('preserves global administrator visibility without querying tenant grants', async () => {
        const {scope, db} = subject();
        expect(await scope.visiblePolicyIds(superAdmin)).toBeUndefined();
        await expect(scope.assertRead(superAdmin, 2)).resolves.toBeUndefined();
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it('rejects missing user identity and invalid policy identifiers', async () => {
        const {scope} = subject();
        await expect(scope.visiblePolicyIds({id: 0, authorities: []} as any))
            .rejects.toBeInstanceOf(ForbiddenException);
        for (const value of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
            await expect(scope.assertRead(admin, value)).rejects.toBeInstanceOf(ForbiddenException);
        }
    });

    it('rejects formerly visible policy if its cluster is no longer authorized', async () => {
        const {scope, rows} = subject();
        rows['clusters as c'] = [];
        expect(await scope.visiblePolicyIds(admin)).toEqual([3]);
    });
});
