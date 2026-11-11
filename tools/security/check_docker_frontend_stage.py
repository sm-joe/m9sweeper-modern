#!/usr/bin/env python3
"""Fail a release if Angular image compilation regains NestJS package access."""
import re
from pathlib import Path

dockerfile = Path("platform/Dockerfile").read_text()
stages = re.split(r"(?im)^(?=FROM\s+)", dockerfile)
frontend = [stage for stage in stages
            if re.match(r"(?i)FROM\s+\S+\s+AS\s+frontend-builder\b", stage)]
if len(frontend) != 1:
    raise SystemExit("FAIL: expected exactly one independent frontend-builder stage")
frontend = frontend[0]
if re.search(r"(?im)^\s*COPY\s+[^\n]*dash/backend", frontend):
    raise SystemExit("FAIL: independent Angular stage copies NestJS backend source")
if "/usr/src/app/backend/node_modules" not in frontend or "test ! -d" not in frontend:
    raise SystemExit("FAIL: Angular Docker stage no longer proves backend dependencies are absent")
if "npm run build:prod" not in frontend or "npm run check:client-boundary" not in frontend:
    raise SystemExit("FAIL: Angular Docker stage must run boundary and production compilation")
if not re.search(
    r"(?m)^COPY --from=frontend-builder /usr/src/app/backend/dist/public /usr/src/app/public\s*$",
    dockerfile
):
    raise SystemExit("FAIL: NestJS static SPA root no longer receives independent Angular output")
print("PASS: Docker Angular build isolated from NestJS modules and still serves SPA from backend/public")
