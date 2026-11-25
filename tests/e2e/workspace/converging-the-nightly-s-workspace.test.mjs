/**
 * The nightly's own workspace, converged: twice is one state, every row one the production sweeps leave alone, the
 * yeses Today reads, what the specs leave behind put back, what it must not reset refused, a dry run, a backup, and
 * the lead and Google seeds as they are made, verify() naming any that drifted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TenantConfigWriteSchema, reviewIsNew, DAY_MS } from "@chanlytics/contracts";
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
  GOOGLE_LISTING,
  GOOGLE_REVIEWS,
  GOOGLE_DAYS,
} from "../../../tooling/scripts/ops/e2e-workspace.mjs";
import {
  CAMPAIGNS_NOTE,
  CAMPAIGN_RUN,
  MATE,
  NOW,
  OWNER,
  PEOPLE_PREFIX,
  QUESTION_WAIT_MS,
  ROBIN,
  chooseAddressing,
  googleReader,
  listConnectionsDue,
  listListingsDue,
  of,
  planLeadSweep,
  reachesTenant,
  run,
  sweepGoogle,
  threadOf,
  wire,
  world,
} from "./_workspace.mjs";

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
    3,
    "Robin's, whose two messages the other specs read, Sam's, which the Receptionist lens draws, and Casey's, where the Campaigns run's reply is",
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
  for (const table of ["jobs", "lines", "playbooks"]) {
    assert.equal(of(w.t, table, T).length, 0, `no ${table}`);
  }
  // The one run is the Campaigns lens's, and it went out: nothing is waiting for a person or for a send job.
  assert.deepEqual(
    of(w.t, "broadcasts", T).map((b) => b.state),
    ["sent"],
    "one run, and it is sent",
  );
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
    purpose: r.purpose,
    ending_pending: r.ending_pending ?? null,
    waiting_since: r.waiting_since ?? null,
    // When it last moved, as lead_rounds_guard stamps it (00506): the seed's moves are each a moment ago.
    state_since: r.state_since ?? r.created_at,
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
  const target = { tenantId: T, notifications: cfg.config.notifications };
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
  // A run a spec made and left waiting, with a person on it (the database cascades them; a double does not): every run starts from none.
  w.t.broadcasts.push({
    id: "stray-run",
    tenant_id: T,
    name: "stray run",
    state: "scheduled",
    scheduled_for: new Date(NOW + DAY_MS).toISOString(),
  });
  w.t.broadcast_recipients.push({
    broadcast_id: "stray-run",
    contact_id: robin.id,
    tenant_id: T,
    state: "queued",
    channel: "whatsapp",
  });
  const cfg = w.t.tenant_config.find((r) => r.tenant_id === T);
  cfg.config = { ...cfg.config, notifications: { escalation_emails: ["owner@a-real-business.com"] } };

  await run(w, { now: NOW + 3_600_000 });
  assert.deepEqual(
    of(w.t, "broadcasts", T).map((b) => b.name),
    [CAMPAIGN_RUN],
    "the stray run is gone and the seed's own is written afresh",
  );
  assert.deepEqual(
    of(w.t, "broadcast_recipients", T)
      .map((r) => r.state)
      .sort(),
    ["sent", "sent", "skipped"],
    "and so are its people: the stray's queued one went with its run",
  );

  assert.deepEqual(
    of(w.t, "contacts", T)
      .map((c) => c.display_name)
      .sort(),
    PEOPLE.map((p) => p.name).sort(),
  );
  assert.equal(of(w.t, "conversations", T).length, 3, "Robin's, Sam's and Casey's: the stray one is gone");
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
    converge(world().db, { ownerEmail: "ruben@rjcapital.example", memberEmail: MATE, apply: true }),
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
  assert.deepEqual(
    ["sequence_batches", "sequence_sends"].map((table) => backedUp.filter((r) => r.table === table).length),
    [1, 3],
    "the run the Campaigns lens reads and its three people, which the run deletes and writes again",
  );
  assert.deepEqual(
    backedUp.filter((r) => r.table === "decisions").map((r) => r.row.payload.seed),
    [CAMPAIGNS_NOTE],
    "and its approval alone of the decisions: the seed's own, found by its mark",
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

test("the Google sweep reaches the seed only a day on, and then writes its failure on the row and tells the owner once, and nothing else: no stamp moved, no review touched, and the next morning's seed clears both", async () => {
  const w = world();
  const hour = 3_600_000;
  const seededAt = Date.now() - 21 * hour;
  const { tenantId: T } = await run(w, { now: seededAt });
  const stamp = new Date(seededAt).toISOString();
  assert.deepEqual(await listListingsDue(w.db, new Date(seededAt + 19 * hour), 40), [], "not due at nineteen hours");
  assert.deepEqual(await listConnectionsDue(w.db, new Date(seededAt + 19 * hour), 40), []);
  assert.equal((await listListingsDue(w.db, new Date(), 40)).length, 1, "due at twenty-one");
  assert.equal((await listConnectionsDue(w.db, new Date(), 40)).length, 1);

  const kept = () =>
    JSON.stringify([of(w.t, "google_reviews", T), of(w.t, "google_listing_days", T), of(w.t, "events", T)]);
  const bells = () => of(w.t, "notifications", T).map((n) => [n.kind, n.subject_type, n.title]);
  const before = kept();
  const rang = bells();
  wire.length = 0;
  const quiet = { info() {}, warn() {}, error() {}, debug() {} };
  const res = await sweepGoogle({ db: w.db, L: quiet, started: Date.now() });
  assert.deepEqual(await res.json(), { ok: true, due: 1, handed: 1 }, "the clock hands the workspace its job");
  assert.deepEqual(wire, [], "and asks Google nothing itself");
  assert.deepEqual(await googleReader(w.db).read({ tenant_id: T }, Date.now() + 45_000), {
    read: {
      listings_due: 1,
      listings_read: 0,
      profiles_due: 1,
      profiles_synced: 0,
      fresh: 0,
      counted: 0,
      failed: 2,
      left: 0,
    },
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
  assert.equal(kept(), before, "no review, day or event was written");
  assert.deepEqual(
    bells(),
    [...rang, ["sweep", "google_connection", "Google Business Profile stopped updating"]],
    "the owner is told once: a profile with no credentials is a cause only they can mend (R11 S11-4)",
  );

  await run(w, { now: seededAt + 24 * hour });
  const [mended] = of(w.t, "google_listings", T);
  const [reconnected] = of(w.t, "google_connections", T);
  assert.deepEqual([mended.check_error, reconnected.sync_error], [null, null], "the next morning's seed clears both");
  assert.deepEqual(bells(), rang, "and the notice with them");
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
