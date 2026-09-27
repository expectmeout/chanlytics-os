/**
 * The nightly's own workspace, converged against a database in memory.
 *
 * e2e-workspace.mjs runs every night against production with the service role,
 * so what it may touch is the whole question. These run it: twice, to see that
 * nothing duplicates; after the specs have left things behind, to see them put
 * back; and against the accounts and workspaces it must refuse, to see that it
 * writes nothing there. The rows it writes are checked against the states the
 * production sweeps leave alone, and its one alert address against the edge's
 * own rule for who is told.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { TenantConfigWriteSchema } from "@chanlytics/contracts";
import {
  converge,
  verify,
  SLUG,
  CALL_ID,
  PEOPLE,
  ALERT_INBOX,
  channelExternalId,
  SAID_YES_TO_MESSAGES,
  SAID_YES_TO_OFFERS,
  LEADS,
  LEAD_SEARCH,
  LEAD_COUNTED,
  WAITING_SEARCH,
  WAITING_ROUND,
  WAITING_LEADS,
  WAITING_FOR_MS,
  ALL_LEAD_PLACES,
} from "../../e2e-workspace.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chooseAddressing, reachesTenant } = await import(
  pathToFileURL(path.join(here, "../../../../apps/edge/lib/ops/notify.ts")).href
);
const { planLeadSweep, QUESTION_WAIT_MS } = await import(
  pathToFileURL(path.join(here, "../../../../apps/edge/lib/leads/lead-sweep.ts")).href
);

const OWNER = "e2e-owner@example.com";
const MATE = "e2e-member@example.com";
const NOW = Date.parse("2026-09-14T09:00:00Z");
const MODES = {
  faq: "auto",
  booking: "auto",
  reply: "auto",
  reengage: "ask",
  campaign: "ask",
  reviews: "ask",
  money: "never",
  follow_up: "ask",
};

/** The moves 00140's lead_rounds_guard allows, and nothing else. */
const ROUND_MOVES = {
  queued: ["probing", "running", "ended"],
  probing: ["waiting_on_owner", "running", "checking", "ended"],
  waiting_on_owner: ["running", "ended"],
  running: ["checking", "ended"],
  checking: ["ended"],
  ended: [],
};

/**
 * lead_rounds as the database keeps it: 00140's guard (a round starts queued and moves only as it allows) and
 * 00163's lead_rounds_notify (a round that stops to ask, or ends with anything but stopped or question_unanswered,
 * gets its bell row -- unless one of that kind for that round is already there -- and a push_send job with it).
 * The trigger is AFTER UPDATE, so it reads the row once the whole update has landed. `moves` records every state
 * a round passed through, with the row as it stood, so a test can put each one in front of the sweep.
 */
function roundsTable(t, moves) {
  const notify = (r) => {
    const search = (t.lead_searches ?? []).find((s) => s.id === r.search_id);
    if (!search) return;
    const kind =
      r.state === "waiting_on_owner"
        ? "leads_question"
        : r.state === "ended" && !["stopped", "question_unanswered"].includes(r.ending)
          ? "leads_ready"
          : null;
    if (!kind) return;
    const bell = (t.notifications ??= []);
    if (bell.some((n) => n.tenant_id === r.tenant_id && n.kind === kind && n.subject_id === r.id)) return;
    const id = crypto.randomUUID();
    bell.push({ id, tenant_id: r.tenant_id, kind, title: `from the trigger: ${search.name}`, subject_id: r.id });
    (t.jobs ??= []).push({
      id: crypto.randomUUID(),
      tenant_id: r.tenant_id,
      kind: "push_send",
      payload: { notification_id: id },
    });
  };
  const guarded = (row) => {
    if (row.state !== "queued") throw new Error(`a round starts queued (${row.state} refused)`);
    moves.push({ ...row });
    return new Proxy(row, {
      set(target, key, value) {
        if (key === "state" && value !== target.state) {
          if (!ROUND_MOVES[target.state].includes(value))
            throw new Error(`lead_rounds.state ${target.state} -> ${value} refused`);
          target.state = value;
          queueMicrotask(() => {
            moves.push({ ...target });
            notify(target);
          });
          return true;
        }
        target[key] = value;
        return true;
      },
    });
  };
  const rows = [];
  rows.push = (...made) => Array.prototype.push.apply(rows, made.map(guarded));
  return rows;
}

/** A database in memory, an auth admin, and provision_tenant as the migrations write it. */
function world(tables = {}) {
  // The platform's one row exists on every database release A touched; the seed
  // adds this workspace to tenants_on and must never flip searches_on.
  const moves = [];
  const t = {
    tenants: [],
    memberships: [],
    lead_platform: [{ id: true, searches_on: false, tenants_on: [] }],
    ...tables,
  };
  t.lead_rounds = roundsTable(t, moves);
  const users = [];
  const db = fakeDb(
    t,
    {},
    {
      provision_tenant: ({ p_tenant_id }) => {
        const rows = (name) => (t[name] ??= []);
        for (const [cls, mode] of Object.entries(MODES)) {
          if (!rows("policies").some((p) => p.tenant_id === p_tenant_id && p.class === cls && p.subject_type == null)) {
            rows("policies").push({
              id: crypto.randomUUID(),
              tenant_id: p_tenant_id,
              class: cls,
              mode,
              subject_type: null,
              subject_id: null,
              limits: {},
            });
          }
        }
        if (!rows("tenant_config").some((r) => r.tenant_id === p_tenant_id))
          rows("tenant_config").push({ tenant_id: p_tenant_id, config: {}, version: 1 });
        if (!rows("billing_accounts").some((r) => r.tenant_id === p_tenant_id))
          rows("billing_accounts").push({ tenant_id: p_tenant_id, mode: "stripe", status: "none" });
        return null;
      },
    },
  );
  db.auth = {
    admin: {
      listUsers: async ({ page }) => ({ data: { users: page === 1 ? users.map((u) => ({ ...u })) : [] }, error: null }),
      createUser: async ({ email }) => {
        const user = { id: crypto.randomUUID(), email };
        users.push(user);
        return { data: { user }, error: null };
      },
    },
  };
  return { db, t, users, moves };
}

const run = (w, over = {}) => converge(w.db, { ownerEmail: OWNER, memberEmail: MATE, apply: true, now: NOW, ...over });
const of = (t, table, tenantId) => (t[table] ?? []).filter((r) => r.tenant_id === tenantId);

test("converging twice leaves one workspace in one state: nothing is duplicated", async () => {
  const w = world();
  const first = await run(w);
  await run(w, { now: NOW + 86_400_000 });
  const T = first.tenantId;
  assert.equal(w.t.tenants.filter((x) => x.slug === SLUG).length, 1);
  assert.equal(w.users.length, 2, "two test users, made once");
  assert.deepEqual(
    of(w.t, "memberships", T)
      .map((m) => m.role)
      .sort(),
    ["operator", "owner"],
  );
  assert.deepEqual(
    of(w.t, "contacts", T)
      .map((c) => c.phone_e164)
      .sort(),
    PEOPLE.map((p) => p.phone).sort(),
  );
  assert.equal(of(w.t, "contact_identities", T).length, PEOPLE.length);
  assert.equal(of(w.t, "conversations", T).length, 1);
  assert.deepEqual(
    of(w.t, "messages", T)
      .map((m) => `${m.sender}:${m.status}`)
      .sort(),
    ["ai:delivered", "customer:received"],
  );
  assert.equal(of(w.t, "calls", T).length, 1);
  assert.equal(of(w.t, "tenant_channels", T).length, 1);
  assert.deepEqual(
    of(w.t, "tenant_config", T).map((r) => r.config.notifications),
    [{ escalation_emails: [ALERT_INBOX] }],
    "one config, with one address",
  );
  const owner = w.users.find((u) => u.email === OWNER);
  assert.equal(
    w.t.memberships.filter((m) => m.user_id === owner.id).length,
    1,
    "the owner belongs to exactly one workspace",
  );
});

test("every row it writes is one the production sweeps leave alone", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const [channel] = of(w.t, "tenant_channels", T);
  assert.equal(channel.external_id, channelExternalId(T));
  assert.doesNotMatch(
    channel.external_id,
    /^\+?\d+$/,
    "no id a real WhatsApp number could have, which would send on the pilot's own number",
  );
  assert.equal(channel.credentials_ref, null);
  assert.equal(channel.waba_id, null);
  const [billing] = of(w.t, "billing_accounts", T);
  assert.deepEqual(
    [billing.mode, billing.status, billing.stripe_customer_id],
    ["direct", "active", null],
    "no Stripe event can reach it",
  );
  const [call] = of(w.t, "calls", T);
  assert.equal(call.retell_call_id, CALL_ID);
  assert.deepEqual(
    [call.status, call.conversation_id, call.message_id, call.recording],
    ["ended", null, null, null],
    "nothing for the call sweep to note or fetch",
  );
  assert.ok(call.transcript_object.length > 0 && call.notified_at);
  const [cv] = of(w.t, "conversations", T);
  assert.deepEqual(
    [cv.state, cv.paused_until, cv.snooze_until],
    ["open", null, null],
    "nothing timed for a pause or snooze sweep",
  );
  assert.ok(
    of(w.t, "messages", T).every((m) => m.status !== "queued"),
    "nothing waiting to send",
  );
  const [cfg] = of(w.t, "tenant_config", T);
  assert.ok(TenantConfigWriteSchema.safeParse(cfg.config).success, "a config the settings save accepts");
  assert.equal(cfg.config.calendar, undefined, "no calendar for the hourly sweep to fetch");
  assert.deepEqual(
    cfg.config.notifications,
    { escalation_emails: [ALERT_INBOX] },
    "one address an alert can go to, and it is Resend's test inbox",
  );
  for (const table of [
    "jobs",
    "escalations",
    "lines",
    "playbooks",
    "broadcasts",
    "google_connections",
    "google_listings",
  ]) {
    assert.equal(of(w.t, table, T).length, 0, `no ${table}`);
  }

  // The lead rounds: every state each one passed through while the seed wrote it, and where they stand, put in
  // front of the leads sweep as cron/leads.ts reads them (no run is live: the seed starts none). Nothing is ended
  // as stuck on the way, and the round that waits is left alone for the day the product gives a question.
  const live = new Set(of(w.t, "lead_searches", T).map((x) => x.id));
  const rounds = of(w.t, "lead_rounds", T).filter((r) => live.has(r.search_id));
  const asSwept = (r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    state: r.state,
    waiting_since: r.waiting_since ?? null,
    created_at: r.created_at,
  });
  for (const r of w.moves.filter((m) => live.has(m.search_id)))
    assert.deepEqual(
      planLeadSweep({ runs: [], rounds: [asSwept(r)] }, NOW),
      [],
      `a sweep that ran while a round was ${r.state} left it alone`,
    );
  const waitingRound = rounds.find((r) => r.state === "waiting_on_owner");
  assert.ok(waitingRound, "one round waits on the owner");
  const beforeTheDay = NOW - WAITING_FOR_MS + QUESTION_WAIT_MS - 60_000;
  assert.deepEqual(
    planLeadSweep({ runs: [], rounds: rounds.map(asSwept) }, beforeTheDay),
    [],
    "no sweep touches a lead round until the question has waited a day, well past the morning's specs",
  );
  assert.deepEqual(
    planLeadSweep({ runs: [], rounds: [asSwept(waitingRound)] }, beforeTheDay + 120_000).map((a) => a.kind),
    ["end_question"],
    "and a day on it would end, as any question nobody answered: the next morning's seed rebuilds it first",
  );
  // 00163's trigger rang for both rounds, and found the seed's own row each time: no push job was queued.
  assert.deepEqual(
    of(w.t, "notifications", T)
      .map((n) => n.kind)
      .sort(),
    ["leads_question", "leads_ready"],
    "one bell row per round, the seed's",
  );
  assert.ok(
    of(w.t, "notifications", T).every((n) => !n.title.startsWith("from the trigger")),
    "the trigger wrote none of them, so it queued no push_send",
  );
});

test("the people said yes to messages and nobody to offers: the state Today's band, People's steps and the QR's door exist to answer", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const people = of(w.t, "contacts", T);
  assert.ok(people.length >= 3, "a list the product calls a list starts at three (todayLeaks' floor)");
  for (const p of people) {
    assert.equal(p.consent, SAID_YES_TO_MESSAGES);
    assert.equal(p.consent_source, "in_person", "a source the People page can name");
    assert.equal(
      p.consent_updated_at,
      new Date(NOW - 7 * 86_400_000).toISOString(),
      "dated from the run, so every night is the same week",
    );
    assert.equal(p.marketing_consent, SAID_YES_TO_OFFERS);
    assert.equal(p.marketing_consent, "unknown", "nobody said yes to offers, so no promotional send has an audience");
  }
  assert.deepEqual(
    await verify(w.db, T, w.users.find((u) => u.email === OWNER).id),
    [],
    "the seeded state passes its own check",
  );
});

test("a spec that recorded a yes to offers is put back, and verify() names the drift before any spec reads it", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const owner = w.users.find((u) => u.email === OWNER).id;
  const [robin, casey] = of(w.t, "contacts", T);
  // What a spec -- or a person poking at the nightly's workspace -- could leave: an offers yes, a withdrawn yes.
  robin.marketing_consent = "opted_in";
  casey.consent = "opted_out";
  const said = await verify(w.db, T, owner);
  assert.ok(said.includes("someone in the workspace has said yes to offers"), said.join(" | "));
  assert.ok(said.includes("fewer than three people have said yes to messages"), said.join(" | "));
  await run(w, { now: NOW + 86_400_000 });
  assert.deepEqual(await verify(w.db, T, owner), [], "the next run puts both back");
  assert.ok(
    of(w.t, "contacts", T).every(
      (p) => p.consent === SAID_YES_TO_MESSAGES && p.marketing_consent === SAID_YES_TO_OFFERS,
    ),
  );
});

test("the one alert address is Resend's test inbox: a failed reply's alert goes there by the edge's own rule, and the deadman has someone to tell", async () => {
  assert.equal(
    ALERT_INBOX,
    "delivered@resend.dev",
    "the address Resend documents as a simulated delivery, which reaches nobody",
  );
  const w = world();
  const { tenantId: T } = await run(w);
  const [cfg] = of(w.t, "tenant_config", T);
  const target = { tenantId: T, notifications: cfg.config.notifications, isEnvDefault: false };
  const platform = { to: ["platform@example.com"], from: "Chanlytics <alerts@example.com>" };

  // thread.spec.ts's reply fails at this channel and the job alerts the owner
  // (job-alert.ts): addressed to the workspace, in full, at the test inbox.
  const addressed = chooseAddressing(target, platform);
  assert.equal(addressed.kind, "tenant");
  assert.deepEqual(addressed.to, [ALERT_INBOX]);
  assert.equal(
    addressed.from,
    platform.from,
    "no sender of its own: the platform's verified one, which Resend accepts",
  );
  // Without it the same alert is a notice in the platform's own mailbox, every night.
  assert.equal(chooseAddressing({ ...target, notifications: null }, platform).kind, "redacted");

  // The deadman pages the platform only for a workspace with nobody to tell (cron/deadman.ts).
  const saved = { LEAD_TO: process.env.LEAD_TO, LEAD_FROM: process.env.LEAD_FROM };
  process.env.LEAD_TO = platform.to[0];
  process.env.LEAD_FROM = platform.from;
  try {
    assert.equal(
      reachesTenant(target),
      true,
      "an escalation left open is warned about in the test inbox, and the platform is not paged",
    );
    assert.equal(reachesTenant({ ...target, notifications: null }), false);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  // An address anywhere else is named, never taken for the known state.
  cfg.config = { ...cfg.config, notifications: { escalation_emails: ["owner@a-real-business.com"] } };
  const owner = w.users.find((u) => u.email === OWNER);
  assert.ok(
    (await verify(w.db, T, owner.id)).some((p) => p.includes(ALERT_INBOX)),
    "verify names alerts that would reach a person",
  );
});

test("what the specs leave behind is put back", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const owner = w.users.find((u) => u.email === OWNER);
  // A night's leftovers: a person a spec added, a thread and an Ask chat, a
  // renamed profile, a saved view, a changed mode, an invitation, a probe, and
  // an alert address somebody set.
  w.t.contacts.push({ id: "stray", tenant_id: T, phone_e164: "+12125550199", display_name: "Stray" });
  w.t.conversations.push({ id: "stray-cv", tenant_id: T, contact_id: "stray", state: "needs_human" });
  w.t.messages.push({
    id: "stray-m",
    tenant_id: T,
    conversation_id: "stray-cv",
    sender: "customer",
    status: "received",
  });
  (w.t.ask_threads ??= []).push({ id: "chat", tenant_id: T, user_id: owner.id });
  w.t.profiles.find((p) => p.user_id === owner.id).display_name = "Ruben Test";
  w.t.memberships.find((m) => m.user_id === owner.id).views = { people: { attentionTab: "active" } };
  w.t.policies.find((p) => p.tenant_id === T && p.class === "reply").mode = "ask";
  w.t.policies.push({
    id: "per-person",
    tenant_id: T,
    class: "reply",
    mode: "never",
    subject_type: "contact",
    subject_id: "stray",
  });
  (w.t.invitations ??= []).push({
    id: "inv",
    tenant_id: "elsewhere",
    email: OWNER,
    accepted_at: null,
    revoked_at: null,
  });
  w.t.tenants.push({ id: "probe", slug: "e2e-probe-1", name: "E2E probe 1757840000000" });
  w.t.memberships.push({ id: "pm", tenant_id: "probe", user_id: owner.id, role: "owner" });
  // A deal a spec recorded on a seeded person, and the one a proposal link opened on the stray (0004, 0008).
  const robin = of(w.t, "contacts", T).find((c) => c.display_name === PEOPLE[0].name);
  (w.t.deals ??= []).push(
    {
      id: "deal-robin",
      tenant_id: T,
      contact_id: robin.id,
      stage: "proposed",
      proposal_url: "https://docs.example.com/p/r",
    },
    { id: "deal-stray", tenant_id: T, contact_id: "stray", stage: "won" },
    { id: "deal-elsewhere", tenant_id: "elsewhere", contact_id: "someone", stage: "won" },
  );
  const cfg = w.t.tenant_config.find((r) => r.tenant_id === T);
  cfg.config = { ...cfg.config, notifications: { escalation_emails: ["owner@a-real-business.com"] } };

  await run(w, { now: NOW + 3_600_000 });

  assert.deepEqual(
    of(w.t, "contacts", T)
      .map((c) => c.display_name)
      .sort(),
    PEOPLE.map((p) => p.name).sort(),
  );
  assert.equal(of(w.t, "conversations", T).length, 1);
  assert.equal(of(w.t, "messages", T).length, 2);
  assert.equal(of(w.t, "ask_threads", T).length, 0);
  assert.equal(of(w.t, "deals", T).length, 0, "every run starts from no deal");
  assert.equal(of(w.t, "deals", "elsewhere").length, 1, "and another workspace's deal is not touched");
  assert.equal(w.t.profiles.find((p) => p.user_id === owner.id).display_name, "");
  assert.deepEqual(w.t.memberships.find((m) => m.user_id === owner.id && m.tenant_id === T).views, {});
  assert.equal(
    w.t.policies.find((p) => p.tenant_id === T && p.class === "reply" && p.subject_type == null).mode,
    "auto",
  );
  assert.equal(w.t.policies.filter((p) => p.tenant_id === T && p.subject_type === "contact").length, 0);
  assert.ok(w.t.invitations[0].revoked_at, "an invitation that sign-in would accept is taken back");
  assert.equal(
    w.t.tenants.some((x) => x.id === "probe"),
    false,
    "the probe workspace-create left is gone",
  );
  assert.deepEqual(
    of(w.t, "tenant_config", T)[0].config.notifications,
    { escalation_emails: [ALERT_INBOX] },
    "the alerts go back to the test inbox",
  );
  const [cv] = of(w.t, "conversations", T);
  assert.equal(
    cv.last_message_at,
    new Date(NOW + 3_600_000 - 2 * 3600_000 + 20_000).toISOString(),
    "re-dated, so Reports counts it",
  );
});

test("it refuses what it must not reset, and writes nothing there", async () => {
  await assert.rejects(
    converge(world().db, { ownerEmail: "ruben@rjcapital.io", memberEmail: MATE, apply: true }),
    /example\.com/,
  );
  await assert.rejects(converge(world().db, { ownerEmail: OWNER, memberEmail: OWNER, apply: true }), /two addresses/);

  // The owner belongs to a real workspace: refused before any write.
  const w = world();
  await run(w);
  const owner = w.users.find((u) => u.email === OWNER);
  w.t.tenants.push({ id: "real", slug: "a-real-business", name: "A Real Business" });
  w.t.memberships.push({ id: "rm", tenant_id: "real", user_id: owner.id, role: "operator" });
  const before = JSON.stringify(w.t);
  await assert.rejects(run(w), /also belongs to A Real Business/);
  assert.equal(JSON.stringify(w.t), before, "nothing written");

  // Someone else is a member of the workspace: refused.
  const w2 = world();
  const { tenantId } = await run(w2);
  w2.t.memberships.push({ id: "sm", tenant_id: tenantId, user_id: "someone-real", role: "viewer" });
  const before2 = JSON.stringify(w2.t);
  await assert.rejects(run(w2), /besides the two test users/);
  assert.equal(JSON.stringify(w2.t), before2, "nothing written");
});

test("a dry run reads, and writes nothing", async () => {
  const w = world();
  const before = JSON.stringify(w.t);
  const report = await converge(w.db, { ownerEmail: OWNER, memberEmail: MATE, apply: false, now: NOW });
  assert.equal(JSON.stringify(w.t), before);
  assert.equal(w.users.length, 0, "no user made");
  assert.ok(report.did.some((line) => line.includes(`would create ${SLUG}`)));
});

test("a run backs the workspace up before it writes", async () => {
  const w = world();
  await run(w);
  let backedUp = null;
  const snapshotAtBackup = [];
  await converge(w.db, {
    ownerEmail: OWNER,
    memberEmail: MATE,
    apply: true,
    now: NOW,
    backup: async (rows) => {
      backedUp = rows;
      snapshotAtBackup.push(JSON.stringify(w.t.messages));
    },
  });
  assert.ok(backedUp.some((r) => r.table === "messages") && backedUp.some((r) => r.table === "tenants"));
  assert.ok(snapshotAtBackup[0].includes("e2e-seed-a-in"), "taken while the old rows were still there");
  assert.ok(
    backedUp.some((r) => r.table === "tenant_config"),
    "the config, alert address and all, is in the backup",
  );
});

test("the lead seed is nine fictional places in one finished search and one waiting on its owner, and the workspace may search while the switch is off", async () => {
  const w = world();
  await run(w);
  const T = w.t.tenants[0].id;
  assert.deepEqual(
    w.t.leads.map((l) => l.business_name).sort(),
    [...LEADS, ...WAITING_LEADS].map((l) => l.business_name).sort(),
  );
  assert.deepEqual(w.t.leads.map((l) => l.place_id).sort(), [...ALL_LEAD_PLACES].sort());
  for (const l of w.t.leads) {
    assert.match(l.phone_e164, /^\+1\d{3}55501\d{2}$/, `${l.business_name}: the fiction range`);
    if (l.email) assert.match(l.email, /\.example$/, `${l.business_name}: a fictional address`);
    if (l.website_host) assert.match(l.website_host, /\.example$/, `${l.business_name}: a fictional site`);
    assert.match(l.place_id, /^ChIJfixture\d{4}$/);
  }
  assert.deepEqual(w.t.lead_searches.map((x) => x.name).sort(), [LEAD_SEARCH.name, WAITING_SEARCH.name].sort());
  const roundOf = (name) => {
    const search = w.t.lead_searches.find((x) => x.name === name);
    return w.t.lead_rounds.find((r) => r.search_id === search.id);
  };
  const done = roundOf(LEAD_SEARCH.name);
  assert.deepEqual(
    [done.state, done.ending, done.seq],
    ["ended", "target_reached", 1],
    "written queued, then ended: lead_rounds_guard refuses an ended insert",
  );
  const waits = roundOf(WAITING_SEARCH.name);
  assert.deepEqual(
    w.moves.filter((m) => m.id === waits.id).map((m) => m.state),
    ["queued", "probing", "waiting_on_owner"],
    "walked as the runner walks it: the guard allows no shorter way into waiting",
  );
  assert.equal(waits.state, "waiting_on_owner");
  assert.equal(waits.ending ?? null, null, "waiting is not an ending");
  assert.deepEqual(
    Object.keys(waits.question).sort(),
    ["asked_at", "criterionKey", "dropTerm", "sentence"],
    "core's RoundQuestion, camelCase, as the runner writes it",
  );
  assert.equal(waits.question.sentence, WAITING_ROUND.question.sentence);
  assert.equal(waits.waiting_since, new Date(NOW - WAITING_FOR_MS).toISOString());
  assert.equal(waits.question.asked_at, waits.waiting_since);
  assert.ok(
    waits.plan.exclusions.some((x) => x.key === waits.question.criterionKey),
    "the question is about one of the plan's own exclusions, so the strip can offer to include it",
  );
  assert.ok(Date.parse(waits.created_at) <= Date.parse(waits.waiting_since), "asked before it waited");
  const members = (id) => w.t.lead_search_members.filter((m) => m.round_id === id);
  assert.deepEqual(
    members(done.id)
      .map((m) => [m.class, m.counted])
      .sort(),
    [
      ["excluded", false],
      ["qualified", true],
      ["qualified", true],
      ["qualified", true],
      ["review", false],
      ["review", false],
    ].sort(),
  );
  assert.deepEqual(
    members(waits.id).map((m) => [m.class, m.excluded_by, m.counted]),
    WAITING_LEADS.map(() => ["excluded", waits.question.criterionKey, false]),
    "the pile the question opens on holds the places it is about, and none of them counted",
  );
  assert.equal(w.t.lead_counters.find((c) => c.kind === "allowance").used, LEAD_COUNTED);
  assert.equal(w.t.lead_counters.find((c) => c.kind === "budget").used, "0.2100", "both rounds' spend");
  const platform = w.t.lead_platform[0];
  assert.deepEqual(platform.tenants_on, [T], "listed, so a paid run may start one here");
  assert.equal(platform.searches_on, false, "and the switch every other workspace reads is untouched");
  await converge(w.db, { ownerEmail: OWNER, memberEmail: MATE, apply: true, now: NOW });
  assert.equal(w.t.lead_searches.length, 2);
  assert.equal(w.t.leads.length, ALL_LEAD_PLACES.length);
  assert.equal(of(w.t, "notifications", T).length, 2, "last night's bell rows go with the rounds they were about");
  assert.equal(of(w.t, "jobs", T).length, 0);
  assert.deepEqual(w.t.lead_platform[0].tenants_on, [T]);
});

test("verify() names a drifted lead seed before any spec reads it", async () => {
  const w = world();
  await run(w);
  const T = w.t.tenants[0].id;
  const ownerId = w.t.memberships.find((m) => m.role === "owner").user_id;
  assert.deepEqual(await verify(w.db, T, ownerId), []);
  w.t.leads[0].business_name = "A Real Gym On A Real Street";
  w.t.leads[0].email = "hello@arealgym.com";
  w.t.leads[0].place_id = "ChIJreal0001";
  const problems = await verify(w.db, T, ownerId);
  assert.ok(
    problems.some((p) => p.includes(`not the ${ALL_LEAD_PLACES.length} fixtures`)),
    problems.join("; "),
  );
  assert.ok(
    problems.some((p) => p.includes("not fictional")),
    problems.join("; "),
  );
});

test("verify() names a waiting search that is no longer waiting, and a push job queued in the workspace", async () => {
  const w = world();
  await run(w);
  const T = w.t.tenants[0].id;
  const ownerId = w.t.memberships.find((m) => m.role === "owner").user_id;
  const search = w.t.lead_searches.find((x) => x.name === WAITING_SEARCH.name);
  const round = w.t.lead_rounds.find((r) => r.search_id === search.id);
  // What an answer pressed by a spec would leave: the round running (paid work), and the push the trigger queues.
  round.state = "running";
  w.t.jobs.push({ id: "push", tenant_id: T, kind: "push_send", payload: { notification_id: "n" } });
  const problems = await verify(w.db, T, ownerId);
  assert.ok(
    problems.some((p) => p.includes("not waiting on the owner")),
    problems.join("; "),
  );
  assert.ok(
    problems.some((p) => p.includes("push job")),
    problems.join("; "),
  );
  await run(w, { now: NOW + 86_400_000 });
  assert.deepEqual(await verify(w.db, T, ownerId), [], "the next run puts it back");
});
