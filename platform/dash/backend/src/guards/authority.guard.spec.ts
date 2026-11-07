import {AuthorityGuard} from './authority.guard';

describe('RC4 AuthorityGuard fail-closed authorization', () => {
  const context: any = {getHandler: () => ({})};
  const makeGuard = (user: any, allowed: any) =>
    new AuthorityGuard(user, {get: jest.fn().mockReturnValue(allowed)} as any);

  it('allows a matching authority for an authenticated user', async () => {
    await expect(makeGuard({authorities: [{type: 'ADMIN'}]}, ['ADMIN'])
      .canActivate(context)).resolves.toBe(true);
  });

  it.each([
    [null, ['ADMIN']],
    [{authorities: null}, ['ADMIN']],
    [{authorities: []}, ['ADMIN']],
    [{authorities: [null, {}]}, ['ADMIN']],
    [{authorities: [{type: 'READ_ONLY'}]}, ['ADMIN']],
    [{authorities: [{type: 'ADMIN'}]}, []],
    [{authorities: [{type: 'ADMIN'}]}, undefined]
  ])('denies malformed or unauthorized identity %#', async (user, allowed) => {
    await expect(makeGuard(user, allowed).canActivate(context)).resolves.toBe(false);
  });
});
