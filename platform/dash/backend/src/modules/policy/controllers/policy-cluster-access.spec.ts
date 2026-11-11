import {GUARDS_METADATA} from '@nestjs/common/constants';
import {ClusterAccessGuard} from '../../../guards/cluster-access.guard';
import {PolicyController} from './policy.controller';

describe('Policy cluster isolation', () => {
  it('requires cluster access in addition to the global role on cluster-scoped policy reads', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA, PolicyController.prototype.getPoliciesByClusterId
    ) as Array<new (...args: any[]) => any>;
    expect(guards).toContain(ClusterAccessGuard);
  });
});
