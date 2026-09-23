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
import { fakeDb } from "./_fake-db.mjs";
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
} from "../e2e-workspace.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chooseAddressing, reachesTenant } = await import(
  pathToFileURL(path.join(here, "../../../apps/edge/lib/ops/notify.ts")).href
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
};

/** A database in memory, an auth admin, and provision_tenant as the migrations write it. */
function world(tables = {}) {
  // The platform's one row exists on every database release A touched; the seed
  // adds this workspace to tenants_on and must never flip searches_on.
  const t = {
    tenants: [],
    memberships: [],
    lead_platform: [{ id: true, searches_on: false, tenants_on: [] }],
    ...tables,
  };
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
  return { db, t, users };
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

test("the lead seed is six fictional places in one finished search, and the workspace may search while the switch is off", async () => {
  const w = world();
  await run(w);
  const T = w.t.tenants[0].id;
  assert.deepEqual(w.t.leads.map((l) => l.business_name).sort(), LEADS.map((l) => l.business_name).sort());
  for (const l of w.t.leads) {
    assert.match(l.phone_e164, /^\+1\d{3}55501\d{2}$/, `${l.business_name}: the fiction range`);
    if (l.email) assert.match(l.email, /\.example$/, `${l.business_name}: a fictional address`);
    assert.match(l.place_id, /^ChIJfixture\d{4}$/);
  }
  assert.equal(w.t.lead_searches.length, 1);
  assert.equal(w.t.lead_searches[0].name, LEAD_SEARCH.name);
  const [round] = w.t.lead_rounds;
  assert.deepEqual(
    [round.state, round.ending, round.seq],
    ["ended", "target_reached", 1],
    "written queued, then ended: lead_rounds_guard refuses an ended insert",
  );
  assert.deepEqual(
    w.t.lead_search_members.map((m) => [m.class, m.counted]).sort(),
    [
      ["excluded", false],
      ["qualified", true],
      ["qualified", true],
      ["qualified", true],
      ["review", false],
      ["review", false],
    ].sort(),
  );
  assert.equal(w.t.lead_counters.find((c) => c.kind === "allowance").used, LEAD_COUNTED);
  const platform = w.t.lead_platform[0];
  assert.deepEqual(platform.tenants_on, [T], "listed, so a paid run may start one here");
  assert.equal(platform.searches_on, false, "and the switch every other workspace reads is untouched");
  await converge(w.db, { ownerEmail: OWNER, memberEmail: MATE, apply: true, now: NOW });
  assert.equal(w.t.lead_searches.length, 1);
  assert.equal(w.t.leads.length, LEADS.length);
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
    problems.some((p) => p.includes("not the 6 fixtures")),
    problems.join("; "),
  );
  assert.ok(
    problems.some((p) => p.includes("not fictional")),
    problems.join("; "),
  );
});
