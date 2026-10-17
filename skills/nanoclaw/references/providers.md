# OpenCode and credential-isolated providers

## Prerequisites

Run on the host. Task-local versus global provider scope is explicit; credentials remain in OneCLI. Catalog availability is not price verification or successful in-Claw inference.

## Steps

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

Do not alter global provider/environment defaults for one reviewer. Only when global setup/adapter work is explicitly scoped, use NanoClaw's supported host env helper/provider setup. The keyless adapter requires `OPENCODE_PROVIDER=opencode`, `OPENCODE_AUTH_MODE=anonymous`, the supported `OPENCODE_BASE_URL` (current official Zen API endpoint), and verified authorized free routes for both `OPENCODE_MODEL` and `OPENCODE_SMALL_MODEL`. The adapter must preserve anonymous mode/baseURL, omit `provider.opencode.options.apiKey`, and reject missing/non-free main/small routes or another provider rather than falling back to paid/authenticated requests. Do not add a dummy key or disable OneCLI protection.

3. Verify an actual fresh in-Claw external reply using native session history, then the required tool/source operation. A host `opencode` success or configured route does not prove container inference, browser capability, source access, or serving-model identity. Record the configured route without claiming cryptographic backend attestation.

```sh
ncl sessions history --id SESSION_ID --limit 100 --json
```

4. Diagnose exact errors before changing credentials. OneCLI can rewrite upstream 401/403 into generic missing-credential advice; that alone does not establish a real key requirement. Check actual route availability, pricing, main/small-model restrictions and adapter mode first. Do not print secrets or override the user's primary model.

5. If host adapter code must change, test in an isolated source testbed: Bun automatically loading a checkout `.env` can contaminate tests expecting unset variables. Preserve authenticated-provider and modality regression coverage. Build/restart the host only when required by the approved host change; runner source is mounted on spawn, so source-only runner edits are not automatically image rebuilds. Package additions use the separate native rebuild workflow and may refuse rebuilding when nothing is pending.

## Exit Criteria

Actual in-Claw reply and required tools succeeded on the exact authorized route; price/scope evidence is recorded; OneCLI remains intact. An unavailable model, quota limit or credential gate is reported precisely, never converted into fabricated output or a paid fallback.
