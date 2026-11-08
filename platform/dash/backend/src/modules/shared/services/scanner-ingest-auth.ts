/**
 * Scanner webhook credentials.
 *
 * Query-string authentication is DISABLED by default. A temporary compatibility
 * override SCANNER_ALLOW_LEGACY_QUERY_KEYS=true must be set explicitly
 * during migration. Migrate collectors to X-API-Key and rotate old keys.
 *
 * Never log or reflect either credential in errors. Never downgrade to a
 * query credential if an X-API-Key header was supplied but is malformed.
 */
export function selectScannerIngestKey(
    headerKey?: string,
    legacyQueryKey?: string,
    allowLegacy = process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS === 'true'
): string {
    const safeToken = (candidate?: string): string => {
        if (typeof candidate !== 'string' || !candidate.trim() ||
            candidate.length > 4096 || /[\r\n\x00]/.test(candidate)) {
            return '';
        }
        return candidate;
    };
    if (headerKey !== undefined) {
        return safeToken(headerKey);
    }
    return allowLegacy ? safeToken(legacyQueryKey) : '';
}

/** Strictly positive, safe integer cluster ID for unguarded external webhooks. */
export function parseScannerClusterId(value: number | string): number {
    const raw = String(value);
    if (!/^[1-9][0-9]*$/.test(raw)) {
        return NaN;
    }
    const id = Number(raw);
    return Number.isSafeInteger(id) ? id : NaN;
}
