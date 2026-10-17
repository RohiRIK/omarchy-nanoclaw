# Purpose, monitoring and recovery with nanoclaw-run

## Prerequisites

Approved purpose and model, indexed task worktree, source hash manifest, small native template and already-approved read-only source/control roots. The companion Bun CLI is shipped in `tools/nanoclaw-run` of this plugin; use installed `nanoclaw-run` or the documented source entrypoint. It wraps native `ncl`, never replaces its authorization or credentials. No runtime dependencies or `.env` loading.

## Steps

1. Define the purpose BEFORE creating an instance. A JSON plan declares version1, exact source path/SHA/hash-manifest, read-only control directory, provider/model, template ref, pinned apt/npm tools, initialTask/exportTask instructions, and required artifact types/digests/JSON-pointer checks. Keep website-specific scripts in the scenario adapter, not the generic lifecycle implementation. See `tools/nanoclaw-run/README.md` and `QUICKSTART.md` in the plugin checkout for the complete schema. Never place credentials in the plan.

2. Put the private run under the registered project worktree's ignored runtime directory and index it. Review dry-run, then apply only the approved task:

```sh
nanoclaw-run init --plan PLAN.json --run .audit/RUN --dry-run
nanoclaw-run init --plan PLAN.json --run .audit/RUN --apply
nanoclaw-run provision --run .audit/RUN --dry-run
nanoclaw-run provision --run .audit/RUN --apply
nanoclaw-run start --run .audit/RUN --apply
```

Provision reconciles its own random group correlation before creation, configures only that group and read-only mounts, installs declared pinned tools through native rebuild, and reads back configuration. It never edits global provider defaults, mount allowlists, live workspaces or unrelated profiles. A denied root needs exact owner approval; a declared package needs actual runtime proof. Keep the source immutable and construct application subprocess environments with synthetic-only values, not inherited agent credentials.

3. Monitor actual evidence, not task labels:

```sh
nanoclaw-run inspect --run .audit/RUN
nanoclaw-run collect --run .audit/RUN
nanoclaw-run diagnose --run .audit/RUN
nanoclaw-run verify --run .audit/RUN
```

The run retains exact group/task/session commissioning state and raw receipts. Collection queries explicit sessions after archival. Structured exports bind run+attempt+contiguous sequence, strict artifact names, immutable digests and complete-event manifests. Missing reports, native errors, export gaps/conflicts or wrong checks block acceptance even when the task says completed. `evidence-complete` is machine-contract validation, NOT semantic/security certification: inspect the actual proof/screenshot independently.

4. Recover concrete problems, preserving attempts and the SAME instance:

```sh
nanoclaw-run recover --run .audit/RUN --mode export --reason "Saved report was not exported" --dry-run
nanoclaw-run recover --run .audit/RUN --mode export --reason "Saved report was not exported" --apply
nanoclaw-run collect --run .audit/RUN
nanoclaw-run verify --run .audit/RUN
```

Use export recovery for actual saved artifacts, not fabricated replacements or unnecessary reexecution. A retry requires a diagnosed terminal failure and concrete changed prerequisite; an in-flight or successful attempt is not blindly duplicated. Uncertain creation is reconciled through native metadata/prompt ownership, not resubmitted. No automatic paid-model, credential or policy workaround. `--mode lock` preserves a demonstrably dead local writer lock only; it refuses live/reused PIDs and never unlocks a live writer.

5. For unattended collection call the one-shot collect operation from a deterministic scheduler without a model. Index its external managed entrypoint/timer. Exercise the actual unattended PATH and read back successful ticks. Store immutable receipts and private evidence inside the indexed run; do not let a model quota failure block preservation. Native recent-log tails are bounded: collect bounded events before displacement and never call a gapped stream complete.

6. Qualify the full workflow on ONE fresh instance before claiming E2E. The website adapter must do actual build/browser/local-API operations, export/retrieve real evidence, then deliberately withhold one saved required report as a disclosed negative control. Verify rejection, commission same-instance export recovery, validate the recovered digests and inspect actual proof/image. This bounded lifecycle qualification is not a comprehensive site-security audit. Do not substitute old reports or parser fixtures for a new run.

## Exit Criteria

Purpose configured natively; actual execution and private evidence observed; a real diagnosed failure repaired in the same group without losing history; contract verification passes and operator proof review is recorded. Required source/CLI/skill revisions and cleanup handles are indexed. No application fixes, publication or deletion are implied.
