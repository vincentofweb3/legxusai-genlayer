#!/usr/bin/env bash

# Redacted release hygiene checks.  This script reports paths and counts only;
# it never prints matching secret values or file contents.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

failures=0

report_zero() {
  local label="$1"
  local count="$2"
  printf '%s: %s\n' "$label" "$count"
  if [[ "$count" -ne 0 ]]; then
    failures=$((failures + 1))
  fi
}

count_paths() {
  find . -path './.git' -prune -o \
    -path './node_modules' -prune -o \
    "$@" -print 2>/dev/null | wc -l | tr -d ' '
}

count_matches() {
  local pattern="$1"
  (rg -l --hidden --no-ignore-vcs \
    --glob '!.git/**' \
    --glob '!node_modules/**' \
    --glob '!scripts/check_repository_hygiene.sh' \
    -- "$pattern" . 2>/dev/null || true) | wc -l | tr -d ' '
}

unsafe_artifacts="$(count_paths \( \
  -name 'deploy.mjs' -o \
  -name 'decrypt-key.mjs' -o \
  -name 'exported-key.json' -o \
  -name '*.pem' -o \
  -name '*.key' -o \
  -name '*.p12' -o \
  -name '*.pfx' -o \
  -name 'id_rsa' -o \
  -name 'id_ed25519' \
\))"
generated_dirs="$(count_paths \( \
  -type d \( -name 'dist' -o -name 'artifacts' -o -name '__pycache__' -o -name '.pytest_cache' \) \
\))"
pem_content="$(count_matches '(?i)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----')"
secret_assignments="$(count_matches '(?i)(PRIVATE_KEY|SECRET_KEY|MNEMONIC|PASSWORD|API_KEY|ACCESS_TOKEN)[[:space:]]*=[[:space:]]*[^[:space:]]+')"
secret_object_fields="$(count_matches '(?i)"(private[_-]?key|secret[_-]?key|mnemonic|password|api[_-]?key|access[_-]?token)"[[:space:]]*:[[:space:]]*[^[:space:]]+')"
prefixed_hash_files="$(count_paths -type f -name '0x????????????????????????????????????????????????????????????????')"

report_zero 'unsafe credential/deployment artifact paths' "$unsafe_artifacts"
report_zero 'generated/cache directories' "$generated_dirs"
report_zero 'private-key marker files' "$pem_content"
report_zero 'secret-assignment files' "$secret_assignments"
report_zero 'secret-object-field files' "$secret_object_fields"
report_zero '64-hex credential-shaped filenames' "$prefixed_hash_files"

env_secret_assignments="$(
  if [[ -f .env ]]; then
    rg -n --no-heading '(?i)(PRIVATE_KEY|SECRET_KEY|MNEMONIC|PASSWORD|API_KEY|ACCESS_TOKEN)[[:space:]]*=' .env >/dev/null 2>&1 && printf '1' || printf '0'
  else
    printf '0'
  fi
)"
env_hex_matches="$(
  if [[ -f .env ]]; then
    rg -n --no-heading '0x[0-9a-fA-F]{64}|(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])' --pcre2 .env >/dev/null 2>&1 && printf '1' || printf '0'
  else
    printf '0'
  fi
)"
report_zero '.env secret-named assignments' "$env_secret_assignments"
report_zero '.env 64-hex matches' "$env_hex_matches"

if [[ "$failures" -ne 0 ]]; then
  printf 'repository hygiene: FAIL (%s redacted checks)\n' "$failures"
  exit 1
fi
printf 'repository hygiene: PASS\n'
