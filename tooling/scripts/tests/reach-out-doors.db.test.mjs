/**
 * Reach out's doors on the database (00184, Reach out Part 3 PR 3): one capacity per domain (D15's days sent, the
 * day's use, the timetable's times), the send door keyed by the lead a send is for, the leads a chain's first step may
 * write to, the person a first send makes without converting its lead, a step's followers, and the claim that never
 * spends a domain's day twice. Email rows are frozen as the send path freezes them (buildEmailRequest with
 * ownDomainIdentity), so the From every door reads is the real shape. Local stack only: it makes workspaces.
 */
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { buildEmailRequest, ownDomainIdentity } from "@chanlytics/channels";
import { claimSends } from "@chanlytics/db";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

const H = 3_600_000;
const DAY = 24 * H;
const stamp = Date.now().toString(36);
const MAILBOX = { local_part: "harbor", reply_token: "b".repeat(24), from_name: "Harbor" };
// A fixed noon (UTC) today: the days a row left on are the UTC days either side of it, whatever the hour of the run.
const NOON = Math.floor(Date.now() / DAY) * DAY + 12 * H;
const iso = (ms) => new Date(ms).toISOString();

let db;
let A;
let search;
let template;
let root;
let step;
let rootRun;
let stepRun;
let thread;
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

const domainRow = (over = {}) =>
  one(
    db.from("sending_domains").insert({
      tenant_id: A,
      host: `d${++n}-${stamp}.example`,
      from_local: "sam",
      from_name: "Sam at Harbor",
      state: "verified",
      provider_status: "verified",
      dmarc: "found",
      verified_at: iso(Date.now() - 10 * DAY),
      clean_since: iso(Date.now() - 10 * DAY),
      ...over,
    }),
  );
const hostOf = async (id) => ok(await db.from("sending_domains").select("host").eq("id", id).single()).host;

/** One outbound email from an own domain, frozen as the send path freezes it. */
async function emailFrom(host, { status = "sent", error = null, sentAt = null, conv = thread } = {}) {
  const id = crypto.randomUUID();
  const request = buildEmailRequest({
    identity: ownDomainIdentity({ host, from_local: "sam", from_name: "Sam" }, MAILBOX, "mail.chanlytics.com"),
    to: `owner-${stamp}@fixture-doors.example`,
    parent: null,
    subject: "Your moving quotes",
    body: "Saw your shop on the map.",
    signature: null,
    actor: "ai",
    campaign: {
      unsubscribeUrl: "https://app.chanlytics.com/u/t",
      footer: "Unsubscribe: https://app.chanlytics.com/u/t",
    },
    messageId: id,
    tenantId: A,
  });
  ok(
    await db.from("messages").insert({
      id,
      tenant_id: A,
      conversation_id: conv,
      channel: "email",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "Saw your shop on the map.",
      status,
      error,
      ...(sentAt ? { created_at: iso(sentAt - 60_000) } : {}),
      meta: {
        email: { subject: request.subject, to: request.to[0], request, message_id: `<${id}@mail.chanlytics.com>` },
        ...(sentAt ? { status_at: { sent: iso(sentAt) } } : {}),
      },
    }),
  );
  return id;
}

const lead = (over = {}) => {
  n += 1;
  return one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureDoors${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      phone_e164: `+1512555${String(1000 + n).slice(-4)}`,
      email: `owner-${stamp}-${n}@fixture-doors.example`,
      email_state: "ok",
      stage: "ready",
      ...over,
    }),
  );
};
const member = (leadId, over = {}) =>
  one(
    db.from("lead_search_members").insert({
      search_id: search,
      lead_id: leadId,
      tenant_id: A,
      class: "qualified",
      counted: true,
      counted_month: new Date().toISOString().slice(0, 7),
      fit: "look",
      judgment: { answer: "yes", reasons: [], shares: [] },
      ...over,
    }),
  );

/**
 * A send in a run, checked (00190: a claim takes a checked send only), moved along the guard's own path to the state
 * asked (00183: planned → claimed → queued → sent).
 */
async function sendIn(over = {}, to = "planned", at = {}) {
  const id = crypto.randomUUID();
  ok(
    await db.from("reach_out_sends").insert({
      id,
      tenant_id: A,
      broadcast_id: rootRun,
      playbook_id: root,
      root_id: root,
      send_at: iso(Date.now() - 60_000),
      checked_at: iso(Date.now() - 60_000),
      ...over,
    }),
  );
  const path = ["planned", "claimed", "queued", "sent"];
  for (const s of path.slice(1, path.indexOf(to) + 1)) {
    const patch =
      s === "claimed"
        ? { state: s, claimed_at: iso(Date.now()) }
        : s === "queued"
          ? { state: s, message_id: at.messageId ?? null }
          : { state: s, sent_at: iso(at.sentAt ?? Date.now()) };
    const r = ok(await db.from("reach_out_sends").update(patch).eq("id", id).select("state"));
    assert.deepEqual(r, [{ state: s }], `moved to ${s}`);
  }
  return id;
}
const capacity = async (domain, at = NOON) =>
  ok(await db.rpc("sending_domain_capacity", { p_domain_id: domain, p_at: iso(at) }));
const hash = async (value) => ok(await db.rpc("lead_suppression_hash", { p_tenant_id: A, p_value: value }));

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `doors-a-${stamp}`, name: "Doors A" }));
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }));
  search = await one(
    db.from("lead_searches").insert({
      tenant_id: A,
      via: "people",
      card: "movers",
      name: "Movers in Austin",
      asked: "movers in Austin",
      plan: {},
    }),
  );
  template = await one(
    db.from("templates").insert({
      tenant_id: A,
      channel: "email",
      source: "chanlytics",
      name: `reach_first_${stamp}`,
      language: "en",
      category: "marketing",
      meta_status: "approved",
      components: [
        { type: "HEADER", text: "Your moving quotes" },
        { type: "BODY", text: "Hi {{business}}" },
      ],
    }),
  );
  const chain = {
    tenant_id: A,
    kind: "reach_out",
    policy_class: "outreach",
    gap_minutes: 12,
    template_id: template,
    template_name: `reach_first_${stamp}`,
    template_language: "en",
    params: [],
  };
  root = await one(
    db.from("playbooks").insert({ ...chain, name: "Movers in Austin", trigger: "lead_first", lead_search_id: search }),
  );
  step = await one(
    db
      .from("playbooks")
      .insert({ ...chain, name: "Nudge", trigger: "after_step", after_playbook_id: root, after_days: 3 }),
  );
  const run = (playbook, day, over = {}) =>
    one(
      db.from("broadcasts").insert({
        tenant_id: A,
        name: "Movers in Austin",
        template_id: template,
        template_name: `reach_first_${stamp}`,
        template_language: "en",
        audience: { kind: "reach_out", root_id: root, step_id: playbook, search_id: search },
        state: "scheduled",
        scheduled_for: iso(Date.now()),
        playbook_id: playbook,
        run_for: day,
        ...over,
      }),
    );
  rootRun = await run(root, "2026-09-28");
  stepRun = await run(step, "2026-10-01");
  const person = await one(
    db.from("contacts").insert({ tenant_id: A, email: `thread-${stamp}@fixture-doors.example` }),
  );
  thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: person }));
});
// A workspace sends from five domains at most (00175): each case removes its own, and its sends keep their place.
afterEach(async () => {
  if (!skip && A) ok(await db.from("sending_domains").delete().eq("tenant_id", A));
});
after(async () => {
  if (skip) return;
  if (A) ok(await db.from("tenants").delete().eq("id", A));
});

test("capacity: a domain's day, its days sent (D15), and the times it spends, from one read", { skip }, async () => {
  const d = await domainRow();
  const host = await hostOf(d);
  assert.deepEqual(await capacity(d), {
    state: "verified",
    clean_since: (await db.from("sending_domains").select("clean_since").eq("id", d).single()).data.clean_since,
    sent_days: 0,
    used: 0,
    recent: [],
    last_sent_at: null,
  });
  // Two left on this UTC day, one the day before: one day sent before today (today's counts from tomorrow, so a
  // domain's share holds all day), two spent in the rolling day.
  await emailFrom(host, { sentAt: NOON - 1 * H });
  await emailFrom(host, { sentAt: NOON - 2 * H });
  await emailFrom(host, { sentAt: NOON - 25 * H });
  let c = await capacity(d);
  assert.deepEqual([c.sent_days, c.used], [1, 2]);
  assert.equal((await capacity(d, NOON + DAY)).sent_days, 2, "tomorrow, today is a day sent");
  // Written and not yet left, and claimed with no row yet: each spends the day too.
  await emailFrom(host, { status: "queued" });
  await sendIn({ domain_id: d, lead_id: await lead() }, "claimed");
  c = await capacity(d);
  assert.equal(c.used, 4);
  // A planned send is a time the timetable keeps clear, never a send spent.
  const later = NOON + 1 * H;
  await sendIn({ domain_id: d, lead_id: await lead(), send_at: iso(later) });
  c = await capacity(d);
  assert.equal(c.used, 4);
  assert.ok(c.recent.includes(later), "the planned time is in recent");
  assert.ok(c.recent.includes(NOON - 1 * H) && !c.recent.includes(NOON - 25 * H), "the rolling day's, not yesterday's");
  // Another domain's mail counts nothing here.
  await emailFrom(await hostOf(await domainRow()), { sentAt: NOON - 3 * H });
  assert.equal((await capacity(d)).used, 4);
  assert.equal(Date.parse((await capacity(d)).last_sent_at), NOON - 1 * H);

  // The rolling day is (at - 24 h, at], as the timetable counts it: one left exactly a day before is out, one at the
  // moment is in.
  const edge = await domainRow();
  const edgeHost = await hostOf(edge);
  await emailFrom(edgeHost, { sentAt: NOON - DAY });
  await emailFrom(edgeHost, { sentAt: NOON });
  assert.equal((await capacity(edge)).used, 1);
});

test(
  "D15 counts the days sent in the last 90 since it was clean: a domain idle for months warms again",
  { skip },
  async () => {
    const d = await domainRow({ clean_since: iso(NOON - 200 * DAY), verified_at: iso(NOON - 200 * DAY) });
    const host = await hostOf(d);
    for (const daysBack of [150, 120, 100]) await emailFrom(host, { sentAt: NOON - daysBack * DAY });
    await emailFrom(host, { sentAt: NOON - 5 * DAY });
    assert.equal((await capacity(d)).sent_days, 1, "only the day inside the last 90");
    // And never before it was clean: a Resume starts the count again.
    ok(
      await db
        .from("sending_domains")
        .update({ clean_since: iso(NOON - 2 * DAY) })
        .eq("id", d),
    );
    assert.equal((await capacity(d)).sent_days, 0);
  },
);

test(
  "the send door is keyed by the lead a send is for; without one, the lead still being written to wins",
  { skip },
  async () => {
    const d = await domainRow();
    const host = await hostOf(d);
    const person = await one(db.from("contacts").insert({ tenant_id: A, email: `two-${stamp}@fixture-doors.example` }));
    const closed = await lead({ contact_id: person, stage: "archived", closed_reason: "not_a_fit" });
    await lead({ contact_id: person, stage: "ready" });
    const facts = async (over) =>
      ok(
        await db.rpc("outreach_facts", {
          p_tenant_id: A,
          p_contact_id: person,
          p_to: `two-${stamp}@fixture-doors.example`,
          p_host: host,
          p_since: iso(Date.now() - DAY),
          ...over,
        }),
      );
    assert.equal((await facts({ p_lead_id: closed })).lead_stage, "archived", "the send's own lead");
    assert.equal((await facts({})).lead_stage, "ready", "00181's rule without one");
    // The five arguments an edge built before this answers with, and the domain's days sent beside its state: the
    // ramp's days as the domains clock wrote them on the row (none until written).
    const five = await facts({});
    assert.deepEqual(Object.keys(five.domain).sort(), ["clean_since", "from_local", "sent_days", "state"]);
    assert.equal(five.domain.sent_days, 0);
    ok(await db.from("sending_domains").update({ sent_days: 16 }).eq("id", d));
    assert.equal((await facts({})).domain.sent_days, 16);
    // The lead's own facts, as a step's followers ask them: the same answer, without the domain's.
    const own = ok(
      await db.rpc("outreach_lead_facts", {
        p_tenant_id: A,
        p_contact_id: person,
        p_to: `two-${stamp}@fixture-doors.example`,
        p_lead_id: closed,
      }),
    );
    assert.deepEqual(own, { lead_stage: "archived", suppressed: false, wrote_back: false });
    // A lead of somebody else's is no lead of this person's.
    const other = await lead({ stage: "ready" });
    assert.equal((await facts({ p_lead_id: other })).lead_stage, null);
  },
);

test(
  "the audience: qualified, counted, ready, a checked address, never a customer's, never the never-again list, never twice in a chain, strongest first",
  { skip },
  async () => {
    const want = [];
    const strong = await lead();
    await member(strong, { fit: "strong" });
    const look = await lead();
    await member(look, { fit: "look" });
    const long = await lead();
    await member(long, { fit: "long" });
    want.push(strong, look, long);
    // Each of these is left out, for its own reason.
    const out = {};
    out.review = await lead();
    await member(out.review, { class: "review", counted: false, counted_month: null });
    out.notCounted = await lead();
    await member(out.notCounted, { counted: false, counted_month: null });
    // The place is on the never-again list (a customer's listing, or an erased one).
    out.byPlace = await lead();
    await member(out.byPlace);
    const place = ok(await db.from("leads").select("place_id").eq("id", out.byPlace).single()).place_id;
    ok(
      await db
        .from("lead_suppressions")
        .insert({ tenant_id: A, kind: "place", hash: await hash(place), what: "customer" }),
    );
    // Somebody in People wrote from this address once, and has another on file now: still theirs.
    const wroteFrom = `wrote-from-${stamp}@fixture-doors.example`;
    const moved = await one(
      db.from("contacts").insert({ tenant_id: A, email: `moved-${stamp}@fixture-doors.example` }),
    );
    ok(
      await db
        .from("contact_identities")
        .insert({ tenant_id: A, contact_id: moved, channel: "email", external_id: wroteFrom }),
    );
    out.byIdentity = await lead({ email: wroteFrom });
    await member(out.byIdentity);
    out.archived = await lead({ stage: "archived", closed_reason: "not_a_fit" });
    await member(out.archived);
    out.catchAll = await lead({ email_state: "catch_all" });
    await member(out.catchAll);
    out.shared = await lead();
    await member(out.shared, { judgment: { answer: "yes", reasons: [], shares: ["phone"] } });
    // A person in People with this address (made first, so the insert trigger has no lead to link).
    const yoursEmail = `yours-${stamp}@fixture-doors.example`;
    ok(await db.from("contacts").insert({ tenant_id: A, email: yoursEmail }));
    out.yours = await lead({ email: yoursEmail });
    await member(out.yours);
    out.suppressed = await lead();
    await member(out.suppressed);
    const sEmail = ok(await db.from("leads").select("email").eq("id", out.suppressed).single()).email;
    ok(
      await db
        .from("lead_suppressions")
        .insert({ tenant_id: A, kind: "email", hash: await hash(sEmail), what: "email_opt_out" }),
    );
    // A business erased, or a customer, by its number: found again under a new address, it is still not written to.
    out.byPhone = await lead();
    await member(out.byPhone);
    const phone = ok(await db.from("leads").select("phone_e164").eq("id", out.byPhone).single()).phone_e164;
    ok(
      await db
        .from("lead_suppressions")
        .insert({ tenant_id: A, kind: "phone", hash: await hash(phone), what: "erased" }),
    );
    out.inChain = await lead();
    await member(out.inChain);
    await sendIn({ lead_id: out.inChain, domain_id: await domainRow() });
    // A lead in a run its owner skipped is the chain's again.
    const skipped = await lead();
    await member(skipped, { fit: "long" });
    const s = await sendIn({ lead_id: skipped, domain_id: await domainRow() });
    ok(await db.from("reach_out_sends").update({ state: "skipped", reason: "run_canceled" }).eq("id", s));
    want.push(skipped);

    const rows = ok(
      await db.rpc("reach_out_audience", { p_tenant_id: A, p_search_id: search, p_root_id: root, p_limit: 50 }),
    );
    const ids = rows.map((r) => r.lead_id);
    for (const [why, id] of Object.entries(out)) assert.ok(!ids.includes(id), `${why} is left out`);
    assert.deepEqual(
      ids.filter((id) => want.includes(id)),
      [strong, look, long, skipped],
      "the finder's fit, strongest first, then the longest found",
    );
    assert.equal(
      rows.find((r) => r.lead_id === strong).email,
      ok(await db.from("leads").select("email").eq("id", strong).single()).email,
    );
    assert.equal(
      ok(await db.rpc("reach_out_audience", { p_tenant_id: A, p_search_id: search, p_root_id: root, p_limit: 1 }))
        .length,
      1,
    );
    // Asked for another workspace, this search is nobody's.
    const elsewhere = crypto.randomUUID();
    assert.deepEqual(
      ok(
        await db.rpc("reach_out_audience", {
          p_tenant_id: elsewhere,
          p_search_id: search,
          p_root_id: root,
          p_limit: 50,
        }),
      ),
      [],
    );
  },
);

test("the person a first send needs is made once, and its lead is not converted by it", { skip }, async () => {
  const l = await lead();
  const before = ok(await db.from("leads").select("version, email").eq("id", l).single());
  const first = ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: l }));
  assert.equal(first.made, true);
  const after1 = ok(await db.from("leads").select("contact_id, stage, version, converted_at").eq("id", l).single());
  assert.deepEqual(
    [after1.contact_id, after1.stage, after1.version, after1.converted_at],
    [first.contact_id, "ready", before.version + 1, null],
    "linked, still ready: nobody has written back",
  );
  const identity = ok(
    await db.from("contact_identities").select("channel, external_id").eq("contact_id", first.contact_id),
  );
  assert.deepEqual(identity, [{ channel: "email", external_id: before.email }]);
  const conv = ok(await db.from("conversations").select("id").eq("contact_id", first.contact_id).single());
  assert.equal(conv.id, first.conversation_id);
  const added = ok(
    await db.from("events").select("data").eq("subject_id", first.contact_id).eq("kind", "contact.added"),
  );
  assert.equal(added.length, 1);
  assert.deepEqual([added[0].data.source, added[0].data.lead_id, added[0].data.by], ["lead", l, "reach_out"]);
  // Asked again, the same person, made by nobody.
  const again = ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: l }));
  assert.deepEqual(
    [again.contact_id, again.conversation_id, again.made],
    [first.contact_id, first.conversation_id, false],
  );
  // A customer since it was planned: a person with its address came into People, and outside the door the insert
  // trigger still links and converts the lead (the switch is the door's transaction's alone). Its person is theirs.
  const email = `customer-${stamp}@fixture-doors.example`;
  const became = await lead({ email });
  ok(await db.from("contacts").insert({ tenant_id: A, email }));
  assert.equal(ok(await db.from("leads").select("stage").eq("id", became).single()).stage, "converted");
  assert.deepEqual(ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: became })), {
    refused: "lead_closed",
  });
  // Somebody in People had the address before the finder found it (the trigger had no lead to link then): a customer,
  // never written to cold.
  const earlier = `earlier-${stamp}@fixture-doors.example`;
  ok(await db.from("contacts").insert({ tenant_id: A, email: earlier }));
  const taken = await lead({ email: earlier });
  assert.deepEqual(ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: taken })), {
    refused: "already_yours",
  });
  assert.equal(ok(await db.from("contacts").select("id").eq("tenant_id", A).eq("email", earlier)).length, 1);
  assert.deepEqual(
    ok(
      await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: await lead({ email: null, email_state: "none" }) }),
    ),
    {
      refused: "no_address",
    },
  );
  const gone = await lead();
  ok(
    await db
      .from("leads")
      .update({ erased_at: iso(Date.now()) })
      .eq("id", gone),
  );
  assert.deepEqual(ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: gone })), { refused: "lead_gone" });
  // An address People cannot hold is no address, refused rather than thrown.
  assert.deepEqual(
    ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: await lead({ email: "no-dot@localhost" }) })),
    {
      refused: "no_address",
    },
  );
  // One they wrote from once, with another address on file now: theirs.
  const wroteFrom = `person-wrote-${stamp}@fixture-doors.example`;
  const moved = await one(
    db.from("contacts").insert({ tenant_id: A, email: `person-now-${stamp}@fixture-doors.example` }),
  );
  ok(
    await db
      .from("contact_identities")
      .insert({ tenant_id: A, contact_id: moved, channel: "email", external_id: wroteFrom }),
  );
  assert.deepEqual(
    ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: await lead({ email: wroteFrom }) })),
    {
      refused: "already_yours",
    },
  );
});

test("two claims make one person for one address at once: the other is refused, never an error", { skip }, async () => {
  for (let round = 0; round < 5; round += 1) {
    const email = `twice-${round}-${stamp}@fixture-doors.example`;
    const [x, y] = [await lead({ email }), await lead({ email })];
    const answers = await Promise.all([
      db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: x }),
      db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: y }),
    ]);
    for (const a of answers) assert.equal(a.error, null, a.error?.message);
    const said = answers.map((a) => (a.data.refused ? a.data.refused : "made")).sort();
    assert.deepEqual(said, ["already_yours", "made"], `round ${round}`);
    assert.equal(ok(await db.from("contacts").select("id").eq("tenant_id", A).eq("email", email)).length, 1);
  }
});

test(
  "a step's followers: sent the step before long enough ago, not on this step yet, and only those the door would write to (00185)",
  { skip },
  async () => {
    const d = await domainRow();
    const host = await hostOf(d);
    const sentTo = async ({ daysAgo, status = "sent", error = null }) => {
      const l = await lead();
      const p = ok(await db.rpc("reach_out_person", { p_tenant_id: A, p_lead_id: l }));
      const m = await emailFrom(host, { status, error, sentAt: Date.now() - daysAgo * DAY, conv: p.conversation_id });
      await sendIn({ lead_id: l, contact_id: p.contact_id, domain_id: d }, "sent", {
        messageId: m,
        sentAt: Date.now() - daysAgo * DAY,
      });
      return { lead: l, ...p, message: m };
    };
    const due = await sentTo({ daysAgo: 4 });
    const early = await sentTo({ daysAgo: 2 });
    const already = await sentTo({ daysAgo: 4 });
    await sendIn({
      broadcast_id: stepRun,
      playbook_id: step,
      lead_id: already.lead,
      contact_id: already.contact_id,
      domain_id: d,
    });
    const bounced = await sentTo({ daysAgo: 5, status: "failed", error: { provider: "bounced" } });
    const failed = await sentTo({ daysAgo: 5, status: "failed", error: { provider: "failed" } });
    // Erased with its person: the sent email's row is gone, and there is nobody to follow up.
    const erased = await sentTo({ daysAgo: 4 });
    ok(await db.from("messages").delete().eq("id", erased.message));
    const wrote = await sentTo({ daysAgo: 4 });
    ok(
      await db.from("messages").insert({
        tenant_id: A,
        conversation_id: wrote.conversation_id,
        channel: "email",
        direction: "inbound",
        sender: "customer",
        type: "text",
        body: "Not interested, thanks.",
        status: "received",
        meta: { email: { subject: "Re: Your moving quotes" } },
      }),
    );
    const rows = ok(
      await db.rpc("reach_out_followers", {
        p_tenant_id: A,
        p_step_id: step,
        p_parent_id: root,
        p_after_days: 3,
        p_limit: 50,
      }),
    );
    const by = Object.fromEntries(rows.map((r) => [r.lead_id, r]));
    assert.ok(by[due.lead] && !by[early.lead] && !by[already.lead], "due, not too early, not on the step yet");
    assert.deepEqual(
      [by[due.lead].contact_id, by[due.lead].parent_message_id, by[due.lead].bounced, by[due.lead].facts.wrote_back],
      [due.contact_id, due.message, false, false],
    );
    assert.equal(by[due.lead].facts.lead_stage, "ready", "the door's own answer, keyed by the lead");
    // 00185: one the door would refuse never comes back to hold a place at the head of the page.
    assert.ok(!by[bounced.lead], "any bounce in the chain stops it (C4)");
    assert.ok(!by[failed.lead], "an email that failed for good stops it too");
    assert.ok(!by[erased.lead], "an erased email has no follower");
    assert.ok(!by[wrote.lead], "a reply stops it");
    assert.deepEqual(
      ok(
        await db.rpc("reach_out_followers", {
          p_tenant_id: crypto.randomUUID(),
          p_step_id: step,
          p_parent_id: root,
          p_after_days: 3,
          p_limit: 50,
        }),
      ),
      [],
      "another workspace's step has no followers here",
    );
  },
);

test(
  "the claim: within the day's room, due sends of a running chain only, and never twice under two ticks (C7)",
  { skip },
  async () => {
    // Each claim at its own moment, after its sends were planned a minute ago.
    const claim = async (domain, cap, limit = 10) =>
      ok(
        await db.rpc("reach_out_claim", {
          p_domain_id: domain,
          p_cap: cap,
          p_at: new Date().toISOString(),
          p_limit: limit,
        }),
      );
    // Cap 2 with one already left today: room for one of three due.
    const d1 = await domainRow();
    await emailFrom(await hostOf(d1), { sentAt: Date.now() - H });
    for (let i = 0; i < 3; i += 1) await sendIn({ domain_id: d1, lead_id: await lead() });
    const got = await claim(d1, 2);
    assert.equal(got.length, 1);
    assert.equal(got[0].state, "claimed");
    assert.equal((await claim(d1, 2)).length, 0, "the claimed one spends the day as well");

    // Two ticks at once, cap 3, five due: three claimed between them, never more.
    const d2 = await domainRow();
    for (let i = 0; i < 5; i += 1) await sendIn({ domain_id: d2, lead_id: await lead() });
    const [x, y] = await Promise.all([claim(d2, 3), claim(d2, 3)]);
    assert.equal(x.length + y.length, 3);
    assert.equal(new Set([...x, ...y].map((r) => r.id)).size, 3);

    // Not yet due, a paused chain's, a run waiting for its owner's yes, a held domain's: none of them.
    const d3 = await domainRow();
    const notDue = await sendIn({ domain_id: d3, lead_id: await lead(), send_at: iso(Date.now() + H) });
    const paused = await one(
      db.from("playbooks").insert({
        tenant_id: A,
        kind: "reach_out",
        policy_class: "outreach",
        gap_minutes: 12,
        template_id: template,
        template_name: `reach_first_${stamp}`,
        template_language: "en",
        params: [],
        name: "Paused",
        trigger: "lead_first",
        // Over a search of its own: a search has one chain (00190).
        lead_search_id: await one(
          db
            .from("lead_searches")
            .insert({ tenant_id: A, via: "people", card: "movers", name: "Paused", asked: "movers", plan: {} }),
        ),
        state: "paused",
      }),
    );
    const pausedRun = await one(
      db.from("broadcasts").insert({
        tenant_id: A,
        name: "Paused",
        template_id: template,
        template_name: `reach_first_${stamp}`,
        template_language: "en",
        audience: { kind: "reach_out", root_id: paused, step_id: paused, search_id: search },
        state: "scheduled",
        scheduled_for: iso(Date.now()),
        playbook_id: paused,
        run_for: "2026-09-28",
      }),
    );
    await sendIn({
      domain_id: d3,
      lead_id: await lead(),
      broadcast_id: pausedRun,
      playbook_id: paused,
      root_id: paused,
    });
    const waiting = await one(
      db.from("broadcasts").insert({
        tenant_id: A,
        name: "Waiting",
        template_id: template,
        template_name: `reach_first_${stamp}`,
        template_language: "en",
        audience: { kind: "reach_out", root_id: root, step_id: root, search_id: search },
        state: "pending_approval",
        scheduled_for: iso(Date.now()),
        playbook_id: root,
        run_for: "2026-09-29",
      }),
    );
    await sendIn({ domain_id: d3, lead_id: await lead(), broadcast_id: waiting });
    assert.equal((await claim(d3, 30)).length, 0);
    assert.equal(ok(await db.from("reach_out_sends").select("state").eq("id", notDue).single()).state, "planned");
    const held = await domainRow({ state: "held", held_why: "bounces", held_at: iso(Date.now()) });
    await sendIn({ domain_id: held, lead_id: await lead() });
    assert.equal((await claim(held, 30)).length, 0, "a held domain claims nothing");

    // A step still running under a paused root: the chain is paused, every step of it.
    const d4 = await domainRow();
    const pausedStep = await one(
      db.from("playbooks").insert({
        tenant_id: A,
        kind: "reach_out",
        policy_class: "outreach",
        gap_minutes: 12,
        template_id: template,
        template_name: `reach_first_${stamp}`,
        template_language: "en",
        params: [],
        name: "Paused's nudge",
        trigger: "after_step",
        after_playbook_id: paused,
        after_days: 3,
      }),
    );
    const pausedStepRun = await one(
      db.from("broadcasts").insert({
        tenant_id: A,
        name: "Paused's nudge",
        template_id: template,
        template_name: `reach_first_${stamp}`,
        template_language: "en",
        audience: { kind: "reach_out", root_id: paused, step_id: pausedStep, search_id: search },
        state: "scheduled",
        scheduled_for: iso(Date.now()),
        playbook_id: pausedStep,
        run_for: "2026-10-01",
      }),
    );
    await sendIn({
      domain_id: d4,
      lead_id: await lead(),
      broadcast_id: pausedStepRun,
      playbook_id: pausedStep,
      root_id: paused,
    });
    assert.equal((await claim(d4, 30)).length, 0, "a paused root holds its steps");

    // No share or no limit is no claim, never "no cap": least() would read a null as none at all.
    await sendIn({ domain_id: d4, lead_id: await lead() });
    for (const [cap, limit] of [
      [null, 10],
      [30, null],
      [null, null],
      [0, 10],
      [30, -1],
    ])
      assert.deepEqual(await claim(d4, cap, limit), [], JSON.stringify({ cap, limit }));
    await assert.rejects(
      claimSends(db, { domainId: d4, cap: Number.NaN, at: new Date(), limit: 10 }),
      /whole numbers/,
      "the repository refuses what JSON would send as null",
    );
    assert.equal((await claim(d4, 30)).length, 1, "and with a share, the due send is claimed");
  },
);
