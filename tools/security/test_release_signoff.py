#!/usr/bin/env python3
import copy
import unittest
from tools.security.check_release_signoff import REQUIRED_GATES, check

SHA = "a" * 40

def valid_document():
    return {
        "schemaVersion": 1,
        "releaseVersion": "v1.0.0",
        "sourceCommit": SHA,
        "environment": {
            "linuxDistribution": "Ubuntu 24.04",
            "kernel": "6.8.0",
            "kubernetesVersion": "v1.37.0",
            "helmVersion": "v3.17.3",
        },
        "artifacts": {"dashDigest": "sha256:" + "b" * 64, "trawlerDigest": "sha256:" + "c" * 64},
        "gates": {name: {"status": "passed", "evidence": ["https://github.com/example/actions/runs/123"]} for name in REQUIRED_GATES},
    }


class ReleaseSignoffTest(unittest.TestCase):
    def test_complete_manifest(self):
        self.assertEqual(check(valid_document(), SHA), [])

    def test_exact_source_sha_required(self):
        self.assertTrue(any("does not match" in e for e in check(valid_document(), "d" * 40)))

    def test_pending_gate_fails_closed(self):
        document = valid_document()
        document["gates"]["postgres_backup_restore"]["status"] = "pending"
        self.assertTrue(any("postgres_backup_restore" in e for e in check(document, SHA)))

    def test_missing_evidence_fails_closed(self):
        document = valid_document()
        document["gates"]["trivy_end_to_end"]["evidence"] = []
        self.assertTrue(any("trivy_end_to_end.evidence" in e for e in check(document, SHA)))

    def test_bad_digest_fails_closed(self):
        document = valid_document()
        document["artifacts"]["dashDigest"] = "latest"
        self.assertTrue(any("dashDigest" in e for e in check(document, SHA)))


if __name__ == "__main__":
    unittest.main()
