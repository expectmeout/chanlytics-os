/**
 * tooling/scripts/ops/delete-tenant.mjs, run as a person runs it: a child process, its own argv and exit code, over a
 * database in memory and buckets as storage answers (_supabase-stand-in.mjs stands in for its client). The script runs
 * from a copy in a folder of its own, so the backup it writes lands there and nowhere in the repository.
 *
 * `deleteTenant(world, ...args)` answers what a person would see and what was left: the exit code, what it printed,
 * the backup's rows, the tables after, every write and storage call in order (`log`), and each bucket's paths after.
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

/**
 * One run. `world`: `tables`, `faults` (fakeDb's, `"<table>.select"`), `buckets` ({ name: { path: bytes } }),
 * `bucketFaults` ({ name: { dir: message } }), `tenantDeleteAnswersNone`, and `env` for the run.
 */
export function deleteTenant(world, ...args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delete-tenant-"));
  try {
    const script = path.join(dir, "scripts", "ops", "delete-tenant.mjs");
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.copyFileSync(SCRIPT, script);
    const worldFile = path.join(dir, "world.json");
    const seenFile = path.join(dir, "seen.json");
    const { env = {}, ...rest } = world;
    fs.writeFileSync(worldFile, JSON.stringify(rest));
    const run = spawnSync(process.execPath, ["--import", STAND_IN, script, ...args], {
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
    const backups = path.join(dir, "backups");
    const written = fs.existsSync(backups) ? fs.readdirSync(backups) : [];
    const backup = written.length
      ? fs
          .readFileSync(path.join(backups, written[0]), "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : null;
    return {
      code: run.status,
      out: run.stdout,
      err: run.stderr,
      said: `${run.stdout}\n${run.stderr}`,
      backup,
      tables: seen?.tables ?? null,
      log: seen?.log ?? [],
      buckets: seen?.buckets ?? {},
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The workspace, a row of its own, its history, and a workspace beside it. */
export const harbor = (over = {}) => ({
  tenants: [
    { id: T, name: NAME, slug: "harbor-nails", created_at: "2026-01-02T00:00:00Z" },
    { id: OTHER, name: "Bayside", slug: "bayside", created_at: "2026-01-02T00:00:00Z" },
  ],
  contacts: [
    { id: "c-1", tenant_id: T, display_name: "Ana" },
    { id: "c-2", tenant_id: OTHER, display_name: "Bruno" },
  ],
  events: [
    { id: 1, tenant_id: T, kind: "contact.created" },
    { id: 2, tenant_id: OTHER, kind: "contact.created" },
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
