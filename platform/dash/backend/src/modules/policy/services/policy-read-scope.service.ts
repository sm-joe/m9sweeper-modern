import {ForbiddenException, Injectable} from '@nestjs/common';
import {DatabaseService} from '../../shared/services/database.service';
import {UserProfileDto} from '../../user/dto/user-profile-dto';

/**
 * Resource-level read boundary for policy inventory and details.
 * A policy mapping can span clusters; non-super-admins see it only when every
 * active mapped cluster is authorized. Global policies are visible read-only,
 * but still require SUPER_ADMIN for mutations (PolicyWriteScopeService).
 *
 * Filter BEFORE pagination/counting: never leak foreign policy names/counts
 * through an unscoped page or policy->cluster mapping.
 */
@Injectable()
export class PolicyReadScopeService {
    constructor(private readonly database: DatabaseService) {}

    private validUser(user: UserProfileDto): boolean {
        return !!user && Number.isSafeInteger(user.id) && user.id > 0 &&
            Array.isArray(user.authorities);
    }

    private isSuperAdmin(user: UserProfileDto): boolean {
        return user.authorities.some(role => role?.type === 'SUPER_ADMIN');
    }

    async visiblePolicyIds(user: UserProfileDto): Promise<number[] | undefined> {
        if (!this.validUser(user)) {
            throw new ForbiddenException('Policy access denied');
        }
        if (this.isSuperAdmin(user)) {
            return undefined; // no filtering for global administrator
        }

        const knex = await this.database.getConnection();
        const policies = await knex('policies')
            .whereNull('deleted_at')
            .select('id', 'relevant_for_all_clusters');
        if (!policies.length) return [];

        const ids = policies.map(policy => Number(policy.id));
        const mappings = await knex('policy_cluster')
            .whereIn('policy_id', ids)
            .where('active', true)
            .select('policy_id', 'cluster_id');

        const clusters = [...new Set<number>(mappings.map(row => Number(row.cluster_id)))];
        const authorized = new Set<number>();
        if (clusters.length) {
            const owned = await knex('clusters as c')
                .join('cluster_group as cg', 'cg.id', 'c.group_id')
                .where('cg.user_id', user.id)
                .whereIn('c.id', clusters)
                .whereNull('c.deleted_at')
                .whereNull('cg.deleted_at')
                .select('c.id');
            const granted = await knex('cluster_user_access as a')
                .join('clusters as c', 'c.id', 'a.cluster_id')
                .where('a.user_id', user.id)
                .whereIn('a.cluster_id', clusters)
                .whereNull('c.deleted_at')
                .select('a.cluster_id');
            for (const row of owned) authorized.add(Number(row.id));
            for (const row of granted) authorized.add(Number(row.cluster_id));
        }
        const byPolicy = new Map<number, number[]>();
        for (const mapping of mappings) {
            const id = Number(mapping.policy_id);
            const linked = byPolicy.get(id) || [];
            linked.push(Number(mapping.cluster_id));
            byPolicy.set(id, linked);
        }

        return policies
            .filter(policy => {
                if (policy.relevant_for_all_clusters === true) return true;
                const linked = byPolicy.get(Number(policy.id));
                return !!linked?.length && linked.every(cluster => authorized.has(cluster));
            })
            .map(policy => Number(policy.id));
    }

    async assertRead(user: UserProfileDto, policyId: number): Promise<void> {
        if (!Number.isSafeInteger(policyId) || policyId <= 0) {
            throw new ForbiddenException('Invalid policy identifier');
        }
        const allowed = await this.visiblePolicyIds(user);
        if (allowed !== undefined && !allowed.includes(policyId)) {
            throw new ForbiddenException('Policy access denied');
        }
        // For the SUPER_ADMIN path, the underlying policy service handles 404.
    }
}
