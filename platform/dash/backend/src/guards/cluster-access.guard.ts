import {CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable} from '@nestjs/common';
import {DatabaseService} from '../modules/shared/services/database.service';
import {UserProfileDto} from '../modules/user/dto/user-profile-dto';

/**
 * Cluster/tenant boundary for authenticated human users.
 *
 * Grants are narrower than global role grants: both an appropriate global role
 * and this check must pass. Scanner-only webhook endpoints use separate keys
 * and are not covered by this guard.
 */
@Injectable()
export class ClusterAccessGuard implements CanActivate {
    constructor(
        @Inject('LOGGED_IN_USER') private readonly user: UserProfileDto,
        private readonly database: DatabaseService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (!this.user || !Number.isSafeInteger(this.user.id) || this.user.id <= 0 ||
            !Array.isArray(this.user.authorities)) {
            throw new ForbiddenException('Cluster access denied');
        }
        if (this.user.authorities.some(role => role?.type === 'SUPER_ADMIN')) {
            return true;
        }
        const req = context.switchToHttp().getRequest();
        // Legacy trawler identity must remain usable while service-account
        // keys migrate to per-cluster grants. Only the explicitly protected
        // scan ingestion path can use this transitional exception.
        if (this.user.authorities.some(role => role?.type === 'TRAWLER') &&
            String(req.originalUrl || req.url || '').includes('/trawler/')) {
            return true;
        }
        const params = req.params || {};
        const query = req.query || {};
        const knex = await this.database.getConnection();
        const rawCluster = params.clusterId ?? params.clusterid ??
            query.clusterId ?? query['cluster-id'];
        let clusterId = Number(rawCluster);
        if (!Number.isSafeInteger(clusterId) || clusterId <= 0) {
            if (params.imageId) {
                const image = await knex('images')
                    .select('cluster_id').where({id: Number(params.imageId)})
                    .whereNull('deleted_at').first();
                clusterId = Number(image?.cluster_id);
            } else if (params.eventId) {
                const event = await knex('project_falco_logs')
                    .select('cluster_id').where({id: Number(params.eventId)}).first();
                clusterId = Number(event?.cluster_id);
            } else if (params.id && String(req.originalUrl || req.url).includes('/kubehunter/')) {
                const report = await knex('kube_hunter')
                    .select('cluster_id').where({id: Number(params.id)}).first();
                clusterId = Number(report?.cluster_id);
            }
        }
        if (!Number.isSafeInteger(clusterId) || clusterId <= 0) {
            throw new ForbiddenException('Explicit cluster scope required');
        }

        const owner = await knex('clusters as c')
            .join('cluster_group as cg', 'cg.id', 'c.group_id')
            .where({'c.id': clusterId, 'cg.user_id': this.user.id})
            .whereNull('c.deleted_at')
            .whereNull('cg.deleted_at')
            .first('c.id');
        if (owner) return true;

        const grant = await knex('cluster_user_access')
            .where({cluster_id: clusterId, user_id: this.user.id})
            .first('can_write');
        if (grant && (req.method === 'GET' || req.method === 'HEAD' || grant.can_write === true)) {
            return true;
        }
        throw new ForbiddenException('Cluster access denied');
    }
}
