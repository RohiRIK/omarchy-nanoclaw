// One bounded native post-repair tool probe; no website rebuild or agent environment export.
import { resolvePlaywright } from "./tooling.mjs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const resolved = resolvePlaywright();
const browser = await resolved.module.chromium.launch({
  executablePath: "/usr/bin/chromium",
  env: { PATH: process.env.PATH, HOME: "/workspace/agent" },
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.setContent(
    "<title>NanoClaw toolchain probe</title><h1>Actual Chromium</h1>",
  );
  assert.equal(await page.title(), "NanoClaw toolchain probe");
  const proof = {
    pass: true,
    resolvedVia: resolved.resolvedVia,
    globalRoot: resolved.root ?? "node-resolution",
    actualBrowserVersion: browser.version(),
    browserTitle: await page.title(),
    realBrowser: true,
    websiteRerun: false,
    executedAt: new Date().toISOString(),
  };
  const p = spawnSync(
    "ncl",
    [
      "tasks",
      "append-log",
      "--msg",
      "NANOCLAW_TOOLS_JSON=" + JSON.stringify(proof),
      "--json",
    ],
    { encoding: "utf8", timeout: 60000 },
  );
  assert.equal(p.status, 0, p.stderr);
  assert(JSON.parse(p.stdout).ok);
  console.log("ACTUAL_TOOLCHAIN_PROBE_EXPORTED");
} finally {
  await browser.close();
}
