#!/usr/bin/env -S bun --no-env-file
import { parseArgs } from "node:util";
import { readFileSync, existsSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  RunError,
  VERSION,
  parsePlan,
  initialize,
  provision,
  start,
  inspect,
  diagnose,
  verify,
  nativeCall,
  type Native,
} from "./core";

const HELP = `nanoclaw-run ${VERSION} — purpose → native execution → evidence → recovery

USAGE: nanoclaw-run COMMAND --run PRIVATE_RUN_DIR [OPTIONS]
COMMANDS:
  init       Validate --plan PLAN.json and initialize an indexed private run
  provision  Reconcile one native group, read-only mounts and pinned packages
  start      Start one bounded purpose task, retaining exact native handles
  inspect    Refresh native status using task AND session; not acceptance
  collect    Retrieve immutable native receipts and provenance/digested artifacts
  diagnose   Explain recorded issues and next safe action; no native mutation
  recover    --mode export|retry --reason TEXT; SAME group, terminal work only
             --mode lock repairs a demonstrably dead local writer lock only
  verify     Validate source, complete export sequence, required files/digests/checks
OPTIONS:
  --run PATH       Required private Git-ignored run directory
  --plan PATH      Required for init; explicit task purpose/config/artifact contract
  --apply          Required for init/native mutations; otherwise dry-run
  --dry-run        Explicitly plan without mutation; cannot combine with --apply
  --mode MODE      Recovery mode; no arbitrary command execution
  --reason TEXT    Concrete failure/change prerequisite for retry/export
  --timeout MS     Native read timeout (default90000; rebuild has explicit600000)
  --json           Output is always JSON for operational commands
  --help, -h       Show help; no native calls
  --version, -v    Show version

EXAMPLES:
  bun --no-env-file src/cli.ts init --plan website.json --run .audit/run --apply
  bun --no-env-file src/cli.ts provision --run .audit/run --apply
  bun --no-env-file src/cli.ts start --run .audit/run --apply
  bun --no-env-file src/cli.ts collect --run .audit/run
  bun --no-env-file src/cli.ts recover --run .audit/run --mode export --reason 'Saved report was not exported' --apply
  bun --no-env-file src/cli.ts verify --run .audit/run

JSON stdout; structured errors stderr; exit0 success/1 error. Machine validation is
NOT semantic security certification. No .env loading, paid fallback, global policy
changes, direct live-workspace reads, public wiring, source fixes or group deletion.
`;
async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      run: { type: "string" },
      plan: { type: "string" },
      mode: { type: "string" },
      reason: { type: "string" },
      timeout: { type: "string" },
      apply: { type: "boolean" },
      "dry-run": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (values.version || positionals[0] === "version") {
    console.log(VERSION);
    return;
  }
  if (values.help || !positionals.length || positionals[0] === "help") {
    console.log(HELP);
    return;
  }
  if (positionals.length !== 1)
    throw new RunError("ARGUMENTS", "One flat command is required");
  const command = positionals[0]!;
  if (
    ![
      "init",
      "provision",
      "start",
      "inspect",
      "collect",
      "diagnose",
      "recover",
      "verify",
    ].includes(command)
  )
    throw new RunError("COMMAND", `Unknown command: ${command}`, "Run --help");
  if (!values.run) throw new RunError("ARGUMENTS", "--run is required");
  if (values.apply && values["dry-run"])
    throw new RunError(
      "ARGUMENTS",
      "--apply and --dry-run are mutually exclusive",
    );
  const timeout = values.timeout === undefined ? 90000 : Number(values.timeout);
  if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 600000)
    throw new RunError("ARGUMENTS", "--timeout must be integer1000..600000ms");
  const run = resolve(values.run),
    apply = values.apply === true;
  const native: Native = (args, t) => nativeCall(args, t ?? timeout);
  let result: unknown;
  switch (command) {
    case "init":
      if (!values.plan) throw new RunError("ARGUMENTS", "init requires --plan");
      result = initialize(
        parsePlan(JSON.parse(readFileSync(resolve(values.plan), "utf8"))),
        run,
        apply,
      );
      break;
    case "provision":
      result = provision(run, apply, native);
      break;
    case "start":
      result = start(run, apply, "initial", "", native);
      break;
    case "inspect":
      result = inspect(run, false, native);
      break;
    case "collect":
      result = inspect(run, true, native);
      break;
    case "diagnose":
      result = diagnose(run);
      break;
    case "verify":
      result = verify(run);
      break;
    case "recover": {
      if (values.mode === "lock") {
        diagnose(run);
        const path = join(run, ".writer.lock");
        if (!existsSync(path))
          throw new RunError("NO_LOCK", "No writer lock exists");
        const data = JSON.parse(readFileSync(path, "utf8")) as {
          pid?: unknown;
        };
        if (!Number.isSafeInteger(data.pid) || Number(data.pid) < 1)
          throw new RunError(
            "LOCK_SCHEMA",
            "Invalid lock PID; no automatic unlock",
          );
        let dead = false;
        try {
          process.kill(Number(data.pid), 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") dead = true;
          else
            throw new RunError(
              "LOCK_PERMISSION",
              "Cannot establish lock owner state",
            );
        }
        if (!dead)
          throw new RunError(
            "LOCK_LIVE",
            "Refuse to steal a live/reused PID lock",
          );
        const archive = join(run, `stale-lock-${Date.now()}.json`);
        if (apply) renameSync(path, archive);
        result = {
          dryRun: !apply,
          action: "preserve demonstrably stale writer lock",
          archive,
        };
        break;
      }
      if (values.mode !== "export" && values.mode !== "retry")
        throw new RunError(
          "ARGUMENTS",
          "recover requires --mode export|retry|lock",
        );
      result = start(run, apply, values.mode, values.reason ?? "", native);
      break;
    }
  }
  console.log(JSON.stringify({ ok: true, data: result }, null, 2));
}
if (import.meta.main)
  main().catch((error: unknown) => {
    const known = error instanceof RunError;
    console.error(
      JSON.stringify({
        ok: false,
        error: {
          code: known ? error.code : "UNEXPECTED",
          message: known
            ? error.message
            : "Operation failed; inspect local prerequisites without exposing raw credentials",
          hint: known ? error.hint : "",
        },
      }),
    );
    process.exitCode = 1;
  });
