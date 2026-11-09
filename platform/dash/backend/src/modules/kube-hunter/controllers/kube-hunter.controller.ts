import {ClusterAccessGuard} from '../../../guards/cluster-access.guard';
import {parseScannerClusterId, selectScannerIngestKey} from '../../shared/services/scanner-ingest-auth';
import {Controller, Get, Headers, HttpException, HttpStatus, Param, Post, Query, UseGuards} from '@nestjs/common';
import {QuotedBody} from "../../../decorators/quoted-body.decorator";
import {KubeHunterService} from "../service/kube-hunter.service";
import {KubeHunterDto} from "../dto/kube-hunter-dto";
import {uuid} from "uuidv4";
import {UserDao} from "../../user/dao/user.dao";
import {AuthService} from "../../auth/services/auth.service";
import {AuthorityId} from "../../user/enum/authority-id";
import {ApiResponse} from "@nestjs/swagger";
import {AllowedAuthorityLevels} from "../../../decorators/allowed-authority-levels.decorator";
import {Authority} from "../../user/enum/Authority";
import {AuthGuard} from "../../../guards/auth.guard";
import {AuthorityGuard} from "../../../guards/authority.guard";
import {ApiKeyDto} from "../../api-key/dto/api-key-dto";
import {ApiKeyDao} from "../../api-key/dao/api-key.dao";
import { MineLoggerService } from '../../shared/services/mine-logger.service';


@Controller()
export class KubeHunterController {
    constructor(
        private readonly kubeHunterService: KubeHunterService,
        private readonly userDao: UserDao,
        private readonly authService: AuthService,
        private readonly apiKeyDao: ApiKeyDao,
      private logger: MineLoggerService,
    ) {}

    @Post('hunter/:clusterId')
    @ApiResponse({
        status: 201,
    })
    async saveKubeHunterReport(@QuotedBody() report: any, @Param('clusterId') clusterId: number, @Query('key') key: string, @Headers('x-api-key') headerKey?: string): Promise<any> {
        const parsedClusterId = parseScannerClusterId(clusterId);
        if (!Number.isFinite(parsedClusterId)) {
            throw new HttpException('Invalid cluster identifier', HttpStatus.BAD_REQUEST);
        }
        clusterId = parsedClusterId;

        // External scanner credentials must be rejected before any persistence
        // or database identity lookup. Do not log or echo the supplied secret.
        const scannerKey = selectScannerIngestKey(headerKey, key);
        if (!scannerKey.trim()) {
            throw new HttpException('Missing kube-hunter API key', HttpStatus.UNAUTHORIZED);
        }

        // find user authority by user's API key
        const currentUserAuthObj = await this.userDao.loadUserByApiKey(scannerKey);
        if (!Array.isArray(currentUserAuthObj) || currentUserAuthObj.length === 0 || !this.authService.checkAuthority(currentUserAuthObj[0].authorities, [AuthorityId.KUBEHUNTER])) {
            this.logger.log({label: 'User is unauthorized; skip saving KH scan report', data: { clusterId }}, 'KubeHunterController.saveKubeHunterReport');
            throw new HttpException('Unauthorized  - log may not have been saved', HttpStatus.UNAUTHORIZED);
        }

        if (currentUserAuthObj[0].isActive === false ||
            (process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS === 'true' &&
             !await this.userDao.scannerHasClusterGrant(currentUserAuthObj[0].id, clusterId))) {
            throw new HttpException('Scanner identity is not authorized for this cluster', HttpStatus.UNAUTHORIZED);
        }
        // Accept real kube-hunter report sections, not arbitrary client-supplied
        // database columns (id, uuid, cluster_id, created_at, etc.).
        // A malformed or empty authenticated scan must never appear as a clean report.
        if (!report || typeof report !== 'object' || Array.isArray(report)) {
            throw new HttpException('Malformed kube-hunter report', HttpStatus.BAD_REQUEST);
        }
        const sections = ['nodes', 'services', 'vulnerabilities'] as const;
        if (!sections.some(section => Object.prototype.hasOwnProperty.call(report, section)) ||
            sections.some(section => report[section] !== undefined &&
                (report[section] === null || typeof report[section] !== 'object'))) {
            throw new HttpException('Malformed kube-hunter report sections', HttpStatus.BAD_REQUEST);
        }
        this.logger.log({label: 'User has been authorized; saving KH scan report', data: { clusterId }}, 'KubeHunterController.saveKubeHunterReport');
        const reportAsDto = Object.assign(new KubeHunterDto(), {
            nodes: report.nodes ?? {},
            services: report.services ?? {},
            vulnerabilities: report.vulnerabilities ?? {},
        });
        reportAsDto.uuid = uuid();
        reportAsDto.clusterId = clusterId;
        const newEntry = await this.kubeHunterService.saveKubeHunterReport(reportAsDto);
        if (!newEntry || newEntry.length == 0) throw new HttpException('Internal Server error - log may not have been saved', HttpStatus.INTERNAL_SERVER_ERROR);
        return newEntry[0];
    }

    @Get('/apiKey')
    @AllowedAuthorityLevels( Authority.SUPER_ADMIN )
    @UseGuards(AuthGuard, AuthorityGuard, ClusterAccessGuard)
    @ApiResponse({
        status: 200
    })
    async getApiKey(): Promise<ApiKeyDto[]> {
        if (process.env.SCANNER_ALLOW_LEGACY_KEY_EXPORT !== 'true') {
            throw new HttpException('Legacy scanner key export is disabled', HttpStatus.GONE);
        }
        const apiKeyKH = await this.apiKeyDao.getApiKeyByUserEmail('Kubehunter');
        if (!apiKeyKH) throw new HttpException(`KH APi key ${apiKeyKH} not found`, HttpStatus.NOT_FOUND);
        return apiKeyKH;
    }

    @Get('/:id')
    @AllowedAuthorityLevels(Authority.READ_ONLY, Authority.ADMIN, Authority.SUPER_ADMIN)
    @UseGuards(AuthGuard, AuthorityGuard, ClusterAccessGuard)
    async getKubeHunterReportById(@Param('id') id: string): Promise<KubeHunterDto> {
        return await this.kubeHunterService.getKubeHunterReportById(+id);
    }

    @Get('/cluster/:clusterId')
    @AllowedAuthorityLevels(Authority.READ_ONLY, Authority.ADMIN, Authority.SUPER_ADMIN)
    @UseGuards(AuthGuard, AuthorityGuard, ClusterAccessGuard)
    async getAllReportsForCluster(@Param('clusterId') clusterId: number, @Query('page') page?: number, @Query('limit') limit?: number):
        Promise<{reportCount: number, list: KubeHunterDto[]}> {
        return this.kubeHunterService.getAllReportsForCluster(clusterId, page, limit);
    }

    @Get('/cluster/:clusterId/recent')
    @AllowedAuthorityLevels(Authority.READ_ONLY, Authority.ADMIN, Authority.SUPER_ADMIN)
    @UseGuards(AuthGuard, AuthorityGuard, ClusterAccessGuard)
    async getRecentReportsForCluster(@Param('clusterId') clusterId: number, @Query('minDate') minDate: number): Promise<KubeHunterDto> {
        return await this.kubeHunterService.getRecentKubeHunterReportForCluster(clusterId, minDate);
    }
}
