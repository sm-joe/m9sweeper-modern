#!/usr/bin/env sh
# Generates SHORT-LIVED, KIND-ONLY staging PKI; not production certificates.
set -eu
umask 077
out="${1:-/work/private-tls}"
mkdir -p "$out"
dns="m9-dash-tls.m9sweeper-system.svc.cluster.local"
openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 2 \
  -keyout "$out/ca.key" -out "$out/ca.crt" \
  -subj "/CN=m9sweeper-kind-test-ca" \
  -addext "basicConstraints=critical,CA:TRUE"
openssl req -newkey rsa:3072 -sha256 -nodes \
  -keyout "$out/tls.key" -out "$out/proxy.csr" \
  -subj "/CN=$dns"
cat >"$out/proxy.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:$dns
EOF
openssl x509 -req -sha256 -days 2 -in "$out/proxy.csr" \
  -CA "$out/ca.crt" -CAkey "$out/ca.key" -CAcreateserial \
  -out "$out/tls.crt" -extfile "$out/proxy.ext"
openssl verify -CAfile "$out/ca.crt" "$out/tls.crt"
rm -f "$out/proxy.csr" "$out/proxy.ext" "$out/ca.srl"
printf 'Generated short-lived Kind PKI in %s (never commit keys)\n' "$out"
