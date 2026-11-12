import {BadRequestException} from '@nestjs/common';
import {parseImageSummaryFilters} from './parse-image-summary-filters';

describe('image dashboard vulnerability summary query parsing', () => {
    it('returns an empty cluster selection for a first-load request without filters', () => {
        expect(parseImageSummaryFilters(undefined)).toEqual({clusterId: [], namespace: []});
        expect(parseImageSummaryFilters({group_by: 'savedAtDate'})).toEqual({
            clusterId: [], namespace: []
        });
    });

    it('parses Angular HttpParams bracketed array keys under the Express simple query parser', () => {
        expect(parseImageSummaryFilters({
            'filters[clusterId][1]': '9',
            'filters[clusterId][0]': '3',
            'filters[namespace][0]': 'default',
            'filters[namespace][1]': 'kube-system',
            'filters[runningInCluster]': 'false',
            'filters[startDate]': '2026-11-01',
            'filters[endDate]': '2026-11-12',
            group_by: 'savedAtDate'
        })).toEqual({
            clusterId: [3, 9], namespace: ['default', 'kube-system'],
            runningInCluster: false,
            startDate: '2026-11-01', endDate: '2026-11-12'
        });
    });

    it('remains compatible with the old nested parser shape', () => {
        expect(parseImageSummaryFilters({
            filters: {
                clusterId: {'0': '7', '1': '8'},
                namespace: {'0': 'prod'},
                runningInCluster: 'true'
            }
        })).toEqual({clusterId: [7, 8], namespace: ['prod'], runningInCluster: true});
        expect(parseImageSummaryFilters({
            filters: {clusterId: ['3'], namespace: 'default'}
        })).toEqual({clusterId: [3], namespace: ['default']});
    });

    it('does not turn malformed or missing cluster scope into an all-cluster query', () => {
        for (const invalid of ['0', '-1', '1.2', 'NaN', '99999999999999999']) {
            expect(() => parseImageSummaryFilters({
                'filters[clusterId][0]': invalid
            })).toThrow(BadRequestException);
        }
        expect(parseImageSummaryFilters({'filters[namespace][0]': 'default'}))
            .toMatchObject({clusterId: [], namespace: ['default']});
        expect(() => parseImageSummaryFilters({
            'filters[clusterId][0]': '3', 'filters[clusterId][1]': '3'
        })).toThrow(BadRequestException);
        expect(() => parseImageSummaryFilters({
            'filters[clusterId][100]': '3'
        })).toThrow(BadRequestException);
    });

    it('rejects malicious arrays and invalid scalar fields before accessing persistence', () => {
        expect(() => parseImageSummaryFilters({
            'filters[namespace]': {inject: 'evil'},
            'filters[clusterId][0]': '3'
        })).toThrow(BadRequestException);
        expect(() => parseImageSummaryFilters({
            'filters[clusterId][0]': '3',
            'filters[runningInCluster]': 'invalid'
        })).toThrow(BadRequestException);
    });
});
