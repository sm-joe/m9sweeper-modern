#!/usr/bin/env python3
"""Staging-only, non-destructive verification of real RabbitMQ -> Java trawler DLQ.

Requires disposable CI Compose project m9-runtime and a running real trawler.
Publishes a malformed scan job for a disposable persisted run UUID. The worker must
retry and quarantine it.  This script NEVER acknowledges or purges the
quarantined delivery and NEVER touches an operator's existing Compose project.
"""
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

if os.getenv("M9_STAGING_DLQ_TEST") != "YES" or os.getenv("M9_COMPOSE_PROJECT") != "m9-runtime":
    sys.exit("Requires M9_STAGING_DLQ_TEST=YES and M9_COMPOSE_PROJECT=m9-runtime on disposable CI")
try:
    import pika
except ImportError:
    sys.exit("pika is required in disposable CI: python3 -m pip install pika")

root = Path(__file__).resolve().parents[2]
env_file = root / "platform/docker-compose/.env"
if not env_file.is_file():
    sys.exit("Missing disposable CI .env")
env = dict(line.split("=", 1) for line in env_file.read_text().splitlines()
           if "=" in line and not line.startswith("#"))
credentials = pika.PlainCredentials(env["RABBITMQ_USERNAME"], env["RABBITMQ_PASSWORD"])
connection = pika.BlockingConnection(pika.ConnectionParameters(
    host="127.0.0.1", port=56729, credentials=credentials,
    heartbeat=30, blocked_connection_timeout=15, socket_timeout=10
))
def sql(query):
    proc = subprocess.run(
        ["docker", "exec", "-i", "postgres", "sh", "-c",
         'psql -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
        input=query, text=True, capture_output=True, check=True
    )
    return proc.stdout.strip()

channel = connection.channel()
queue = "trawler_queue"
failed = queue + ".failed"
try:
    ready = channel.queue_declare(queue=queue, passive=True).method
    quarantined = channel.queue_declare(queue=failed, passive=True).method
    # Never mix a poison probe with existing queue activity or a user's failed scans.
    if ready.message_count != 0 or ready.consumer_count < 1 or quarantined.message_count != 0:
        sys.exit("Refusing DLQ probe: queues are not empty or Java trawler has no active consumer")
    # The earlier positive staging test creates a disposable cluster/image and
    # completes a real Trivy scan. Create a NEW run against that same isolated
    # image to verify Java's final callback to Dash and persistent FAILED state.
    fixture = sql("""SELECT c.id || '|' || i.id
        FROM clusters c JOIN images i ON i.cluster_id=c.id
        WHERE c.name LIKE 'm9-trivy-e2e-%'
        ORDER BY c.id DESC LIMIT 1;""")
    if not fixture or len(fixture.split("|")) != 2:
        sys.exit("Refusing DLQ probe without real disposable staging fixture")
    cluster_id, image_id = map(int, fixture.split("|"))
    run_id = str(uuid.uuid4())
    sql(f"""BEGIN;
        INSERT INTO image_scan_runs(id,cluster_id,image_id,status,created_at,updated_at)
        VALUES ('{run_id}',{cluster_id},{image_id},'queued',
                CAST(EXTRACT(EPOCH FROM NOW()) * 1000 AS BIGINT),
                CAST(EXTRACT(EPOCH FROM NOW()) * 1000 AS BIGINT));
        UPDATE images SET scan_queued=true WHERE id={image_id} AND cluster_id={cluster_id};
        COMMIT;""")
    payload = json.dumps({
        "cluster": {"id": cluster_id}, "image": {"id": image_id},
        "dockerRegistry": None, "scanRunId": run_id
    }, separators=(",", ":")).encode()
    channel.confirm_delivery()
    channel.basic_publish(
        exchange="", routing_key=queue, body=payload, mandatory=True,
        properties=pika.BasicProperties(delivery_mode=2, content_type="application/json")
    )
    print("PASS: unique invalid job durably published to disposable CI worker queue")
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        method, properties, body = channel.basic_get(queue=failed, auto_ack=False)
        if method is not None:
            try:
                if body != payload:
                    raise AssertionError("DLQ contains an unexpected job; refusing to acknowledge")
                retries = (properties.headers or {}).get("x-m9sweeper-retries")
                if not isinstance(retries, int) or retries != 4:
                    raise AssertionError(f"Expected 4th failure to be quarantined, got {retries!r}")
                if properties.delivery_mode != 2:
                    raise AssertionError("Quarantined job is not marked durable")
                print("PASS: real Java trawler retried a malformed job 3 times then quarantined it durably")
                # Trawler final callback must update the SAME UUID and release
                # the queued spinner. No synthetic finding or clean result.
                ledger = ""
                for _ in range(25):
                    ledger = sql(f"""SELECT r.status || '|' ||
                        COALESCE(r.compliant::text, 'null') || '|' ||
                        COALESCE(r.failure_reason, '') || '|' ||
                        i.scan_queued::text || '|' || COALESCE(i.scan_results, '')
                        FROM image_scan_runs r JOIN images i
                          ON i.id=r.image_id AND i.cluster_id=r.cluster_id
                        WHERE r.id='{run_id}';""")
                    if ledger.startswith("failed|"):
                        break
                    time.sleep(1)
                parts = ledger.split("|")
                if len(parts) != 5 or parts[0] != "failed" or parts[1] != "null" or \
                        parts[2] != "Scan exhausted retries" or parts[3] != "f" or parts[4] != "Failed":
                    # Diagnostic only on failure: distinguish Java callback
                    # delivery from NestJS auth/route validation. This probe
                    # deliberately leaves CI red even if a direct POST works.
                    from urllib.request import Request, urlopen
                    from urllib.error import HTTPError
                    callback = Request(
                        f"http://127.0.0.1:3000/api/clusters/{cluster_id}/images/{image_id}/trawler/scan/fail",
                        json.dumps({"scanRunId": run_id}).encode(),
                        {"Content-Type": "application/json", "x-auth-token": env["TRAWLER_API_KEY"]},
                        method="POST"
                    )
                    try:
                        with urlopen(callback, timeout=12) as response:
                            print("DIAGNOSTIC: direct authenticated failure callback HTTP", response.status)
                    except HTTPError as error:
                        print("DIAGNOSTIC: direct authenticated failure callback HTTP", error.code)
                    except Exception as error:
                        print("DIAGNOSTIC: direct callback connection error", type(error).__name__)
                    raise AssertionError("Final retry did not atomically fail scan ledger and release image queue: " + ledger)
                print("PASS: authenticated Java quarantine callback marked scan UUID failed")
                print("PASS: image queue cleared; failed run has no compliant result")
                print("PASS: failed queue evidence retained; never counted as a compliant scan")
            finally:
                channel.basic_nack(method.delivery_tag, requeue=True)
            break
        time.sleep(2)
    else:
        raise AssertionError("Malformed job never reached durable dead-letter queue within 90s")
finally:
    try:
        channel.close()
    finally:
        connection.close()
