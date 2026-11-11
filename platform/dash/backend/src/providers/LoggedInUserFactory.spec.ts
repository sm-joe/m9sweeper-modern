import LoggedInUserFactory from './LoggedInUserFactory';

describe('Global request identity credential transport', () => {
    const factory = (LoggedInUserFactory as any).useFactory;
    const jwt: any = {verify: jest.fn().mockResolvedValue({id: 4, authorities: [{type: 'ADMIN'}]})};
    const keys: any = {getUserInfoByApiKey: jest.fn().mockResolvedValue({id: 7, authorities: [{type: 'FALCO'}]})};
    const logger: any = {log: jest.fn()};
    beforeEach(() => jest.clearAllMocks());
    const req = (headers: any = {}, query: any = {}) => ({
        headers,
        query,
        get: (name: string) => headers[name.toLowerCase()]
    });
    it('does not accept a valid API key in URL query parameters', async () => {
        const identity = await factory(req({}, {'x-api-key': 'valid-but-in-url'}), jwt, keys, logger);
        expect(identity).toBeFalsy();
        expect(keys.getUserInfoByApiKey).not.toHaveBeenCalled();
        expect(jwt.verify).not.toHaveBeenCalled();
    });
    it('still supports the header-only scanner service identity', async () => {
        const identity = await factory(req({'x-api-key': 'valid-header-key'}), jwt, keys, logger);
        expect(identity.id).toBe(7);
        expect(keys.getUserInfoByApiKey).toHaveBeenCalledWith('valid-header-key');
    });
    it('still supports normal JWT bearer authentication', async () => {
        const identity = await factory(req({authorization: 'Bearer signed-jwt'}), jwt, keys, logger);
        expect(identity.id).toBe(4);
        expect(jwt.verify).toHaveBeenCalledWith('signed-jwt');
        expect(keys.getUserInfoByApiKey).not.toHaveBeenCalled();
    });
});
