import {PolicyService} from './policy-service';

describe('PolicyService scan configuration', () => {
    let dao: any;
    let service: PolicyService;

    beforeEach(() => {
        dao = {
            getPolicyByName: jest.fn(),
            createPolicy: jest.fn().mockResolvedValue([72]),
            getPolicyById: jest.fn().mockResolvedValue({id: 72, name: 'Kind Trivy baseline'})
        };
        service = new PolicyService(dao, {} as any);
    });

    it('creates a new policy when the name lookup returns an empty array', async () => {
        dao.getPolicyByName.mockResolvedValue([]);
        await expect(service.createPolicy({name: 'Kind Trivy baseline'} as any))
          .resolves.toMatchObject({id: 72});
        expect(dao.createPolicy).toHaveBeenCalledTimes(1);
    });

    it('does not create a duplicate policy', async () => {
        dao.getPolicyByName.mockResolvedValue([{id: 99}]);
        await expect(service.createPolicy({name: 'Existing'} as any))
          .resolves.toBeNull();
        expect(dao.createPolicy).not.toHaveBeenCalled();
    });

    it('requires an enabled Trivy scanner on enabled policies', () => {
        const policy = {enabled: true} as any;
        expect(service.validateActivePolicyScanners(policy, [])).toBe(false);
        expect(service.validateActivePolicyScanners(policy, undefined as any)).toBe(false);
        expect(service.validateActivePolicyScanners(policy, [{enabled: false, type: 'TRIVY'}] as any)).toBe(false);
        expect(service.validateActivePolicyScanners(policy, [{enabled: true, type: 'OTHER'}] as any)).toBe(false);
        expect(service.validateActivePolicyScanners(policy, [{enabled: true, type: 'TRIVY'}] as any)).toBe(true);
    });
});
