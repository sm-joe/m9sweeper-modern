import {BadRequestException, createParamDecorator, ExecutionContext} from '@nestjs/common';

/**
 * Scanner reports can arrive as ordinary application/json, JSON encoded in a
 * text payload, or as a JSON string containing the serialized JSON document.
 * The previous decorator assumed every request body was a string and threw
 * TypeError for Nest/Express's already-parsed objects (HTTP 500).
 */
export function parseQuotedBody(body: unknown): Record<string, unknown> {
    let parsed: unknown = body;

    // At most two JSON decode passes support legacy JSON-string payloads,
    // without lossy backslash stripping that corrupts report evidence.
    for (let attempt = 0; attempt < 2 && typeof parsed === 'string'; attempt++) {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            throw new BadRequestException('Malformed scanner report JSON');
        }
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new BadRequestException('Scanner report must be a JSON object');
    }
    return parsed as Record<string, unknown>;
}

export const QuotedBody = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
    // Authentication in the controller must run before reporting malformed payloads.
    return ctx.switchToHttp().getRequest().body;
});
