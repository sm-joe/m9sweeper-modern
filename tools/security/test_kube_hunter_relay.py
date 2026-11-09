#!/usr/bin/env python3
"""Integration-test the exact Python relay embedded in rendered kube-hunter Helm YAML."""
import http.server
import os
from pathlib import Path
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request


def extract_rendered_relay(rendered):
    lines = Path(rendered).read_text().splitlines()
    start = next(i for i, line in enumerate(lines) if line == "  relay.py: |")
    source = []
    for line in lines[start + 1:]:
        if line.startswith("    "):
            source.append(line[4:])
        elif not line.strip():
            source.append("")
        else:
            break
    assert source and "X-API-Key" in "\n".join(source), "missing relay source in Helm render"
    return "\n".join(source) + "\n"


def await_port(host, port, process, timeout=10):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if process.poll() is not None:
            raise RuntimeError("report relay exited before listening")
        try:
            with socket.create_connection((host, port), timeout=0.2):
                return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("report relay did not start")


def run():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: test_kube_hunter_relay.py /tmp/rendered.yaml")
    source = extract_rendered_relay(sys.argv[1])
    captured = []

    class Upstream(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            n = int(self.headers.get("Content-Length", "-1"))
            captured.append((self.path, self.headers.get("X-API-Key"), self.rfile.read(n)))
            self.send_response(500 if self.path.endswith("/fail") else 201)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *args):
            pass

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        relay = root / "relay.py"
        relay.write_text(source)
        key = root / "key.pem"
        cert = root / "cert.pem"
        subprocess.run([
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-days", "1", "-keyout", str(key), "-out", str(cert),
            "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost",
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        upstream = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(str(cert), str(key))
        upstream.socket = ssl_context.wrap_socket(upstream.socket, server_side=True)
        server_thread = threading.Thread(target=upstream.serve_forever, daemon=True)
        server_thread.start()
        try:
            for url_suffix, expected_status in [("/ingest", 204), ("/fail", 502)]:
                env = os.environ.copy()
                env.update({
                    "REPORT_RELAY_TARGET_URL": f"https://localhost:{upstream.server_port}{url_suffix}",
                    "REPORT_RELAY_API_KEY": "ephemeral-test-token",
                    "SSL_CERT_FILE": str(cert),
                    "PYTHONUNBUFFERED": "1",
                })
                process = subprocess.Popen([sys.executable, "-B", str(relay)], env=env,
                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
                try:
                    await_port("127.0.0.1", 8765, process)
                    request = urllib.request.Request("http://127.0.0.1:8765/", data=b'{"findings":[1]}',
                        method="POST", headers={"Content-Type": "application/json"})
                    try:
                        with urllib.request.urlopen(request, timeout=10) as response:
                            status = response.status
                    except urllib.error.HTTPError as exc:
                        status = exc.code
                    assert status == expected_status, (url_suffix, status, expected_status)
                    assert captured[-1] == (url_suffix, "ephemeral-test-token", b'{"findings":[1]}')
                finally:
                    process.terminate()
                    try:
                        process.wait(timeout=4)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=4)
        finally:
            upstream.shutdown()
            upstream.server_close()
    print("PASS: rendered kube-hunter relay forwards header-authenticated HTTPS and fails closed")


if __name__ == "__main__":
    run()
