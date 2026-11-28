/**
 * tooling/scripts/ops/delete-tenant.mjs, run as a person runs it: a child process, its own argv and exit code, over a
 * database in memory and buckets as storage answers (_supabase-stand-in.mjs stands in for its client). The script runs
 * from a copy in a folder of its own, so the backup it writes lands there and nowhere in the repository.
 *
 * `deleteTenant(world, ...args)` answers what a person would see and what was left: the exit code, what it printed,
 * the backup's rows, the clean-up list it wrote, the tables after, every write and storage call in order (`log`), each
 * call that left for a provider (`fetched`), and each bucket's paths after. `runsIn()` is the same over one folder kept
 * between runs, for a run that picks up what the one before it left.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../_source.mjs";

const STAND_IN = pathToFileURL(path.join(ROOT, "tests/console/back-office/_supabase-stand-in.mjs")).href;
const SCRIPT = path.join(ROOT, "tooling/scripts/ops/delete-tenant.mjs");
/** The script's own modules, beside it. */
const PARTS = path.join(ROOT, "tooling/scripts/ops/delete-tenant");

/** The workspace these runs delete, and one beside it whose rows no run may touch. */
export const T = "00000000-0000-4000-8000-0000000000a1";
export const OTHER = "00000000-0000-4000-8000-0000000000b2";
export const NAME = "Harbor Nails";

/** A provider's variables this run does not hold, unless a case gives them. */
const UNSET = {
  ANTHROPIC_API_KEY: "",
  CLOUDFLARE_ACCOUNT_ID: "",
  CLOUDFLARE_STREAM_API_TOKEN: "",
  FOOTAGE_RELAY_URL: "",
  FOOTAGE_TICKET_KEY: "",
};

const linesOf = (file) =>
  fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

/**
 * A folder the script runs from, kept until `close()`: `run(world, ...args)` is one run there. `world`: `tables`,
 * `faults` (fakeDb's, `"<table>.select"`), `buckets` ({ name: { path: bytes } }), `bucketFaults` ({ name: { dir:
 * message } }), `tenantDeleteAnswersNone`, the stand-in's `timeoutPast`, `ledger`, `fetchFails` and `removeFails`, and
 * `env` for the run.
 */
export function runsIn() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delete-tenant-"));
  const script = path.join(dir, "scripts", "ops", "delete-tenant.mjs");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(SCRIPT, script);
  if (fs.existsSync(PARTS)) fs.cpSync(PARTS, path.join(path.dirname(script), "delete-tenant"), { recursive: true });
  const backups = path.join(dir, "backups");
  const run = (world, ...args) => {
    const worldFile = path.join(dir, "world.json");
    const seenFile = path.join(dir, "seen.json");
    fs.rmSync(seenFile, { force: true });
    const before = fs.existsSync(backups) ? fs.readdirSync(backups) : [];
    const { env = {}, ...rest } = world;
    fs.writeFileSync(worldFile, JSON.stringify(rest));
    const ran = spawnSync(process.execPath, ["--import", STAND_IN, script, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        ...UNSET,
        SUPABASE_URL: "https://db.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-test-only",
        DELETE_TENANT_WORLD: worldFile,
        DELETE_TENANT_SEEN: seenFile,
        ...env,
      },
    });
    const seen = fs.existsSync(seenFile) ? JSON.parse(fs.readFileSync(seenFile, "utf8")) : null;
    // What this run wrote: its backup, and the list of what it removes outside the database.
    const written = (fs.existsSync(backups) ? fs.readdirSync(backups) : []).filter((f) => !before.includes(f));
    const backupFile = written.find((f) => f.endsWith(".jsonl") && !f.endsWith(".clean-up.jsonl"));
    const listName = written.find((f) => f.endsWith(".clean-up.jsonl"));
    return {
      code: ran.status,
      out: ran.stdout,
      err: ran.stderr,
      said: `${ran.stdout}\n${ran.stderr}`,
      backup: backupFile ? linesOf(path.join(backups, backupFile)) : null,
      listFile: listName ? path.join(backups, listName) : null,
      list: listName ? linesOf(path.join(backups, listName)) : null,
      tables: seen?.tables ?? null,
      log: seen?.log ?? [],
      fetched: seen?.fetched ?? [],
      buckets: seen?.buckets ?? {},
    };
  };
  return { run, readList: (file) => linesOf(file), close: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/**
 * How every apply begins, in the order of its writes: Stop everything through its door, then the workspace's queued
 * jobs withdrawn. Nothing is deleted before both.
 */
export const STOPPED = ["rpc workspace_sending_stop", "jobs update"];

/** One run, in a folder of its own that goes when it ends. */
export function deleteTenant(world, ...args) {
  const place = runsIn();
  try {
    return place.run(world, ...args);
  } finally {
    place.close();
  }
}

/** The workspace, a row of its own, its history, and a workspace beside it. */
export const harbor = (over = {}) => ({
  tenants: [
    { id: T, name: NAME, slug: "harbor-nails", created_at: "2026-01-02T00:00:00Z", sending_stopped_at: null },
    { id: OTHER, name: "Bayside", slug: "bayside", created_at: "2026-01-02T00:00:00Z", sending_stopped_at: null },
  ],
  contacts: [
    { id: "c-1", tenant_id: T, display_name: "Ana" },
    { id: "c-2", tenant_id: OTHER, display_name: "Bruno" },
  ],
  events: [
    { id: "e-1", tenant_id: T, kind: "contact.created", created_at: "2026-03-04T10:00:00Z" },
    { id: "e-2", tenant_id: OTHER, kind: "contact.created", created_at: "2026-03-04T10:00:00Z" },
  ],
  ...over,
});

/** What the cascade cannot reach: one of each, the line answering. */
export const STRANDED = {
  lines: [
    {
      id: "l-1",
      tenant_id: T,
      e164: "+13055550123",
      subaccount_sid: "AC-test",
      number_sid: "PN-test",
      voice_state: "answering",
    },
  ],
  billing_accounts: [
    { tenant_id: T, status: "trialing", stripe_customer_id: "cus_test", stripe_subscription_id: "sub_test" },
  ],
  google_connections: [{ id: "g-1", tenant_id: T, google_email: "owner@example.com" }],
  source_connections: [{ id: "s-1", tenant_id: T, email: "owner@example.com", health: "ok" }],
  tenant_channels: [{ id: "tc-1", tenant_id: T, status: "active", external_id: "waba-1" }],
  voice_agents: [{ tenant_id: T, agent_id: "agent_test", llm_id: "llm_test" }],
};
