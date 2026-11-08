import {ClusterAccessGuard} from '../../../guards/cluster-access.guard';
import {parseScannerClusterId, selectScannerIngestKey} from '../../shared/services/scanner-ingest-auth';
import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    HttpException,
    HttpStatus,
    Inject,
    Param,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";
import {AllowedAuthorityLevels} from "../../../decorators/allowed-authority-levels.decorator";
import {Authority} from "../../user/enum/Authority";
import {AuthGuard} from "../../../guards/auth.guard";
import {AuthorityGuard} from "../../../guards/authority.guard";
import {KubeBenchService} from "../services/kube-bench.service";
import {ApiResponse} from "@nestjs/swagger";
import {KubeBenchDto, KubeBenchLogDto, KubeBenchSummaryTimestampedDto} from "../dto/kube-bench-dto";
import {UserProfileDto} from "../../user/dto/user-profile-dto";
import {uuid} from "uuidv4";
import {UserDao} from "../../user/dao/user.dao";
import {AuthService} from '../../auth/services/auth.service'
import {AuthorityId} from "../../user/enum/authority-id";
import {ApiKeyDao} from "../../api-key/dao/api-key.dao";
import {ApiKeyDto} from "../../api-key/dto/api-key-dto";
import { MineLoggerService } from '../../shared/services/mine-logger.service';

@Controller()
export class KubeBenchController {
    constructor(
        @Inject('LOGGED_IN_USER') private readonly _loggedInUser: UserProfileDto,
        private readonly kubeBenchService: KubeBenchService,
        private readonly userDao: UserDao,
        private readonly authService: AuthService,
        private readonly apiKeyDao: ApiKeyDao,
        private logger: MineLoggerService,
    ) {}

    @Post('/:clusterId')
    // called externally in curl
    // To do: implement API key protection with interceptor per trawler scanning method
    @ApiResponse({
        status: 201,
    })
    async saveKubeBenchReport(@Body() report: any, @Param('clusterId') clusterId: number, @Query('key') legacyKey: string, @Headers('x-api-key') headerKey?: string): Promise<KubeBenchDto> {
        // Header credentials supersede the legacy URL query credential. Never log either.
        const key = selectScannerIngestKey(headerKey, legacyKey);
        const parsedClusterId = parseScannerClusterId(clusterId);
        if (!Number.isSafeInteger(parsedClusterId)) {
            throw new HttpException('Invalid cluster ID', HttpStatus.BAD_REQUEST);
        }

        clusterId = parsedClusterId;

        // find user authority by user's apikey
        if (typeof key !== 'string' || !key.trim()) {
            throw new HttpException('Missing kube-bench API key', HttpStatus.UNAUTHORIZED);
        }
        const currentUserAuthObj = await this.userDao.loadUserByApiKey(key);

        // if the current user's api is valid
        if (Array.isArray(currentUserAuthObj) && currentUserAuthObj.length > 0 && currentUserAuthObj[0]) {
           //  get all authorities from the current user
            const currentUserAuth = currentUserAuthObj[0].authorities;
            // get Kubebench authority from Authorityid
            let authorityArr: AuthorityId [] = [AuthorityId.KUBEBENCH];
            // is the user a KB user
            let isKBUser = this.authService.checkAuthority(currentUserAuth, authorityArr);
            if (isKBUser && currentUserAuthObj[0].isActive !== false &&
                (process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS !== 'true' ||
                 await this.userDao.scannerHasClusterGrant(currentUserAuthObj[0].id, clusterId))) {
                this.logger.log({label: 'User has been authorized; saving KB scan report', data: { clusterId }}, 'KubeBenchController.saveKubeBenchReport');
                //return key as any; // no reports;  remove when done
                if (!report || !Array.isArray(report.Controls) || !report.Controls.length ||
                    !report.Totals || !['total_pass', 'total_fail', 'total_warn'].every(
                      field => Number.isSafeInteger(report.Totals[field]) && report.Totals[field] >= 0)) {
                    throw new HttpException('Malformed kube-bench report: expected nonempty Controls and numeric Totals', HttpStatus.BAD_REQUEST);
                }
                const reportAsLogDto = Object.assign(new KubeBenchLogDto(), report);
                const reportAsDto: KubeBenchDto = {
                    uuid: uuid(),
                    clusterId: clusterId,
                    resultsJson: reportAsLogDto,
                    resultsSummary: reportAsLogDto.Totals,
                };
                const newEntry = await this.kubeBenchService.saveKubeBenchReport(reportAsDto);
                if (!newEntry || newEntry.length == 0) throw new HttpException('Internal Server error - log may not have been saved', HttpStatus.INTERNAL_SERVER_ERROR);
                return newEntry[0];

            } else {
                this.logger.log({label: 'User is unauthorized; skip saving KB scan report', data: { clusterId }}, 'KubeBenchController.saveKubeBenchReport');
                throw new HttpException('Unauthorized  - log may not have been saved', HttpStatus.UNAUTHORIZED);
            }
        }
        throw new HttpException('Invalid kube-bench API key', HttpStatus.UNAUTHORIZED);
    }

    @Get('/apiKey')
    @AllowedAuthorityLevels( Authority.SUPER_ADMIN )
    @UseGuards(AuthGuard, AuthorityGuard)
    @ApiResponse({
        status: 200
    })
    async getApiKey(): Promise<ApiKeyDto[]> {
        if (process.env.SCANNER_ALLOW_LEGACY_KEY_EXPORT !== 'true') {
            throw new HttpException('Legacy scanner key export is disabled', HttpStatus.GONE);
        }
        const apiKeyKB = await this.apiKeyDao.getApiKeyByUserEmail('Kubebench');
        if (!apiKeyKB) throw new HttpException(`KB APi key ${apiKeyKB} not found`, HttpStatus.NOT_FOUND);
        return apiKeyKB;
    }

    @Get('/:id')
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN, Authority.ADMIN, Authority.READ_ONLY)
    @UseGuards(AuthGuard, AuthorityGuard, ClusterAccessGuard)
    @ApiResponse({
        status: 201,
    })
    async getBenchReportById(@Param('id') id: string): Promise<KubeBenchDto> {
        const report = await this.kubeBenchService.getBenchReportById(+id);
        if (!report) throw new HttpException(`ID ${id} not found`, HttpStatus.NOT_FOUND);
        return report;
    }


    @Delete('/:id')
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN)
    @UseGuards(AuthGuard, AuthorityGuard, ClusterAccessGuard)
    @ApiResponse({
        status: 201,
    })
    async deleteBenchReportById(@Param('id') id: number): Promise<boolean> {
        const deleted = await this.kubeBenchService.deleteBenchReportById(id);
        if (!deleted) throw new HttpException(`ID ${id} not found`, HttpStatus.NOT_FOUND);
        return true;
    }

    @Get('cluster/:clusterId')
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN, Authority.ADMIN, Authority.READ_ONLY)
    @UseGuards(AuthGuard, AuthorityGuard, ClusterAccessGuard)
    @ApiResponse({
        status: 201,
    })
    async getAllBenchReportsByCluster(@Param('clusterId') clusterId: number, @Query('page') page?: number, @Query ('limit') limit?: number ):
        Promise<{reportCount:number, list: KubeBenchDto[]}> {
        const reports = await this.kubeBenchService.getAllBenchReportsByCluster(clusterId, page, limit);
        return reports;
    }

    @Get('cluster/last/report/:clusterId')
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN, Authority.ADMIN, Authority.READ_ONLY)
    @UseGuards(AuthGuard, AuthorityGuard, ClusterAccessGuard)
    @ApiResponse({
        status: 201,
    })
    async getLastBenchReportSummary(@Param('clusterId') clusterId: number): Promise<KubeBenchSummaryTimestampedDto> {
        const summary = await this.kubeBenchService.getLastBenchReportSummary(clusterId);
        if (!summary || summary.length == 0) throw new HttpException(`No results for cluster ID ${clusterId} found`, HttpStatus.NOT_FOUND);
        const Totals = summary[0].resultsSummary;
        const createdAt = summary[0].createdAt;
        return {Totals, createdAt};
    }

    @Get('/config/get-options')
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN, Authority.ADMIN, Authority.READ_ONLY)
    @UseGuards(AuthGuard, AuthorityGuard)
    @ApiResponse({
        status: 200,
    })
    async getConfigFileList(): Promise<{data: {name: string, value: string}[], success: boolean}> {
        const env = await this.kubeBenchService.getConfigFileList();
        return { data: env, success: true };
    }

    @Get('/config/get-options/:option')
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN, Authority.ADMIN, Authority.READ_ONLY)
    @UseGuards(AuthGuard, AuthorityGuard)
    @ApiResponse({
        status: 200,
    })
    async getConfigFileContents(@Param('option') option: string): Promise<{data: string, success: boolean}> {
        const contents = await this.kubeBenchService.getConfigFileContents(option);
        return { data: contents, success: true };
    }
}
