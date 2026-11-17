import base64
import importlib.util
from pathlib import Path
import unittest

SOURCE = (Path(__file__).resolve().parents[2] /
          "platform/manifests/charts/m9sweeper/files/secret-contract-preflight.py")
spec = importlib.util.spec_from_file_location("secret_contract_preflight", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def encoded(entries):
    return {"data": {key: base64.b64encode(value.encode()).decode()
                     for key, value in entries.items()}}


def fixtures():
    return {
        "dash": encoded({
            "SECURITY_JWT_SECRET": "j" * 40,
            "DATABASE_CONNECTION_HOST": "m9sweeper-postgresql",
            "DATABASE_CONNECTION_PORT": "5432",
            "DATABASE_CONNECTION_DATABASE": "postgres",
            "DATABASE_CONNECTION_USERNAME": "postgres",
            "DATABASE_CONNECTION_PASSWORD": "db-secure",
            "RABBITMQ_HOST_NAME": "m9sweeper-rabbitmq",
            "RABBITMQ_HOST_PORT": "5672",
            "RABBITMQ_USER_NAME": "m9",
            "RABBITMQ_USER_PASSWORD": "actual-broker-password",
            "MSG_QUEUE_NAME_IMAGE_SCANNER": "trawler_queue",
        }),
        "init": encoded({
            "CLUSTER_API_KEY": "c" * 40,
            "SUPER_ADMIN_EMAIL": "admin@ci.invalid",
            "SUPER_ADMIN_PASSWORD": "valid-admin-password",
            "TRAWLER_API_KEY": "t" * 40,
            "KUBE_HUNTER_API_KEY": "h" * 40,
            "KUBE_BENCH_API_KEY": "b" * 40,
            "FALCO_API_KEY": "f" * 40,
        }),
        "trawler": encoded({
            "RABBITMQ_HOSTNAME": "m9sweeper-rabbitmq",
            "RABBITMQ_PORT": "5672",
            "RABBITMQ_USERNAME": "m9",
            "RABBITMQ_PASSWORD": "actual-broker-password",
            "RABBITMQ_QUEUE_NAME": "trawler_queue",
            "M9SWEEPER_API_KEY": "t" * 40,
        }),
    }


class SecretContractTests(unittest.TestCase):
    def test_complete_documented_environment_passes(self):
        self.assertEqual([], module.validate(fixtures()))

    def test_existing_trawler_secret_using_dash_names_fails_before_deployment(self):
        objects = fixtures()
        for old, new in [
            ("RABBITMQ_HOSTNAME", "RABBITMQ_HOST_NAME"),
            ("RABBITMQ_USERNAME", "RABBITMQ_USER_NAME"),
            ("RABBITMQ_PASSWORD", "RABBITMQ_USER_PASSWORD"),
            ("RABBITMQ_QUEUE_NAME", "MSG_QUEUE_NAME_IMAGE_SCANNER"),
        ]:
            objects["trawler"]["data"][new] = objects["trawler"]["data"].pop(old)
        errors = module.validate(objects)
        self.assertTrue(any("RABBITMQ_USERNAME" in error for error in errors))
        self.assertTrue(any("RABBITMQ_PASSWORD" in error for error in errors))

    def test_missing_scanner_api_key_fails(self):
        objects = fixtures()
        del objects["trawler"]["data"]["M9SWEEPER_API_KEY"]
        self.assertTrue(any("M9SWEEPER_API_KEY" in e for e in module.validate(objects)))

    def test_placeholder_in_documented_password_fails(self):
        objects = fixtures()
        objects["trawler"]["data"]["RABBITMQ_PASSWORD"] = base64.b64encode(
            b"replace-with-rabbitmq-password").decode()
        self.assertTrue(any("placeholder" in e for e in module.validate(objects)))

    def test_mismatched_host_is_detected(self):
        objects = fixtures()
        objects["trawler"]["data"]["RABBITMQ_HOSTNAME"] = base64.b64encode(
            b"rabbitmq.other.svc.cluster.local").decode()
        self.assertTrue(any("RABBITMQ_HOSTNAME" in e for e in module.validate(objects)))

    def test_diagnostics_never_print_sensitive_values(self):
        objects = fixtures()
        objects["trawler"]["data"]["RABBITMQ_PASSWORD"] = base64.b64encode(
            b"secret-password-that-must-not-leak").decode()
        self.assertNotIn("secret-password-that-must-not-leak",
                         repr(module.validate(objects)))


if __name__ == "__main__":
    unittest.main()
