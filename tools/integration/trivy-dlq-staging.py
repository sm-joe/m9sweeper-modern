#!/usr/bin/env python3
"""Staging-only, non-destructive verification of real RabbitMQ -> Java trawler DLQ.

Requires disposable CI Compose project m9-runtime and a running real trawler.
Publishes one malformed scan payload with a unique marker.  The worker must
retry and quarantine it.  This script NEVER acknowledges or purges the
quarantined delivery and NEVER touches an operator's existing Compose project.
"""
import json
import os
import sys
import time
import uuid
from pathlib import Path

if os.getenv("M9_STAGING_DLQ_TEST") != "YES" or os.getenv("M9_COMPOSE_PROJECT") != "m9-runtime":
    sys.exit("Requires M9_STAGING_DLQ_TEST=YES and M9_COMPOSE_PROJECT=m9-runtime on disposable CI")
try:
    import pika
except ImportError as exc:
    sys.exit("pika is required in disposable CI: python3 -m pip install pika") from exc

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
channel = connection.channel()
queue = "trawler_queue"
failed = queue + ".failed"
try:
    ready = channel.queue_declare(queue=queue, passive=True).method
    quarantined = channel.queue_declare(queue=failed, passive=True).method
    # Never mix a poison probe with existing queue activity or a user's failed scans.
    if ready.message_count != 0 or ready.consumer_count < 1 or quarantined.message_count != 0:
        sys.exit("Refusing DLQ probe: queues are not empty or Java trawler has no active consumer")
    probe_id = str(uuid.uuid4())
    payload = json.dumps({"cluster": None, "image": None, "m9DlqProbeId": probe_id},
                         separators=(",", ":")).encode()
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
