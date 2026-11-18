/**
 * The world the footage sources' tests run in (the footage sources plan, P2): a workspace that takes videos, a member
 * who connected a Google account, that account's token in a Vault that answers from memory, and the pretend Drive
 * (_fake-drive.mjs) behind the process's own `fetch`. The real handlers run over it: the walk, the read, the clock,
 * the push door and the admin door.
 *
 * `runJobs` stands in for the ledger: it claims each footage job on the ledger in turn (so a kind's once-only key
 * holds as the ledger's does), hands it to the handler the job runner would, and closes it. A handler that throws
 * leaves its job failed and the throw is the test's to read.
 *
 * The four SQL functions of 00641 are modelled here by hand, as the in-memory database models every function it is
 * given; the SQL itself is proved on a real database by the-clock-hands-out-folders.db.test.mjs.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import crypto from "node:crypto";
import { fakeDb } from "../../_fake-db.mjs";
import { at } from "../../_cron-doors-world.mjs";
import { rows } from "../../_rows.mjs";
import { fakeDrive } from "./_fake-drive.mjs";

export const T = "11111111-1111-4111-8111-111111111111";
export const OTHER = "22222222-2222-4222-8222-222222222222";
export const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const CONNECTION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const SOURCE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const ROOT = "folder-root";

/**
 * No test here reaches the network: outside a world, `fetch` refuses, so a call that slipped past the pretend Drive
 * fails loudly instead of leaving for Google.
 */
const NO_NETWORK = async (url) => {
  throw new Error(`a footage test reached for the network: ${url}`);
};
globalThis.fetch = NO_NETWORK;

/**
 * A table whose new rows are filled as the database fills them: a column the code left out takes its default, where
 * the in-memory database would leave it undefined. A row a test seeds is taken as it is.
 */
function withDefaults(seeded, defaults) {
  const table = [...seeded];
  table.push = (...added) =>
    Array.prototype.push.apply(
      table,
      added.map((row) => Object.assign(row, { ...defaults(), ...row })),
    );
  return table;
}

const ITEM_DEFAULTS = () => ({
  parent_id: null,
  modified_at: null,
  checksum: null,
  bytes: null,
  seconds: null,
  added_by: null,
  why: null,
  file_id: null,
  gone_at: null,
  seen_run: null,
  missed_run: null,
  walked_run: null,
  walk_page: null,
  length_until: null,
});

/** What every footage test's process holds: the Google client, the callback, and the edge's own address. */
export function setEnv() {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret-for-this-file";
  process.env.SOURCES_OAUTH_REDIRECT = "https://app.example.com/api/v1/sources/callback";
  process.env.EDGE_ORIGIN = "https://edge.example.com";
}

/** A watched folder's row as the database would hold it: every column the sync reads, at its default. */
export function sourceRow(over = {}) {
  return {
    id: SOURCE,
    tenant_id: T,
    connection_id: CONNECTION,
    folder_id: ROOT,
    folder_name: "Footage",
    drive_id: null,
    include_subfolders: true,
    state: "setting_up",
    change_cursor: "100",
    next_read_at: null,
    read_gap_seconds: 300,
    channel_id: null,
    channel_resource_id: null,
    channel_token_hash: null,
    channel_expires_at: null,
    reconciled_at: null,
    last_error: null,
    last_error_at: null,
    last_read_at: null,
    signalled_at: null,
    last_change_at: null,
    busy_reads: 0,
    next_walk_at: null,
    walk_run: 0,
    walk_kind: null,
    walk_started_at: null,
    walk_touched_at: null,
    hold_at: null,
    hold_count: null,
    hold_confirmed_at: null,
    walk_units: 0,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    ...over,
  };
}

/** One job of a kind per folder due, as 00641's sources_hand_out writes them: none where one waits or runs. */
function handOut(tables, { p_walk_stale_seconds }) {
  const now = Date.now();
  const due = (iso) => iso != null && Date.parse(iso) <= now;
  const live = (key) =>
    (tables.jobs ?? []).some(
      (job) => job.dedupe_key === key && ["scheduled", "fired"].includes(job.state ?? "scheduled"),
    );
  const write = (source, kind, payload, parts) => {
    const key = [kind, source.tenant_id, ...parts].join(":");
    if (live(key)) return 0;
    (tables.jobs ??= []).push({
      id: crypto.randomUUID(),
      tenant_id: source.tenant_id,
      kind,
      state: "scheduled",
      due_at: new Date(now).toISOString(),
      payload,
      attempts: 0,
      lane: 2,
      dedupe_key: key,
      dedupe_kept: false,
    });
    return 1;
  };
  const out = { reads: 0, walks: 0, again: 0 };
  for (const source of tables.media_sources ?? []) {
    if (["watching", "frozen"].includes(source.state) && due(source.next_read_at))
      out.reads += write(source, "source_read", { source_id: source.id }, [source.id]);
    if (source.state === "watching" && source.walk_kind == null && due(source.next_walk_at)) {
      const run = String(source.walk_run + 1);
      out.walks += write(source, "source_walk", { source_id: source.id, run, step: "0", walk: "reconcile" }, [
        source.id,
        run,
        "0",
      ]);
    }
    const stale =
      source.walk_touched_at != null && Date.parse(source.walk_touched_at) < now - p_walk_stale_seconds * 1000;
    if (source.walk_kind != null && ["setting_up", "watching"].includes(source.state) && stale) {
      const run = String(source.walk_run);
      const step = `again-${Math.floor(now / 3_600_000) * 3600}`;
      out.again += write(source, "source_walk", { source_id: source.id, run, step, walk: source.walk_kind }, [
        source.id,
        run,
        step,
      ]);
    }
    const idle = Date.parse(source.updated_at) < now - p_walk_stale_seconds * 1000;
    if (source.state === "setting_up" && source.walk_kind == null && idle) {
      const run = String(source.walk_run + 1);
      const walk = source.walk_run === 0 ? "snapshot" : "reconcile";
      out.again += write(source, "source_walk", { source_id: source.id, run, step: "0", walk }, [source.id, run, "0"]);
    }
  }
  return out;
}

/**
 * A world: its tables, its database, its Vault and its Drive. `source` seeds a watched folder (false for none);
 * `tables` adds or replaces whole tables.
 */
export function world({ source = {}, tables: more = {}, faults = {}, rpcs: moreRpcs = {} } = {}) {
  const drive = fakeDrive();
  const tables = {
    tenants: [rows.tenant({ id: T }), rows.tenant({ id: OTHER, slug: "other-studio" })],
    tenant_config: [rows.config({ tenant_id: T, config: { features: { video_preview: true } } })],
    memberships: [rows.membership({ tenant_id: T, user_id: OWNER, role: "owner" })],
    source_connections: [
      rows.sourceConnection({
        id: CONNECTION,
        tenant_id: T,
        provider_account: "google-sub-1",
        email: "owner@example.com",
        connected_by: OWNER,
        credentials_ref: `source-creds-${CONNECTION}`,
      }),
    ],
    media_sources: source === false ? [] : [sourceRow(source)],
    source_items: [],
    jobs: [],
    ...more,
  };
  // What the code writes takes the tables' defaults (00639, 00641, the ledger's), as the database gives them.
  tables.media_sources = withDefaults(tables.media_sources, () => {
    const { id: _id, tenant_id: _tenant, connection_id: _connection, folder_id: _folder, ...rest } = sourceRow();
    return rest;
  });
  tables.source_items = withDefaults(tables.source_items, ITEM_DEFAULTS);
  tables.source_connections = withDefaults(tables.source_connections, () => ({
    provider_account: null,
    email: null,
    scopes: [],
    credentials_ref: null,
  }));
  tables.jobs = withDefaults(tables.jobs, () => ({ state: "scheduled", attempts: 0 }));
  const vault = new Map([
    [
      CONNECTION,
      {
        refresh_token: "refresh-token-1",
        access_token: "access-token-1",
        expires_at: Date.now() + 3_000_000,
        scope: "drive",
      },
    ],
  ]);
  const rpcs = {
    source_credentials_get: ({ p_connection_id }) => vault.get(p_connection_id) ?? null,
    source_credentials_put: ({ p_connection_id, p_secret, p_if_refresh_token }) => {
      const kept = vault.get(p_connection_id);
      if (p_if_refresh_token && kept?.refresh_token !== p_if_refresh_token)
        throw Object.assign(new Error("the token changed since it was read"), { code: "40001" });
      vault.set(p_connection_id, p_secret);
      const row = tables.source_connections.find((connection) => connection.id === p_connection_id);
      if (row) row.credentials_ref = `source-creds-${p_connection_id}`;
      return `source-creds-${p_connection_id}`;
    },
    source_credentials_drop: ({ p_connection_id }) => vault.delete(p_connection_id),
    sources_hand_out: (args) => handOut(tables, args),
    ...moreRpcs,
  };
  const db = fakeDb(tables, faults, rpcs);
  globalThis.fetch = drive.fetch;
  return {
    drive,
    tables,
    db,
    vault,
    faults,
    source: () => tables.media_sources.find((row) => row.id === SOURCE),
    items: () => tables.source_items.filter((row) => row.source_id === SOURCE),
    item: (providerId) => tables.source_items.find((row) => row.source_id === SOURCE && row.provider_id === providerId),
    jobs: (kind) => tables.jobs.filter((job) => job.kind === kind),
    /** The jobs of a kind still to run: a row the code wrote names no state, and the database's default is scheduled. */
    waiting: (kind) => tables.jobs.filter((job) => job.kind === kind && (job.state ?? "scheduled") === "scheduled"),
    restore: () => {
      globalThis.fetch = NO_NETWORK;
    },
  };
}

const { sourcesReader } = await import(at("apps/edge/lib/files/sources/sweep.ts"));

/**
 * The footage jobs on the ledger, run as the ledger runs them, until none is left that is due (`rounds` at most, so a
 * walk that keeps handing itself on stops a test rather than hanging it). Answers what each job answered. `roomMs` is
 * how long each job is given before its deadline.
 */
export async function runJobs(w, { rounds = 50, roomMs = 40_000, kinds = ["source_walk", "source_read"] } = {}) {
  const reader = sourcesReader(w.db);
  const answers = [];
  for (let round = 0; round < rounds; round++) {
    // A row the code wrote names no state: the database's default is scheduled.
    const job = w.tables.jobs.find(
      (row) =>
        (row.state ?? "scheduled") === "scheduled" &&
        kinds.includes(row.kind) &&
        Date.parse(row.due_at) <= Date.now() + 1000,
    );
    if (!job) return answers;
    job.state = "fired";
    job.attempts = (job.attempts ?? 0) + 1;
    try {
      const run = job.kind === "source_walk" ? reader.walk : reader.read;
      answers.push({ kind: job.kind, payload: job.payload, ...(await run(job, Date.now() + roomMs)) });
      job.state = "done";
    } catch (error) {
      job.state = "failed";
      throw error;
    }
  }
  throw new Error(`the footage jobs did not come to rest in ${rounds} rounds`);
}

/** One job of a kind put on the ledger by hand, as its writer would, due now. */
export function schedule(w, kind, payload, parts) {
  w.tables.jobs.push({
    id: crypto.randomUUID(),
    tenant_id: T,
    kind,
    state: "scheduled",
    due_at: new Date().toISOString(),
    payload,
    attempts: 0,
    lane: 2,
    dedupe_key: [kind, T, ...parts].join(":"),
    dedupe_kept: false,
  });
}

/** The first walk of the world's folder, asked for as a watch asks for it, and run to its end. */
export async function firstWalk(w) {
  schedule(w, "source_walk", { source_id: SOURCE, run: "1", step: "0", walk: "snapshot" }, [SOURCE, "1", "0"]);
  return runJobs(w);
}
