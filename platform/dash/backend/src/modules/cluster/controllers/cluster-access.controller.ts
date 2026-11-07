import {BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, UseGuards} from '@nestjs/common';
import {DatabaseService} from '../../shared/services/database.service';
import {AllowedAuthorityLevels} from '../../../decorators/allowed-authority-levels.decorator';
import {Authority} from '../../user/enum/Authority';
import {AuthGuard} from '../../../guards/auth.guard';
import {AuthorityGuard} from '../../../guards/authority.guard';

/** Super-admin management of explicit tenant/cluster access grants. */
@Controller('access')
@UseGuards(AuthGuard, AuthorityGuard)
export class ClusterAccessController {
    constructor(private readonly database: DatabaseService) {}

    private id(value: string): number {
        if (!/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(+value)) {
            throw new BadRequestException('Invalid user or cluster identifier');
        }
        return +value;
    }

    @Get(':clusterId/users')
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN)
    async list(@Param('clusterId') clusterId: string) {
        const knex = await this.database.getConnection();
        return knex('cluster_user_access').select('user_id', 'can_write')
            .where('cluster_id', this.id(clusterId)).orderBy('user_id');
    }

    @Post(':clusterId/users/:userId')
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN)
    async upsert(
        @Param('clusterId') clusterId: string,
        @Param('userId') userId: string,
        @Body() body: {canWrite?: boolean}
    ): Promise<{clusterId: number; userId: number; canWrite: boolean}> {
        const cid = this.id(clusterId);
        const uid = this.id(userId);
        if (typeof body?.canWrite !== 'boolean') {
            throw new BadRequestException('canWrite must be boolean');
        }
        const knex = await this.database.getConnection();
        const [cluster, user] = await Promise.all([
            knex('clusters').where({id: cid}).whereNull('deleted_at').first('id'),
            knex('users').where({id: uid}).whereNull('deleted_at').first('id')
        ]);
        if (!cluster || !user) {
            throw new NotFoundException('Cluster or user does not exist');
        }
        await knex('cluster_user_access').insert({
            cluster_id: cid, user_id: uid, can_write: body.canWrite,
            created_at: Date.now()
        }).onConflict(['cluster_id', 'user_id']).merge({can_write: body.canWrite});
        return {clusterId: cid, userId: uid, canWrite: body.canWrite};
    }

    @Delete(':clusterId/users/:userId')
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN)
    async revoke(@Param('clusterId') clusterId: string, @Param('userId') userId: string):
        Promise<{revoked: boolean}> {
        const knex = await this.database.getConnection();
        const count = await knex('cluster_user_access')
            .where({cluster_id: this.id(clusterId), user_id: this.id(userId)}).del();
        return {revoked: count > 0};
    }
}
