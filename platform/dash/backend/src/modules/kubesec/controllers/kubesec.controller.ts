import {BadGatewayException, BadRequestException, Body, Controller, Get, InternalServerErrorException, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors} from '@nestjs/common';
import {ClusterAccessGuard} from '../../../guards/cluster-access.guard';
import {KubesecService} from "../services/kubesec.service";
import {AllowedAuthorityLevels} from "../../../decorators/allowed-authority-levels.decorator";
import {Authority} from "../../user/enum/Authority";
import {AuthGuard} from "../../../guards/auth.guard";
import {AuthorityGuard} from "../../../guards/authority.guard";
import {FileInterceptor} from "@nestjs/platform-express";
import {Express} from 'express';
import {V1PodList} from "@kubernetes/client-node";
import {V1NamespaceList} from "@kubernetes/client-node/dist/gen/model/v1NamespaceList";

@Controller()
export class KubesecController {
    constructor(
        private readonly kubesecService: KubesecService,
    ) {}

    @Get('/listnamespaces')
    @UseGuards(ClusterAccessGuard)
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN, Authority.ADMIN, Authority.READ_ONLY)
    @UseGuards(AuthGuard, AuthorityGuard)
    async listNamespaces(@Query('clusterId') clusterId: number): Promise<V1NamespaceList> {
        return await this.kubesecService.listNamespaces(clusterId).catch((err) => {
            console.log(err);
            throw new InternalServerErrorException();
        });
    }

    @Get('/listpods')
    @UseGuards(ClusterAccessGuard)
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN, Authority.ADMIN, Authority.READ_ONLY)
    @UseGuards(AuthGuard, AuthorityGuard)
    async listPods(
      @Query('cluster') clusterId: number,
      @Query('namespaces') namespaces: string[]
    ): Promise<(V1PodList)[]> {
        const raw = namespaces as unknown as string | string[];
        const selected = (Array.isArray(raw) ? raw : raw ? [raw] : [])
            .filter(namespace => namespace !== 'selectAll');
        if (selected.length === 0 || selected.length > 100 ||
            selected.some(namespace => !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(namespace))) {
            throw new BadRequestException('Select one or more valid Kubernetes namespaces');
        }
        const response = await this.kubesecService.listPods(clusterId, [...new Set(selected)]);
        // Avoid silently displaying "No pods" when the Kubernetes API returned
        // 401/403, DNS failures, or an invalid namespace.
        if (response.errors.length) {
            throw new BadGatewayException(
                'Could not list pods in one or more namespaces. Check cluster credentials, pod-list RBAC and API connectivity.');
        }
        return response.podList;
    }

    @Post('/:clusterId')
    @UseGuards(ClusterAccessGuard)
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN, Authority.ADMIN, Authority.READ_ONLY)
    @UseGuards(AuthGuard, AuthorityGuard)
    async runKubesecForPod(@Param('clusterId') clusterId: number, @Body() podInfo: any) {
        const res = [];
        if(!Array.isArray(podInfo)) {
            return (await this.kubesecService.runKubesecByPod(podInfo.name, podInfo.namespace, clusterId)).data[0];
        }
        for (const info of podInfo) {
            res.push(this.kubesecService.runKubesecByPod(info.name, info.namespace, clusterId).then(result => result.data[0]));
        }
        return await Promise.all(res);
    }

    @Post()
    @UseInterceptors(FileInterceptor('podFile'))
    @AllowedAuthorityLevels(Authority.SUPER_ADMIN, Authority.ADMIN, Authority.READ_ONLY)
    @UseGuards(AuthGuard, AuthorityGuard)
    async runKubesecForFile(@UploadedFile() podFile: Express.Multer.File) {
        const res = await this.kubesecService.runKubesecByPodFile(podFile);
        return typeof(res) === "string" ? res : res.data[0];
    }
}
