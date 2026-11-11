import {ForbiddenException} from '@nestjs/common';
import {PolicyWriteScopeService} from './policy-write-scope.service';

describe('P0 policy write cluster scope', () => {
    const admin: any = {id: 31, authorities: [{type: 'ADMIN'}]};
    const superAdmin: any = {id: 1, authorities: [{type: 'SUPER_ADMIN'}]};
    const make = () => new PolicyWriteScopeService({getConnection: jest.fn()} as any);
    it('refuses global, empty and duplicate cluster assignments for ordinary admins', async () => {
        const service = make();
        for (const input of [
            {policy: {relevantForAllClusters: true}, clusters: [2]},
            {policy: {relevantForAllClusters: 1}, clusters: [2]},
            {policy: {}, clusters: []},
            {policy: {}, clusters: [2, 2]},
            {policy: {}, clusters: undefined},
            {policy: {}, clusters: ['2']}
        ]) {
            await expect(service.assertCreate(admin, input as any))
                .rejects.toBeInstanceOf(ForbiddenException);
        }
    });
    it('rejects foreign clusters before a new policy is persisted', async () => {
        const service = make();
        (service as any).authorized = jest.fn().mockRejectedValue(
            new ForbiddenException('Policy mutation includes an unauthorized cluster'));
        await expect(service.assertCreate(admin, {policy: {}, clusters: [2, 3]} as any))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
    it('requires all previously linked clusters before an admin updates a policy', async () => {
        const service = make();
        (service as any).existingClusters = jest.fn().mockResolvedValue([2, 3]);
        (service as any).authorized = jest.fn().mockRejectedValue(
            new ForbiddenException('Unauthorized cluster'));
        await expect(service.assertUpdate(admin, 11, {policy: {}, clusters: [2]} as any))
            .rejects.toBeInstanceOf(ForbiddenException);
        expect((service as any).authorized).toHaveBeenCalledWith(admin, [2, 3]);
    });
    it('rejects global promotion and deletion of a foreign-cluster policy', async () => {
        const service = make();
        await expect(service.assertUpdate(admin, 11,
            {policy: {relevantForAllClusters: true}, clusters: [2]} as any))
            .rejects.toBeInstanceOf(ForbiddenException);
        (service as any).existingClusters = jest.fn().mockResolvedValue([2, 3]);
        (service as any).authorized = jest.fn().mockRejectedValue(new ForbiddenException());
        await expect(service.assertDelete(admin, 11)).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('preserves super-admin global policy management', async () => {
        const service = make();
        await expect(service.assertCreate(superAdmin,
            {policy: {relevantForAllClusters: true}} as any)).resolves.toBeUndefined();
        await expect(service.assertUpdate(superAdmin, 1,
            {policy: {relevantForAllClusters: true}} as any)).resolves.toBeUndefined();
        await expect(service.assertDelete(superAdmin, 1)).resolves.toBeUndefined();
    });
});
