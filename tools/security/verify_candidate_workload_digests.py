#!/usr/bin/env python3
"""Fail closed if candidate Helm workloads omit, downgrade or swap signed images.

Uses rendered Kubernetes manifests, rather than trusting umbrella values alone.
No third-party YAML dependency is required: container image fields in all
Kubernetes PodSpecs are scalar values emitted as "image: ...".
"""
import re
import sys
from pathlib import Path

DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
VERSION = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+$")
IMAGE = re.compile(r"(?m)^\s*-?\s*image:\s*['\"]?([^\s'\"]+)")
# Both modern repositories and the obsolete upstream repositories are checked.
COMPONENT = re.compile(
    r"(?:^|/)(?:m9sweeper-dash|m9sweeper-trawler|dash|trawler)(?=[:@]|$)"
)

def verify(manifest: str, version: str, dash_digest: str, trawler_digest: str) -> tuple[int, int]:
    if not VERSION.fullmatch(version):
        raise ValueError("Release version must be vMAJOR.MINOR.PATCH")
    if not DIGEST.fullmatch(dash_digest) or not DIGEST.fullmatch(trawler_digest):
        raise ValueError("Candidate requires exact SHA-256 OCI image digests")
    expected = {
        "dash": f"ghcr.io/sm-joe/m9sweeper-dash:{version}@{dash_digest}",
        "trawler": f"ghcr.io/sm-joe/m9sweeper-trawler:{version}@{trawler_digest}",
    }
    found = dict.fromkeys(expected, 0)
    for image in IMAGE.findall(manifest):
        # Evaluate any image name representing one of the two components,
        # including older upstream repositories, alternative registries, and
        # malformed digest-less variants.
        if not COMPONENT.search(image):
            continue
        component = "dash" if re.search(r"(?:^|/)(?:m9sweeper-dash|dash)(?=[:@]|$)", image) else "trawler"
        if image != expected[component]:
            raise ValueError(f"Rendered {component} image does not match signed immutable candidate digest")
        found[component] += 1
    for component, count in found.items():
        if count == 0:
            raise ValueError(f"No rendered {component} workload references its signed candidate image")
    return found["dash"], found["trawler"]

def main() -> None:
    if len(sys.argv) != 5:
        raise SystemExit("usage: verify_candidate_workload_digests.py RENDERED_YAML VERSION DASH_SHA256 TRAWLER_SHA256")
    try:
        count = verify(Path(sys.argv[1]).read_text(), *sys.argv[2:])
    except (ValueError, OSError) as exc:
        raise SystemExit("FAIL: candidate workload image verification: " + str(exc)) from exc
    print(f"PASS: every rendered Dash ({count[0]}) and trawler ({count[1]}) image is pinned to signed OCI digests")

if __name__ == "__main__":
    main()
