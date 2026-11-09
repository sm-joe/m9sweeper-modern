import {Authority} from '../../user/enum/Authority';
import {FalcoController} from './falco.controller';

/**
 * Every Falco rule mutation is capable of changing global or foreign-cluster
 * policy because the rule payload can set allClusters or arbitrary cluster IDs.
 * Until fully scoped policy-edit authorization exists, this is super-admin only.
 */
describe('P0 Falco rule modification authority boundary', () => {
  for (const method of ['createFalcoRule', 'updateFalcoRule', 'deleteFalcoRule']) {
    it(`${method} requires SUPER_ADMIN and never authorizes ordinary ADMIN`, () => {
      const roles: string[] = Reflect.getMetadata('allowedAuthorities', FalcoController.prototype[method]);
      expect(roles).toEqual([Authority.SUPER_ADMIN]);
      expect(roles).not.toContain(Authority.ADMIN);
    });
  }

  it('still permits read-only listing of scoped Falco rules', () => {
    const roles: string[] = Reflect.getMetadata('allowedAuthorities',
      FalcoController.prototype.listActiveFalcoRulesForCluster);
    expect(roles).toContain(Authority.READ_ONLY);
  });
});
