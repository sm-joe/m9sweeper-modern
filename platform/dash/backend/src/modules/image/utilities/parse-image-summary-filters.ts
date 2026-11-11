import {BadRequestException} from '@nestjs/common';

/**
 * Express 5 uses a simple query parser by default. Angular still sends the
 * legacy names filters[clusterId][0] and filters[namespace][0].
 * Handle both flat and extended/nested query representations without allowing
 * an omitted or malformed scope to become an all-cluster query.
 */
export interface ImageSummaryFilters {
    clusterId: number[];
    namespace: string[];
    startDate?: string;
    endDate?: string;
    runningInCluster?: boolean;
}

export function parseImageSummaryFilters(query: Record<string, unknown> | undefined): ImageSummaryFilters {
    const source = query && typeof query === 'object' && !Array.isArray(query) ? query : {};
    const nested = source.filters && typeof source.filters === 'object' &&
        !Array.isArray(source.filters) ? source.filters as Record<string, unknown> : {};

    const readField = (field: string): unknown => {
        if (Object.prototype.hasOwnProperty.call(nested, field)) {
            return nested[field];
        }
        if (Object.prototype.hasOwnProperty.call(source, `filters[${field}]`)) {
            return source[`filters[${field}]`];
        }
        const matches: Array<{index: number; value: unknown}> = [];
        const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^filters\\[${escaped}\\]\\[([0-9]+)\\]$`);
        for (const key of Object.keys(source)) {
            const match = pattern.exec(key);
            if (match) {
                const index = Number(match[1]);
                if (!Number.isSafeInteger(index) || index > 99 || matches.some(entry => entry.index === index)) {
                    throw new BadRequestException('Invalid image summary array index');
                }
                matches.push({index, value: source[key]});
            }
        }
        if (!matches.length) return undefined;
        return matches.sort((a, b) => a.index - b.index).map(entry => entry.value);
    };

    const toArray = (input: unknown, name: string): unknown[] => {
        if (input == null || input === '') return [];
        let values: unknown[];
        if (Array.isArray(input)) {
            values = input;
        } else if (typeof input === 'object') {
            const record = input as Record<string, unknown>;
            const keys = Object.keys(record);
            if (keys.some(key => !/^(0|[1-9][0-9]*)$/.test(key))) {
                throw new BadRequestException(`Invalid ${name} filter`);
            }
            values = keys.sort((a, b) => Number(a) - Number(b)).map(key => record[key]);
        } else {
            values = [input];
        }
        if (values.length > 100 || values.some(value => Array.isArray(value) ||
            (value !== null && typeof value === 'object'))) {
            throw new BadRequestException(`Invalid ${name} filter`);
        }
        return values;
    };

    const clusterId = toArray(readField('clusterId'), 'clusterId').map(value => {
        const text = String(value);
        if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(Number(text))) {
            throw new BadRequestException('Invalid image summary cluster identifier');
        }
        return Number(text);
    });
    if (new Set(clusterId).size !== clusterId.length) {
        throw new BadRequestException('Duplicate image summary cluster identifier');
    }

    const namespace = toArray(readField('namespace'), 'namespace').map(value => {
        if (typeof value !== 'string' || !value.length || value.length > 253) {
            throw new BadRequestException('Invalid image summary namespace');
        }
        return value;
    });

    const filters: ImageSummaryFilters = {clusterId, namespace};
    const startDate = readField('startDate');
    const endDate = readField('endDate');
    for (const [key, value] of [['startDate', startDate], ['endDate', endDate]] as const) {
        if (value !== undefined && value !== '') {
            if (typeof value !== 'string' || value.length > 64) {
                throw new BadRequestException(`Invalid image summary ${key}`);
            }
            filters[key] = value;
        }
    }
    const running = readField('runningInCluster');
    if (running !== undefined && running !== '') {
        if (running === true || running === 'true' || running === '1' || running === 1) {
            filters.runningInCluster = true;
        } else if (running === false || running === 'false' || running === '0' || running === 0) {
            filters.runningInCluster = false;
        } else {
            throw new BadRequestException('Invalid image summary runningInCluster');
        }
    }
    return filters;
}
