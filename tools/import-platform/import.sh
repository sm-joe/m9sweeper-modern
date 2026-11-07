#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
SOURCE_REPO="https://github.com/m9sweeper/m9sweeper.git"
SOURCE_SHA="2bc394b5db0d00e3a5784d388ba26be6451ff9c0"
if [[ -e platform/.upstream-source-revision ]]; then
  actual="$(cat platform/.upstream-source-revision)"
  if [[ "$actual" != "$SOURCE_SHA" ]]; then
    echo "Different upstream version already imported: $actual" >&2
    exit 1
  fi
  echo "Pinned source already imported; leaving user changes intact."
  exit 0
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git clone --depth 1 --branch main "$SOURCE_REPO" "$tmp/original"
actual="$(git -C "$tmp/original" rev-parse HEAD)"
if [[ "$actual" != "$SOURCE_SHA" ]]; then
  echo "Upstream SHA changed. Expected $SOURCE_SHA, got $actual. Refusing unreviewed import." >&2
  exit 1
fi
mkdir -p platform
cp -a "$tmp/original/." platform/
rm -rf platform/.git
printf '%s\n' "$SOURCE_SHA" > platform/.upstream-source-revision
echo "Imported entire upstream source at $SOURCE_SHA. No application modules discarded."
