# Validate and replay the skill's failure cases

## Prerequisites

Python3, the skill checkout and (for live read-only verification only) native ncl plus a real recorded task/session. Do not spawn workers or change existing groups merely to test documentation.

## Steps

1. Check frontmatter, <=50-line router, all routed reference paths, scripts and safety boundaries. Canonical source must resolve from the installed skill link; do not update a stale copy or synchronize unrelated profiles. Confirm application audit methodology remains in its own skill rather than duplicating it here.

2. Run the helper's deterministic negative/positive fixture suite and help, without native side effects:

```sh
python3 scripts/check-task.py --help
python3 scripts/check-task.py --self-test
```

These are helper regression fixtures, NOT agent effectiveness or website-security results.

3. Replay one actual archived task read-only with the exact handles from an authorized run:

```sh
python3 scripts/check-task.py --id TASK_ID --session SESSION_ID
```

Require a successful native response with matching exact IDs. Record the real command/exit and task status, but do not claim scan acceptance merely because lifecycle is completed. The helper must not create/retry/delete tasks, query unrelated sessions, print secrets or read native live-workspace files.

4. Review these realistic instruction scenarios without executing their side effects:

- A stopped session's task returns not-found by default: use its exact session, preserve native errors, no blind redispatch.
- A Claw is configured with a source mount but host allowed-roots is empty: request the narrow read-only task root and test actual access; no global policy bypass, template-size circumvention or live seeding.
- Many background tasks are scheduled and model supervision hits429: preserve full artifacts with a tested non-model collector, lock state and gate follow-ups on retrieved evidence, not timer spacing or model-generated status.
- A host model exists but the Claw lacks Chromium: qualify current route/pricing and real tools, provision/rebuild natively, then execute/export/retrieve a pilot before fan-out.

5. For a formal instruction-effectiveness claim, run paired with-skill/no-skill scenario evaluations under create-skill's test workflow. Do not present parser tests or source-string checks as that experiment. For this maintenance task, report precisely which structural, fixture and live read-only checks actually ran.

## Exit Criteria

Structure loads through the installed link, all references exist, helper regression tests pass, and live archived-session query succeeds or has an exact blocker. Source diff/commit is available, unrelated changes/running jobs remain untouched, and formal A/B effectiveness is not claimed unless executed.
