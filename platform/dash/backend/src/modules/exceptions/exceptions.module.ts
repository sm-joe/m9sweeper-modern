import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import {ExceptionsDao} from "./dao/exceptions.dao";
import {ExceptionsService} from "./services/exceptions.service";
import {ExceptionController} from "./controllers/exception.controller";
import {ExceptionScopeService} from './services/exception-scope.service';

@Global()
@Module({
    providers: [ExceptionsDao, ExceptionsService, ExceptionScopeService],
    imports: [
        ScheduleModule.forRoot()
    ],
    exports: [
        ExceptionsDao,
        ExceptionsService,
        ExceptionScopeService
    ],
    controllers: [ExceptionController]
})
export class ExceptionsModule {}
