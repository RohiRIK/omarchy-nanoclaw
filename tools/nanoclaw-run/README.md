# nanoclaw-run

A Bun-only, strict-TypeScript lifecycle CLI over **native NanoClaw host interfaces**: define a purpose, provision one task-owned instance, track actual execution/evidence, diagnose failures, and recover bounded work in that same instance.

This is not a second agent coordinator, a replacement for `ncl`, a credential manager, or a security-scanner result generator. Eight flat commands use `node:util` parseArgs (create-cli tier1); there are no runtime dependencies. It does not load `.env` files.

## Run

```sh
bun install --frozen-lockfile
bun --no-env-file src/cli.ts --help
bun --no-env-file src/cli.ts --version
bun --no-env-file test
bun --no-env-file run typecheck
bun --no-env-file run build
```

The plugin's `bin/nanoclaw-run` wrapper resolves this source entrypoint from the plugin checkout. Source execution needs Bun and native `ncl`/its host prerequisites; it does not need the dev packages installed. `dist/nanoclaw-run.js` is an exercised build artifact, not checked-in runtime evidence. Never install into a system prefix or publish a package as part of an ordinary run.

## Purpose plan

Use an explicit JSON plan. No credentials, arbitrary shell callbacks or global policy overrides:

```json
{
  "version": 1,
  "purpose": "Your bounded approved purpose, with real deliverables",
  "source": {"path":"/approved/task/source","sha":"0000000000000000000000000000000000000000","manifest":"/approved/task/source-manifest.json"},
  "controlPath":"/approved/task/control",
  "provider":"opencode",
  "model":"opencode/EXACT-AVAILABLE-AND-AUTHORIZED-free",
  "freeOnly":true,
  "templateRef":"category/small-installed-template",
  "packages":{"apt":[],"npm":[]},
  "initialTask":"Read and execute the supplied bounded controls. Use run {{runId}}, attempt {{attempt}} in native exports.",
  "exportTask":"Re-export genuine saved deliverables for run {{runId}}, attempt {{attempt}}; do not rerun the work or invent replacements.",
  "artifacts":[{"name":"report.md","type":"text","minBytes":100,"checks":[]}]
}
```

**Replace every example path/model/SHA** with verified values. The zeros and route above are documentation placeholders, not real scan inputs. Manifest is a JSON object mapping every relative source filename to its SHA256. The CLI rejects changed, extra, missing or symlinked source files. A source SHA is a commissioned identity, not inferred from arbitrary content. Validate its Git/archive provenance before preparing the manifest. Exact pinned npm versions (not ranges/tags) and simple apt names are required. Discover live model availability, pricing and data handling separately; `-free` is a configuration guard, not billing attestation.

Run directories must be private/Git-ignored and under an existing registered task worktree; parent directory must already exist. Source/control mounts must already fit the native allowlist. The CLI never writes mount policy, credentials, global providers, live Claw workspaces or production source. A small installed native template supplies persona/tools; source remains a complete separate read-only mount, not oversized template payload.

## Commands and state

| Command | Purpose | Native mutation |
|---|---|---|
| `init --plan FILE --run DIR` | Validate source/plan, commission a random per-run group correlation, save private index/state | None; local initialization requires `--apply` |
| `provision --run DIR` | Reconcile/create one task-owned group, local provider/model, read-only source/control, declared pinned packages and confirmed rebuild | Only with `--apply` |
| `start --run DIR` | Persist intent before creation; save/read back exact native task **and session** | Only with `--apply` |
| `inspect --run DIR` | Refresh native state, including archived sessions | Read only |
| `collect --run DIR` | Save raw native receipts and decoded provenance/digested events | Native read; private local evidence writes |
| `diagnose --run DIR` | Explain exact saved state/issues and next safe action | None |
| `recover --mode export\|retry --reason TEXT --run DIR` | Repair a diagnosed terminal attempt using the SAME group | Only with `--apply` |
| `verify --run DIR` | Recheck immutable source, complete export stream, required files/types/digests/JSON checks | None; private local acceptance-state write |

Mutators default to dry-run. `--apply` and `--dry-run` are mutually exclusive. Help/version require no native calls. Operational JSON goes to stdout; structured errors go to stderr, exit1. `--timeout` bounds native reads; a declared package rebuild uses its explicit longer bound. Native failures are not reclassified as pending/unstarted/empty findings.

State: `run.json`, `INDEX.md`, `attempts/N/{receipts,events,artifacts}`. State uses exclusive single-writer locking and atomic replacement; immutable receipt/event digests retain provenance. Do not share one run directory between unrelated tasks. A stale lock is not automatically stolen: `recover --mode lock --apply` preserves only a demonstrably dead lock; live/reused PIDs are refused. No group deletion/retirement command exists.

## Export protocol

Inside the commissioned task, append private native log lines through `ncl tasks append-log --msg ONE_ARGUMENT --json`. Prefix the serialized event with `NANOCLAW_RUN_JSON=`:

```json
{"runId":"EXACT-RUN-ID","attempt":1,"seq":1,"kind":"artifact","name":"report.md","encoding":"utf8","data":"actual complete Markdown"}
```

Events have contiguous positive sequence numbers starting1 and bind exact run/attempt. Types: checkpoint, artifact, failure, complete. Artifact encodings: json→JSON.stringify bytes; utf8→UTF8 string; base64→validated binary. Required type/check declarations belong to the plan, not a model's improvised filenames. Completion must be last and include:

```json
{"sourceSha":"EXACT-SOURCE-SHA","artifacts":{"report.md":"SHA256-OF-EXACT-EXPORTED-BYTES"}}
```

Use max8 bounded events under45000characters each per attempt and collect before the native last10-line tail displaces anything. Sequence gaps/conflicting reexports, wrong owners, unsafe/reserved names, symlinks, missing artifacts, wrong bytes, failed JSON-pointer equality assertions, worker failures and premature completion all block acceptance. Additional unknown artifact names are rejected. Preserve reports locally during execution so export-only recovery is possible; host code NEVER reads live workspaces.

`evidence-complete` means **the machine contract passed**, not that a model's security findings or screenshots are automatically authentic/independently verified. The owner/operator still inspects actual proof and image. Quota-safe scheduling should invoke this deterministic collector without a model; record scheduler/wrapper handles in the run index.

## Failure recovery

1. Inspect/collect/diagnose the original commissioned attempt first. Closed sessions require its recorded `--session`; an empty native live-task list is not data loss.
2. Do not retry active or successful work. A recovery requires terminal native state, an actual diagnosed problem and a concrete reason/change prerequisite.
3. Prefer `--mode export` for saved files whose export was incomplete. That reuses the same group, preserves the original attempt, and does not rerun build/browser/tests.
4. Use retry only after a genuine prerequisite correction. Never substitute models, weaken OneCLI, edit live workspaces, widen roots, or fabricate outputs to turn a blocker green.
5. Uncertain creation is reconciled from native group/session metadata and commissioned prompt ownership; no blind repeated create is performed.

## Qualification adapter

`e2e/prepare.mjs`, `qualify.mjs` and `network-guard.cjs` implement a **real bounded website scenario**. Preparation stages small controls inside an already-approved website task worktree and installs a small supported native template, not a live workspace. A fresh Claw builds/runs the exact site snapshot, exercises Chromium and local APIs with synthetic credentials/mocks, exports real proof/image, deliberately withholds one saved report, then same-instance export recovery must succeed. App side-effect guards are process-level, not an OS/network sandbox. Dependency/build font downloads are distinct from guarded runtime tests. This is lifecycle qualification, not a comprehensive website vulnerability assessment.

Powered by caffeine and questionable life choices.
