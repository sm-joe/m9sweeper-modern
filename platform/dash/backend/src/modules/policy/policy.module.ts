import { Global, Module } from '@nestjs/common';
import { PolicyDao } from "./dao/policy-dao";
import { PolicyService } from "./services/policy-service";
import { PolicyController } from "./controllers/policy.controller";
import {PolicyComplianceCheckerService} from './services/policy-compliance-checker-service';
import {PolicyWriteScopeService} from './services/policy-write-scope.service';
import { ImageComplianceFacadeService } from './services/image-compliance-facade-service';
import { ImageComplianceService } from './services/image-compliance-service';

@Global()
@Module({
    providers: [
        PolicyDao,
        PolicyService,
        PolicyWriteScopeService,
        PolicyComplianceCheckerService,
        ImageComplianceFacadeService,
        ImageComplianceService
    ],
    exports: [
        PolicyDao,
        PolicyService,
        PolicyComplianceCheckerService,
        ImageComplianceFacadeService,
        ImageComplianceService
    ],
    controllers: [
        PolicyController
    ]
})

export class PolicyModule {}
