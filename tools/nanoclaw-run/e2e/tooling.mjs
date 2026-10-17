import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const localRequire = createRequire(import.meta.url);
export function claimExecution(root, runId, attempt) {
  if (!Number.isSafeInteger(attempt) || attempt < 1)
    throw new Error("Invalid execution attempt");
  const marker = path.join(root, "executed-attempt-" + attempt + ".json");
  fs.writeFileSync(
    marker,
    JSON.stringify({ runId, attempt, startedAt: new Date().toISOString() }),
    { flag: "wx", mode: 0o600 },
  );
  return marker;
}
/** Resolve through the actual installing manager; never assume npm owns a pnpm layer. */
export function resolvePlaywright({
  runner = spawnSync,
  requireFn = localRequire,
} = {}) {
  try {
    return {
      module: requireFn("playwright-core"),
      resolvedVia: "node-resolution",
    };
  } catch {}
  const tried = [];
  for (const manager of ["pnpm", "npm"]) {
    let result;
    try {
      result = runner(manager, ["root", "-g"], {
        encoding: "utf8",
        timeout: 15000,
      });
    } catch {
      tried.push(manager + ":unavailable");
      continue;
    }
    if (result.status !== 0 || !result.stdout?.trim()) {
      tried.push(manager + ":no-root");
      continue;
    }
    const root = result.stdout.trim();
    try {
      return {
        module: requireFn(path.join(root, "playwright-core")),
        resolvedVia: manager,
        root,
      };
    } catch {
      tried.push(manager + ":module-not-found");
    }
  }
  throw new Error("PLAYWRIGHT_UNAVAILABLE: " + tried.join(","));
}
