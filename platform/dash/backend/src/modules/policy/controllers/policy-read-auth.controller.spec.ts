import {BadRequestException} from '@nestjs/common';
import {PolicyController} from './policy.controller';

describe('PolicyController / API authorization and pagination', () => {
    function subject() {
        const user: any = {id: 14, authorities: [{type: 'ADMIN'}]};
        const service: any = {
            getPolicyById: jest.fn().mockResolvedValue({id: 1}),
            getAllPolicies: jest.fn().mockResolvedValue({totalCount: 1, list: [{id: 1}]}),
            getPolicyClusterMap: jest.fn().mockResolvedValue([{id: 10}])
        };
        const readScope: any = {
            assertRead: jest.fn().mockResolvedValue(undefined),
            visiblePolicyIds: jest.fn().mockResolvedValue([1])
        };
        const controller = new PolicyController(user, service, {} as any, {} as any,
            {} as any, readScope);
        return {controller, service, readScope};
    }

    it('authorizes policy detail before fetching it', async () => {
        const {controller, service, readScope} = subject();
        readScope.assertRead.mockRejectedValue(new Error('forbidden'));
        await expect(controller.getPolicyById(2)).rejects.toThrow('forbidden');
        expect(service.getPolicyById).not.toHaveBeenCalled();
    });

    it('authorizes policy cluster-map access before returning foreign cluster names', async () => {
        const {controller, service, readScope} = subject();
        readScope.assertRead.mockRejectedValue(new Error('forbidden'));
        await expect(controller.getAllClustersByPolicyId(2)).rejects.toThrow('forbidden');
        expect(service.getPolicyClusterMap).not.toHaveBeenCalled();
    });

    it('passes authorized IDs into DB-level count and pagination', async () => {
        const {controller, service} = subject();
        await controller.getAllPolicies({field: 'id', direction: 'asc'}, '1' as any, '20' as any);
        expect(service.getAllPolicies).toHaveBeenCalledWith(
            1, 20, {field: 'id', direction: 'asc'}, [1]
        );
    });

    it('supports the existing Angular client omitted pagination defaults', async () => {
        const {controller, service} = subject();
        await controller.getAllPolicies(undefined, 'undefined' as any, 'undefined' as any);
        expect(service.getAllPolicies).toHaveBeenCalledWith(0, 10, undefined, [1]);
    });

    it('rejects negative, fractional, huge and malformed paging before querying policies', async () => {
        for (const value of ['-1', '1.5', 'NaN', '100001', '9999999999999999']) {
            const {controller, service} = subject();
            await expect(controller.getAllPolicies(undefined, value as any, 10))
                .rejects.toBeInstanceOf(BadRequestException);
            expect(service.getAllPolicies).not.toHaveBeenCalled();
        }
        const {controller} = subject();
        await expect(controller.getAllPolicies(undefined, 0, 101))
            .rejects.toBeInstanceOf(BadRequestException);
    });
});
