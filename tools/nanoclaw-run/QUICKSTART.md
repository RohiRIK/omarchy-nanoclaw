# nanoclaw-run quick start

Use an authorized native NanoClaw service and a registered/indexed project worktree. Put the private run under its ignored `.audit/` (or equivalent). Prepare immutable source with a complete SHA256 manifest and a small native template. Verify the exact model's availability/pricing; no credentials in plans.

```sh
nanoclaw-run init --plan PLAN.json --run .audit/RUN --apply
nanoclaw-run provision --run .audit/RUN --apply
nanoclaw-run start --run .audit/RUN --apply
nanoclaw-run inspect --run .audit/RUN
nanoclaw-run collect --run .audit/RUN
nanoclaw-run diagnose --run .audit/RUN
nanoclaw-run recover --run .audit/RUN --mode export --reason "Actual saved report was not exported" --apply
nanoclaw-run collect --run .audit/RUN
nanoclaw-run verify --run .audit/RUN
```

Without `--apply`, native mutators show a dry-run. Source fallback: `bun --no-env-file /path/to/plugin/tools/nanoclaw-run/src/cli.ts COMMAND ...`. An explicit `collect` retrieves native evidence and writes private local receipts; a completed task alone is not acceptance. Query uses the exact saved task AND session even after archival.

Schedule collect with a non-model runner for background work, and index that scheduler/entrypoint. Use bounded native event exports with complete run/attempt/sequence and artifact digests. Repeated collection is idempotent; gaps/errors/unknown ownership do not become successful status. Do not flood the recent-log tail.

Required plan schema, expected outputs, failures and the real single-instance website adapter are in [README.md](README.md). No deletion, source fix, public wiring or credential/policy change is authorized by these commands.
