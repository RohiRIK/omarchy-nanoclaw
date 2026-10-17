# NanoClaw purpose → monitor → recover: implementation contract

Owner: Bob. User explicitly requested create-skill + create-cli, improvements/split as needed, then ONE fresh NanoClaw E2E against the website scenario. Not another multi-agent website audit. Existing audits are not to be restarted or modified.

Canonical source: /home/rohi/Work/omarchy-nanoclaw. Candidate: this registered run-lifecycle worktree, branch feat/nanoclaw-run-lifecycle. Tool: tools/nanoclaw-run, Bun/strict-TypeScript, tier1 parseArgs, no runtime dependencies. Never replace native ncl; own only durable purpose/commissioning state and bounded lifecycle.

Eight flat operations: init, provision, start, inspect, collect, diagnose, recover, verify. --apply required for native mutations; default dry-run. JSON-only stdout; structured errors stderr; exit0/1. No credential file loading. No arbitrary shell execution, global provider/mount-policy edits, app fixes, external sends, public wiring, direct live-workspace access or group deletion.

Purpose plan: explicit source SHA and hash manifest, immutable source/control mounts, authorized exact model, small template ref, pinned tool packages, purpose prompt, required artifact names/types and JSON-pointer equality assertions. Run state/receipts are private, ignored within a registered Git worktree. Metadata/cleanup index records native group/task/session and externally managed artifacts. Before mutations validate source hashes and plan; never normalize a failing native identifier.

Native ownership: generated random group/name correlation per run, persisted before creation. Save task creation intent before network calls; recover uncertain outcomes through exact native group/session/task metadata and prompt hash, not blind duplicate creation. Preserve prior attempts; reject retry while native prior task active. Enforce a single-writer lock and atomic state.

Monitoring: always exact task AND session IDs, including closed sessions. API errors are not pending or zero findings. Store raw native receipts and bounded serialized artifact events with run/attempt/sequence provenance. Require complete sequence, safe filenames, no symlinks/reserved receipts, matching artifact digests and all declared required artifacts. Group completed state alone is not acceptance. Report evidence-complete/ready-for-human-review, not semantic security certification.

Recovery: diagnose concrete errors first. Archive lookup reuses exact native handles; retry/re-export only terminal work in the SAME group, after an explicit reason. Supported task-local rebuild only for declared packages. No automatic widening gates or model substitution. Native tool/policy blockers remain explicit.

Qualification: synthetic unit/fault fixtures plus a new real single Claw. Website is frozen application SHA c3f319da6bc6165b5dc80f4d1582ca2cb3a0edd8. Build and run isolated site with clean synthetic env, real Chromium and local API requests, provider mocks, bounded native exports. Deliberately defer one required report export (disclosed negative control), prove CLI refuses acceptance, then recover by re-exporting saved artifacts through same Claw, retrieve/validate screenshot and actual proof. Do not fabricate scanner data or call that bounded qualification a comprehensive website audit.

Skills: retain nanoclaw platform router; lifecycle provisioning, monitoring and recovery belong in focused linked workflows backed by executable CLI. Add another standalone skill only if needed by distinct trigger/scope, not merely to inflate skill count. Keep audit methodology in application-security-audits. Validate all routing paths and installed source links. Show final actual diff and commit after integration; no push unless separately authorized.
