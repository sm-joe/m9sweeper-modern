#!/usr/bin/env bash
# Read-only RabbitMQ health check for Nagios/cron/systemd/Kubernetes CronJob.
# It does not acknowledge, consume, purge, replay or mutate messages.
set -euo pipefail
QUEUE="${QUEUE:-trawler_queue}"
FAILED_QUEUE="${FAILED_QUEUE:-trawler_queue.failed}"
MAX_READY="${MAX_READY:-100}"
MAX_UNACK="${MAX_UNACK:-5}"

for value in "$MAX_READY" "$MAX_UNACK"; do
  [[ "$value" =~ ^[0-9]+$ ]] || { echo "UNKNOWN: thresholds must be nonnegative integers"; exit 3; }
done
command -v docker >/dev/null || { echo "UNKNOWN: docker not installed"; exit 3; }
command -v python3 >/dev/null || { echo "UNKNOWN: python3 not installed"; exit 3; }

# Quiet mode suppresses RabbitMQ CLI startup banners so JSON can be parsed safely.
if ! snapshot="$(docker exec rabbitmq rabbitmqctl -q list_queues --formatter=json name messages_ready messages_unacknowledged consumers)"; then
  echo "CRITICAL: unable to inspect RabbitMQ queues" >&2
  exit 2
fi

RABBITMQ_SNAPSHOT="$snapshot" python3 - "$QUEUE" "$FAILED_QUEUE" "$MAX_READY" "$MAX_UNACK" <<'PY'
import json
import os
import sys

normal, dead, ready_max, unack_max = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
try:
    queues = json.loads(os.environ['RABBITMQ_SNAPSHOT'])
    queues = {q['name']: q for q in queues}
    active = queues[normal]
    failed = queues[dead]
    ready = int(active['messages_ready'])
    unack = int(active['messages_unacknowledged'])
    consumers = int(active['consumers'])
    quarantined = int(failed['messages_ready']) + int(failed['messages_unacknowledged'])
except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
    print(f"UNKNOWN: invalid queue response: {exc}")
    sys.exit(3)

data = (f"{normal} ready={ready}, unack={unack}, consumers={consumers}; "
        f"{dead} quarantined={quarantined}")
if quarantined > 0 or ready > ready_max or unack > unack_max or consumers < 1:
    print("CRITICAL: " + data)
    sys.exit(2)
print("OK: " + data)
PY
