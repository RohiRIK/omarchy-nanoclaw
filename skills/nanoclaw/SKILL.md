---
name: nanoclaw
description: "Use when operating NanoClaw agents, providers, sessions, tasks, or host integration. Provision and verify through supported host interfaces. NOT FOR application audit methodology or entering containers."
version: 1.2.0
author: Rohi Rikman
license: MIT
metadata:
  hermes:
    tags: [nanoclaw, operations, agents, evidence]
    related_skills: [project-worktrees, application-security-audits]
usage_hint: "For purpose/monitor/recover load references/run-lifecycle.md first; use the matching platform reference for native diagnostics."
---

# NanoClaw host operations

Operate from the host. Never enter a Claw container or read/edit its live workspace. NanoClaw is the `ncl` platform here, not NVIDIA NemoClaw.

## Workflow Routing

| Intent | Reference |
|---|---|
| Define a purpose, monitor execution, diagnose and repair a run end-to-end | [Run lifecycle CLI](references/run-lifecycle.md) |
| Health, channels, terminal chat, containers, desktop and skill links | [Operations](references/operations.md) |
| Create agents, templates, indexed worktrees, mounts and tool preflight | [Provisioning](references/provisioning.md) |
| OpenCode free models, OneCLI and provider diagnostics | [Providers](references/providers.md) |
| Background tasks, archived sessions, reports and quota-safe collection | [Tasks and evidence](references/tasks-and-evidence.md) |
| Validate this skill and replay its failure cases safely | [Verification](references/verification.md) |

## Execution contract

- Keep host-side source, harness and artifacts in an indexed task worktree; index native-managed runtime and external scheduler handles rather than relocating them.
- Prove one real in-Claw execute/export/retrieve cycle before parallel fan-out. A model catalog, configured mount, running container or completed task is not acceptance.
- Retrieve full evidence before dependent work; preserve artifacts without model inference. Retry only after checking the exact failure and terminal state.
- Load `application-security-audits` through the host skill loader when available for audit methodology; do not substitute repeated prompts for coverage.

## Gotchas

- Save task AND session IDs. Recovery needs `ncl tasks get --id TASK --session SESSION --json`; default lookup can miss archived sessions.
- Check both mount configuration and host allowlist, then actual in-Claw access. Never widen a host root or write a live workspace to work around a failure.
- Ordinary final task logs may truncate to 500 characters; task-get exposes only a recent tail. Export and collect bounded full artifacts during work.
- Native API errors are errors, not zero findings or proof a task never ran. Use the read-only `scripts/check-task.py` helper for explicit-handle queries.
- Discover available models and current pricing; never copy a stale free-model ID, add fake keys, disable OneCLI or fall back to a paid route.

## Examples

- “Run three Claws in the background” → indexed worktree, native provisioning, pilot, durable receipts, then fan-out.
- “The task disappeared” → exact task/session query and native history, not blind redispatch.
- “Fix terminal chat/provider/desktop integration” → operations/provider reference; preserve approval and credential boundaries.
