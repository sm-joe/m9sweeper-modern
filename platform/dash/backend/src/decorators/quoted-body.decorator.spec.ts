import {BadRequestException} from '@nestjs/common';
import {parseQuotedBody} from './quoted-body.decorator';

describe('scanner JSON report body compatibility', () => {
  const report = {Nodes: [{Name: 'kind-control-plane'}], findings: [{id: 'CVE-test', detail: 'a\\b'}]};

  it('accepts application/json objects without calling string methods on them', () => {
    expect(parseQuotedBody(report)).toEqual(report);
  });

  it('accepts JSON carried as text and preserves escaped report evidence', () => {
    expect(parseQuotedBody(JSON.stringify(report))).toEqual(report);
  });

  it('accepts legacy double-encoded JSON strings', () => {
    expect(parseQuotedBody(JSON.stringify(JSON.stringify(report)))).toEqual(report);
  });

  it.each([null, undefined, [], 'not-json', 'null', '[1,2]', '123', '"not-json"'])(
    'rejects malformed or non-object scanner reports without a 500 (%p)',
    value => {
      expect(() => parseQuotedBody(value)).toThrow(BadRequestException);
    }
  );
});
