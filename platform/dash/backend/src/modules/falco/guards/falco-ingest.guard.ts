import {
    BadRequestException, CanActivate, ExecutionContext, Injectable,
    UnauthorizedException
} from '@nestjs/common';
import {UserDao} from '../../user/dao/user.dao';
import {AuthService} from '../../auth/services/auth.service';
import {AuthorityId} from '../../user/enum/authority-id';
import {parseScannerClusterId, selectScannerIngestKey} from '../../shared/services/scanner-ingest-auth';

/**
 * HTTP boundary for external Falcosidekick collector POSTs.
 * Guards run before Nest global ValidationPipe, ensuring missing/invalid/revoked
 * credentials return 401 even if the event JSON is structurally malformed.
 * Never log API keys or raw events. Body validation stays in ValidationPipe.
 */
@Injectable()
export class FalcoIngestGuard implements CanActivate {
    constructor(
        private readonly users: UserDao,
        private readonly auth: AuthService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const clusterId = parseScannerClusterId(request.params?.clusterid);
        if (!Number.isFinite(clusterId)) {
            throw new BadRequestException('Invalid cluster identifier');
        }
        const header = request.headers?.['x-api-key'];
        const query = request.query?.key;
        const scannerKey = selectScannerIngestKey(header, query);
        if (!scannerKey.trim()) {
            throw new UnauthorizedException('Missing Falco API key');
        }
        const userRecords = await this.users.loadUserByApiKey(scannerKey);
        if (!Array.isArray(userRecords) || userRecords.length < 1) {
            throw new UnauthorizedException('Access denied');
        }
        const identity = userRecords[0];
        if (identity.isActive === false ||
            !this.auth.checkAuthority(identity.authorities, [AuthorityId.FALCO])) {
            throw new UnauthorizedException('Access denied');
        }
        if (process.env.SCANNER_REQUIRE_CLUSTER_BINDINGS === 'true' &&
            !await this.users.scannerHasClusterGrant(identity.id, clusterId)) {
            throw new UnauthorizedException('Scanner identity is not authorized for this cluster');
        }
        return true;
    }
}
