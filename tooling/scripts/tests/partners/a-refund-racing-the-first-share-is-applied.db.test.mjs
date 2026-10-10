/**
 * A refund that races its invoice's first share is applied, whichever commits first (00365), on a real database.
 *
 * partner_reverse looks for the invoice's share and, finding none, parks the reversal for partner_earn to apply when
 * the share is written. Two webhooks in flight at once used to lose it: a share written and not yet committed is
 * invisible to the reversal, which parked itself after partner_earn had already read what was parked, so nothing ever
 * applied it and the sweep forgot it after 120 days, the partner keeping a refunded invoice's share. And the other
 * way: a reversal parked and not yet committed is invisible to partner_earn. Both now take the invoice's one lock for
 * their transaction before they read.
 *
 * Proved by holding one door's transaction open (a `do` block that calls it, then sleeps) through the Supabase CLI, and
 * calling the other on its own connection while the first still holds: the second asks first that the first is still
 * open, so the race is the one being run. Then the ledger is read: the share, the refund, and nothing parked. Runs the
 * way events-name-their-request.db.test.mjs runs the CLI (SUPABASE_CLI names the binary when `supabase` is not on PATH,
 * SUPABASE_DB_URL the database when the environment names one on this machine); never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a partner, a workspace and earnings"
      : false;

const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}${r.error?.message ?? ""}`);
  return r.data;
};

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PAID = "2026-08-01T12:00:00Z";
/** How long the first door's transaction stays open: past the CLI's start for the second, which then waits on it. */
const HOLD_S = 10;

let db;
let T; // the workspace the partner brought
let partnerId;
let userId;

/** One statement through the CLI, as the database's own user: its rows, or the failure it printed. */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`${CLI} db query failed: ${[r.stderr, r.stdout].join("\n").trim().slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

/** One statement through the CLI, left running: settles with how it ended. */
function running(sql) {
  return new Promise((resolve) => {
    const child = spawn(CLI, ["db", "query", ...CLI_TARGET, sql], { cwd: ROOT });
    let said = "";
    child.stdout.on("data", (d) => (said += d));
    child.stderr.on("data", (d) => (said += d));
    child.on("close", (status) => resolve({ status, said }));
  });
}

/** The words that find the held transaction in pg_stat_activity, spelt so no other query's text holds them whole. */
const heldBy = (tag) => `'%' || 'held-' || '${tag}-${RUN}' || '%'`;
const isHeld = (tag) =>
  `exists (select 1 from pg_stat_activity where query like ${heldBy(tag)} and pid <> pg_backend_pid() and state = 'active')`;

/**
 * Holds `first` open (it runs, then the transaction sleeps), and once it is sleeping runs `second` on its own
 * connection, which first asks that `first` is still open: the race, run. Settles when both have.
 */
async function race(tag, first, second) {
  const held = running(`do $$ begin ${first} perform pg_sleep(${HOLD_S}); end $$ /* held-${tag}-${RUN} */`);
  const deadline = Date.now() + HOLD_S * 1000;
  for (;;) {
    const [row] = query(
      `select count(*)::int as n from pg_stat_activity where query like ${heldBy(tag)} and wait_event = 'PgSleep'`,
    );
    if (row?.n >= 1) break;
    assert.ok(Date.now() < deadline, `${tag}: the first door's transaction never got to its sleep`);
  }
  query(`do $$ begin
    if not ${isHeld(tag)} then
      raise exception 'the first door''s transaction ended before the second came: no race was run';
    end if;
    ${second}
  end $$`);
  const first_ = await held;
  assert.equal(first_.status, 0, `${tag}: the held door failed: ${first_.said.slice(-600)}`);
}

const earn = (invoice, event) =>
  `perform public.partner_earn('${T}', '${invoice}', '${event}', 40000, 'usd', '${PAID}');`;
const refund = (invoice, event) => `perform public.partner_reverse('${invoice}', '${event}', 'refund', 10000);`;

async function ledgerOf(invoice) {
  const earned = ok(
    await db
      .from("partner_earnings")
      .select("kind, earned_cents")
      .eq("stripe_invoice_id", invoice)
      .order("created_at")
      .order("kind", { ascending: false }),
  );
  const parked = ok(
    await db.from("partner_reversals_waiting").select("stripe_event_id").eq("stripe_invoice_id", invoice),
  );
  return { earned: earned.map((e) => [e.kind, e.earned_cents]), parked: parked.map((p) => p.stripe_event_id) };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const made = await db.auth.admin.createUser({
    email: `race-partner-${RUN}@example.com`,
    password: `pw-${RUN}-Aa1!`,
    email_confirm: true,
  });
  assert.equal(made.error, null, made.error?.message);
  userId = made.data.user.id;
  const code = `race-${RUN}`;
  partnerId = ok(await db.from("partners").insert({ user_id: userId, code }).select("id").single()).id;
  T = ok(
    await db
      .from("tenants")
      .insert({ slug: `race-${RUN}`, name: "Race Studio" })
      .select("id")
      .single(),
  ).id;
  ok(await db.from("partner_tenants").insert({ tenant_id: T, partner_id: partnerId, code_used: code }));
});

after(async () => {
  if (skip || !partnerId) return;
  await db.from("partner_reversals_waiting").delete().like("stripe_invoice_id", `in_race_%_${RUN}`);
  await db.from("partner_earnings").delete().eq("partner_id", partnerId);
  await db.from("partner_tenants").delete().eq("partner_id", partnerId);
  if (T) {
    await db.from("events").delete().eq("tenant_id", T);
    await db.from("tenants").delete().eq("id", T);
  }
  await db.from("partners").delete().eq("id", partnerId);
  await db.auth.admin.deleteUser(userId).catch(() => {});
});

test(
  "a refund that arrives while the invoice's first share is being written waits for it, and takes its part of the share",
  { skip },
  async () => {
    const invoice = `in_race_a_${RUN}`;
    await race("share", earn(invoice, `evt_race_a_share_${RUN}`), refund(invoice, `evt_race_a_refund_${RUN}`));
    assert.deepEqual(await ledgerOf(invoice), {
      earned: [
        ["share", 10000],
        ["refund", -2500],
      ],
      parked: [],
    });
  },
);

test(
  "a share written while a refund of its invoice is being parked waits for it, and applies it",
  { skip },
  async () => {
    const invoice = `in_race_b_${RUN}`;
    await race("refund", refund(invoice, `evt_race_b_refund_${RUN}`), earn(invoice, `evt_race_b_share_${RUN}`));
    assert.deepEqual(await ledgerOf(invoice), {
      earned: [
        ["share", 10000],
        ["refund", -2500],
      ],
      parked: [],
    });
  },
);
