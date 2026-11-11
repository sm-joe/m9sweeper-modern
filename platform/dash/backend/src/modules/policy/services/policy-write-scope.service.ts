import {ForbiddenException, Injectable} from '@nestjs/common';
import {DatabaseService} from '../../shared/services/database.service';
import {UserProfileDto} from '../../user/dto/user-profile-dto';
import {PolicyScannerDto} from '../dto/policy-dto';

/**
 * Mutating a shared policy affects all mapped clusters. Ordinary ADMINs must
 * have write access to EVERY linked cluster, including on delete/replace.
 * Global policies are solely managed by SUPER_ADMIN.
 */
@Injectable()
export class PolicyWriteScopeService {
    constructor(private readonly database: DatabaseService) {}

    private superAdmin(user: UserProfileDto): boolean {
        return !!user && Array.isArray(user.authorities) &&
            user.authorities.some(role => role?.type === 'SUPER_ADMIN');
    }

    private validIds(value: unknown): value is number[] {
        return Array.isArray(value) && value.length > 0 && value.length <= 100 &&
            value.every(x => Number.isSafeInteger(x) && x > 0) &&
            new Set(value).size === value.length;
    }

    private async authorized(user: UserProfileDto, clusterIds: number[]): Promise<void> {
        if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 ||
            !Array.isArray(user.authorities) || !this.validIds(clusterIds)) {
            throw new ForbiddenException('Explicit authorized policy cluster mapping required');
        }
        const knex = await this.database.getConnection();
        const owners = await knex('clusters as c')
            .join('cluster_group as cg', 'cg.id', 'c.group_id')
            .where('cg.user_id', user.id)
            .whereIn('c.id', clusterIds)
            .whereNull('c.deleted_at').whereNull('cg.deleted_at').select('c.id');
        const grants = await knex('cluster_user_access')
            .where({user_id: user.id, can_write: true})
            .whereIn('cluster_id', clusterIds)
            .select('cluster_id');
        const allowed = new Set<number>([
            ...owners.map(item => Number(item.id)),
            ...grants.map(item => Number(item.cluster_id))
        ]);
        if (clusterIds.some(id => !allowed.has(id))) {
            throw new ForbiddenException('Policy mutation includes an unauthorized cluster');
        }
    }

    private forbidsGlobal(input: any): boolean {
        const global = input?.policy?.relevantForAllClusters;
        return ![undefined, null, false, 0].includes(global);
    }

    async assertCreate(user: UserProfileDto, input: PolicyScannerDto): Promise<void> {
        if (this.superAdmin(user)) return;
        if (!input || this.forbidsGlobal(input) || !this.validIds(input.clusters)) {
            throw new ForbiddenException('Only super admins may create unscoped or global policies');
        }
        await this.authorized(user, input.clusters);
    }

    private async existingClusters(policyId: number): Promise<number[]> {
        if (!Number.isSafeInteger(policyId) || policyId <= 0) {
            throw new ForbiddenException('Invalid policy identifier');
        }
        const knex = await this.database.getConnection();
        const row = await knex('policies').where({id: policyId})
            .whereNull('deleted_at').first('id', 'relevant_for_all_clusters');
        if (!row || row.relevant_for_all_clusters) {
            throw new ForbiddenException('Global or unknown policy is super-admin only');
        }
        const links = await knex('policy_cluster')
            .where({policy_id: policyId, active: true})
            .select('cluster_id');
        return links.map(item => Number(item.cluster_id));
    }

    async assertUpdate(user: UserProfileDto, policyId: number, input: PolicyScannerDto): Promise<void> {
        if (this.superAdmin(user)) return;
        if (!input || this.forbidsGlobal(input)) {
            throw new ForbiddenException('Global policy updates require super admin');
        }
        const existing = await this.existingClusters(policyId);
        await this.authorized(user, existing);
        if (input.clusters !== undefined) {
            await this.authorized(user, input.clusters);
        }
    }

    async assertDelete(user: UserProfileDto, policyId: number): Promise<void> {
        if (this.superAdmin(user)) return;
        await this.authorized(user, await this.existingClusters(policyId));
    }
}
