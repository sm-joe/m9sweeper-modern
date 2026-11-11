import {FalcoIngestGuard} from './falco-ingest.guard';

describe('Falco pre-validation HTTP authentication', () => {
    const saved = process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS;
    afterEach(() => {
        if (saved === undefined) delete process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS;
        else process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS = saved;
    });
    const requestContext = (key?: string, queryKey?: string, clusterid = '3'): any => ({
        switchToHttp: () => ({getRequest: () => ({
            params: {clusterid},
            headers: key === undefined ? {} : {'x-api-key': key},
            query: queryKey === undefined ? {} : {key: queryKey}
        })})
    });
    function subject(users: any[] = [{id: 11, isActive: true, authorities: ['FALCO']}]) {
        const userDao: any = {
            loadUserByApiKey: jest.fn().mockResolvedValue(users),
            scannerHasClusterGrant: jest.fn().mockResolvedValue(true)
        };
        const auth: any = {checkAuthority: jest.fn().mockReturnValue(true)};
        return {guard: new FalcoIngestGuard(userDao, auth), userDao, auth};
    }
    it('returns 401 for missing API key before any user lookup', async () => {
        const {guard, userDao} = subject();
        await expect(guard.canActivate(requestContext())).rejects.toMatchObject({status: 401});
        expect(userDao.loadUserByApiKey).not.toHaveBeenCalled();
    });
    it('rejects invalid and inactive scanner identities before event body validation', async () => {
        const missing = subject([]);
        await expect(missing.guard.canActivate(requestContext('invalid'))).rejects.toMatchObject({status: 401});
        const revoked = subject([{id: 11, isActive: false, authorities: ['FALCO']}]);
        await expect(revoked.guard.canActivate(requestContext('revoked'))).rejects.toMatchObject({status: 401});
    });
    it('prefers the header to query and permits valid scanner role', async () => {
        const {guard, userDao} = subject();
        await expect(guard.canActivate(requestContext('header-key', 'query-key'))).resolves.toBe(true);
        expect(userDao.loadUserByApiKey).toHaveBeenCalledWith('header-key');
    });
    it('requires the exact granted cluster when cluster bindings are enforced', async () => {
        process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS = 'true';
        const {guard, userDao} = subject();
        userDao.scannerHasClusterGrant.mockResolvedValue(false);
        await expect(guard.canActivate(requestContext('valid-key'))).rejects.toMatchObject({status: 401});
        expect(userDao.scannerHasClusterGrant).toHaveBeenCalledWith(11, 3);
    });
    it('rejects invalid route cluster IDs before any API key lookup', async () => {
        const {guard, userDao} = subject();
        await expect(guard.canActivate(requestContext('token', undefined, 'NaN')))
            .rejects.toMatchObject({status: 400});
        expect(userDao.loadUserByApiKey).not.toHaveBeenCalled();
    });
});
