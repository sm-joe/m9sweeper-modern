/**
 * Scanner webhook credentials.
 *
 * Existing kube-hunter installations still use query-string keys. During
 * migration they remain supported, but operators can opt out explicitly with
 * SCANNER_ALLOW_LEGACY_QUERY_KEYS=false after moving clients to X-API-Key.
 *
 * Never log or reflect either credential in errors.
 */
export function selectScannerIngestKey(
    headerKey?: string,
    legacyQueryKey?: string,
    allowLegacy = process.env.SCANNER_ALLOW_LEGACY_QUERY_KEYS !== 'false'
): string {
    const safeToken = (candidate?: string): string => {
        if (typeof candidate !== 'string' || !candidate ||
            candidate.length > 4096 || /[\r\n\x00]/.test(candidate)) {
            return '';
        }
        return candidate;
    };
    const fromHeader = safeToken(headerKey);
    if (fromHeader) {
        return fromHeader;
    }
    return allowLegacy ? safeToken(legacyQueryKey) : '';
}
