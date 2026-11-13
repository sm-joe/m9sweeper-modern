import base64
import unittest

from tools.security.mvp_preinstall_secrets import validate_secret_data


def secrets():
    dash = {
        "SECURITY_JWT_SECRET": "J" * 40,
        "DATABASE_CONNECTION_HOST": "pg.internal",
        "DATABASE_CONNECTION_PORT": "5432",
        "DATABASE_CONNECTION_DATABASE": "postgres",
        "DATABASE_CONNECTION_USERNAME": "postgres",
        "DATABASE_CONNECTION_PASSWORD": "secure-db-pass-xyz",
        "RABBITMQ_HOST_NAME": "broker.internal",
        "RABBITMQ_HOST_PORT": "5672",
        "RABBITMQ_USER_NAME": "m9",
        "RABBITMQ_USER_PASSWORD": "secure-broker-pass",
        "MSG_QUEUE_NAME_IMAGE_SCANNER": "trawler_queue",
    }
    init = {
        "CLUSTER_API_KEY": "C" * 40,
        "SUPER_ADMIN_EMAIL": "operator@example.invalid",
        "SUPER_ADMIN_PASSWORD": "safe-admin-password-12345",
        "TRAWLER_API_KEY": "T" * 40,
        "KUBE_HUNTER_API_KEY": "H" * 40,
        "KUBE_BENCH_API_KEY": "B" * 40,
        "FALCO_API_KEY": "F" * 40,
    }
    worker = {
        "RABBITMQ_HOSTNAME": "broker.internal",
        "RABBITMQ_PORT": "5672",
        "RABBITMQ_USERNAME": "m9",
        "RABBITMQ_PASSWORD": "secure-broker-pass",
        "RABBITMQ_QUEUE_NAME": "trawler_queue",
        "M9SWEEPER_API_KEY": "T" * 40,
    }
    return {role: {"data": {
        key: base64.b64encode(value.encode()).decode()
        for key, value in entries.items()}}
        for role, entries in (("dash",dash),("init",init),("trawler",worker))}


class MvpSecretPreflightTests(unittest.TestCase):
    def test_matching_staging_secrets_pass(self):
        self.assertEqual(validate_secret_data(secrets()), [])

    def test_missing_key_fails_without_exposing_values(self):
        s = secrets()
        del s["dash"]["data"]["SECURITY_JWT_SECRET"]
        self.assertTrue(any("SECURITY_JWT_SECRET" in e for e in validate_secret_data(s)))

    def test_mismatched_worker_api_key_fails(self):
        s = secrets()
        s["trawler"]["data"]["M9SWEEPER_API_KEY"] = base64.b64encode(b"X" * 40).decode()
        self.assertTrue(any("scanner API credentials do not match" in e for e in validate_secret_data(s)))

    def test_mismatched_broker_credentials_fail(self):
        s = secrets()
        s["trawler"]["data"]["RABBITMQ_PASSWORD"] = base64.b64encode(b"incorrect").decode()
        self.assertTrue(any("RABBITMQ_USER_PASSWORD" in e for e in validate_secret_data(s)))

    def test_default_guest_account_fails(self):
        s = secrets()
        for role,key in (("dash","RABBITMQ_USER_NAME"),("trawler","RABBITMQ_USERNAME")):
            s[role]["data"][key] = base64.b64encode(b"guest").decode()
        self.assertTrue(validate_secret_data(s))

    def test_garbage_base64_fails_without_leak(self):
        s = secrets()
        s["init"]["data"]["SUPER_ADMIN_PASSWORD"] = "!!!!sensitive-secret"
        errors = validate_secret_data(s)
        self.assertTrue(errors)
        self.assertNotIn("!!!!", " ".join(errors))


if __name__ == "__main__":
    unittest.main()
