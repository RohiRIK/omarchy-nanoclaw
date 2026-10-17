# Provision and qualify a Claw

## Prerequisites

Approved task, exact source revision, canonical repository, native service and available model route. Load `project-worktrees` where available. This workflow grants no extra host access or destructive cleanup permission.

## Steps

1. Resolve Git registration and the project container before creating copies. Register one task worktree at the approved project layout, with branch/purpose/owner/status in the container index. Keep source snapshots, harness, private receipts and reports beneath that worktree. Distinguish immutable application SHA from harness commits. Record native group/task/session/model/mount/image and scheduler handles in a run-local cleanup index. NanoClaw's native runtime directories stay platform-managed; do not relocate or inspect them. Preserve dirty/unpushed work.

2. Discover the current native command forms, then seed a small supported local template:

```sh
ncl groups create --help
ncl groups create --template CATEGORY/NAME --name TASK_AGENT_NAME --new --json
```

Persist the returned ID immediately, then read back `ncl groups get --id GROUP_ID --json`. Native create responses have existed as a flat `data.id` and as `data.group.id`; inspect the response rather than hard-code an unverified shape. `--new` intentionally creates another group; reconcile uncertain outcomes before retrying. Do not use it as an idempotency flag. Existing-template updates require reviewing the native plan, authorization for affected surfaces and native application; never write seed files into a live workspace.

3. Keep templates small (persona/tools/contracts), and mount full immutable source separately. The observed template reader limit is 50 MiB; inspect the installed reader/help if it differs. Do not bypass the cap or silently drop source assets to make a “full copy” fit.

4. Set only the task group's verified provider/model, not global defaults:

```sh
ncl groups config update --id GROUP_ID --provider opencode --model VERIFIED_ROUTE --json
ncl groups config add-mount --id GROUP_ID --host ABSOLUTE_SNAPSHOT_PATH --container site --ro --json
ncl groups config get --id GROUP_ID --json
```

`site` is a relative mount name, exposed as `/workspace/extra/site`. A configured mount can still be rejected on spawn. Inspect the actual host mount allowlist and native mount-security diagnostics. An empty allowed-roots list permits no extra source mounts. Obtain approval for the exact task-only read-only root, not the whole home/projects tree. Use the supported `/manage-mounts` workflow; never weaken blocked patterns, grant writes, enter containers, or edit live workspaces to circumvent a denied mount. Retest actual in-Claw source access after approved changes.

5. Provision tools natively before dispatch; package configuration alone is not tool availability:

```sh
ncl groups config add-package --id GROUP_ID --apt REQUIRED_PACKAGE --json
ncl groups config add-package --id GROUP_ID --npm PACKAGE_AT_VERIFIED_VERSION --json
ncl groups restart --id GROUP_ID --rebuild --json
```

Read back actual rebuild success. Browser work needs a real browser binary and automation library in the target Claw, not merely on the host. Verify the requested version exists first. A package rebuild is distinct from a normal group restart; do not rebuild for metadata-only changes or claim completion from a background launch handle. Ordinary saved provider/mount changes take effect on subsequent spawn/restart; restart only the intended group.

6. Run one bounded pilot on the actual configured Claw BEFORE fan-out. Require a source read/version/count checkpoint, the needed tool invocation, real task operation, full native export, and host retrieval/inspection. For a website audit, require an isolated build/start, real browser assertion/screenshot, and harmless local API test under synthetic credentials with mail/payment/challenge mocked. Distinguish process-level egress guards from an OS sandbox. Never inherit the agent environment into an application subprocess.

7. Open complementary parallel lanes only after pilot evidence passes. Gate follow-ups on retrieved artifacts, not clock-spaced repeated prompts. Preserve all failed pilot receipts and fix the actual prerequisite before one bounded retry; do not create duplicate in-flight workers. Use `application-security-audits` for coverage/methodology when available, not this platform skill as a substitute.

## Exit Criteria

Correct registered/indexed worktree; exact native metadata/model/mount read-back; required tools and source exercised inside the Claw; real pilot artifacts retrieved. Native-managed external resources are indexed for later approved cleanup. No fan-out if the pilot or collection path failed.
