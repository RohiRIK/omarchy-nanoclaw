import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  parsePlan,
  digest,
  MARKER,
  save,
  readState,
  locked,
  ingest,
  verifyArtifacts,
  inspect,
  start,
  checkSource,
  pointer,
  artifactBytes,
  safeName,
  type State,
  type Plan,
  type Attempt,
  type Native,
  RunError,
} from "../src/core";
let dir: string, source: string, run: string, s: State, a: Attempt;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nanoclaw-run-fixture-"));
  source = join(dir, "source");
  run = join(dir, "run");
  mkdirSync(source);
  mkdirSync(run);
  writeFileSync(
    join(source, "fixture.ts"),
    "// Explicit synthetic unit fixture, not website scan evidence\n",
  );
  const manifest = join(dir, "manifest.json");
  writeFileSync(
    manifest,
    JSON.stringify({
      "fixture.ts": digest(readFileSync(join(source, "fixture.ts"))),
    }),
  );
  const plan: Plan = {
    version: 1,
    purpose: "Synthetic lifecycle regression only",
    source: { path: source, sha: "a".repeat(40), manifest },
    controlPath: source,
    provider: "opencode",
    model: "opencode/fixture-free",
    templateRef: "fixture/template",
    initialTask: "Synthetic fixture, never sent to a live agent",
    exportTask: "Synthetic fixture export",
    packages: { apt: [], npm: [] },
    artifacts: [
      {
        name: "proof.json",
        type: "json",
        minBytes: 2,
        checks: [{ pointer: "/pass", equals: true }],
      },
      { name: "report.md", type: "text", minBytes: 10, checks: [] },
    ],
    freeOnly: true,
  };
  a = {
    number: 1,
    mode: "initial",
    reason: "",
    intent: {
      name: "fixture-task",
      prompt: "fixture prompt",
      promptSha: digest("fixture prompt"),
    },
    taskId: "fixture-task-series",
    sessionId: "fixture-closed-session",
    nativeStatus: "completed",
    events: {},
    conflicts: [],
  };
  s = {
    version: 1,
    id: "fixture-run",
    groupName: "fixture-owned-group",
    createdAt: new Date().toISOString(),
    plan,
    planSha: digest(JSON.stringify(plan)),
    groupId: "fixture-owned-id",
    phase: "provisioned",
    attempts: [a],
  };
  save(run, s);
});
afterEach(() => {
  if (!dir.includes("nanoclaw-run-fixture-"))
    throw new Error("Unsafe test cleanup");
  rmSync(dir, { recursive: true });
});
const event = (
  seq: number,
  kind: string,
  extra: Record<string, unknown> = {},
) =>
  MARKER +
  JSON.stringify({ runId: s.id, attempt: a.number, seq, kind, ...extra });
function good(includeReport = true) {
  const proof = { pass: true };
  const report =
    "# Real fixture report\nThis is a synthetic test, not security evidence.\n";
  const lines = [
    event(1, "checkpoint", { data: { fixture: true } }),
    event(2, "artifact", { name: "proof.json", encoding: "json", data: proof }),
  ];
  if (includeReport)
    lines.push(
      event(3, "artifact", {
        name: "report.md",
        encoding: "utf8",
        data: report,
      }),
    );
  lines.push(
    event(includeReport ? 4 : 3, "complete", {
      data: {
        sourceSha: s.plan.source.sha,
        artifacts: {
          "proof.json": digest(JSON.stringify(proof)),
          "report.md": digest(report),
        },
      },
    }),
  );
  return lines;
}
const fake: Native = (args) => {
  if (args[0] === "groups" && args[1] === "get")
    return { id: s.groupId, name: s.groupName };
  if (args[0] === "tasks" && args[1] === "get")
    return {
      agent_group_id: s.groupId,
      series_id: a.taskId,
      session_id: a.sessionId,
      status: a.nativeStatus,
      prompt: a.intent.prompt,
      recent_log: good(),
      completed_runs: 1,
    };
  throw new Error("Unexpected fixture-native operation: " + args.join(" "));
};

test("valid purpose plan round-trips without identifier normalization", () =>
  expect(parsePlan(s.plan)).toEqual(s.plan));
test.each(["opencode/paid-route", "other/fixture-free"])(
  "free-only rejects unauthorized model %s",
  (model) => expect(() => parsePlan({ ...s.plan, model })).toThrow(),
);
test("stale schema and malformed SHA fail closed", () => {
  expect(() => parsePlan({ ...s.plan, version: 2 })).toThrow();
  expect(() =>
    parsePlan({
      ...s.plan,
      source: { ...s.plan.source, sha: "0x" + "a".repeat(40) },
    }),
  ).toThrow();
});
test.each(["../escape", "native-receipt.json", "/absolute", ".hidden", "a/b"])(
  "rejects unsafe/reserved artifact %s",
  (name) => expect(safeName(name)).toBe(false),
);
test("pinned package validation rejects option injection/ranges", () => {
  expect(() =>
    parsePlan({ ...s.plan, packages: { apt: ["--evil"], npm: [] } }),
  ).toThrow();
  expect(() =>
    parsePlan({ ...s.plan, packages: { apt: [], npm: ["pkg@latest"] } }),
  ).toThrow();
});
test("source hashes verified; modifications and added files rejected", () => {
  expect(checkSource(s.plan)).toBe(1);
  writeFileSync(join(source, "fixture.ts"), "changed");
  expect(() => checkSource(s.plan)).toThrow();
});
test("extra source inventory rejected", () => {
  writeFileSync(join(source, "extra"), "extra");
  expect(() => checkSource(s.plan)).toThrow();
});
test("source symlinks rejected", () => {
  symlinkSync(join(source, "fixture.ts"), join(source, "link"));
  expect(() => checkSource(s.plan)).toThrow();
});
test("plan tampering rejected", () => {
  const current = readState(run);
  current.plan.purpose = "uncommissioned";
  save(run, current);
  expect(() => readState(run)).toThrow();
});
test("single-writer lock refuses concurrent writer and releases its own lock", () => {
  locked(run, () => expect(() => locked(run, () => true)).toThrow());
  expect(existsSync(join(run, ".writer.lock"))).toBe(false);
});
test("artifact evidence passes only complete matching sequence/digests/checks", () => {
  ingest(run, s, a, good());
  expect(verifyArtifacts(run, s, a)).toEqual([]);
});
test("completed task with missing exported report is NOT accepted", () => {
  ingest(run, s, a, good(false));
  expect(verifyArtifacts(run, s, a)).toContain("missing-artifact:report.md");
});
test("pending lifecycle blocks otherwise valid exports", () => {
  ingest(run, s, a, good());
  a.nativeStatus = "pending";
  expect(verifyArtifacts(run, s, a)).toContain("native-task-not-terminal");
});
test("dropped export sequence is detected", () => {
  ingest(
    run,
    s,
    a,
    good().filter((x) => !x.includes('"seq":2')),
  );
  expect(verifyArtifacts(run, s, a)).toContain("export-sequence-gap");
});
test("foreign run or attempt cannot export into commissioned artifact namespace", () => {
  ingest(run, s, a, [good()[1]!.replace("fixture-run", "other-run")]);
  expect(a.conflicts).toContain("foreign-run-or-attempt");
});
test("malformed and oversized exports rejected", () => {
  ingest(run, s, a, [MARKER + "{broken", MARKER + "x".repeat(45001)]);
  expect(a.conflicts).toContain("malformed-export");
  expect(a.conflicts).toContain("oversized-export");
});
test("conflicting sequence never overwrites first immutable artifact", () => {
  ingest(run, s, a, good());
  ingest(run, s, a, [
    event(2, "artifact", {
      name: "proof.json",
      encoding: "json",
      data: { pass: false },
    }),
  ]);
  expect(a.conflicts).toContain("sequence-conflict:2");
  expect(
    JSON.parse(
      readFileSync(join(run, "attempts/1/artifacts/proof.json"), "utf8"),
    ).pass,
  ).toBe(true);
});
test("changed artifact digest and assertion are rejected", () => {
  ingest(run, s, a, good());
  writeFileSync(
    join(run, "attempts/1/artifacts/proof.json"),
    JSON.stringify({ pass: false }),
  );
  const issues = verifyArtifacts(run, s, a);
  expect(issues).toContain("digest-mismatch:proof.json");
  expect(issues).toContain("assertion:proof.json:/pass");
});
test("source SHA mismatch in completion rejected", () => {
  ingest(run, s, a, good());
  a.complete!.sourceSha = "b".repeat(40);
  expect(verifyArtifacts(run, s, a)).toContain("source-sha-mismatch");
});
test("complete marker must be last, not an early success flag", () => {
  ingest(run, s, a, good());
  ingest(run, s, a, [event(5, "checkpoint", { data: { late: true } })]);
  expect(verifyArtifacts(run, s, a)).toContain("complete-not-last-event");
});
test("artifact symlink cannot overwrite outside evidence directory", () => {
  const out = join(dir, "outside");
  writeFileSync(out, "retain");
  mkdirSync(join(run, "attempts/1/artifacts"), { recursive: true });
  symlinkSync(out, join(run, "attempts/1/artifacts/proof.json"));
  ingest(run, s, a, good());
  expect(a.conflicts).toContain("unsafe-artifact:proof.json");
  expect(readFileSync(out, "utf8")).toBe("retain");
});
test("JSON pointer cannot inherit prototype fields", () => {
  expect(pointer({}, "/toString")).toBeUndefined();
  expect(pointer({ "a/b": { "~x": 1 } }, "/a~1b/~0x")).toBe(1);
});
test("invalid binary encoding is rejected", () =>
  expect(() => artifactBytes({ encoding: "base64", data: "%%%" })).toThrow());
test("real collect command path explicitly includes archived session ID", () => {
  const calls: string[][] = [];
  const native: Native = (args) => {
    calls.push(args);
    return fake(args);
  };
  const result = inspect(run, true, native);
  expect(result.phase).toBe("evidence-complete");
  expect(
    calls.some(
      (x) => x.includes("--session") && x.includes("fixture-closed-session"),
    ),
  ).toBe(true);
  expect(result.semanticAcceptance).toBe(false);
});
test("native API failure remains an error, not pending or zero findings", () => {
  const native: Native = (args) => {
    if (args[0] === "groups") return fake(args);
    throw new RunError("NATIVE_API", "fixture failure");
  };
  expect(() => inspect(run, true, native)).toThrow();
  expect(readState(run).phase).toBe("native-query-error");
  expect(readState(run).attempts[0]!.error).toBe("NATIVE_API");
});
test("cross-group task lookup fails ownership check", () => {
  const native: Native = (args) => {
    const d = fake(args);
    return args[0] === "tasks"
      ? { ...(d as Record<string, unknown>), agent_group_id: "unrelated" }
      : d;
  };
  expect(() => inspect(run, true, native)).toThrow();
});
test("active previous attempt cannot be retried", () => {
  a.nativeStatus = "pending";
  save(run, s);
  expect(() =>
    start(run, true, "retry", "specific prerequisite", fake),
  ).toThrow();
  expect(readState(run).attempts).toHaveLength(1);
});
test("successful work cannot be blindly retried without diagnosed failure", () =>
  expect(() => start(run, true, "export", "just repeat", fake)).toThrow());
test("recovery needs a concrete reason", () => {
  a.issues = ["missing-artifact:report.md"];
  save(run, s);
  expect(() => start(run, true, "export", "", fake)).toThrow();
});
test("uncertain creation does not resend when no native session confirms it", () => {
  delete a.taskId;
  delete a.sessionId;
  a.error = "NATIVE_TRANSPORT";
  save(run, s);
  const native: Native = (args) => (args[0] === "sessions" ? [] : fake(args));
  expect(() => start(run, true, "initial", "", native)).toThrow();
  expect(readState(run).attempts).toHaveLength(1);
});
test("help/version/invalid arguments are pure CLI checks, not native mutations", () => {
  const cmd = (args: string[]) =>
    spawnSync("bun", ["--no-env-file", "src/cli.ts", ...args], {
      encoding: "utf8",
    });
  expect(cmd(["--help"]).status).toBe(0);
  expect(cmd(["--version"]).stdout.trim()).toBe("0.1.0");
  const bad = cmd(["unknown"]);
  expect(bad.status).toBe(1);
  expect(JSON.parse(bad.stderr).ok).toBe(false);
});
