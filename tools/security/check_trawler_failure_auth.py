#!/usr/bin/env python3
"""Fail CI if the Java failed-scan callback uses unsupported auth header.

The real disposable queue -> Java -> NestJS -> PostgreSQL acceptance remains
the authoritative behavioral test. This is a cheap structural regression.
"""
from pathlib import Path

java = Path("platform/trawler/src/main/java/io/m9sweeper/trawler/Trawler.java").read_text()
identity = Path("platform/dash/backend/src/providers/LoggedInUserFactory.ts").read_text()

start = java.index("private static void notifyQuarantinedScan")
end = java.index("private Connection getAmpqConnection", start)
callback = java[start:end]
assert 'conn.setRequestProperty("x-api-key"' in callback, (
    "Java DLQ failure callback must send X-API-Key resolved by NestJS"
)
assert 'conn.setRequestProperty("x-auth-token"' not in callback, (
    "Legacy x-auth-token is NOT consumed by LoggedInUserFactory"
)
assert "request.get('x-api-key')" in identity, "NestJS identity header contract changed"
print("PASS: Java terminal DLQ callback authenticates with the supported X-API-Key header")
