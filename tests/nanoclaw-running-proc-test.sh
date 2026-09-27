#!/usr/bin/env bash
# Test: the "no running NanoClaw process" check must (a) FIRE when NanoClaw is
# genuinely not running, and (b) NOT fire when a real process is running.
# Both directions, against the real nanoclaw-status, invoked by absolute plugin
# path exactly as the panel/menu does.
set -uo pipefail
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$PLUGIN_DIR/bin/nanoclaw-status"
RC=0

has_note() { grep -qF "$2" <<<"$1"; }

# The "not running" cases need a host where NanoClaw is actually stopped. With
# the real service up, the check is right to stay quiet, so skip them.
if systemctl --user list-units 'nanoclaw-v2-*' --state=active --no-legend 2>/dev/null | grep -q .; then
  echo "SKIP  not-running cases: the real NanoClaw service is running"
  SKIP_NOT_RUNNING=1
fi

# --- case 1: nothing running -> the warning must appear --------------------
if [[ -z ${SKIP_NOT_RUNNING:-} ]]; then
out="$("$SCRIPT" --json 2>&1)"
if has_note "$out" "No running NanoClaw process found."; then
  echo "PASS  not-running: warning fires"
else
  echo "FAIL  not-running: warning missing"; RC=1
fi

# --- case 1b: launched by a parent whose argv says "nanoclaw" ---------------
# The check's own ancestors (a test runner, a `bash -c 'cd ~/nanoclaw...'`
# wrapper) used to count as a running NanoClaw and hide the warning.
out1b="$(bash -c '"$0" --json; : nanoclaw-wrapper' "$SCRIPT" 2>&1)"
if has_note "$out1b" "No running NanoClaw process found."; then
  echo "PASS  not-running: a nanoclaw-named parent does not mask the warning"
else
  echo "FAIL  not-running: the calling process was counted as NanoClaw"; RC=1
fi
fi

# --- case 2: a real nanoclaw process -> warning must NOT appear ------------
# A stand-in whose argv contains 'nanoclaw' but which lives outside the
# plugin dir, i.e. exactly what a genuine upstream process looks like.
sleep 300 &
FAKE=$!
exec -a "nanoclaw run --host" sleep 300 &
REALISH=$!
sleep 0.4
out2="$("$SCRIPT" --json 2>&1)"
kill "$FAKE" "$REALISH" 2>/dev/null
wait "$FAKE" "$REALISH" 2>/dev/null

if has_note "$out2" "No running NanoClaw process found."; then
  echo "FAIL  running: warning still fired despite a real process"; RC=1
else
  echo "PASS  running: warning correctly suppressed"
fi

# --- case 3: JSON still parses and counts are sane -------------------------
if grep -q '"summary"' <<<"$out2" && grep -q '"fail": 0' <<<"$out2"; then
  echo "PASS  json: still valid, fail count 0"
else
  echo "FAIL  json: malformed or unexpected failure count"; RC=1
fi

echo
[[ $RC -eq 0 ]] && echo "ALL ASSERTIONS PASSED" || echo "ASSERTION FAILURES"
exit $RC
