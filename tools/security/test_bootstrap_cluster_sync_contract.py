"""Protect installation from previously stored, expired Kubernetes credentials."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / "platform/dash/backend/package.json"
SYNC = ROOT / "platform/dash/backend/src/modules/command-line/commands/cluster-sync.command.ts"
CRON = ROOT / "platform/dash/backend/src/modules/command-line/controllers/cron-jobs.controller.ts"
CHART = ROOT / "platform/manifests/charts/dash/templates/job-init.yaml"


class BootstrapClusterSyncContractTests(unittest.TestCase):
    def test_cluster_inventory_is_not_a_blocking_helm_bootstrap_step(self):
        commands = json.loads(PACKAGE.read_text(encoding="utf-8"))["scripts"]
        bootstrap = commands["cli:init:all"]
        self.assertIn("cli:database:migrate", bootstrap)
        self.assertIn("cli:users:init", bootstrap)
        self.assertIn("cli:cluster:seed", bootstrap)
        self.assertIn("cli:registries:init", bootstrap)
        self.assertIn("cli:exceptions:init", bootstrap)
        self.assertNotIn("cli:cluster:sync-all", bootstrap)
        self.assertIn("cli:cluster:sync-all", commands)

    def test_cluster_sync_retains_fail_closed_inventory_semantics(self):
        source = SYNC.read_text(encoding="utf-8")
        self.assertIn("return false;", source)
        self.assertIn("Cluster inventory sync incomplete", source)
        self.assertIn("updateClusterLastScanned", source)

    def test_cluster_sync_remains_scheduled_separately(self):
        source = CRON.read_text(encoding="utf-8")
        self.assertIn("this.clusterSyncCommand.syncCluster('all')", source)
        self.assertIn("scrapeJob.start()", source)

    def test_helm_job_runs_only_bootstrap(self):
        source = CHART.read_text(encoding="utf-8")
        self.assertIn("cli:init:all", source)
        self.assertIn('"helm.sh/hook": post-install', source)
        self.assertNotIn("cli:cluster:sync-all", source)


if __name__ == "__main__":
    unittest.main()
