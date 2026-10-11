/**
 * The nightly's own workspace, converged against a database in memory.
 *
 * e2e-workspace.mjs runs every night against production with the service role,
 * so what it may touch is the whole question. These run it: twice, to see that
 * nothing duplicates; after the specs have left things behind, to see them put
 * back; and against the accounts and workspaces it must refuse, to see that it
 * writes nothing there. The rows it writes are checked against the states the
 * production sweeps leave alone, and its one alert address against the edge's
 * own rule for who is told. The Receptionist lens's rows (convergeReceptionist)
 * are held to the same bar, and to what the lens reads of them; so are the People
 * lens's (convergePeople: a yes on the ledger for each person, three steps done,
 * and no step open).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  TenantConfigWriteSchema,
  SHARED_EVENT_VERSIONS,
  reviewIsNew,
  starterByName,
  closedOf,
  missedCallIsNews,
  DAY_MS,
  HOUR_MS,
  MIN_MS,
} from "@chanlytics/contracts";
import * as seed from "../../ops/e2e-workspace.mjs";
import {
  converge,
  runOptions,
  verify,
  SLUG,
  CALL_ID,
  PEOPLE,
  TIMEZONE,
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
  GOOGLE_LISTING,
  GOOGLE_REVIEWS,
  GOOGLE_DAYS,
  WIN_BACK,
} from "../../ops/e2e-workspace.mjs";

// The Google sweep as production runs it: the Places key and the OAuth client set, and a wire where Google would be that
// knows no fixture place (Google answers 404) and nothing else. Installed before the sweep's modules load: places.ts binds
// `fetch` as it is then.
process.env.GOOGLE_PLACES_API_KEY = "places-key-for-this-file";
process.env.GOOGLE_OAUTH_CLIENT_ID = "oauth-client-for-this-file";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "oauth-secret-for-this-file";
process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://dash.test/api/v1/google/callback";
const wire = [];
globalThis.fetch = async (url, init) => {
  wire.push(`${init?.method ?? "GET"} ${String(url).split("?")[0]}`);
  if (String(url).startsWith("https://places.googleapis.com/v1/places/"))
    return new Response(JSON.stringify({ error: { code: 404, status: "NOT_FOUND" } }), { status: 404 });
  throw new Error(`nothing on the wire answers ${url}`);
};

const here = path.dirname(fileURLToPath(import.meta.url));
const { chooseAddressing, reachesTenant } = await import(
  pathToFileURL(path.join(here, "../../../../apps/edge/lib/ops/notify.ts")).href
);
const { planLeadSweep, QUESTION_WAIT_MS } = await import(
  pathToFileURL(path.join(here, "../../../../apps/edge/lib/leads/lead-sweep.ts")).href
);
const { sweepGoogle } = await import(
  pathToFileURL(path.join(here, "../../../../apps/edge/lib/google/google-sweep.ts")).href
);
const { listingsDue, connectionsDue } = await import(
  pathToFileURL(path.join(here, "../../../../apps/edge/lib/google/listing-check.ts")).href
);
const { sweepUnfinished } = await import(
  pathToFileURL(path.join(here, "../../../../apps/edge/lib/receptionist/unfinished.ts")).href
);

// The Receptionist lens's rows (convergeReceptionist), named by what the seed exports.
const { RECEPTIONIST_PREFIX, MISSED_CALL_ID } = seed;
// The People lens's rows (convergePeople): the prefix of each step's words and the note on each yes's event.
const { PEOPLE_PREFIX, PEOPLE_NOTE } = seed;

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
      // Vault holds nothing for the workspace: the Business Profile it is seeded with has no credentials.
      get_google_credentials: () => null,
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
/** The seeded person with this phone number, and their conversation. */
const personAt = (t, tenantId, phone) => of(t, "contacts", tenantId).find((c) => c.phone_e164 === phone);
const threadOf = (t, tenantId, phone) => {
  const person = personAt(t, tenantId, phone);
  return of(t, "conversations", tenantId).find((c) => c.contact_id === person?.id);
};
const [ROBIN, CASEY, SAM] = PEOPLE;
/** An instant read back as the workspace's own clock: its day, "HH:MM", and the quarter hour of the day (0 to 95). */
function localOf(at, zone = TIMEZONE) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(at))
      .map((x) => [x.type, x.value]),
  );
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    clock: `${p.hour}:${p.minute}`,
    q: Number(p.hour) * 4 + Math.floor(Number(p.minute) / 15),
  };
}
const quietLog = { info() {}, warn() {}, error() {}, debug() {} };
/** What a customer's own words are: everything but mail read as automated (public.message_is_a_persons_words, 00299). */
const personsWords = (m) => !["automated", "auto_reply", "report"].includes(m.meta?.email?.claim ?? "person");

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
  assert.equal(
    of(w.t, "conversations", T).length,
    2,
    "Robin's, whose two messages the other specs read, and Sam's, which the Receptionist lens draws",
  );
  const robins = threadOf(w.t, T, ROBIN.phone);
  assert.deepEqual(
    of(w.t, "messages", T)
      .filter((m) => m.conversation_id === robins.id)
      .map((m) => `${m.sender}:${m.status}`)
      .sort(),
    ["ai:delivered", "customer:received"],
  );
  assert.equal(of(w.t, "calls", T).length, 2, "the answered call, and the one nobody took");
  assert.equal(of(w.t, "escalations", T).length, 2, "two resolved: written afresh, not added to");
  assert.equal(
    of(w.t, "events", T).filter((e) => e.kind === "message.send_blocked").length,
    1,
    "and the one blocked send is the last night's, not a second",
  );
  assert.deepEqual(
    ["google_listings", "google_connections", "google_reviews", "google_listing_days"].map(
      (table) => of(w.t, table, T).length,
    ),
    [1, 1, GOOGLE_REVIEWS.length, GOOGLE_DAYS.length],
    "the Google rows are written afresh, not added to",
  );
  assert.equal(
    of(w.t, "events", T).filter((e) => e.kind.startsWith("google.")).length,
    2,
    "and so are the two events the replies filed",
  );
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
  const call = of(w.t, "calls", T).find((c) => c.retell_call_id === CALL_ID);
  assert.deepEqual(
    [call.status, call.conversation_id, call.message_id, call.recording],
    ["ended", null, null, null],
    "nothing for the call sweep to note or fetch",
  );
  assert.ok(call.transcript_object.length > 0 && call.notified_at);
  for (const cv of of(w.t, "conversations", T)) {
    assert.deepEqual(
      [cv.state, cv.paused_until, cv.snooze_until, cv.assignee_user_id],
      ["open", null, null, null],
      "nothing timed for a pause or snooze sweep, and nobody's to answer",
    );
  }
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
  for (const table of ["jobs", "lines", "playbooks", "broadcasts"]) {
    assert.equal(of(w.t, table, T).length, 0, `no ${table}`);
  }
  // Two escalations exist, both resolved when they were written: an open one is paged to the platform after two hours.
  assert.deepEqual(
    of(w.t, "escalations", T).map((e) => e.state),
    ["resolved", "resolved"],
    "no open escalation",
  );

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
  const seededMessages = of(w.t, "messages", T)
    .map((m) => m.external_id)
    .sort();
  assert.ok(seededMessages.length > 2, "Robin's two and the Receptionist lens's");
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
  assert.equal(of(w.t, "conversations", T).length, 2, "Robin's and Sam's: the stray one is gone");
  assert.deepEqual(
    of(w.t, "messages", T)
      .map((m) => m.external_id)
      .sort(),
    seededMessages,
    "the seeded messages and no other: the stray's went with its thread",
  );
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
  const cv = threadOf(w.t, T, ROBIN.phone);
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
  assert.equal(
    backedUp.filter((r) => r.table === "person_notes" && String(r.row.body).startsWith(PEOPLE_PREFIX)).length,
    3,
    "and so are the steps the run deletes and writes again",
  );
  assert.equal(
    backedUp.some((r) => r.table === "events"),
    false,
    "the ledger's rows a run replaces are not: they are the seed's own, written afresh",
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

test("the Google seed is a listing, a Business Profile with no credentials and four reviews dated from the run: two answered, two waiting, the receptionist's reply and the held one filed by the real writer", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const stamp = new Date(NOW).toISOString();
  const [listing] = of(w.t, "google_listings", T);
  assert.match(listing.place_id, /^ChIJfixture\d{4}$/, "a place id no Google place has");
  assert.deepEqual(
    [listing.place_id, listing.rating, listing.review_count, listing.checked_at, listing.check_error],
    [GOOGLE_LISTING.place_id, 4, 4, stamp, null],
  );
  const [profile] = of(w.t, "google_connections", T);
  assert.deepEqual(
    [profile.credentials_ref, profile.reviews_complete, profile.last_synced_at, profile.sync_error],
    [null, true, stamp, null],
    "synced as of the run, and nothing that could be used to read Google",
  );
  assert.match(profile.location_name, /^locations\//);

  const reviews = of(w.t, "google_reviews", T);
  const hoursBefore = (iso) => (NOW - Date.parse(iso)) / 3_600_000;
  assert.deepEqual(
    reviews.map((r) => [r.review_id, r.origin, r.rating, hoursBefore(r.published_at) / 24]),
    GOOGLE_REVIEWS.map((r) => [r.review_id, "profile", r.rating, r.writtenDaysAgo]),
    "written 3, 9, 5 and 40 days before the run",
  );
  for (const r of reviews) assert.match(r.author, /^\w+ Example$/, "a made-up reviewer");
  const [byReceptionist, byOwner, held, waiting] = reviews;
  assert.deepEqual(
    [byReceptionist, byOwner, held, waiting].map((r) => r.reply_text !== null),
    [true, true, false, false],
    "two answered and two waiting",
  );
  assert.equal(hoursBefore(byReceptionist.replied_at), 1, "the receptionist's reply is an hour old, as its event is");
  assert.equal(
    (Date.parse(byOwner.replied_at) - Date.parse(byOwner.published_at)) / 3_600_000,
    26,
    "the owner's came a day and two hours after the review",
  );
  assert.deepEqual([held.replied_at, waiting.replied_at], [null, null]);
  assert.ok(
    reviews.every((r) => !reviewIsNew(r, listing.linked_at, NOW)),
    "none is news: Today draws no line about a review and no bell rings",
  );

  // The two events the ledger reads who wrote a reply and why one was held from, as the edge's writers file them.
  const events = of(w.t, "events", T).filter((e) => e.kind.startsWith("google."));
  assert.deepEqual(
    events.map((e) => [e.kind, e.subject_type, e.subject_id, e.data]).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    [
      [
        "google.replied",
        "review",
        byReceptionist.id,
        { review_id: byReceptionist.review_id, chars: GOOGLE_REVIEWS[0].reply.text.length, by: "receptionist" },
      ],
      ["google.reply_held", "review", held.id, { review_id: held.review_id, why: "price" }],
    ],
    "nothing for the owner's reply, which was written on Google",
  );
  assert.deepEqual(
    of(w.t, "google_listing_days", T).map((d) => [d.day, d.rating, d.review_count]),
    [
      ["2026-08-14", 5, 1],
      ["2026-09-14", 4, 4],
    ],
    "the count on the run's day in the workspace's zone, and a month before",
  );
  assert.deepEqual(await verify(w.db, T, w.users.find((u) => u.email === OWNER).id), []);
});

test("the Google sweep reaches the seed only a day on, and then writes its failure on the row and nothing else: no stamp moved, no review touched, no bell, and the next morning's seed clears it", async () => {
  const w = world();
  const hour = 3_600_000;
  const seededAt = Date.now() - 21 * hour;
  const { tenantId: T } = await run(w, { now: seededAt });
  const stamp = new Date(seededAt).toISOString();
  assert.deepEqual(await listingsDue(w.db, new Date(seededAt + 19 * hour), 40), [], "not due at nineteen hours");
  assert.deepEqual(await connectionsDue(w.db, new Date(seededAt + 19 * hour), 40), []);
  assert.equal((await listingsDue(w.db, new Date(), 40)).length, 1, "due at twenty-one");
  assert.equal((await connectionsDue(w.db, new Date(), 40)).length, 1);

  const kept = () =>
    JSON.stringify([
      of(w.t, "google_reviews", T),
      of(w.t, "google_listing_days", T),
      of(w.t, "notifications", T),
      of(w.t, "events", T),
    ]);
  const before = kept();
  wire.length = 0;
  const quiet = { info() {}, warn() {}, error() {}, debug() {} };
  const res = await sweepGoogle({ db: w.db, L: quiet, started: Date.now() });
  assert.deepEqual(await res.json(), {
    ok: true,
    listings_due: 1,
    listings_read: 0,
    profiles_due: 1,
    profiles_synced: 0,
    fresh: 0,
    counted: 0,
    failed: 2,
    remaining: 0,
  });
  assert.deepEqual(
    wire,
    [`GET https://places.googleapis.com/v1/places/${GOOGLE_LISTING.place_id}`],
    "Google was asked for the fixture place and for nothing else: no token, no reviews, no reply",
  );
  const [listing] = of(w.t, "google_listings", T);
  const [profile] = of(w.t, "google_connections", T);
  assert.ok(listing.check_error && profile.sync_error, "each row says what failed");
  assert.deepEqual([listing.checked_at, profile.last_synced_at], [stamp, stamp], "and neither stamp moved");
  assert.equal(kept(), before, "no review, day, bell or event was written");

  await run(w, { now: seededAt + 24 * hour });
  const [mended] = of(w.t, "google_listings", T);
  const [reconnected] = of(w.t, "google_connections", T);
  assert.deepEqual([mended.check_error, reconnected.sync_error], [null, null], "the next morning's seed clears both");
});

test("verify() names a Google seed that a spec or a person changed: another listing, a profile with credentials, a review that is not a fixture, a reply event gone", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const ownerId = w.t.memberships.find((m) => m.role === "owner").user_id;
  assert.deepEqual(await verify(w.db, T, ownerId), []);
  w.t.google_listings[0].place_id = "ChIJrealplace0001";
  w.t.google_connections[0].credentials_ref = "vault:google";
  w.t.google_reviews[1].origin = "places";
  w.t.events.splice(
    w.t.events.findIndex((e) => e.kind === "google.replied"),
    1,
  );
  const problems = await verify(w.db, T, ownerId);
  for (const named of [
    "one Google listing",
    "one Business Profile",
    "Google reviews are not the 4 fixtures",
    "reply events",
  ])
    assert.ok(
      problems.some((p) => p.includes(named)),
      `${named}: ${problems.join("; ")}`,
    );
  await run(w, { now: NOW + 86_400_000 });
  assert.deepEqual(await verify(w.db, T, ownerId), [], "the next run puts it back");
});

/* ---- The Receptionist lens's rows (convergeReceptionist) ---- */

test("the Receptionist lens's rows: Sam's conversation holds a week of what the lens draws, every row the seed's and dated from the run", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const cv = threadOf(w.t, T, SAM.phone);
  assert.ok(cv, "Sam has a conversation of his own");
  assert.notEqual(
    cv.id,
    threadOf(w.t, T, ROBIN.phone).id,
    "and Robin's, whose messages the other specs read, is another",
  );
  const sam = personAt(w.t, T, SAM.phone);
  const casey = personAt(w.t, T, CASEY.phone);
  const thread = of(w.t, "messages", T).filter((m) => m.conversation_id === cv.id);
  assert.ok(
    thread.every((m) => m.contact_id === sam.id && String(m.external_id).startsWith(RECEPTIONIST_PREFIX)),
    "every message in it is Sam's and the seed's, named by its prefix",
  );
  assert.equal(new Set(thread.map((m) => m.external_id)).size, thread.length, "each once");
  assert.equal(RECEPTIONIST_PREFIX, "e2e-seed-r-");

  // What Sam wrote: five on WhatsApp, three about booking and two about prices, each read and answered by the receptionist;
  // and one email that a program wrote.
  const asks = thread.filter((m) => m.direction === "inbound" && m.channel === "whatsapp");
  assert.deepEqual(
    asks.map((m) => [m.sender, m.status, m.meta.handled]),
    Array(5).fill(["customer", "received", "ai"]),
  );
  assert.deepEqual(
    [asks.filter((m) => m.meta.intent === "booking").length, asks.filter((m) => m.meta.intent === "pricing").length],
    [3, 2],
  );
  const mail = thread.filter((m) => m.channel === "email");
  assert.deepEqual(
    mail.map((m) => [m.direction, m.sender, m.status, m.meta]),
    [["inbound", "customer", "received", { email: { claim: "automated" } }]],
    "the automated email, which is counted nowhere",
  );

  // What the receptionist answered: five replies that went out, four in English and one in Spanish, three of them held
  // for a minute first; and two drafts that never went out, one cancelled with no reason and one steered.
  const ai = thread.filter((m) => m.direction === "outbound" && m.sender === "ai");
  const left = ai.filter((m) => m.status === "delivered");
  assert.equal(left.length, 5);
  assert.deepEqual(
    [left.filter((m) => m.meta.language === "en").length, left.filter((m) => m.meta.language === "es").length],
    [4, 1],
  );
  const held = ai.filter((m) => m.meta.source === "veto_window");
  assert.deepEqual(held.map((m) => [m.status, m.meta.delay_ms]).sort(), [
    ["canceled", 60_000],
    ["canceled", 60_000],
    ["delivered", 60_000],
    ["delivered", 60_000],
    ["delivered", 60_000],
  ]);
  const cancelled = ai.filter((m) => m.status === "canceled");
  assert.equal(cancelled.length, 2);
  assert.equal(cancelled.filter((m) => !m.error).length, 1, "the owner's cancel leaves no reason");
  const steered = cancelled.find((m) => m.error?.reason === "steered");
  assert.ok(steered, "and the steered one says so");
  const replacement = left.find((m) => m.id === steered.error.replaced_by);
  assert.equal(replacement?.meta.source, "steered", "its replacement is the reply that went out, and is not a hold");

  // Two handovers, resolved when they were written: a person's first reply ten minutes after each.
  const escalations = of(w.t, "escalations", T);
  assert.equal(escalations.length, 2);
  const humans = thread.filter((m) => m.sender === "human");
  assert.deepEqual(
    humans.map((m) => [m.direction, m.channel, m.status]),
    Array(2).fill(["outbound", "whatsapp", "delivered"]),
  );
  assert.ok(
    humans.every((m) => !m.meta?.source),
    "a person's own words, not a broadcast's or a reach-out's",
  );
  for (const e of escalations) {
    assert.deepEqual([e.conversation_id, e.reason, e.state], [cv.id, "human_token", "resolved"]);
    assert.ok(e.resolved_at && Date.parse(e.resolved_at) > Date.parse(e.created_at), "resolved at a time of its own");
    assert.equal(
      humans.filter((m) => Date.parse(m.created_at) - Date.parse(e.created_at) === 10 * MIN_MS).length,
      1,
      "one person's reply ten minutes after",
    );
  }

  // The call nobody took, and the send that was held at the door.
  const missed = of(w.t, "calls", T).find((c) => c.retell_call_id === MISSED_CALL_ID);
  assert.equal(MISSED_CALL_ID, "e2e-seed-r-missed");
  assert.deepEqual(
    [missed.status, missed.direction, missed.contact_id, missed.conversation_id, missed.message_id, missed.recording],
    ["not_connected", "inbound", casey.id, null, null, null],
  );
  assert.ok(missed.notified_at, "already notified: nothing for the post-call mail");
  const blocked = of(w.t, "events", T).filter((e) => e.kind === "message.send_blocked");
  assert.deepEqual(
    blocked.map((e) => e.data),
    [{ reason: "human_has_it", purpose: "conversational" }],
  );

  // Dated from the run: inside the seven days the shortest lens period reads, so every period shows them, and past the
  // day the unfinished-message sweep looks back over and the bell keeps a missed call as news. At least three hours
  // before the first conversation's reply, so that conversation stays the newest.
  const robinsReply = Date.parse(threadOf(w.t, T, ROBIN.phone).last_message_at);
  const dated = [
    ...thread.map((m) => m.created_at),
    ...escalations.flatMap((e) => [e.created_at, e.resolved_at]),
    missed.started_at,
  ].map((at) => Date.parse(at));
  for (const at of dated) {
    assert.ok(NOW - at > DAY_MS, `${new Date(at).toISOString()} is past the day the sweeps look back over`);
    assert.ok(NOW - at < 7 * DAY_MS, `${new Date(at).toISOString()} is inside the shortest period`);
    assert.ok(robinsReply - at >= 3 * HOUR_MS, `${new Date(at).toISOString()} is three hours before Robin's reply`);
  }
  assert.equal(cv.last_message_at, new Date(Math.max(...thread.map((m) => Date.parse(m.created_at)))).toISOString());
  assert.equal(
    cv.last_inbound_at,
    new Date(Math.max(...asks.map((m) => Date.parse(m.created_at)))).toISOString(),
    "the last thing the customer wrote",
  );
  assert.ok(
    thread.every((m) => m.status !== "queued") && of(w.t, "jobs", T).length === 0,
    "terminal: nothing waiting to send, no job to send it",
  );
  assert.deepEqual(await verify(w.db, T, w.users.find((u) => u.email === OWNER).id), []);
});

test("what the lens will make of those rows: the hold, the topics, the languages, the handover, the call nobody took", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const messages = of(w.t, "messages", T);
  const calls = of(w.t, "calls", T);
  const count = (rows, key) =>
    rows.reduce((acc, r) => ({ ...acc, [key(r)]: (acc[key(r)] ?? 0) + 1 }), /** @type {Record<string, number>} */ ({}));

  // receptionist_series reads (00380, the plan's Task 7): the drafts of the window by what became of them,
  const drafts = messages.filter(
    (m) =>
      m.direction === "outbound" && m.sender === "ai" && ["veto_window", "low_confidence"].includes(m.meta?.source),
  );
  assert.deepEqual(
    count(drafts, (m) => (m.status === "canceled" ? (m.error?.reason ?? "canceled") : "sent")),
    { sent: 3, canceled: 1, steered: 1 },
    "three went out as the hold ended, one was cancelled, one steered: five in the hold",
  );
  // the topics of what came in by text or WhatsApp in a person's own words (Robin's message is not stamped),
  const texts = messages.filter(
    (m) =>
      m.direction === "inbound" &&
      m.sender === "customer" &&
      ["whatsapp", "sms"].includes(m.channel) &&
      personsWords(m),
  );
  assert.equal(texts.length, 6);
  assert.deepEqual(
    count(
      texts.filter((m) => m.meta?.intent),
      (m) => m.meta.intent,
    ),
    { booking: 3, pricing: 2 },
  );
  // the languages of the replies that left (Robin's is not stamped),
  const replies = messages.filter(
    (m) => m.direction === "outbound" && m.sender === "ai" && ["sent", "delivered", "read"].includes(m.status),
  );
  assert.equal(replies.length, 6);
  assert.deepEqual(
    count(
      replies.filter((m) => m.meta?.language),
      (m) => m.meta.language,
    ),
    { en: 4, es: 1 },
  );
  // the handovers: the first reply of a person after each, and how long each took to settle,
  const medians = of(w.t, "escalations", T).map((e) => {
    const first = messages
      .filter((m) => m.conversation_id === e.conversation_id && m.sender === "human" && m.direction === "outbound")
      .map((m) => Date.parse(m.created_at))
      .filter((at) => at > Date.parse(e.created_at))
      .sort()[0];
    return {
      replied: (first - Date.parse(e.created_at)) / 1000,
      settled: (Date.parse(e.resolved_at) - Date.parse(e.created_at)) / 1000,
    };
  });
  assert.deepEqual(
    medians.map((m) => m.replied),
    [600, 600],
    "a median of ten minutes",
  );
  assert.deepEqual(
    medians.map((m) => m.settled).sort((a, b) => a - b),
    [3000, 4200],
    "and an hour to settle: two and not more",
  );
  // and the call: a person's, that never connected, and nobody rang them back in the hour after it.
  const missed = calls.find((c) => c.retell_call_id === MISSED_CALL_ID);
  const after = (at) => at > Date.parse(missed.started_at) && at <= Date.parse(missed.started_at) + HOUR_MS;
  assert.ok(
    !messages.some(
      (m) => m.contact_id === missed.contact_id && m.direction === "outbound" && after(Date.parse(m.created_at)),
    ),
  );
  assert.ok(!calls.some((c) => c !== missed && c.contact_id === missed.contact_id && after(Date.parse(c.started_at))));
});

test("the workspace keeps no opening hours, as the local harness's record and the other nightly specs have it: the lens's closed figure asks for them", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const [cfg] = of(w.t, "tenant_config", T);
  assert.equal(cfg.config.brain.profile, undefined, "no profile, so no hours");
  assert.deepEqual(cfg.config, seed.workspaceConfig(), "the config the harness derives its nightly record from");
  assert.ok(TenantConfigWriteSchema.safeParse(cfg.config).success, "a config the settings save accepts");
  assert.deepEqual(cfg.config.notifications, { escalation_emails: [ALERT_INBOX] }, "and the alerts are as they were");

  // Each person's words by the workspace's own day and quarter hour (what receptionist_series counts as arrivals): six,
  // Robin's one and Sam's five, for the automated email is nobody's arrival. Asked the one question the lens asks of a
  // workspace with no hours (closedOf), the answer is none, which the lens words as a request for them and not as zero.
  const arrivals = of(w.t, "messages", T)
    .filter((m) => m.direction === "inbound" && m.sender === "customer" && personsWords(m))
    .map((m) => ({ d: localOf(m.created_at).day, q: localOf(m.created_at).q, n: 1 }));
  assert.equal(arrivals.length, 6);
  assert.equal(closedOf(arrivals, {}), null);
});

test("a second run changes nothing but the dates: the Receptionist rows move a day with the run, and none is added", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const undated = (rows) =>
    JSON.stringify(rows)
      .replace(/"\d{4}-\d{2}-\d{2}T[\d:.]+Z"/g, '"<date>"')
      .replace(/"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g, '"<id>"');
  const byKey = (key) => (a, b) => (String(key(a)) < String(key(b)) ? -1 : 1);
  const picture = () => ({
    messages: of(w.t, "messages", T).sort(byKey((m) => m.external_id)),
    conversations: of(w.t, "conversations", T).sort(byKey((c) => c.last_message_at)),
    escalations: of(w.t, "escalations", T).sort(byKey((e) => e.created_at)),
    calls: of(w.t, "calls", T).sort(byKey((c) => c.retell_call_id)),
    events: of(w.t, "events", T).filter((e) => e.kind === "message.send_blocked"),
    config: of(w.t, "tenant_config", T).map((r) => r.config),
  });
  const dates = () => ({
    messages: Object.fromEntries(of(w.t, "messages", T).map((m) => [m.external_id, Date.parse(m.created_at)])),
    escalations: of(w.t, "escalations", T)
      .sort(byKey((e) => e.created_at))
      .map((e) => [Date.parse(e.created_at), Date.parse(e.resolved_at)]),
    calls: Object.fromEntries(of(w.t, "calls", T).map((c) => [c.retell_call_id, Date.parse(c.started_at)])),
  });
  const first = { shape: undated(picture()), dates: dates() };
  await run(w, { now: NOW + DAY_MS });
  assert.equal(undated(picture()), first.shape, "the same rows, but for their dates and their ids");
  const next = dates();
  for (const [id, at] of Object.entries(first.dates.messages))
    assert.equal(next.messages[id] - at, DAY_MS, `${id} moved a day`);
  assert.deepEqual(
    next.escalations.map((pair, i) => pair.map((at, j) => at - first.dates.escalations[i][j])),
    [
      [DAY_MS, DAY_MS],
      [DAY_MS, DAY_MS],
    ],
  );
  for (const [id, at] of Object.entries(first.dates.calls))
    assert.equal(next.calls[id] - at, DAY_MS, `${id} moved a day`);
});

test("the Receptionist rows delete their own last night's before they are written, whoever left them: run alone over its own rows it adds nothing", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const ownerId = w.users.find((u) => u.email === OWNER).id;
  const cv = threadOf(w.t, T, SAM.phone);
  const tables = ["conversations", "messages", "escalations", "calls", "events", "jobs"];
  const counted = () => tables.map((table) => of(w.t, table, T).length);
  const before = counted();
  // What a spec could leave in Sam's thread, and an event of another kind, which the seed does not own.
  w.t.messages.push({ id: "stray-m", tenant_id: T, conversation_id: cv.id, sender: "customer", direction: "inbound" });
  w.t.events.push({
    id: "other-event",
    tenant_id: T,
    kind: "contact.noted",
    data: {},
    created_at: new Date(NOW).toISOString(),
  });
  await seed.convergeReceptionist(w.db, T, ownerId, NOW + DAY_MS);
  assert.equal(
    w.t.messages.some((m) => m.id === "stray-m"),
    false,
    "gone with the thread it was in",
  );
  assert.deepEqual(
    counted().map((n, i) => n - before[i]),
    [0, 0, 0, 0, 1, 0],
    "the same rows again, and the other event is not the seed's to delete",
  );
  assert.notEqual(threadOf(w.t, T, SAM.phone).id, cv.id, "a conversation of its own, written afresh");
  assert.deepEqual(await verify(w.db, T, ownerId), []);
});

test("no sweep or job reaches the Receptionist rows: the unfinished-message sweep, the note sweep, the bell and the deadman", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const cv = threadOf(w.t, T, SAM.phone);
  const robinsMessages = new Set(
    of(w.t, "messages", T)
      .filter((m) => m.conversation_id === threadOf(w.t, T, ROBIN.phone).id)
      .map((m) => m.id),
  );

  // The unfinished-message sweep (every ten minutes, from the deadman tick) looks back a day for a text nobody finished
  // with: asked a few minutes after the seed and for two days on, it opens no escalation, tells nobody and stamps none of
  // Sam's. (Robin's, two hours old and answered, it stamps handled, as it always has.)
  const raised = [];
  const stamped = [];
  const told = [];
  const sweep = (after) =>
    sweepUnfinished({
      db: w.db,
      L: quietLog,
      upsertEscalation: async (...args) => {
        raised.push(args);
        return { created: true };
      },
      markProcessed: async (_db, _tenant, id) => {
        stamped.push(id);
      },
      notify: async (...args) => {
        told.push(args);
        return true;
      },
      loadTenantNotifications: async () => ({ notifications: null, isEnvDefault: false }),
      reachesTenant: () => true,
      deadline: Infinity,
      now: () => NOW + after,
    });
  for (const after of [4 * MIN_MS, 23 * HOUR_MS, 26 * HOUR_MS, 50 * HOUR_MS]) {
    assert.deepEqual(
      await sweep(after),
      { unanswered: 0, orphaned: 0, told: 0 },
      `${after / HOUR_MS} hours after the seed`,
    );
  }
  assert.deepEqual([raised, told], [[], []], "no escalation raised, nobody told");
  assert.ok(stamped.length > 0, "the sweep did read the workspace: it stamped Robin's answered text");
  assert.ok(
    stamped.every((id) => robinsMessages.has(id)),
    "and the only message it stamps is Robin's",
  );
  // The same sweep does catch a text of Sam's that is inside its day and has no reply and no stamp, so the silence above is its own.
  const lone = {
    id: "lone",
    tenant_id: T,
    conversation_id: cv.id,
    contact_id: personAt(w.t, T, SAM.phone).id,
    channel: "whatsapp",
    direction: "inbound",
    sender: "customer",
    type: "text",
    body: "Hello?",
    status: "received",
    created_at: new Date(NOW - 5 * HOUR_MS).toISOString(),
    meta: {},
  };
  w.t.messages.push(lone);
  assert.equal((await sweep(0)).unanswered, 1, "a text five hours old with no answer is raised");
  assert.equal(raised.length, 1);
  w.t.messages.splice(w.t.messages.indexOf(lone), 1);

  // The note sweep (00159, note_candidates) reads a conversation whose newest customer message is between six hours and
  // seven days old and newer than its last look, and a call that was notified, is on a person, came in and ended within
  // three days and was not looked at. Each of Sam's is stamped as looked at, so it waits for a message that never comes.
  const missed = of(w.t, "calls", T).find((c) => c.retell_call_id === MISSED_CALL_ID);
  const threadWaits = (c, now) =>
    Date.parse(c.last_inbound_at) < now - 6 * HOUR_MS &&
    Date.parse(c.last_inbound_at) > now - 7 * DAY_MS &&
    (c.note_checked_at == null || Date.parse(c.note_checked_at) < Date.parse(c.last_inbound_at));
  const callWaits = (c, now) =>
    c.note_checked_at == null &&
    c.notified_at != null &&
    c.contact_id != null &&
    c.direction === "inbound" &&
    Date.parse(c.ended_at) > now - 3 * DAY_MS;
  assert.ok(cv.note_checked_at, "Sam's conversation is stamped as read");
  assert.ok(missed.note_checked_at, "and the call is");
  for (const after of [0, 7 * HOUR_MS, 3 * DAY_MS]) {
    assert.equal(threadWaits(cv, NOW + after), false, `the conversation, ${after / HOUR_MS} hours on`);
    assert.equal(callWaits(missed, NOW + after), false, `the call, ${after / HOUR_MS} hours on`);
  }
  // Without the stamp both would wait, so the stamp is what keeps a model from being asked about them.
  assert.equal(threadWaits({ ...cv, note_checked_at: null }, NOW), true);
  assert.equal(callWaits({ ...missed, note_checked_at: null }, NOW), true);

  // The bell raises a "missed call" row for a dial that never connected for a day (missedCallIsNews), and the deadman
  // pages the platform for an escalation open two hours: this call is past its day, and no escalation is open.
  assert.equal(missedCallIsNews({ missed: true, live: false, startedAtMs: Date.parse(missed.started_at) }, NOW), false);
  assert.deepEqual(
    of(w.t, "escalations", T).filter((e) => e.state !== "resolved"),
    [],
  );
  assert.deepEqual(
    [of(w.t, "jobs", T).length, of(w.t, "messages", T).filter((m) => m.status === "queued").length],
    [0, 0],
  );
});

test("the rows the lens adds leave the other specs' first reads where they were: Robin's thread is the newest and the answered call the latest", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  // The Inbox and the exports spec read the newest conversation (GET conversations, newest first) and the latest call.
  const newest = of(w.t, "conversations", T).sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1))[0];
  assert.equal(newest.contact_id, personAt(w.t, T, ROBIN.phone).id);
  const latest = of(w.t, "calls", T).sort((a, b) => (a.started_at < b.started_at ? 1 : -1))[0];
  assert.equal(latest.retell_call_id, CALL_ID, "a call with a transcript, which the call export reads");
});

test("verify() names an open escalation, a queued message, a missed call that connected, a handover with no time to it and a blocked send that is gone", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const ownerId = w.t.memberships.find((m) => m.role === "owner").user_id;
  assert.deepEqual(await verify(w.db, T, ownerId), []);
  const said = async () => (await verify(w.db, T, ownerId)).join(" | ");
  const [first, second] = of(w.t, "escalations", T);

  // What a spec that went wrong, or a person poking at the workspace, could leave.
  first.state = "open";
  first.resolved_at = null;
  assert.match(await said(), /open escalation/, "the deadman would page the platform for it");
  first.state = "resolved";
  first.resolved_at = new Date(Date.parse(first.created_at) + HOUR_MS).toISOString();
  assert.equal(await said(), "");

  second.resolved_at = null;
  assert.match(await said(), /resolved/, "resolved before records were kept is unknown to the lens");
  second.resolved_at = new Date(Date.parse(second.created_at) + HOUR_MS).toISOString();

  w.t.messages.push({
    id: "queued-by-hand",
    tenant_id: T,
    conversation_id: first.conversation_id,
    sender: "ai",
    direction: "outbound",
    status: "queued",
  });
  assert.match(await said(), /queued/, "a send job would pick it up");
  w.t.messages.pop();

  const missed = of(w.t, "calls", T).find((c) => c.retell_call_id === MISSED_CALL_ID);
  missed.status = "ended";
  assert.match(await said(), /never connected/);
  missed.status = "not_connected";
  w.t.calls.splice(w.t.calls.indexOf(missed), 1);
  assert.match(await said(), /never connected/, "and a call that is not there at all");
  w.t.calls.push(missed);

  const blocked = w.t.events.findIndex((e) => e.kind === "message.send_blocked");
  const [event] = w.t.events.splice(blocked, 1);
  assert.match(await said(), /blocked/, "the one event the writer files best-effort and never throws");
  w.t.events.push(event);
  assert.equal(await said(), "");

  // Every one of them put back by the next run.
  first.state = "open";
  second.resolved_at = null;
  missed.status = "ended";
  w.t.messages.push({ id: "q2", tenant_id: T, conversation_id: first.conversation_id, status: "queued" });
  assert.notEqual(await said(), "");
  await run(w, { now: NOW + DAY_MS });
  assert.deepEqual(await verify(w.db, T, ownerId), [], "the next run puts it back");
});

test("the eval's Win-back (the moment spec, A8): written only under --seed-win-back, which the nightly does not pass; then one campaign on silence, paused so no sweep runs it, on a message of its own, written once however often the workspace converges", async () => {
  // The script's arguments: the nightly's own (.github/workflows/nightly-e2e.yml, 09:00 UTC) are --apply alone.
  assert.deepEqual(runOptions(["node", "e2e-workspace.mjs", "--apply"]), { apply: true, seedWinBack: false });
  assert.deepEqual(runOptions(["node", "e2e-workspace.mjs", "--apply", "--seed-win-back"]), {
    apply: true,
    seedWinBack: true,
  });
  assert.deepEqual(
    runOptions(["node", "e2e-workspace.mjs", "--seed-win-back"]),
    { apply: false, seedWinBack: true },
    "the flag alone is a dry run all the same",
  );

  const w = world();
  // The nightly's converge (--apply alone): no Win-back, no message for it.
  const { tenantId: T } = await run(w);
  const ownerId = w.t.memberships.find((m) => m.role === "owner").user_id;
  assert.deepEqual(of(w.t, "playbooks", T), [], "merging seeds nothing");
  assert.deepEqual(of(w.t, "templates", T), [], "nor a message for it");
  // A dry run under the flag says what it would add, and adds nothing.
  const before = JSON.stringify(w.t);
  const dry = await run(w, { apply: false, seedWinBack: true });
  assert.equal(JSON.stringify(w.t), before, "a dry run writes nothing");
  assert.ok(
    dry.did.some((line) => line.includes("would add the eval's Win-back")),
    dry.did.join(" | "),
  );

  // Ruben's run by hand (--apply --seed-win-back), twice: one campaign, one message.
  const seeded = await run(w, { seedWinBack: true });
  assert.ok(seeded.did.includes("added the eval's Win-back, paused"), seeded.did.join(" | "));
  await run(w, { seedWinBack: true, now: NOW + 86_400_000 });
  const playbooks = of(w.t, "playbooks", T);
  assert.deepEqual(
    playbooks.map((p) => [p.name, p.trigger, p.state, p.policy_class]),
    [[WIN_BACK.name, "quiet_30", "paused", "reengage"]],
  );
  const [winBack] = playbooks;
  const messages = of(w.t, "templates", T);
  assert.equal(messages.length, 1, "one message, written once");
  const [message] = messages;
  assert.equal(winBack.template_id, message.id);
  assert.deepEqual(
    [message.name, message.channel, message.meta_status, message.source],
    [WIN_BACK.template, "whatsapp", "approved", "chanlytics"],
  );
  // A message of its own, no starter's: Ask's setup never takes it for a starter on file (contracts startersForTrigger).
  assert.equal(starterByName(WIN_BACK.template), null);
  assert.deepEqual(await verify(w.db, T, ownerId), [], "the seeded state passes its own check");

  // Paused, the hourly sweep never takes it: at its hour it is not due, where the same campaign running would be.
  const due = async () =>
    (
      await w.db.rpc("playbooks_due", {
        p_kind: "moment",
        p_at: new Date(NOW + 6 * 3_600_000).toISOString(),
        p_last_hour: 20,
        p_limit: 50,
        p_tenant_id: T,
      })
    ).data;
  assert.deepEqual(await due(), [], "11:00 in the workspace's zone, past its 10:00: paused, never due");

  // A spec that resumed, renamed or retimed it is named by verify(), and put back by the nightly's own converge, which
  // still adds nothing.
  Object.assign(winBack, { state: "running", name: "Past clients", run_hour: 9 });
  assert.equal((await due()).length, 1, "running, the sweep would take it");
  assert.ok(
    (await verify(w.db, T, ownerId)).some((p) => p.includes("Win-back")),
    "verify names a Win-back left running",
  );
  const putBack = await run(w, { now: NOW + 2 * 86_400_000 });
  assert.ok(putBack.did.includes("put the eval's Win-back back, paused"), putBack.did.join(" | "));
  assert.deepEqual(
    of(w.t, "playbooks", T).map((p) => [p.name, p.state, p.run_hour]),
    [[WIN_BACK.name, "paused", 10]],
  );
  assert.equal(of(w.t, "templates", T).length, 1, "and no second message");
  assert.deepEqual(await due(), []);
});

// ---------------------------------------------------------------------------------------------------------------------
// The People lens's rows (convergePeople): a yes for each seeded person on the ledger, and three steps the team finished.
// ---------------------------------------------------------------------------------------------------------------------

/** The yes events of the workspace, the seed's own and anyone's. */
const yesEvents = (t, tenantId) => of(t, "events", tenantId).filter((e) => e.kind === "contact.consent_changed");
/** The steps the seed wrote: the notes whose words start with its prefix. */
const seededSteps = (t, tenantId) =>
  of(t, "person_notes", tenantId).filter((n) => String(n.body).startsWith(PEOPLE_PREFIX));
/** The workspace's own day `n` days before the run at NOW (which is 05:00 in New York, so no clock change is near it). */
const dayBack = (n) => localOf(NOW - n * DAY_MS).day;

test("the People lens's rows: each seeded person's yes on the ledger a week back, and three steps the owner finished, two on their day or before and one a day late", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const ownerId = w.users.find((u) => u.email === OWNER).id;
  assert.equal(PEOPLE_NOTE, "e2e-seed-p");
  assert.equal(PEOPLE_PREFIX, "e2e seed step: ");

  // Three yeses, one for each seeded person, carrying the date of the yes their own column keeps.
  const people = of(w.t, "contacts", T);
  const yeses = yesEvents(w.t, T);
  assert.deepEqual(yeses.map((e) => e.subject_id).sort(), people.map((p) => p.id).sort(), "one for each of the three");
  for (const e of yeses) {
    assert.deepEqual(
      [e.subject_type, e.category, e.version],
      ["contact", "contact", SHARED_EVENT_VERSIONS["contact.consent_changed"]],
    );
    assert.deepEqual(e.data, {
      consent: "opted_in",
      source: "customer_message",
      channel: "whatsapp",
      note: PEOPLE_NOTE,
    });
    assert.equal(
      e.created_at,
      people.find((p) => p.id === e.subject_id).consent_updated_at,
      "dated as their own column's yes is: seven days before the run",
    );
    assert.equal(e.created_at, new Date(NOW - 7 * DAY_MS).toISOString());
  }

  // Three steps, all done by the owner: Casey's twice and Robin's once.
  const casey = personAt(w.t, T, CASEY.phone);
  const robin = personAt(w.t, T, ROBIN.phone);
  const steps = seededSteps(w.t, T);
  assert.deepEqual(
    steps.map((s) => [s.contact_id, s.due_on, localOf(s.done_at).day]).sort(),
    [
      [casey.id, dayBack(5), dayBack(5)],
      [casey.id, dayBack(9), dayBack(8)],
      [robin.id, dayBack(3), dayBack(6)],
    ].sort(),
    "Casey's on its day and a day late, Robin's three days before it was due",
  );
  for (const s of steps) {
    assert.deepEqual(
      [s.team_only, s.author_kind, s.state, s.author_user_id, s.done_by],
      [true, "member", "kept", ownerId, ownerId],
      "a step is the team's, written and done by a member",
    );
    assert.ok(
      s.body.length > PEOPLE_PREFIX.length && s.body.length <= 600,
      "words after the prefix, within the note's limit",
    );
    assert.ok(Date.parse(s.done_at) < NOW, "done in the past");
    assert.ok(Date.parse(s.created_at) < Date.parse(s.done_at), "and written before it was done");
  }
  assert.deepEqual(await verify(w.db, T, ownerId), []);
});

test("what the lens will make of the People rows: three yeses won, three steps done and two of them on their day", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const windowStart = NOW - 30 * DAY_MS;
  const inWindow = (at) => Date.parse(at) >= windowStart && Date.parse(at) <= NOW;

  // people_series counts a yes once for each person, kind of message and answer, leaving out a merge and a STOP's own reset,
  // an event whose purpose it does not know and one that names no live person.
  const live = new Set(of(w.t, "contacts", T).map((c) => c.id));
  const counted = new Set(
    yesEvents(w.t, T)
      .filter(
        (e) =>
          inWindow(e.created_at) &&
          live.has(e.subject_id) &&
          ["opted_in", "opted_out"].includes(e.data.consent) &&
          !["merge", "stop"].includes(e.data.source ?? "") &&
          ["", "marketing", "email_marketing"].includes(e.data.purpose ?? ""),
      )
      .map((e) => `${e.subject_id} ${e.data.purpose ?? "messages"} ${e.data.consent}`),
  );
  assert.equal(counted.size, 3, "yeses won: all three, to messages");

  // And a step counts when it is done in the window, on time when it was done on its day or before, by the workspace's day.
  const done = seededSteps(w.t, T).filter((s) => s.due_on && s.done_at && inWindow(s.done_at));
  assert.equal(done.length, 3);
  assert.equal(done.filter((s) => localOf(s.done_at).day <= s.due_on).length, 2);
});

test("a second run changes nothing but the dates: the People rows move a day with the run, and none is added", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const undated = (rows) =>
    JSON.stringify(rows)
      .replace(/"\d{4}-\d{2}-\d{2}T[\d:.]+Z"/g, '"<date>"')
      .replace(/"\d{4}-\d{2}-\d{2}"/g, '"<day>"')
      .replace(/"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g, '"<id>"');
  const byKey = (key) => (a, b) => (String(key(a)) < String(key(b)) ? -1 : 1);
  const picture = () => ({
    yeses: yesEvents(w.t, T).sort(byKey((e) => e.subject_id)),
    steps: seededSteps(w.t, T).sort(byKey((n) => n.body)),
    notes: of(w.t, "person_notes", T).length,
  });
  const dates = () => ({
    yeses: Object.fromEntries(yesEvents(w.t, T).map((e) => [e.subject_id, Date.parse(e.created_at)])),
    steps: Object.fromEntries(
      seededSteps(w.t, T).map((n) => [n.body, [Date.parse(`${n.due_on}T00:00:00Z`), Date.parse(n.done_at)]]),
    ),
  });
  const first = { shape: undated(picture()), dates: dates() };
  assert.deepEqual(
    [Object.keys(first.dates.yeses).length, Object.keys(first.dates.steps).length],
    [3, 3],
    "there is something to compare",
  );
  await run(w, { now: NOW + DAY_MS });
  assert.equal(undated(picture()), first.shape, "the same rows, but for their dates and their ids");
  const next = dates();
  for (const [person, at] of Object.entries(first.dates.yeses))
    assert.equal(next.yeses[person] - at, DAY_MS, "a yes moved a day, with the column that dates it");
  for (const [words, pair] of Object.entries(first.dates.steps))
    assert.deepEqual(
      next.steps[words].map((at, i) => at - pair[i]),
      [DAY_MS, DAY_MS],
      `${words}: its day and the time it was done moved a day`,
    );
});

test("the People rows are all terminal: no open step, no suppressed address, no queued message, no job, nothing a sweep selects", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const notes = of(w.t, "person_notes", T);
  assert.equal(notes.length, 3, "the three done steps and no other note");
  assert.deepEqual(
    notes.filter((n) => n.due_on && !n.done_at),
    [],
    "no open step: it would be a row in Today and a person on the Steps due list, which other specs count",
  );
  assert.ok(
    notes.every((n) => n.done_at && n.done_by && n.due_on),
    "each is done, by a member, and has a day",
  );
  assert.ok(
    of(w.t, "contacts", T).every((c) => !c.email_suppressed_at && !c.email),
    "no address, so none stopped",
  );
  assert.deepEqual(
    of(w.t, "events", T).filter((e) => e.kind === "contact.email_suppressed"),
    [],
  );
  assert.equal(of(w.t, "messages", T).filter((m) => m.status === "queued").length, 0);
  assert.equal(of(w.t, "jobs", T).length, 0);
  // The yeses are history: a person's own column says the same, and nothing in the workspace is a stop.
  assert.ok(of(w.t, "contacts", T).every((c) => c.consent === "opted_in"));
  assert.equal(yesEvents(w.t, T).filter((e) => e.data.consent !== "opted_in").length, 0, "no stop event");
});

test("the People rows delete their own last night's before they are written, and only theirs: a person's step, a real yes, another kind of event and another workspace's rows stay", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const ownerId = w.users.find((u) => u.email === OWNER).id;
  const casey = personAt(w.t, T, CASEY.phone);
  const planted = (table, row) => w.t[table].push({ tenant_id: T, ...row });
  // Another workspace's rows that look exactly like the seed's (its note, its prefix): both deletes are the workspace's own.
  const elsewhere = crypto.randomUUID();
  w.t.events.push({
    id: "elsewhere-yes",
    tenant_id: elsewhere,
    kind: "contact.consent_changed",
    subject_type: "contact",
    subject_id: crypto.randomUUID(),
    data: { consent: "opted_in", source: "customer_message", channel: "whatsapp", note: PEOPLE_NOTE },
    created_at: new Date(NOW).toISOString(),
  });
  w.t.person_notes.push({
    id: "elsewhere-step",
    tenant_id: elsewhere,
    contact_id: crypto.randomUUID(),
    body: `${PEOPLE_PREFIX}done in another workspace`,
    author_kind: "member",
    author_user_id: ownerId,
    team_only: true,
    due_on: dayBack(4),
    done_at: new Date(NOW - 4 * DAY_MS).toISOString(),
  });
  // What a person or a spec could have left: a step of their own, a real yes (no note), an event of another kind that
  // happens to carry the note, and a step under the seed's prefix that was left open.
  planted("person_notes", {
    id: "their-step",
    contact_id: casey.id,
    body: "Call back about the quote",
    author_kind: "member",
    author_user_id: ownerId,
    team_only: true,
    due_on: dayBack(-3),
    done_at: null,
  });
  planted("events", {
    id: "their-yes",
    kind: "contact.consent_changed",
    subject_type: "contact",
    subject_id: casey.id,
    data: { consent: "opted_in", source: "customer_message", channel: "sms" },
    created_at: new Date(NOW).toISOString(),
  });
  planted("events", {
    id: "other-kind",
    kind: "contact.noted",
    subject_type: "contact",
    subject_id: casey.id,
    data: { note: PEOPLE_NOTE },
    created_at: new Date(NOW).toISOString(),
  });
  planted("person_notes", {
    id: "left-open",
    contact_id: casey.id,
    body: `${PEOPLE_PREFIX}left open by a spec`,
    author_kind: "member",
    author_user_id: ownerId,
    team_only: true,
    due_on: dayBack(2),
    done_at: null,
  });

  await seed.convergePeople(w.db, T, ownerId, NOW + DAY_MS);

  const ids = (rows) => rows.map((r) => r.id);
  assert.equal(ids(of(w.t, "person_notes", T)).includes("left-open"), false, "an open step under the prefix goes");
  assert.equal(ids(of(w.t, "person_notes", T)).includes("their-step"), true, "a step without the prefix stays");
  assert.deepEqual(
    [of(w.t, "person_notes", T).length, seededSteps(w.t, T).length],
    [4, 3],
    "the person's step and the seed's three again, none added to",
  );
  const seeded = yesEvents(w.t, T).filter((e) => e.data.note === PEOPLE_NOTE);
  assert.equal(ids(yesEvents(w.t, T)).includes("their-yes"), true, "a yes without the note stays");
  assert.equal(seeded.length, 3, "and the seed's three again");
  assert.equal(
    ids(of(w.t, "events", T)).includes("other-kind"),
    true,
    "another kind of event is not the seed's to delete",
  );
  assert.deepEqual(
    [...new Set(seeded.map((e) => e.created_at))],
    [new Date(NOW + DAY_MS - 7 * DAY_MS).toISOString()],
    "all dated from the new run",
  );
  assert.equal(
    w.t.events.some((e) => e.id === "elsewhere-yes"),
    true,
    "another workspace's yes, with the seed's note, stays",
  );
  assert.equal(
    w.t.person_notes.some((n) => n.id === "elsewhere-step"),
    true,
    "and so does its step, with the seed's prefix",
  );
});

test("verify() names a step left open under the prefix, one with no day, a yes that is gone or doubled, a step that is gone and a queued message", async () => {
  const w = world();
  const { tenantId: T } = await run(w);
  const ownerId = w.users.find((u) => u.email === OWNER).id;
  assert.deepEqual(await verify(w.db, T, ownerId), []);
  const said = async () => (await verify(w.db, T, ownerId)).join(" | ");
  const casey = personAt(w.t, T, CASEY.phone);
  const step = (over) => ({
    id: crypto.randomUUID(),
    tenant_id: T,
    contact_id: casey.id,
    body: `${PEOPLE_PREFIX}planted`,
    author_kind: "member",
    author_user_id: ownerId,
    team_only: true,
    ...over,
  });

  // An open step: a row in Today and a person on the Steps due list.
  const open = step({ due_on: dayBack(1), done_at: null });
  w.t.person_notes.push(open);
  assert.match(await said(), /open or have no day/, "an open step is named");
  w.t.person_notes.splice(w.t.person_notes.indexOf(open), 1);
  assert.equal(await said(), "");

  // A seeded note with no day is no step at all: the lens counts none of it, and nothing says it was meant to.
  const dayless = step({ due_on: null, done_at: null, team_only: false });
  w.t.person_notes.push(dayless);
  assert.match(await said(), /open or have no day/, "and so is one with no day");
  w.t.person_notes.splice(w.t.person_notes.indexOf(dayless), 1);

  // A step that is gone.
  const [gone] = seededSteps(w.t, T);
  w.t.person_notes.splice(w.t.person_notes.indexOf(gone), 1);
  assert.match(await said(), /done steps/, "a missing step is named");
  w.t.person_notes.push(gone);
  assert.equal(await said(), "");

  // A yes that is gone, and one that is doubled.
  const [lost] = yesEvents(w.t, T).filter((e) => e.data.note === PEOPLE_NOTE);
  w.t.events.splice(w.t.events.indexOf(lost), 1);
  assert.match(await said(), /yes event/, "a missing yes is named");
  w.t.events.push(lost);
  assert.equal(await said(), "");
  const twin = { ...lost, id: crypto.randomUUID() };
  w.t.events.push(twin);
  assert.match(await said(), /yes event/, "and a doubled one");
  w.t.events.splice(w.t.events.indexOf(twin), 1);
  assert.equal(await said(), "");

  // A queued message, which a send job would pick up (as the Receptionist's rows hold it).
  w.t.messages.push({ id: "queued-by-hand", tenant_id: T, sender: "ai", direction: "outbound", status: "queued" });
  assert.match(await said(), /queued/);
  w.t.messages.pop();
  assert.equal(await said(), "");

  // All of it put back by the next run.
  w.t.person_notes.push(open);
  w.t.events.splice(w.t.events.indexOf(lost), 1);
  assert.notEqual(await said(), "");
  await run(w, { now: NOW + DAY_MS });
  assert.deepEqual(await verify(w.db, T, ownerId), [], "the next run puts it back");
});
