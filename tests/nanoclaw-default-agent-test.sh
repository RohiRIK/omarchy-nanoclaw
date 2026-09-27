#!/usr/bin/env bash
# Test: nanoclaw-default-agent routes the agent launcher correctly.
#   - `set` writes nanoclaw to the defaults file and opens the NanoClaw session
#   - `launch` with NanoClaw as default opens NanoClaw (tui, or inline)
#   - `launch` with any other default hands off to omarchy-agent untouched
# omarchy-* commands are stubbed so no window ever opens and the real defaults
# file is never touched.
set -uo pipefail
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$PLUGIN_DIR/bin/nanoclaw-default-agent"
RC=0

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/home/.config/omarchy/defaults"

cat >"$TMP/bin/omarchy-default-agent" <<'EOF'
#!/bin/bash
cat "$HOME/.config/omarchy/defaults/agent" 2>/dev/null
EOF
cat >"$TMP/bin/omarchy-agent" <<'EOF'
#!/bin/bash
echo "omarchy-agent $*"
EOF
cat >"$TMP/bin/omarchy-launch-tui" <<'EOF'
#!/bin/bash
echo "tui $*"
EOF
chmod +x "$TMP/bin/"*

run() { HOME="$TMP/home" PATH="$TMP/bin:$PATH" "$SCRIPT" "$@" 2>&1 </dev/null; }
check() { # name expected-substring actual
  if [[ $3 == *"$2"* ]]; then echo "PASS  $1"; else echo "FAIL  $1 (got: $3)"; RC=1; fi
}

echo claude >"$TMP/home/.config/omarchy/defaults/agent"
check "other default is handed to omarchy-agent" "omarchy-agent --pick" "$(run launch --pick)"
check "flags pass through untouched" "omarchy-agent --inline" "$(run launch --inline)"

out="$(run set)"
check "set writes nanoclaw" "nanoclaw" "$(cat "$TMP/home/.config/omarchy/defaults/agent")"
check "set opens the NanoClaw session with the agent app-id" \
  "tui --app-id=org.omarchy.agent $PLUGIN_DIR/bin/nanoclaw-agent" "$out"

check "launch opens NanoClaw when it is the default" "bin/nanoclaw-agent" "$(run launch --pick)"
check "prompt is forwarded" "nanoclaw-agent --prompt hello there" "$(run launch --prompt 'hello there')"

if [[ $(run nope; echo "rc=$?") == *"rc=2"* ]]; then
  echo "PASS  unknown verb rejected"
else
  echo "FAIL  unknown verb accepted"; RC=1
fi

echo
[[ $RC -eq 0 ]] && echo "ALL ASSERTIONS PASSED" || echo "ASSERTION FAILURES"
exit $RC
