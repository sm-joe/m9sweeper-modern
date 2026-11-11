import {ForbiddenException, Injectable} from '@nestjs/common';
import {DatabaseService} from '../../shared/services/database.service';
import {UserProfileDto} from '../../user/dto/user-profile-dto';

/**
 * Fail-closed exception access: shared exception rows can cover multiple clusters.
 * A non-super-admin must be authorized for EVERY cluster covered by an exception.
 * Unscoped/global exceptions are reserved for SUPER_ADMIN. This prevents the
 * details endpoint from leaking mappings for foreign clusters.
 */
@Injectable()
export class ExceptionScopeService {
    constructor(private readonly database: DatabaseService) {}

    private isSuperAdmin(user: UserProfileDto): boolean {
        return !!user && Array.isArray(user.authorities) &&
            user.authorities.some(role => role?.type === 'SUPER_ADMIN');
    }

    private validIds(ids: unknown): ids is number[] {
        return Array.isArray(ids) && ids.length > 0 && ids.length <= 100 &&
            ids.every(id => Number.isSafeInteger(id) && id > 0) &&
            new Set(ids).size === ids.length;
    }

    private async authorizedClusterIds(user: UserProfileDto, ids: number[], write: boolean): Promise<Set<number>> {
        const knex = await this.database.getConnection();
        const owned = await knex('clusters as c')
            .join('cluster_group as cg', 'cg.id', 'c.group_id')
            .where('cg.user_id', user.id)
            .whereIn('c.id', ids)
            .whereNull('c.deleted_at')
            .whereNull('cg.deleted_at')
            .select('c.id');
        const grants = await knex('cluster_user_access as a')
            .join('clusters as c', 'c.id', 'a.cluster_id')
            .where('a.user_id', user.id)
            .whereIn('a.cluster_id', ids)
            .whereNull('c.deleted_at')
            .modify(q => {
                if (write) q.where('a.can_write', true);
            })
            .select('a.cluster_id');
        return new Set<number>([
            ...owned.map(x => Number(x.id)),
            ...grants.map(x => Number(x.cluster_id))
        ]);
    }

    async assertRequested(user: UserProfileDto, clusters: unknown, write = true): Promise<void> {
        if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 ||
            !Array.isArray(user.authorities)) {
            throw new ForbiddenException('Exception cluster scope denied');
        }
        if (this.isSuperAdmin(user)) return;
        if (!this.validIds(clusters)) {
            throw new ForbiddenException('Explicit authorized exception clusters required');
        }
        const granted = await this.authorizedClusterIds(user, clusters, write);
        if (clusters.some(id => !granted.has(id))) {
            throw new ForbiddenException('Exception spans an unauthorized cluster');
        }
    }

    async visibleIds(user: UserProfileDto, ids: number[], write = false): Promise<Set<number>> {
        if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 ||
            !Array.isArray(user.authorities)) {
            throw new ForbiddenException('Exception access denied');
        }
        if (this.isSuperAdmin(user)) return new Set(ids);
        const safeIds = ids.filter(id => Number.isSafeInteger(id) && id > 0);
        if (!safeIds.length) return new Set();
        const knex = await this.database.getConnection();
        const links = await knex('exceptions_clusters')
            .whereIn('exception_id', safeIds)
            .select('exception_id', 'cluster_id');
        const allClusters = [...new Set<number>(links.map(x => Number(x.cluster_id)))];
        const granted = allClusters.length
            ? await this.authorizedClusterIds(user, allClusters, write)
            : new Set<number>();
        const byException = new Map<number, number[]>();
        for (const link of links) {
            const id = Number(link.exception_id);
            const clusters = byException.get(id) || [];
            clusters.push(Number(link.cluster_id));
            byException.set(id, clusters);
        }
        return new Set(safeIds.filter(id => {
            const clusters = byException.get(id);
            return !!clusters?.length && clusters.every(cluster => granted.has(cluster));
        }));
    }

    async assertExisting(user: UserProfileDto, exceptionId: number, write = false): Promise<void> {
        if (!Number.isSafeInteger(exceptionId) || exceptionId <= 0) {
            throw new ForbiddenException('Invalid exception ID');
        }
        const knex = await this.database.getConnection();
        const row = await knex('exceptions').where({id: exceptionId})
            .whereNull('deleted_at').first('id');
        if (!row) throw new ForbiddenException('Exception access denied');
        const visible = await this.visibleIds(user, [exceptionId], write);
        if (!visible.has(exceptionId)) {
            throw new ForbiddenException('Exception access denied');
        }
    }
}
