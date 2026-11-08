import {DatabaseService} from '../../shared/services/database.service';
import {ForbiddenException} from '@nestjs/common';
import {ApiBearerAuth, ApiResponse, ApiTags} from '@nestjs/swagger';
import {
    Body,
    Controller,
    Delete,
    Get,
    Inject,
    NotFoundException,
    Param,
    Post,
    Put,
    UseGuards,
    UseInterceptors
} from '@nestjs/common';
import {ResponseTransformerInterceptor} from "../../../interceptors/response-transformer.interceptor";
import {UserProfileDto} from "../../user/dto/user-profile-dto";
import {ClusterGroupService} from "../services/cluster-group-service";
import { CLUSTER_GROUP_RESPONSE_SCHEMA, UPDATE_CLUSTER_RESPONSE_SCHEMA } from "../open-api-schema/cluster-group-schema";
import {ClusterGroupDto} from "../dto/cluster-group-dto";
import { AllowedAuthorityLevels } from '../../../decorators/allowed-authority-levels.decorator'
import { AuthorityGuard } from '../../../guards/authority.guard';
import {AuthGuard} from '../../../guards/auth.guard';
import {Authority} from '../../user/enum/Authority';

@ApiTags('clusterGroup')
@ApiBearerAuth('jwt-auth')
@Controller()
@UseInterceptors(ResponseTransformerInterceptor)
export class ClusterGroupController {
    constructor(@Inject('LOGGED_IN_USER') private readonly _loggedInUser: UserProfileDto,
                private readonly clusterGroupService: ClusterGroupService,
                private readonly database: DatabaseService) {}


    private isSuperAdmin(): boolean {
        return this._loggedInUser?.authorities?.some(role => role.type === Authority.SUPER_ADMIN) === true;
    }

    private async allowedGroupIds(): Promise<Set<number>> {
        if (this.isSuperAdmin()) {
            return new Set((await this.clusterGroupService.getClusterGroups()).map(g => Number(g.id)));
        }
        const userId = Number(this._loggedInUser?.id);
        if (!Number.isSafeInteger(userId) || userId <= 0) {
            throw new ForbiddenException('Invalid cluster-group identity');
        }
        const knex = await this.database.getConnection();
        const [owned, granted] = await Promise.all([
            knex('cluster_group').where({user_id: userId}).whereNull('deleted_at').select('id'),
            knex('clusters as c').join('cluster_user_access as cua', 'cua.cluster_id', 'c.id')
                .where('cua.user_id', userId).whereNull('c.deleted_at').select('c.group_id')
        ]);
        return new Set([...owned.map(g => Number(g.id)), ...granted.map(g => Number(g.group_id))]);
    }

    private async requireGroupOwner(groupId: number): Promise<void> {
        if (this.isSuperAdmin()) return;
        const knex = await this.database.getConnection();
        const owner = await knex('cluster_group')
            .where({id: Number(groupId), user_id: Number(this._loggedInUser?.id)})
            .whereNull('deleted_at').first('id');
        if (!owner) throw new ForbiddenException('Cluster-group owner required');
    }

    @Get(':clusterGroupId')
    @AllowedAuthorityLevels(Authority.READ_ONLY, Authority.SUPER_ADMIN, Authority.ADMIN)
    @UseGuards(AuthGuard, AuthorityGuard)
    @ApiResponse({
        status: 200,
        schema: CLUSTER_GROUP_RESPONSE_SCHEMA
    })
    async getClusterGroupById(@Param('clusterGroupId') clusterGroupId: number): Promise<ClusterGroupDto> {
        if (!(await this.allowedGroupIds()).has(Number(clusterGroupId))) {
            throw new ForbiddenException('Cluster-group access denied');
        }
        return this.clusterGroupService.getClusterGroupById(clusterGroupId)
          .then(group => {
              if (!group) {
                  throw new NotFoundException('Cluster Group not found');
              }
              return group;
          });
    }

    @Post()
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN, Authority.ADMIN)
    @UseGuards(AuthGuard, AuthorityGuard)
    @ApiResponse({
        status: 200,
        schema: CLUSTER_GROUP_RESPONSE_SCHEMA
    })
    async createClusterGroup(@Body() clusterGroupData: ClusterGroupDto): Promise<ClusterGroupDto> {
        if (!this.isSuperAdmin()) clusterGroupData.userId = this._loggedInUser.id;
        return this.clusterGroupService.createClusterGroup(clusterGroupData);
    }

    @Put(':clusterGroupId')
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN, Authority.ADMIN)
    @UseGuards(AuthGuard, AuthorityGuard)
    @ApiResponse({
        status: 200,
        schema: UPDATE_CLUSTER_RESPONSE_SCHEMA
    })
    async updateClusterGroup(@Body() clusterGroupData: ClusterGroupDto, @Param('clusterGroupId') clusterGroupId: number): Promise<number> {
        await this.requireGroupOwner(clusterGroupId);
        if (!this.isSuperAdmin()) clusterGroupData.userId = this._loggedInUser.id;
        return this.clusterGroupService.updateClusterGroup(clusterGroupData, clusterGroupId);
    }

    @Delete(':clusterGroupId')
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN, Authority.ADMIN)
    @UseGuards(AuthGuard, AuthorityGuard)
    @ApiResponse({
        status: 200,
        schema: UPDATE_CLUSTER_RESPONSE_SCHEMA
    })
    async deleteClusterGroup(@Param('clusterGroupId') clusterGroupId: number): Promise<number> {
        await this.requireGroupOwner(clusterGroupId);
        return this.clusterGroupService.deleteClusterGroup(clusterGroupId);
    }

    @Get('')
    @AllowedAuthorityLevels(Authority.READ_ONLY, Authority.SUPER_ADMIN, Authority.ADMIN)
    @UseGuards(AuthGuard, AuthorityGuard)
    @ApiResponse({
        status: 200,
        schema: CLUSTER_GROUP_RESPONSE_SCHEMA
    })
    async getAllClusters(): Promise<ClusterGroupDto[]> {
        const groups = await this.clusterGroupService.getClusterGroups();
        if (this.isSuperAdmin()) return groups;
        const allowedIds = await this.allowedGroupIds();
        return groups.filter(g => allowedIds.has(Number(g.id)));
    }
}
