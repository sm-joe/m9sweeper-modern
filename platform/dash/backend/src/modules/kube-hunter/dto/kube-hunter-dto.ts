import {Expose, Transform} from "class-transformer";
import {IsNumber, IsString} from "class-validator";

export class KubeHunterDto {
    @Expose({name: 'id', toPlainOnly: true})
    @IsNumber()
    id: number;

    @Expose({name: 'cluster_id'})
    @IsNumber()
    clusterId: number;

    @Expose({name: 'created_at'})
    @IsNumber()
    createdAt: number;

    /** Deprecated */
    @Expose({name: 'uuid', toPlainOnly: true})
    @IsString()
    uuid: string;

    // structure: IKubeHunterRawNodes
    @Expose({name: 'nodes', toPlainOnly: true})
    @Transform(({value}) => typeof value === 'string' ? value : JSON.stringify(value), {toPlainOnly: true})
    nodes: string;

    // structure: IKubeHunterRawServices
    @Expose({name: 'services', toPlainOnly: true})
    @Transform(({value}) => typeof value === 'string' ? value : JSON.stringify(value), {toPlainOnly: true})
    services: string;

    // structure: IKubeHunterRawVulnerabilities
    @Expose({name: 'vulnerabilities', toPlainOnly: true})
    @Transform(({value}) => typeof value === 'string' ? value : JSON.stringify(value), {toPlainOnly: true})
    vulnerabilities: string;
}
