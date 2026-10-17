# OpenCode and credential-isolated providers

## Prerequisites

Run on the host. Task-local versus global provider scope is explicit; credentials remain in OneCLI. Catalog availability is not price verification or successful in-Claw inference.

## CLI-first baseline for a failing OpenCode integration

1. Establish the architecture from installed source: NanoClaw launches the full `opencode serve` agent; the SDK controls that agent locally. Do not describe this as an SDK-only installation or infer that free models require an API key.
2. Before changing provider settings, gateway versions, credentials or timeouts, exercise the installed full CLI using its normal built-in provider resolution and the exact authorized free model:

```sh
opencode run --format json --model EXACT_AUTHORIZED_FREE_ROUTE "Reply exactly NCL_CLI_OK. Do not use tools."
```

Discover flags with `opencode run --help` first. Use a supported native task/pre-task script for an in-Claw baseline, not `docker exec` or a read/edit of a live workspace. Keep OneCLI/proxy/CA protections unchanged; never add a dummy key or use `--auto`. An isolated empty working directory and XDG state can prove a credentialless baseline without reading personal files or existing auth files; label that isolation because it does not prove the existing workspace/configuration is healthy. Preserve and report any removed child-only config overrides. Do not force an API URL, hand-build a chat-completions request or select a different model for this baseline.
3. Bound the run and capture the actual CLI version, exact command/model, exit status, timeout flag, JSON error metadata and the expected reply marker. Export only safe metadata through the native private task log. A pre-task script has a 30-second ceiling: leave time for cancellation and export, kill only its owned child process group and do not leave inference running. A completed diagnostic task or CLI exit0 without the expected answer is NOT inference success.
4. If this first execution check fails, stop and report its exact observed failure. Do not proceed to a tool probe, scan, another model or speculative configuration repair. Raw HTTP/SDK tests are supplemental diagnostics, never substitutes for this agent baseline. A catalog entry, gateway health200, host-only success, isolated SDK response or host Cloudflare error does not establish the complete NanoClaw path's behavior.
5. Only after the CLI baseline succeeds, compare it with the NanoClaw-managed agent on the same model and protected network path. Compare one variable at a time: normal provider transport versus adapter baseURL/model declarations, effective config, workspace/instructions, continuation, then event/result handling. Record backend response, runner completion and task acknowledgement separately. Require a short real reply before a harmless tool/checkpoint probe. Distinguish a returned error from a request that never settles; do not claim an unrelated gateway update fixes either without a red-to-green comparison.

## Provisioning and qualification steps

1. Discover current routes and verify pricing and private-data handling from the provider's current official documentation ([OpenCode Zen](https://opencode.ai/docs/zen/)):

```sh
opencode models opencode
ncl groups config get --id GROUP_ID --json
```

Select the exact available authorized route; do not “repair” identifiers or paste a retired example model. The catalog can list non-free models too. A `-free` suffix is only a guard, not billing evidence. The task's requested route must pass real inference; no paid/different-model fallback without approval.

2. Prefer the task-local override and normal restart:

```sh
ncl groups config update --id GROUP_ID --provider opencode --model VERIFIED_ROUTE --json
ncl groups restart --id GROUP_ID --json
```

Do not alter global provider/environment defaults for one reviewer. Only when global setup/adapter work is explicitly scoped, use NanoClaw's supported host env helper/provider setup. The keyless adapter uses `OPENCODE_PROVIDER=opencode`, `OPENCODE_AUTH_MODE=anonymous`, and verified authorized free routes for both `OPENCODE_MODEL` and `OPENCODE_SMALL_MODEL`. A forced custom `OPENCODE_BASE_URL` is NOT a prerequisite of the full agent's built-in free provider. Treat any adapter endpoint override as a comparison variable; use the adapter's documented `native` option when appropriate, and check its `ANTHROPIC_BASE_URL` fallback before unsetting anything. Preserve the existing authorized route until the CLI-first comparison identifies a required change. The adapter must omit `provider.opencode.options.apiKey` in anonymous mode and reject missing/non-free main/small routes or another provider rather than falling back to paid/authenticated requests. Do not add a dummy key or disable OneCLI protection.

3. Verify an actual fresh in-Claw external reply using native session history, then the required tool/source operation. A host `opencode` success or configured route does not prove container inference, browser capability, source access, or serving-model identity. Record the configured route without claiming cryptographic backend attestation.

```sh
ncl sessions history --id SESSION_ID --limit 100 --json
```

4. Diagnose exact errors before changing credentials. OneCLI can rewrite upstream 401/403 into generic missing-credential advice; that alone does not establish a real key requirement. Check actual route availability, pricing, main/small-model restrictions and adapter mode first. Do not print secrets or override the user's primary model.

5. If host adapter code must change, test in an isolated source testbed: Bun automatically loading a checkout `.env` can contaminate tests expecting unset variables. Preserve authenticated-provider and modality regression coverage. Build/restart the host only when required by the approved host change; runner source is mounted on spawn, so source-only runner edits are not automatically image rebuilds. Package additions use the separate native rebuild workflow and may refuse rebuilding when nothing is pending.

## Exit Criteria

Actual in-Claw reply and required tools succeeded on the exact authorized route; price/scope evidence is recorded; OneCLI remains intact. An unavailable model, quota limit or credential gate is reported precisely, never converted into fabricated output or a paid fallback.
