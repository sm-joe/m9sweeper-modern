import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/create-install-secrets.py"
spec = importlib.util.spec_from_file_location("m9_create_secrets", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FirstInstallGeneratorTests(unittest.TestCase):
    def read_env(self, path):
        return dict(line.split("=", 1) for line in path.read_text().splitlines())

    def test_generates_matching_secrets_without_example_passwords(self):
        with tempfile.TemporaryDirectory() as base:
            root = Path(base) / "m9-private"
            with patch.dict(os.environ, {"M9_ADMIN_EMAIL": "operator@company.test"}):
                module.create(root)
            dash = self.read_env(root / "dash-runtime.env")
            init = self.read_env(root / "dash-bootstrap.env")
            worker = self.read_env(root / "trawler-runtime.env")
            self.assertEqual(dash["RABBITMQ_USER_PASSWORD"], worker["RABBITMQ_PASSWORD"])
            self.assertEqual(dash["RABBITMQ_USER_NAME"], worker["RABBITMQ_USERNAME"])
            self.assertEqual(dash["RABBITMQ_HOST_NAME"], worker["RABBITMQ_HOSTNAME"])
            self.assertEqual(dash["MSG_QUEUE_NAME_IMAGE_SCANNER"], worker["RABBITMQ_QUEUE_NAME"])
            self.assertEqual(init["TRAWLER_API_KEY"], worker["M9SWEEPER_API_KEY"])
            self.assertGreaterEqual(len(init["TRAWLER_API_KEY"]), 32)
            self.assertNotIn("replace-with-", repr((dash, init, worker)))
            self.assertEqual(init["SUPER_ADMIN_EMAIL"], "operator@company.test")
            if os.name == "posix":
                self.assertEqual((root / "dash-runtime.env").stat().st_mode & 0o777, 0o600)

    def test_existing_secret_files_never_overwritten(self):
        with tempfile.TemporaryDirectory() as base:
            root = Path(base)
            before = root / "dash-runtime.env"
            before.write_text("KEEP=existing-value\n")
            with patch.dict(os.environ, {"M9_ADMIN_EMAIL": "operator@company.test"}):
                with self.assertRaises(FileExistsError):
                    module.create(root)
            self.assertEqual(before.read_text(), "KEEP=existing-value\n")
            self.assertFalse((root / "trawler-runtime.env").exists())

    def test_rejects_sample_admin_email(self):
        with tempfile.TemporaryDirectory() as base:
            with patch.dict(os.environ, {"M9_ADMIN_EMAIL": "your-real-admin-email@example.com"}):
                with self.assertRaises(ValueError):
                    module.create(Path(base))

    def test_requires_admin_email(self):
        with tempfile.TemporaryDirectory() as base:
            with patch.dict(os.environ, {"M9_ADMIN_EMAIL": ""}):
                with self.assertRaises(ValueError):
                    module.create(Path(base))


if __name__ == "__main__":
    unittest.main()
