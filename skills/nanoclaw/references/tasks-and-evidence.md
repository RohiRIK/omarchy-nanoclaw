# Native tasks, archival recovery and durable artifacts

## Prerequisites

Approved scope, indexed task worktree, qualified Claw and concrete acceptance criteria. Persist exact native handles before a background handoff; do not enter or read a live workspace to retrieve reports.

## Steps

1. Create one bounded unit using the current native interface, save the native receipt, and read back the returned task AND session:

```sh
ncl tasks create --name BOUNDED_TASK --group GROUP_ID --prompt TASK_PROMPT --process-after ISO_TIMESTAMP --json
ncl tasks get --id TASK_ID --session SESSION_ID --json
```

Task creation returns `series_id` and `session_id` (not a generic `id`). Record group, exact model, source SHA, task series, session, required artifacts and acceptance state in the run index/state. Schedule is not execution. `tasks run` queues another run: do not use it to inspect status. Confirm terminal state and reconcile uncertain create outcomes before retry.

2. Recover archived results with the explicit session, even when default lookup/list returns nothing:

```sh
ncl sessions get --id SESSION_ID --json
ncl tasks get --id TASK_ID --session SESSION_ID --json
ncl sessions history --id SESSION_ID --limit 100 --json
python3 scripts/check-task.py --id TASK_ID --session SESSION_ID
```

Resolve `scripts/check-task.py` relative to this skill's installed directory, not an application worktree. Default task lookup can search only active sessions; `task not found` or an empty live-task list does not prove data loss/non-execution. A nonzero CLI exit, `ok:false`, invalid JSON, missing/mismatched IDs or malformed payload is an ERROR, not a scheduled job or zero findings. The helper is read-only and requires both exact handles; `--raw-json` explicitly returns the validated native envelope for a private collector.

3. Separate states: scheduled → active → actually executed → exported → retrieved → independently verified. A completed lifecycle can contain a blocker and no scan. Verify actual read/tool/request receipts and every required artifact. Report configured model separately from unobserved serving-model identity.

4. Export bounded full evidence DURING work using the native PRIVATE task log, not a report path or ordinary final summary:

```text
ncl tasks append-log --msg SINGLE_LINE_SERIALIZED_ENVELOPE --json
```

Inside a task, task/group can be auto-derived; use the actual native context. Serialize a distinctive marker plus `{kind,lane,artifact,data}` as ONE subprocess argument, never shell interpolation of report text. Confirm the export command succeeded. This log is not an external user send. Ordinary final task text may already be stored truncated to500characters; history's `--json` only removes presentation truncation and cannot recover missing stored text.

5. Respect the recent-log tail (observed last10nonemptylines). Keep artifact batches below the installed API/log limits, aggregate records and collect before new lines displace them. Do not flood uncollected screenshots/traces. A one-line envelope below45000characters is a conservative tested convention, not a claimed protocol maximum. Never bypass a native size gate. Preserve raw native receipts alongside decoded reports and screenshot/data hashes. Check source/lane/schema, safe basenames, reserved receipt filenames, symlinks and evidence references before writing decoded output.

6. Collect without model inference. Keep collector implementation/state/evidence in the indexed worktree. If a scheduler requires a managed scripts directory, place only a small delegating entrypoint there and index its cleanup handle. Exercise the real unattended entrypoint/PATH (including ncl's Node/pnpm dependencies), then read back an actual successful scheduled run. Use a lock plus atomic replacement for dispatch/collection state so one writer cannot erase new task handles. A quota-limited reasoning supervisor must not prevent artifact preservation.

7. Gate dependent work on RETRIEVED required reports/ledgers/evidence. Validate exact case IDs and baseline where relevant, then independently check significant claims; structural checks do not establish exploitability. Preserve partial/error receipts and give each retry a concrete changed prerequisite. Do not replace missing artifacts with synthetic “scan results,” count timer ticks as rounds completed, or recreate an in-flight task.

8. On handoff, report actual completed/blocked owners and collected artifacts, not merely launched processes. Maintain the cleanup index; retain dirty/unpushed work and reports until scoped retirement approval. Use native lifecycle and Git worktree commands, never raw workspace/container deletion.

## Exit Criteria

Exact task+session can be queried even after archival; actual required evidence is retained privately outside native live workspaces; collection succeeds without a model; acceptance and limitations are explicit. No API error was silently classified as success/unstarted/empty findings.
