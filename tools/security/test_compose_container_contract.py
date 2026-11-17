#!/usr/bin/env python3
"""Regression tests for first-install Compose secrets and Docker stack wiring."""
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "platform/docker-compose"
GENERATOR = COMPOSE / "create-compose-env.py"

class ComposeContractTests(unittest.TestCase):
    def test_first_install_generates_private_matching_secrets_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / ".env"
            cmd = [sys.executable, str(GENERATOR),
                   "--admin-email", "maintainer@test-domain.org",
                   "--output", str(output)]
            initial = subprocess.run(cmd, text=True, capture_output=True)
            self.assertEqual(initial.returncode, 0, initial.stderr)
            self.assertTrue(output.is_file())
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            entries = dict(line.partition("=")[::2] for line in output.read_text().splitlines()
                           if "=" in line and not line.startswith("#"))
            for key in ("SECURITY_JWT_SECRET", "DATABASE_PASSWORD", "RABBITMQ_PASSWORD",
                        "SUPER_ADMIN_PASSWORD", "TRAWLER_API_KEY", "FALCO_API_KEY",
                        "KUBE_HUNTER_API_KEY", "KUBE_BENCH_API_KEY"):
                self.assertGreaterEqual(len(entries[key]), 48, key)
            self.assertEqual(entries["RABBITMQ_USERNAME"], "m9sweeper")
            self.assertEqual(entries["SUPER_ADMIN_EMAIL"], "maintainer@test-domain.org")
            self.assertEqual(entries["CLUSTER_SCRAPE_SCHEDULE"], '"*/5 * * * *"')
            again = subprocess.run(cmd, text=True, capture_output=True)
            self.assertNotEqual(again.returncode, 0)
            self.assertNotIn(entries["DATABASE_PASSWORD"], again.stderr)
            self.assertIn("Refusing to overwrite", again.stderr)
            self.assertNotIn(entries["SUPER_ADMIN_PASSWORD"], initial.stdout)

    def test_example_email_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / ".env"
            result = subprocess.run([sys.executable, str(GENERATOR), "--admin-email",
                                     "your-real-admin-email@example.com", "--output", str(output)],
                                    text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())

    def test_core_application_uses_real_multistage_images(self):
        dash = (ROOT / "platform/Dockerfile").read_text()
        worker = (ROOT / "platform/trawler/Dockerfile.jvm").read_text()
        compose = (COMPOSE / "docker-compose.yml").read_text()
        self.assertIn("AS frontend-builder", dash)
        self.assertIn("COPY --from=frontend-builder", dash)
        self.assertIn("USER 1050", dash)
        self.assertIn('ENTRYPOINT ["java", "-jar"', worker)
        self.assertIn("USER 1050:1050", worker)
        self.assertIn("image: postgres:17", compose)
        self.assertIn("image: rabbitmq:4.4-management", compose)
        self.assertIn("m9sweeperRabbitData:/var/lib/rabbitmq", compose)
        self.assertIn("condition: service_completed_successfully", compose)
        self.assertIn("condition: service_healthy", compose)
        self.assertIn("127.0.0.1:3000:3000", compose)

if __name__ == "__main__":
    unittest.main()
