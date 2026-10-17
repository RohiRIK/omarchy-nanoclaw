import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  lstatSync,
  readdirSync,
  realpathSync,
  openSync,
  closeSync,
} from "node:fs";
import { resolve, join, dirname, basename, relative, sep } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

export type Obj = Record<string, unknown>;
export class RunError extends Error {
  constructor(
    public code: string,
    message: string,
    public hint = "",
  ) {
    super(message);
  }
}
export const MARKER = "NANOCLAW_RUN_JSON=";
export const VERSION = "0.1.0";
export function obj(v: unknown): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new RunError("SCHEMA", "Expected an object");
  return v as Obj;
}
function str(v: unknown, name: string): string {
  if (typeof v !== "string" || !v || v.includes("\0"))
    throw new RunError("SCHEMA", `${name} must be a nonempty string`);
  return v;
}
function strings(v: unknown): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string"))
    throw new RunError("SCHEMA", "Expected string array");
  return v as string[];
}
export const digest = (s: string | Uint8Array): string =>
  createHash("sha256").update(s).digest("hex");
export const safeName = (s: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(s) && !s.startsWith("native-");
export interface Artifact {
  name: string;
  type: "json" | "text" | "jpeg";
  minBytes: number;
  checks: { pointer: string; equals: unknown }[];
}
export interface Plan {
  version: 1;
  purpose: string;
  source: { path: string; sha: string; manifest: string };
  controlPath: string;
  provider: string;
  model: string;
  templateRef: string;
  initialTask: string;
  exportTask: string;
  packages: { apt: string[]; npm: string[] };
  artifacts: Artifact[];
  freeOnly: boolean;
}
export interface Intent {
  name: string;
  prompt: string;
  promptSha: string;
}
export interface Attempt {
  number: number;
  mode: "initial" | "retry" | "export";
  reason: string;
  intent: Intent;
  taskId?: string;
  sessionId?: string;
  nativeStatus?: string;
  error?: string;
  issues?: string[];
  events: Record<string, string>;
  complete?: Obj;
  completeSeq?: number;
  conflicts: string[];
}
export interface State {
  version: 1;
  id: string;
  createdAt: string;
  groupName: string;
  plan: Plan;
  planSha: string;
  groupId?: string;
  phase: string;
  attempts: Attempt[];
}
export type Native = (args: string[], timeout?: number) => unknown;

export function parsePlan(value: unknown): Plan {
  const p = obj(value),
    s = obj(p.source),
    packages = obj(p.packages ?? { apt: [], npm: [] });
  if (p.version !== 1) throw new RunError("SCHEMA", "Plan version must be 1");
  const source = {
    path: str(s.path, "source.path"),
    sha: str(s.sha, "source.sha"),
    manifest: str(s.manifest, "source.manifest"),
  };
  if (!/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(source.sha))
    throw new RunError(
      "SCHEMA",
      "Invalid source SHA; preserve/correct the supplied identifier explicitly",
    );
  for (const path of [
    source.path,
    source.manifest,
    str(p.controlPath, "controlPath"),
  ])
    if (!path.startsWith("/"))
      throw new RunError(
        "SCHEMA",
        "Source/control/manifest paths must be absolute",
      );
  const provider = str(p.provider, "provider"),
    model = str(p.model, "model");
  const freeOnly = p.freeOnly !== false;
  if (
    freeOnly &&
    (provider !== "opencode" ||
      !model.startsWith("opencode/") ||
      !model.endsWith("-free"))
  )
    throw new RunError(
      "MODEL_SCOPE",
      "Free-only run requires an exact authorized OpenCode free route",
    );
  const apt = strings(packages.apt),
    npm = strings(packages.npm);
  if (
    apt.some((x) => !/^[a-z0-9][a-z0-9+.-]*$/.test(x)) ||
    npm.some(
      (x) =>
        !/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+@[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(
          x,
        ),
    )
  )
    throw new RunError(
      "PACKAGE_SCOPE",
      "Use apt names and exact pinned npm versions, never options or ranges",
    );
  if (
    !Array.isArray(p.artifacts) ||
    !p.artifacts.length ||
    p.artifacts.length > 8
  )
    throw new RunError("SCHEMA", "Declare 1–8 bounded required artifacts");
  const artifacts = p.artifacts.map((v) => {
    const a = obj(v),
      name = str(a.name, "artifact.name");
    if (!safeName(name) || !["json", "text", "jpeg"].includes(String(a.type)))
      throw new RunError("SCHEMA", "Unsafe artifact name/type");
    const checks = (a.checks ?? []) as unknown;
    if (!Array.isArray(checks))
      throw new RunError("SCHEMA", "checks must be an array");
    return {
      name,
      type: a.type as Artifact["type"],
      minBytes:
        typeof a.minBytes === "number" &&
        Number.isInteger(a.minBytes) &&
        a.minBytes > 0
          ? a.minBytes
          : 1,
      checks: checks.map((v) => {
        const c = obj(v);
        const pointer = str(c.pointer, "pointer");
        if (!pointer.startsWith("/") || !("equals" in c))
          throw new RunError(
            "SCHEMA",
            "Checks require JSON pointer and explicit equals",
          );
        return { pointer, equals: c.equals };
      }),
    };
  });
  if (new Set(artifacts.map((a) => a.name)).size !== artifacts.length)
    throw new RunError("SCHEMA", "Duplicate artifact declarations");
  return {
    version: 1,
    purpose: str(p.purpose, "purpose"),
    source,
    controlPath: str(p.controlPath, "controlPath"),
    provider,
    model,
    templateRef: str(p.templateRef, "templateRef"),
    initialTask: str(p.initialTask, "initialTask"),
    exportTask: str(p.exportTask, "exportTask"),
    packages: { apt, npm },
    artifacts,
    freeOnly,
  };
}
export function nativeCall(args: string[], timeout = 90000): unknown {
  const result = spawnSync("ncl", [...args, "--json"], {
    encoding: "utf8",
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error)
    throw new RunError(
      "NATIVE_TRANSPORT",
      "Native command unavailable/timed out",
      "Inspect ncl, service and unattended PATH; never blind retry creation",
    );
  let envelope: Obj;
  try {
    envelope = obj(JSON.parse(result.stdout));
  } catch {
    throw new RunError("NATIVE_JSON", "Native command did not return JSON");
  }
  if (result.status !== 0 || envelope.ok !== true) {
    let code = "native-error";
    try {
      code = String(obj(envelope.error).code ?? code);
    } catch {}
    throw new RunError(
      "NATIVE_API",
      `Native ${args[0]}/${args[1]} refused (${code})`,
      "Inspect exact recorded session and native diagnostics; do not reinterpret as pending",
    );
  }
  return envelope.data;
}
function noSymlinks(path: string): void {
  let p = resolve(path);
  while (true) {
    try {
      if (lstatSync(p).isSymbolicLink())
        throw new RunError("SYMLINK", "Refusing symlinked state/evidence path");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = dirname(p);
    if (parent === p) break;
    p = parent;
  }
}
export function atomic(path: string, data: string | Uint8Array): void {
  noSymlinks(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.write-${randomUUID()}`);
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeFileSync(fd, data);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
}
export function readState(run: string): State {
  noSymlinks(run);
  const state = obj(
    JSON.parse(readFileSync(join(run, "run.json"), "utf8")),
  ) as unknown as State;
  if (
    state.version !== 1 ||
    state.planSha !== digest(JSON.stringify(state.plan))
  )
    throw new RunError("STATE_INTEGRITY", "Run version/plan hash mismatch");
  parsePlan(state.plan);
  return state;
}
export function save(run: string, s: State): void {
  atomic(join(run, "run.json"), JSON.stringify(s, null, 2) + "\n");
  const attempts = s.attempts
    .map(
      (a) =>
        `| ${a.number} | ${a.mode} | ${a.taskId ?? "creation-unconfirmed"} | ${a.sessionId ?? "creation-unconfirmed"} | ${a.nativeStatus ?? "not-queried"} |`,
    )
    .join("\n");
  atomic(
    join(run, "INDEX.md"),
    `# NanoClaw run ${s.id}\n\nPurpose: ${s.plan.purpose}\n\nPhase: ${s.phase}\nSource: ${s.plan.source.sha}\nGroup: ${s.groupId ?? "not-created"} (${s.groupName})\nModel: ${s.plan.model}\nRead-only source: ${s.plan.source.path}\nRead-only controls: ${s.plan.controlPath}\nNative template: ${s.plan.templateRef}\n\n| Attempt | Mode | Task | Exact session | Native state |\n|---|---|---|---|---|\n${attempts}\n\nEvidence: attempts/N/{receipts,events,artifacts}. Native workspaces remain platform-managed. Preserve this index, run.json, source and outputs until scoped cleanup approval. This index does not authorize deletion/publication/global changes.\n`,
  );
}
export function locked<T>(run: string, fn: () => T): T {
  noSymlinks(run);
  mkdirSync(run, { recursive: true, mode: 0o700 });
  const path = join(run, ".writer.lock");
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch {
    throw new RunError(
      "LOCKED",
      "Another writer or a stale lock exists",
      "diagnose reads lock metadata; never steal a live lock",
    );
  }
  writeFileSync(
    fd,
    JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
  );
  closeSync(fd);
  try {
    return fn();
  } finally {
    unlinkSync(path);
  }
}
function allowed(path: string): void {
  const file = join(homedir(), ".config/nanoclaw/mount-allowlist.json");
  const cfg = obj(JSON.parse(readFileSync(file, "utf8")));
  const target = realpathSync(path);
  const roots = Array.isArray(cfg.allowedRoots) ? cfg.allowedRoots : [];
  const ok = roots.some((v) => {
    const r = obj(v);
    if (typeof r.path !== "string" || !existsSync(r.path)) return false;
    const base = realpathSync(r.path);
    return target === base || target.startsWith(base + sep);
  });
  if (!ok)
    throw new RunError(
      "MOUNT_GATE",
      "Source/control is outside approved mount roots",
      "Obtain exact read-only task-root approval; CLI never changes policy",
    );
}
export function checkSource(plan: Plan): number {
  const manifest = obj(JSON.parse(readFileSync(plan.source.manifest, "utf8")));
  let count = 0;
  const seen = new Set<string>();
  function walk(dir: string, prefix = ""): void {
    for (const file of readdirSync(dir, { withFileTypes: true })) {
      const name = prefix + file.name;
      if (file.isSymbolicLink())
        throw new RunError(
          "SOURCE_SYMLINK",
          "Immutable source must not contain symlinks",
        );
      if (file.isDirectory()) walk(join(dir, file.name), name + "/");
      else if (file.isFile()) {
        seen.add(name);
        if (
          typeof manifest[name] !== "string" ||
          digest(readFileSync(join(dir, file.name))) !== manifest[name]
        )
          throw new RunError("SOURCE_CHANGED", `Source hash mismatch: ${name}`);
        count++;
      }
    }
  }
  walk(plan.source.path);
  if (!count || seen.size !== Object.keys(manifest).length)
    throw new RunError(
      "SOURCE_CHANGED",
      "Incomplete or extra source inventory",
    );
  return count;
}
export function initialize(plan: Plan, run: string, apply: boolean): Obj {
  const git = spawnSync(
    "git",
    ["-C", dirname(run), "rev-parse", "--show-toplevel"],
    { encoding: "utf8" },
  );
  if (git.status !== 0)
    throw new RunError(
      "WORKTREE",
      "Run must be beneath an existing registered Git worktree",
    );
  const root = git.stdout.trim();
  const rel = relative(root, run);
  if (rel.startsWith("..") || !rel)
    throw new RunError(
      "WORKTREE",
      "Use a private run directory inside the worktree",
    );
  const ignored = spawnSync(
    "git",
    ["-C", root, "check-ignore", "--no-index", join(run, "run.json")],
    { encoding: "utf8" },
  );
  if (ignored.status !== 0)
    throw new RunError(
      "PRIVACY",
      "Run state must be Git-ignored before initialization",
    );
  const files = checkSource(plan);
  if (!apply)
    return {
      dryRun: true,
      worktree: root,
      files,
      action: "initialize private run",
    };
  if (existsSync(join(run, "run.json")))
    throw new RunError("EXISTS", "Run already initialized; use recorded state");
  return locked(run, () => {
    const id = randomUUID();
    const s: State = {
      version: 1,
      id,
      createdAt: new Date().toISOString(),
      groupName: `ncr-${id.replaceAll("-", "").slice(0, 16)}`,
      plan,
      planSha: digest(JSON.stringify(plan)),
      phase: "initialized",
      attempts: [],
    };
    save(run, s);
    atomic(
      join(run, "INDEX.md"),
      `# NanoClaw run ${id}\n\nPurpose: ${plan.purpose}\n\nSource: ${plan.source.sha}\nWorktree: ${root}\n\nAuthoritative native group/task/session/artifact handles: run.json. Native workspaces stay platform-managed. No deletion, publication or global-policy changes are authorized by this index.\n`,
    );
    return summary(s);
  });
}
function owned(s: State, native: Native): void {
  if (!s.groupId) throw new RunError("NOT_PROVISIONED", "Provision first");
  const g = obj(native(["groups", "get", "--id", s.groupId]));
  if (g.id !== s.groupId || g.name !== s.groupName)
    throw new RunError(
      "OWNERSHIP",
      "Native group does not match this commissioned run",
    );
}
export function provision(
  run: string,
  apply: boolean,
  native: Native = nativeCall,
): Obj {
  return locked(run, () => {
    const s = readState(run);
    checkSource(s.plan);
    allowed(s.plan.source.path);
    allowed(s.plan.controlPath);
    if (!apply)
      return {
        dryRun: true,
        action:
          "create/reconcile one task-owned group and configure read-only inputs",
        groupName: s.groupName,
      };
    if (s.attempts.length)
      throw new RunError(
        "ACTIVE_CONFIG",
        "Do not reprovision a group after work has started",
      );
    s.phase = "provisioning";
    save(run, s);
    if (!s.groupId) {
      const list = native(["groups", "list"]);
      if (!Array.isArray(list))
        throw new RunError("NATIVE_SCHEMA", "Expected group list");
      const found = list.map(obj).filter((g) => g.name === s.groupName);
      if (found.length > 1)
        throw new RunError(
          "UNCERTAIN_CREATE",
          "Multiple native groups match run correlation",
        );
      let group: Obj;
      if (found.length) group = found[0]!;
      else {
        const data = obj(
          native([
            "groups",
            "create",
            "--template",
            s.plan.templateRef,
            "--name",
            s.groupName,
            "--new",
          ]),
        );
        group = data.group ? obj(data.group) : data;
      }
      s.groupId = str(group.id, "native group ID");
      save(run, s);
    }
    owned(s, native);
    const id = s.groupId!;
    native([
      "groups",
      "config",
      "update",
      "--id",
      id,
      "--provider",
      s.plan.provider,
      "--model",
      s.plan.model,
    ]);
    for (const [host, mount] of [
      [s.plan.source.path, "site"],
      [s.plan.controlPath, "control"],
    ])
      native([
        "groups",
        "config",
        "add-mount",
        "--id",
        id,
        "--host",
        host!,
        "--container",
        mount!,
        "--ro",
      ]);
    for (const pkg of s.plan.packages.apt)
      native(["groups", "config", "add-package", "--id", id, "--apt", pkg]);
    for (const pkg of s.plan.packages.npm)
      native(["groups", "config", "add-package", "--id", id, "--npm", pkg]);
    if (s.plan.packages.apt.length + s.plan.packages.npm.length) {
      const built = obj(
        native(["groups", "restart", "--id", id, "--rebuild"], 600000),
      );
      if (built.rebuilt !== true)
        throw new RunError("REBUILD", "Native package rebuild not confirmed");
    }
    const cfg = obj(native(["groups", "config", "get", "--id", id]));
    if (cfg.model !== s.plan.model || cfg.provider !== s.plan.provider)
      throw new RunError(
        "CONFIG_MISMATCH",
        "Native model/provider read-back differs",
      );
    s.phase = "provisioned";
    save(run, s);
    return summary(s);
  });
}
function makePrompt(s: State, a: number, mode: string, reason: string): string {
  return `RUN ${s.id} ATTEMPT ${a}\nPURPOSE: ${s.plan.purpose}\nSOURCE: ${s.plan.source.sha}, read-only /workspace/extra/site; controls read-only /workspace/extra/control. No live credentials, external sends, production probes, source/config changes, delegation or model substitution. Use owned /workspace/agent sandbox.\n${mode === "export" ? "RECOVERY: re-export the actual SAVED artifacts from this run, do not rerun the application/build/tests or invent missing files. If missing, export failure." : "Execute the actual supplied purpose/harness; do not substitute a future-action plan."}\nReason: ${reason}\nNATIVE EXPORT CONTRACT: append ONE LINE per event with ncl tasks append-log --msg. Prefix ${MARKER}, then JSON.stringify({runId:${JSON.stringify(s.id)},attempt:${a},seq:positiveContiguousIntegerStarting1,kind:'checkpoint'|'artifact'|'complete'|'failure',...}). Artifacts use exact name, encoding json|utf8|base64 and data; declared names: ${JSON.stringify(s.plan.artifacts.map((x) => ({ name: x.name, type: x.type })))}. JSON bytes=JSON.stringify(data), text bytes=UTF8(data), binary=base64 decode(data). Complete event data={sourceSha:${JSON.stringify(s.plan.source.sha)},artifacts:{name:sha256OfExactBytes,...}}. Include all declared digests even during the documented defer-report negative control. Export max8 bounded events (<45000chars each), never flood the last10 native-log tail. Echo no raw credentials. End task only after exports finish. The host independently checks required artifacts/digests and does not equate lifecycle with acceptance.\n${(mode === "export" ? s.plan.exportTask : s.plan.initialTask).replaceAll("{{runId}}", s.id).replaceAll("{{attempt}}", String(a))}\n`;
}
function nativeTask(s: State, a: Attempt, native: Native): Obj {
  if (!a.taskId || !a.sessionId)
    throw new RunError("NO_TASK", "Native task handles not yet reconciled");
  const d = obj(
    native(["tasks", "get", "--id", a.taskId, "--session", a.sessionId]),
  );
  if (
    d.agent_group_id !== s.groupId ||
    d.series_id !== a.taskId ||
    d.session_id !== a.sessionId
  )
    throw new RunError(
      "OWNERSHIP",
      "Native task/session does not match commissioned run",
    );
  if (
    !["pending", "paused", "completed", "failed", "cancelled"].includes(
      String(d.status),
    )
  )
    throw new RunError("NATIVE_SCHEMA", "Unknown task state");
  if (typeof d.prompt === "string" && digest(d.prompt) !== a.intent.promptSha)
    throw new RunError(
      "OWNERSHIP",
      "Native task prompt differs from commissioned intent",
    );
  return d;
}
function reconcileIntent(s: State, a: Attempt, native: Native): boolean {
  const sessions = native(["sessions", "list"]);
  if (!Array.isArray(sessions))
    throw new RunError("NATIVE_SCHEMA", "Expected session list");
  const prefix = `system:tasks:${a.intent.name}-`;
  const found = sessions
    .map(obj)
    .filter(
      (x) =>
        x.agent_group_id === s.groupId &&
        typeof x.thread_id === "string" &&
        x.thread_id.startsWith(prefix),
    );
  if (found.length > 1)
    throw new RunError(
      "UNCERTAIN_CREATE",
      "Multiple native sessions match task intent",
    );
  const row = found[0];
  if (!row) return false;
  a.sessionId = str(row.id, "session ID");
  a.taskId = str(row.thread_id, "thread ID").slice("system:tasks:".length);
  nativeTask(s, a, native);
  return true;
}
export function start(
  run: string,
  apply: boolean,
  mode: "initial" | "retry" | "export" = "initial",
  reason = "",
  native: Native = nativeCall,
): Obj {
  return locked(run, () => {
    const s = readState(run);
    owned(s, native);
    checkSource(s.plan);
    const previous = s.attempts.at(-1);
    if (!previous && s.phase !== "provisioned")
      throw new RunError(
        "NOT_PROVISIONED",
        "Complete provisioning before the first task",
      );
    if (!previous && mode !== "initial")
      throw new RunError("NO_TASK", "No prior attempt exists to recover");
    if (previous?.taskId && previous.sessionId) {
      const d = nativeTask(s, previous, native);
      previous.nativeStatus = String(d.status);
      if (!["completed", "failed", "cancelled"].includes(String(d.status)))
        throw new RunError(
          "IN_FLIGHT",
          "Previous task is not terminal; refuse a duplicate writer",
        );
      if (mode === "initial")
        throw new RunError(
          "ALREADY_STARTED",
          "Use explicit recover for terminal work",
        );
    }
    if (
      mode !== "initial" &&
      previous &&
      previous.taskId &&
      !previous.error &&
      !previous.issues?.length
    )
      throw new RunError(
        "RECOVERY_NOT_DIAGNOSED",
        "Collect/diagnose the concrete failure before recovery; do not repeat successful work",
      );
    if (mode !== "initial" && !reason.trim())
      throw new RunError(
        "RECOVERY_REASON",
        "Recovery requires a concrete reason/changed prerequisite",
      );
    if (!apply)
      return {
        dryRun: true,
        action:
          mode === "initial"
            ? "start bounded task"
            : `recover ${mode} in SAME group`,
        groupId: s.groupId,
      };
    let a: Attempt;
    if (previous && (!previous.taskId || !previous.sessionId)) {
      a = previous;
      if (reconcileIntent(s, a, native)) {
        save(run, s);
        return summary(s);
      }
      throw new RunError(
        "UNCERTAIN_CREATE",
        "Prior creation intent has no confirmed task; refusing to resend",
        "Inspect native sessions/receipts and settle the original operation first",
      );
    } else {
      const number = s.attempts.length + 1;
      const prompt = makePrompt(s, number, mode, reason);
      a = {
        number,
        mode,
        reason,
        intent: {
          name: `ncr-${s.id.replaceAll("-", "").slice(0, 8)}-a${number}`,
          prompt,
          promptSha: digest(prompt),
        },
        events: {},
        conflicts: [],
      };
      s.attempts.push(a);
    }
    s.phase = "task-creation-intent-saved";
    save(run, s);
    try {
      const d = obj(
        native([
          "tasks",
          "create",
          "--name",
          a.intent.name,
          "--group",
          s.groupId!,
          "--prompt",
          a.intent.prompt,
          "--process-after",
          new Date(Date.now() + 3000).toISOString(),
        ]),
      );
      const taskId = str(d.series_id, "task ID"),
        sessionId = str(d.session_id, "session ID");
      a.taskId = taskId;
      a.sessionId = sessionId;
      s.phase = "scheduled";
      save(run, s);
      nativeTask(s, a, native);
      return summary(s);
    } catch (e) {
      a.error = e instanceof RunError ? e.code : "NATIVE_ERROR";
      s.phase = "creation-uncertain";
      save(run, s);
      throw e;
    }
  });
}
export function pointer(value: unknown, path: string): unknown {
  let v = value;
  for (const piece of path.slice(1).split("/")) {
    const key = piece.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!v || typeof v !== "object" || !Object.hasOwn(v, key)) return undefined;
    v = (v as Obj)[key];
  }
  return v;
}
export function artifactBytes(event: Obj): Buffer {
  if (event.encoding === "json") return Buffer.from(JSON.stringify(event.data));
  if (event.encoding === "utf8" && typeof event.data === "string")
    return Buffer.from(event.data);
  if (event.encoding === "base64" && typeof event.data === "string") {
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        event.data,
      )
    )
      throw new RunError("EXPORT_SCHEMA", "Invalid base64");
    return Buffer.from(event.data, "base64");
  }
  throw new RunError("EXPORT_SCHEMA", "Invalid artifact encoding");
}
export function ingest(
  run: string,
  s: State,
  a: Attempt,
  lines: string[],
): void {
  const dir = join(run, "attempts", String(a.number));
  for (const line of lines) {
    const index = line.indexOf(MARKER);
    if (index < 0) continue;
    if (line.length - index > 45000) {
      a.conflicts.push("oversized-export");
      continue;
    }
    let e: Obj;
    try {
      e = obj(JSON.parse(line.slice(index + MARKER.length)));
    } catch {
      a.conflicts.push("malformed-export");
      continue;
    }
    if (e.runId !== s.id || e.attempt !== a.number) {
      a.conflicts.push("foreign-run-or-attempt");
      continue;
    }
    if (
      !Number.isSafeInteger(e.seq) ||
      (e.seq as number) < 1 ||
      (e.seq as number) > 1000
    ) {
      a.conflicts.push("invalid-sequence");
      continue;
    }
    const seq = String(e.seq),
      hash = digest(JSON.stringify(e));
    if (a.events[seq] && a.events[seq] !== hash) {
      a.conflicts.push(`sequence-conflict:${seq}`);
      continue;
    }
    a.events[seq] = hash;
    atomic(
      join(dir, "events", `${seq}-${hash}.json`),
      JSON.stringify(e, null, 2),
    );
    if (e.kind === "artifact") {
      try {
        const name = str(e.name, "artifact name");
        if (!safeName(name) || !s.plan.artifacts.some((x) => x.name === name))
          throw new RunError("EXPORT_SCHEMA", "Unexpected artifact");
        const bytes = artifactBytes(e);
        const file = join(dir, "artifacts", name);
        noSymlinks(file);
        if (existsSync(file) && digest(readFileSync(file)) !== digest(bytes)) {
          a.conflicts.push(`artifact-conflict:${name}`);
          continue;
        }
        atomic(file, bytes);
      } catch {
        a.conflicts.push(`unsafe-artifact:${String(e.name)}`);
      }
    } else if (e.kind === "complete") {
      try {
        if (a.completeSeq && a.completeSeq !== e.seq)
          a.conflicts.push("multiple-complete-events");
        a.complete = obj(e.data);
        a.completeSeq = e.seq as number;
      } catch {
        a.conflicts.push("invalid-complete");
      }
    } else if (e.kind === "failure") a.conflicts.push("worker-failure");
    else if (e.kind !== "checkpoint") a.conflicts.push("unknown-event-kind");
  }
}
export function verifyArtifacts(run: string, s: State, a: Attempt): string[] {
  const issues = [...new Set(a.conflicts)];
  if (a.error) issues.push(`native-error:${a.error}`);
  if (a.nativeStatus === "failed" || a.nativeStatus === "cancelled")
    issues.push(`native-task-${a.nativeStatus}`);
  else if (a.nativeStatus !== "completed")
    issues.push("native-task-not-terminal");
  const seqs = Object.keys(a.events)
    .map(Number)
    .sort((x, y) => x - y);
  if (!seqs.length || seqs.some((n, i) => n !== i + 1))
    issues.push("export-sequence-gap");
  if (a.complete && a.completeSeq !== seqs.at(-1))
    issues.push("complete-not-last-event");
  if (!a.complete) issues.push("missing-complete-event");
  else if (a.complete.sourceSha !== s.plan.source.sha)
    issues.push("source-sha-mismatch");
  let declared: Obj = {};
  try {
    declared = obj(a.complete?.artifacts);
  } catch {
    issues.push("missing-complete-digests");
  }
  for (const spec of s.plan.artifacts) {
    const file = join(
      run,
      "attempts",
      String(a.number),
      "artifacts",
      spec.name,
    );
    if (!existsSync(file)) {
      issues.push(`missing-artifact:${spec.name}`);
      continue;
    }
    noSymlinks(file);
    const bytes = readFileSync(file);
    if (bytes.length < spec.minBytes)
      issues.push(`artifact-too-small:${spec.name}`);
    if (declared[spec.name] !== digest(bytes))
      issues.push(`digest-mismatch:${spec.name}`);
    if (
      spec.type === "jpeg" &&
      (bytes[0] !== 255 ||
        bytes[1] !== 216 ||
        bytes[bytes.length - 2] !== 255 ||
        bytes[bytes.length - 1] !== 217)
    )
      issues.push(`invalid-jpeg:${spec.name}`);
    if (spec.type === "json") {
      try {
        const data: unknown = JSON.parse(bytes.toString());
        for (const check of spec.checks)
          if (
            JSON.stringify(pointer(data, check.pointer)) !==
            JSON.stringify(check.equals)
          )
            issues.push(`assertion:${spec.name}:${check.pointer}`);
      } catch {
        issues.push(`invalid-json:${spec.name}`);
      }
    }
  }
  return [...new Set(issues)];
}
export function inspect(
  run: string,
  collect: boolean,
  native: Native = nativeCall,
): Obj {
  return locked(run, () => {
    const s = readState(run);
    owned(s, native);
    const a = s.attempts.at(-1);
    if (!a) throw new RunError("NO_TASK", "Start a task first");
    if (!a.taskId) {
      if (!reconcileIntent(s, a, native))
        throw new RunError(
          "UNCERTAIN_CREATE",
          "No matching native task; inspect commissioning intent before retry",
        );
    }
    try {
      const d = nativeTask(s, a, native);
      a.nativeStatus = String(d.status);
      delete a.error;
      if (collect) {
        const logs = d.recent_log;
        if (!Array.isArray(logs) || !logs.every((x) => typeof x === "string"))
          throw new RunError("NATIVE_SCHEMA", "Invalid recent-log tail");
        const bytes = JSON.stringify(d, null, 2);
        atomic(
          join(
            run,
            "attempts",
            String(a.number),
            "receipts",
            `native-${digest(bytes)}.json`,
          ),
          bytes,
        );
        ingest(run, s, a, logs as string[]);
        a.issues = verifyArtifacts(run, s, a);
        s.phase = a.issues.length ? "evidence-incomplete" : "evidence-complete";
      } else
        s.phase =
          d.status === "completed"
            ? "native-completed-not-verified"
            : d.status === "failed" || d.status === "cancelled"
              ? `native-${String(d.status)}`
              : "active-or-scheduled";
      delete a.error;
      save(run, s);
      return summary(s);
    } catch (e) {
      a.error = e instanceof RunError ? e.code : "NATIVE_ERROR";
      s.phase = "native-query-error";
      save(run, s);
      throw e;
    }
  });
}
export function verify(run: string): Obj {
  return locked(run, () => {
    const s = readState(run),
      a = s.attempts.at(-1);
    if (!a) throw new RunError("NO_TASK", "No attempt to verify");
    checkSource(s.plan);
    a.issues = verifyArtifacts(run, s, a);
    s.phase = a.issues.length ? "evidence-incomplete" : "evidence-complete";
    save(run, s);
    if (a.issues.length)
      throw new RunError(
        "EVIDENCE_INCOMPLETE",
        a.issues.join("; "),
        "diagnose; re-export saved artifacts only after the prior task is terminal",
      );
    return {
      ...summary(s),
      verification:
        "machine-contract-only; operator must inspect real proof/screenshot",
      operatorReviewRequired: true,
    };
  });
}
export function diagnose(run: string): Obj {
  const s = readState(run),
    a = s.attempts.at(-1);
  let lock: unknown = null;
  const lockPath = join(run, ".writer.lock");
  noSymlinks(lockPath);
  if (existsSync(lockPath)) {
    const data = obj(JSON.parse(readFileSync(lockPath, "utf8")));
    lock = { pid: data.pid, createdAt: data.createdAt };
  }
  return {
    ...summary(s),
    lock,
    issues: a ? (a.issues ?? []) : [],
    next: a?.error
      ? "Resolve exact native error using stored task AND session"
      : a?.issues?.length
        ? "Only terminal work may be recovered; use export to retrieve already-saved artifacts without rerunning"
        : "Inspect/collect actual native evidence before acceptance",
  };
}
export function summary(s: State): Obj {
  const a = s.attempts.at(-1);
  return {
    runId: s.id,
    phase: s.phase,
    groupId: s.groupId ?? null,
    groupName: s.groupName,
    model: s.plan.model,
    sourceSha: s.plan.source.sha,
    attempt: a?.number ?? 0,
    taskId: a?.taskId ?? null,
    sessionId: a?.sessionId ?? null,
    nativeStatus: a?.nativeStatus ?? null,
    issues: a?.issues ?? [],
    error: a?.error ?? null,
    semanticAcceptance: false,
  };
}
