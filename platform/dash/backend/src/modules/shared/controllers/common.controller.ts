import {ApiBearerAuth, ApiResponse, ApiTags} from '@nestjs/swagger';
import {
    Controller,
    UseInterceptors,
    Get, UseGuards,

} from '@nestjs/common';
import { ResponseTransformerInterceptor } from '../../../interceptors/response-transformer.interceptor';
import {ConfigService} from "@nestjs/config";
import {BASE_URL_SCHEMA} from "../open-api-schema/common-schema";
import {AllowedAuthorityLevels} from "../../../decorators/allowed-authority-levels.decorator";
import {Authority} from "../../user/enum/Authority";
import {AuthGuard} from "../../../guards/auth.guard";
import {AuthorityGuard} from "../../../guards/authority.guard";
import {validateScannerReportEndpoint} from '../services/report-endpoint';


@ApiTags('Common')
@ApiBearerAuth('jwt-auth')
@Controller()
@UseInterceptors(ResponseTransformerInterceptor)
export class CommonController {
    constructor(private readonly configService: ConfigService) {}


    @Get('get-config')
    @AllowedAuthorityLevels(Authority.READ_ONLY, Authority.SUPER_ADMIN, Authority.ADMIN)
    @UseGuards(AuthGuard, AuthorityGuard)
    @ApiResponse({
        status: 200,
        schema: BASE_URL_SCHEMA
    })
    async getBaseUrl(): Promise<{baseUrl: string; reportIngestionUrl: string | null}> {
        const baseUrl = this.configService.get('server.baseUrl');
        // Only expose a validated scanner callback URL. Missing/malformed configuration
        // must prevent generating a broken scan Job instead of falling back to localhost.
        const reportIngestionUrl = validateScannerReportEndpoint(this.configService.get('server.reportIngestionUrl'));
        return {baseUrl, reportIngestionUrl};
    }



}
