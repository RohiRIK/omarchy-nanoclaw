import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlaywright, claimExecution } from "./tooling.mjs";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
test("producer restart in same attempt is refused and preserves the original marker", () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "ncr-tooling-"));
  try {
    const file = claimExecution(dir, "fixture", 1);
    const original = fs.readFileSync(file, "utf8");
    assert.throws(
      () => claimExecution(dir, "fixture", 1),
      (e) => e.code === "EEXIST",
    );
    assert.equal(fs.readFileSync(file, "utf8"), original);
    assert.notEqual(claimExecution(dir, "fixture", 2), file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("pnpm-only installed layer resolves without assuming npm root", () => {
  const calls = [];
  const result = resolvePlaywright({
    runner: (cmd) => {
      calls.push(cmd);
      return {
        status: 0,
        stdout:
          cmd === "pnpm"
            ? "/fixture/pnpm/global/node_modules"
            : "/fixture/npm/node_modules",
      };
    },
    requireFn: (p) => {
      if (p === "/fixture/pnpm/global/node_modules/playwright-core")
        return { chromium: "fixture-only" };
      throw new Error("fixture miss");
    },
  });
  assert.equal(result.resolvedVia, "pnpm");
  assert.deepEqual(calls, ["pnpm"]);
});
test("fallback npm root remains supported", () => {
  const result = resolvePlaywright({
    runner: (cmd) => ({
      status: cmd === "pnpm" ? 1 : 0,
      stdout: "/fixture/npm",
    }),
    requireFn: (p) => {
      if (p === "/fixture/npm/playwright-core") return {};
      throw new Error("fixture miss");
    },
  });
  assert.equal(result.resolvedVia, "npm");
});
test("missing module is an explicit prerequisite blocker, never fabricated browser success", () => {
  assert.throws(
    () =>
      resolvePlaywright({
        runner: () => ({ status: 1, stdout: "" }),
        requireFn: () => {
          throw new Error("fixture miss");
        },
      }),
    /PLAYWRIGHT_UNAVAILABLE/,
  );
});
