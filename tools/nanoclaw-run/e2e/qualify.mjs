import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { resolvePlaywright, claimExecution } from "./tooling.mjs";
const { values } = parseArgs({
  options: {
    "run-id": { type: "string" },
    attempt: { type: "string" },
    "export-only": { type: "boolean" },
    "defer-report": { type: "boolean" },
  },
});
const runId = values["run-id"];
const attempt = Number(values.attempt);
assert(
  /^[a-f0-9-]{36}$/.test(runId || "") &&
    Number.isSafeInteger(attempt) &&
    attempt > 0,
  "Exact run id/attempt required",
);
const source = "/workspace/extra/site";
const control = path.dirname(new URL(import.meta.url).pathname);
const root = "/workspace/agent/ncr-" + runId;
fs.mkdirSync(root, { recursive: true });
const app = path.join(root, "app");
const captured = {};
const saved = path.join(root, "saved");
fs.mkdirSync(saved, { recursive: true });
let seq = 0;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function emit(kind, extra = {}) {
  const line =
    "NANOCLAW_RUN_JSON=" +
    JSON.stringify({ runId, attempt, seq: ++seq, kind, ...extra });
  assert(line.length < 45000, "Bounded export exceeded");
  const cp = spawnSync(
    "ncl",
    ["tasks", "append-log", "--msg", line, "--json"],
    { encoding: "utf8", timeout: 60000 },
  );
  assert.equal(cp.status, 0, cp.stderr);
  assert(JSON.parse(cp.stdout).ok, "Native export refused");
}
function emitSaved() {
  const specs = [
    ["e2e.json", "json"],
    ["browser.jpg", "base64"],
    ["report.md", "utf8"],
  ];
  const hashes = {};
  emit("checkpoint", {
    data: {
      phase: values["export-only"]
        ? "reexport-saved-not-rerun"
        : "executed-negative-control",
      root,
    },
  });
  for (const [name, encoding] of specs) {
    const bytes = fs.readFileSync(path.join(saved, name));
    hashes[name] = sha(bytes);
    if (values["defer-report"] && name === "report.md") continue;
    const data =
      encoding === "json"
        ? JSON.parse(bytes.toString())
        : encoding === "base64"
          ? bytes.toString("base64")
          : bytes.toString();
    emit("artifact", { name, encoding, data });
  }
  emit("complete", {
    data: {
      sourceSha: "c3f319da6bc6165b5dc80f4d1582ca2cb3a0edd8",
      artifacts: hashes,
    },
  });
}
function exportArtifact(kind, artifact, data) {
  captured[artifact] = data;
  if (kind === "checkpoint") emit("checkpoint", { data });
  if (kind === "blocker") emit("failure", { data });
}
if (values["export-only"]) {
  emitSaved();
  console.log("SAVED_ARTIFACTS_REEXPORTED_WITHOUT_RERUN");
  process.exit(0);
}
// A worker must not restart a failed producer in the same attempt and reset seq1.
// Keep the original failure/bytes; the host commissions a distinct recovery attempt.
try {
  claimExecution(root, runId, attempt);
} catch (e) {
  if (e.code === "EEXIST") {
    console.error(
      "ATTEMPT_ALREADY_EXECUTED: preserve evidence; do not remove outputs or retry this attempt. Host recovery is required.",
    );
    process.exit(1);
  }
  throw e;
}
function run(command, args, env, cwd = app) {
  const log = path.join(
    root,
    command.replaceAll("/", "_") + "-" + args[0]?.replaceAll("/", "_") + ".log",
  );
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(log, "w");
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", fd, fd] });
    const timer = setTimeout(() => child.kill("SIGTERM"), 900000);
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timer);
      fs.closeSync(fd);
      if (code !== 0)
        reject(
          new Error(
            `${command} ${args.join(" ")} exited ${code}: ${fs.readFileSync(log, "utf8").slice(-10000)}`,
          ),
        );
      else
        resolve({
          command,
          args,
          exitCode: code,
          logTail: fs.readFileSync(log, "utf8").slice(-5000),
        });
    });
  });
}
let server, browser;
try {
  assert(
    fs.existsSync(path.join(source, "package.json")),
    "Source unavailable",
  );
  const pkg = JSON.parse(
    fs.readFileSync(path.join(source, "package.json"), "utf8"),
  );
  exportArtifact("checkpoint", "pilot-source.json", {
    source,
    package: pkg.name,
    version: pkg.version,
    baseline: "c3f319da6bc6165b5dc80f4d1582ca2cb3a0edd8",
    pid: process.pid,
  });
  const playwright = resolvePlaywright();
  const { chromium } = playwright.module;
  const executable = ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(
    (x) => fs.existsSync(x),
  );
  assert(executable, "Chromium unavailable");
  assert(
    !fs.existsSync(app),
    "Fresh execution required; recover existing artifacts instead of rerunning",
  );
  fs.cpSync(source, app, {
    recursive: true,
    filter: (p) =>
      ![
        ".git",
        "node_modules",
        ".next",
        ".env",
        ".env.local",
        ".env.production",
      ].includes(path.basename(p)),
  });
  const home = path.join(root, "clean-home");
  fs.mkdirSync(home, { recursive: true });
  const clean = {
    PATH: process.env.PATH,
    HOME: home,
    NEXT_TELEMETRY_DISABLED: "1",
    CI: "1",
    NODE_ENV: "production",
    BUN_INSTALL_CACHE_DIR: path.join(root, "bun-cache"),
  };
  exportArtifact(
    "evidence",
    "dependency-install.json",
    await run(
      "bun",
      ["install", "--frozen-lockfile", "--ignore-scripts"],
      clean,
    ),
  );
  exportArtifact(
    "evidence",
    "build.json",
    await run("bun", ["run", "build"], clean),
  );
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...clean,
    NODE_OPTIONS: `--require ${path.join(control, "network-guard.cjs")}`,
    AUDIT_NETWORK_LOG: path.join(root, "network.jsonl"),
    AUDIT_MOCK_FEEDS: "1",
    RESEND_API_KEY: "audit-dummy-not-a-real-key",
    CONTACT_FROM_EMAIL: "audit@audit.invalid",
    CONTACT_TO_EMAIL: "sink@audit.invalid",
    TURNSTILE_SECRET_KEY: "audit-dummy-secret",
    TURNSTILE_SITE_KEY: "audit-site-key",
    TURNSTILE_ACTION: "contact",
    CONTACT_ALLOWED_ORIGINS: base,
  };
  const log = fs.openSync(path.join(root, "server.log"), "w");
  server = spawn(
    "node",
    [
      path.join(app, "node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    { cwd: app, env, stdio: ["ignore", log, log] },
  );
  let ready = false;
  for (let i = 0; i < 180; i++) {
    if (server.exitCode !== null)
      throw new Error(
        "Server exited: " +
          fs.readFileSync(path.join(root, "server.log"), "utf8"),
      );
    try {
      const response = await fetch(base);
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert(ready, "App readiness timeout");
  browser = await chromium.launch({
    executablePath: executable,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const blocked = [];
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin === base || ["data:", "blob:"].includes(u.protocol))
      return route.continue();
    blocked.push(u.origin);
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto(base + "/gallery", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  assert.equal(response.status(), 200);
  await page.waitForTimeout(1500);
  const body = await page.locator("body").innerText();
  assert(body.length > 100, "Hydrated page body is empty");
  const tiles = await page.locator("img").count();
  assert(tiles > 0, "No actual rendered gallery images");
  const screenshot = await page.screenshot({
    type: "jpeg",
    quality: 20,
    clip: { x: 0, y: 0, width: 1024, height: 600 },
  });
  const browserResult = {
    url: base + "/gallery",
    status: response.status(),
    title: await page.title(),
    visibleBodyExcerpt: body.slice(0, 1600),
    imageElements: tiles,
    pageErrors: errors,
    blockedExternalOrigins: [...new Set(blocked)],
    screenshotSha256: (await import("node:crypto"))
      .createHash("sha256")
      .update(screenshot)
      .digest("hex"),
  };
  assert.equal(errors.length, 0, "Browser JS errors");
  exportArtifact("evidence", "pilot-browser.json", browserResult);
  if (screenshot.toString("base64").length < 35000)
    exportArtifact("evidence", "pilot-browser.jpg", {
      encoding: "base64",
      content: screenshot.toString("base64"),
    });
  const rejected = await fetch(base + "/api/contact", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.invalid",
    },
    body: "{}",
  });
  assert.equal(rejected.status, 403);
  const unsupported = await fetch(base + "/api/contact", {
    method: "POST",
    headers: { "content-type": "text/plain", origin: base },
    body: "test",
  });
  assert.equal(unsupported.status, 415);
  const result = await fetch(base + "/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({
      name: "Audit Fixture",
      email: "fixture@audit.invalid",
      category: "question",
      message: "Harmless synthetic audit message; no real mail.",
      consent: true,
      turnstileToken: "audit-pass",
      website: "",
    }),
  });
  const resultBody = await result.text();
  assert.equal(result.status, 200, resultBody);
  const events = fs
    .readFileSync(path.join(root, "network.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((x) => JSON.parse(x));
  assert(
    events.some((x) => x.kind === "email_mock" && x.realMailSent === false),
    "Mock email not verified",
  );
  exportArtifact("evidence", "pilot-api.json", {
    crossOriginStatus: rejected.status,
    unsupportedContentTypeStatus: unsupported.status,
    validMockedContactStatus: result.status,
    validMockedContactBody: resultBody,
    networkEvents: events,
    realEmailsSent: 0,
    credentials: "synthetic-only",
    serverEnvInherited: false,
  });
  exportArtifact("evidence", "pilot-acceptance.json", {
    pass: true,
    baseline: "c3f319da6bc6165b5dc80f4d1582ca2cb3a0edd8",
    sourceRead: true,
    productionBuild: true,
    realChromiumTest: true,
    realLocalApiTest: true,
    externalSideEffectsMocked: true,
    fullAuditComplete: false,
  });
  const e2e = {
    runId,
    sourceSha: "c3f319da6bc6165b5dc80f4d1582ca2cb3a0edd8",
    executedAt: new Date().toISOString(),
    freshAppCopy: true,
    buildId: fs.readFileSync(path.join(app, ".next/BUILD_ID"), "utf8").trim(),
    source: captured["pilot-source.json"],
    install: captured["dependency-install.json"],
    build: captured["build.json"],
    browser: { realChromium: true, ...captured["pilot-browser.json"] },
    api: captured["pilot-api.json"],
    qualificationOnly: true,
    fullWebsiteAudit: false,
  };
  fs.writeFileSync(path.join(saved, "e2e.json"), JSON.stringify(e2e));
  fs.writeFileSync(path.join(saved, "browser.jpg"), screenshot);
  fs.writeFileSync(
    path.join(saved, "report.md"),
    "# NanoClaw run lifecycle: real website qualification\n\nRun " +
      runId +
      "; source " +
      e2e.sourceSha +
      ".\n\nFresh application copy and production build " +
      e2e.buildId +
      ". Actual Chromium gallery page returned200 with " +
      tiles +
      " image elements and no JavaScript errors. Actual local contact API returned403 for wrong origin,415 for wrong content type,200 for valid synthetic submission. Turnstile/Resend were mocked; zero real email. Application environment was constructed explicitly, not inherited.\n\nThis is bounded platform qualification, NOT comprehensive website security certification. The initial missing report export is a disclosed negative control; the report is saved here and must be re-exported through the same native group without re-running tests.\n",
  );
  emitSaved();
  console.log(
    values["defer-report"]
      ? "REAL_E2E_EXECUTED_REPORT_EXPORT_INTENTIONALLY_DEFERRED"
      : "REAL_E2E_EXECUTED",
  );
} catch (e) {
  const failure = { pass: false, error: String(e.stack || e) };
  fs.writeFileSync(
    path.join(root, "pilot-failure.json"),
    JSON.stringify(failure),
  );
  try {
    exportArtifact("blocker", "pilot-failure.json", failure);
  } catch {}
  console.error(e);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) server.kill("SIGTERM");
}
