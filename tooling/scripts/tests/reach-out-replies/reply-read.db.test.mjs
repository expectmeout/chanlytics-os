/**
 * A reply is read for what it means (00222, Reach out Part 5 PR 3), on a real database. One workspace, a reach-out that
 * wrote to a business, and its reply:
 *   - whose reply it is (reach_out_reply_of): by In-Reply-To, by References from another address, by the person within
 *     thirty days and not after;
 *   - each intent's plan through the reading's door (reach_out_reply_apply), the plan made by contracts' readingPlan:
 *     Talking through the one converter, a not-now's day and step, a no's consent, addresses and own domain (N6), a
 *     wrong person's step; the lead's waiting sends skipped; an automatic out-of-office recorded and skipping nothing;
 *   - B1: an automatic no and an automatic wrong person are answers (outreach_wrote_back's fourth reading) until undone;
 *   - once: a second apply and a re-read of a reading already read change nothing, and a re-read of an unread reading
 *     applies in its place and is due a notice again;
 *   - the job's index, one live read per message and stage; the notice's claim and mark (B2);
 *   - the undo: who may, for how long, refused after an unsubscribe, and exactly what it puts back while nothing else
 *     holds it (another no from the same person, a second lead's no on the same domain, an unsubscribe before);
 *   - outreach_wrote_back's body is 00211's with the fourth reading and nothing else; the doors are closed to a session
 *     but the member's two.
 * The migration is applied twice by the replay, not here. Local stack only: it makes workspaces, people and leads, and
 * reads the catalog through the CLI (SUPABASE_CLI names it), as privileges.db.test.mjs does.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { leadSuppressionHash, parseReplyReading, readingPlan } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, people and leads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
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
const migration = (n) => {
  const dir = path.join(ROOT, "supabase/migrations");
  return fs.readFileSync(
    path.join(
      dir,
      fs.readdirSync(dir).find((f) => f.startsWith(`${n}_`)),
    ),
    "utf8",
  );
};
const bodyIn = (src, header) => {
  const at = src.indexOf(header);
  assert.ok(at >= 0, `no ${header}`);
  const open = src.indexOf("as $$", at) + "as $$".length;
  return src.slice(open, src.indexOf("$$", open));
};

const HOUR = 3_600_000;
const DAY = 86_400_000;
const TZ = "America/Chicago";
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();
const SEND_HOST = `send-${stamp}.example`;
let db;
let A;
let B;
let template;
let owner;
let viewer;
let stranger;
const users = [];
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

async function member(tenant, role) {
  const email = `reply-${role}-${(n += 1)}-${stamp}@fixture-reply.example`;
  const password = `pw-${stamp}-${role}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }));
  return { id: made.data.user.id, c };
}

/** A chain over a search of its own (a search has one chain, 00197), and a run of it. */
async function chain() {
  const search = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} }),
  );
  return one(
    db.from("playbooks").insert({
      tenant_id: A,
      kind: "reach_out",
      policy_class: "outreach",
      gap_minutes: 5,
      template_id: template,
      template_name: `reach_reply_${stamp}`,
      template_language: "en",
      params: [],
      name: "Movers",
      trigger: "lead_first",
      lead_search_id: search,
      state: "running",
      signed_by: "Sam",
    }),
  );
}
let days = 0;
/** A run of the chain: each on a day of its own, as a chain has one run a day (broadcasts_playbook_run). */
const run = (root, state) =>
  one(
    db.from("broadcasts").insert({
      tenant_id: A,
      name: `Movers · ${state}`,
      template_id: template,
      template_name: `reach_reply_${stamp}`,
      template_language: "en",
      audience: { kind: "reach_out", root_id: root, step_id: root },
      state,
      scheduled_for: iso(Date.now()),
      playbook_id: root,
      run_for: new Date(Date.now() - (days += 1) * DAY).toISOString().slice(0, 10),
    }),
  );

/**
 * A business a reach-out wrote to: its person, its lead (website `website`), the chain, the email that left from
 * SEND_HOST `sentAgo` ago, and its send. `later` plans a second step's send in a live run, and holds a third.
 */
async function wroteTo({ host, website = host, stage = "nurture", sentAgo = HOUR, later = false } = {}) {
  n += 1;
  const address = `office-${n}@${host}`;
  const person = await one(db.from("contacts").insert({ tenant_id: A, email: address, display_name: `Fixture ${n}` }));
  const lead = await one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureReply${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      email: address,
      email_state: "ok",
      stage,
      contact_id: person,
      website_host: website,
    }),
  );
  const root = await chain();
  const first = await run(root, "sent");
  const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: person }));
  const messageId = `<ro-${stamp}-${n}@${SEND_HOST}>`;
  const sent = await one(
    db.from("messages").insert({
      tenant_id: A,
      conversation_id: thread,
      contact_id: person,
      channel: "email",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "Saw your shop on the map, and had a quick question.",
      status: "sent",
      meta: { email: { message_id: messageId, request: { from: `"Sam" <sam@${SEND_HOST}>`, to: [address] } } },
      created_at: iso(Date.now() - sentAgo),
    }),
  );
  const send = crypto.randomUUID();
  ok(
    await db.from("reach_out_sends").insert({
      id: send,
      tenant_id: A,
      broadcast_id: first,
      playbook_id: root,
      root_id: root,
      lead_id: lead,
      contact_id: person,
      state: "sent",
      send_at: iso(Date.now() - sentAgo),
      sent_at: iso(Date.now() - sentAgo),
      message_id: sent,
    }),
  );
  const waiting = [];
  if (later) {
    for (const [state, over] of [
      ["planned", {}],
      ["held", { reason: "reads_like_spam" }],
    ]) {
      const next = await run(root, "scheduled");
      const id = crypto.randomUUID();
      ok(
        await db.from("reach_out_sends").insert({
          id,
          tenant_id: A,
          broadcast_id: next,
          playbook_id: root,
          root_id: root,
          lead_id: lead,
          contact_id: person,
          state,
          send_at: iso(Date.now() + DAY),
          ...over,
        }),
      );
      waiting.push(id);
    }
  }
  return { address, person, lead, thread, sent, messageId, send, waiting };
}

/** A later step's email to the same business, in a run of its own: what a reply may answer instead of the first. */
async function sentAgain(ro) {
  const root = ok(await db.from("reach_out_sends").select("root_id").eq("id", ro.send).single()).root_id;
  const next = await run(root, "sent");
  const messageId = `<ro-${stamp}-${(n += 1)}-again@${SEND_HOST}>`;
  const sent = await one(
    db.from("messages").insert({
      tenant_id: A,
      conversation_id: ro.thread,
      contact_id: ro.person,
      channel: "email",
      direction: "outbound",
      sender: "ai",
      type: "text",
      body: "Following up on my note.",
      status: "sent",
      meta: { email: { message_id: messageId, request: { from: `"Sam" <sam@${SEND_HOST}>`, to: [ro.address] } } },
      created_at: iso(Date.now() - HOUR / 2),
    }),
  );
  ok(
    await db.from("reach_out_sends").insert({
      id: crypto.randomUUID(),
      tenant_id: A,
      broadcast_id: next,
      playbook_id: root,
      root_id: root,
      lead_id: ro.lead,
      contact_id: ro.person,
      state: "sent",
      send_at: iso(Date.now() - HOUR / 2),
      sent_at: iso(Date.now() - HOUR / 2),
      message_id: sent,
    }),
  );
  return { messageId, sent };
}

/** Their reply: from `from` (their own thread when it is the lead's address, else a new person's), citing the email. */
async function replied(
  ro,
  { from = ro.address, claim = "person", cite = "in_reply_to", cites = ro, at = Date.now(), text = "No" } = {},
) {
  let person = ro.person;
  let thread = ro.thread;
  if (from !== ro.address) {
    const known = ok(await db.from("contacts").select("id").eq("tenant_id", A).eq("email", from).maybeSingle());
    person =
      known?.id ?? (await one(db.from("contacts").insert({ tenant_id: A, email: from, display_name: "Another" })));
    thread =
      ok(await db.from("conversations").select("id").eq("contact_id", person).maybeSingle())?.id ??
      (await one(db.from("conversations").insert({ tenant_id: A, contact_id: person })));
  }
  return one(
    db.from("messages").insert({
      tenant_id: A,
      conversation_id: thread,
      contact_id: person,
      channel: "email",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: text,
      status: "received",
      channel_ts: iso(at),
      created_at: iso(at),
      meta: {
        email: {
          subject: "Re: A quick question",
          message_id: `<reply-${stamp}-${crypto.randomUUID()}@${from.split("@")[1]}>`,
          in_reply_to: cite === "in_reply_to" ? cites.messageId : null,
          references: cite === "none" ? [] : [cites.messageId],
          from,
          claim,
        },
      },
    }),
  );
}

const replyOf = async (messageId, tenant = A) =>
  ok(await db.rpc("reach_out_reply_of", { p_tenant_id: tenant, p_message_id: messageId, p_days: 30 }));

/** A reading applied as the job applies it: the plan is contracts' readingPlan over what reach_out_reply_of says. */
async function readAs(messageId, answer, { reread = 0, unread = "model_failed", readAt = Date.now() } = {}) {
  const of = await replyOf(messageId);
  const reading = answer ? parseReplyReading(answer) : null;
  const plan = readingPlan(reading, {
    claim: of.claim,
    receivedAt: Date.parse(of.received_at),
    tz: of.tz ?? TZ,
    business: of.business,
    leadAddress: of.lead_email,
    leadWebsite: of.lead_website,
    replyFrom: of.from,
    reread: reread > 0,
    readAt,
  });
  const r = reading ?? { intent: "other", summary: "", day: null, referTo: null };
  const res = ok(
    await db.rpc("reach_out_reply_apply", {
      p_tenant_id: A,
      p_message_id: messageId,
      p_reading: {
        intent: r.intent,
        summary: r.summary,
        day: r.day,
        refer_to: r.referTo,
        unread: reading ? null : unread,
      },
      p_plan: plan,
      p_reread: reread,
      p_days: 30,
    }),
  );
  return { res, plan };
}
const reading = async (messageId) =>
  ok(await db.from("reach_out_replies").select("*").eq("message_id", messageId).maybeSingle());
const leadRow = async (id) => ok(await db.from("leads").select("*").eq("id", id).single());
const consentOf = async (contact) =>
  ok(await db.from("contacts").select("email_marketing, email_marketing_source").eq("id", contact).single());
const held = async (address) => ok(await db.rpc("lead_address_suppressed", { p_tenant_id: A, p_address: address }));
const rowsFor = async (kind, value) =>
  ok(
    await db
      .from("lead_suppressions")
      .select("what")
      .eq("tenant_id", A)
      .eq("kind", kind)
      .eq("hash", await leadSuppressionHash(A, value)),
  );
const wroteBack = async (contact) =>
  ok(await db.rpc("outreach_lead_facts", { p_tenant_id: A, p_contact_id: contact, p_to: "x@example.com" })).wrote_back;
const unsubscribed = async () =>
  ok(
    await db.rpc("sending_domain_counts", {
      p_tenant_id: A,
      p_host: SEND_HOST,
      p_since: iso(Date.now() - 2 * DAY),
    }),
  ).unsubscribed;
const eventsOf = async (subject, kind) =>
  ok(await db.from("events").select("data").eq("tenant_id", A).eq("subject_id", subject).eq("kind", kind)).map(
    (e) => e.data,
  );
const NO = { intent: "no", summary: "Asks to be taken off the list", day: null, refer_to: null };

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `reply-a-${stamp}`, name: "Harbor Moving Co", timezone: TZ }));
  B = await one(db.from("tenants").insert({ slug: `reply-b-${stamp}`, name: "Another", timezone: TZ }));
  template = await one(
    db.from("templates").insert({
      tenant_id: A,
      channel: "email",
      source: "chanlytics",
      name: `reach_reply_${stamp}`,
      language: "en",
      category: "marketing",
      meta_status: "approved",
      components: [
        { type: "HEADER", format: "TEXT", text: "A quick question" },
        { type: "BODY", text: "Hi {{business}}, a quick question." },
      ],
    }),
  );
  owner = await member(A, "owner");
  viewer = await member(A, "viewer");
  stranger = await member(B, "owner");
});
after(async () => {
  if (skip) return;
  for (const t of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const u of users) await db.auth.admin.deleteUser(u).catch(() => {});
});

test(
  "whose reply: by In-Reply-To, by References from another address, by the person within thirty days",
  { skip },
  async () => {
    const host = `whose-${stamp}.example`;
    const ro = await wroteTo({ host });
    const direct = await replied(ro);
    const of = await replyOf(direct);
    assert.equal(of.send_id, ro.send);
    assert.equal(of.lead_id, ro.lead);
    assert.equal(of.lead_contact_id, ro.person);
    assert.equal(of.lead_email, ro.address);
    assert.equal(of.answered_message_id, ro.sent);
    assert.equal(of.answered_text, "Saw your shop on the map, and had a quick question.");
    assert.equal(of.business, `Fixture Movers ${n}`);
    assert.equal(of.chain, "Movers");
    assert.equal(of.signed_by, "Sam");
    assert.equal(of.tz, TZ);
    assert.equal(of.claim, "person");
    assert.equal(of.from, ro.address);

    const colleague = await replied(ro, { from: `dana@${host}`, cite: "references" });
    const theirs = await replyOf(colleague);
    assert.equal(theirs.lead_id, ro.lead, "a reply from another address that cites the email is the lead's");
    assert.notEqual(theirs.contact_id, ro.person, "written by the person the intake kept it under");
    assert.equal(theirs.lead_contact_id, ro.person);

    const uncited = await replied(ro, { cite: "none" });
    assert.equal((await replyOf(uncited)).send_id, ro.send, "their own thread's person, when nothing is cited");

    const old = await wroteTo({ host: `old-${stamp}.example`, sentAgo: 31 * DAY });
    assert.equal(await replyOf(await replied(old, { cite: "none" })), null, "not after thirty days");
    assert.equal(await replyOf(await replied(old)), null, "nor when it cites an email that old");
    assert.equal(await replyOf(direct, B), null, "another workspace's message is nobody's reply there");
    assert.equal(await replyOf(ro.sent), null, "our own email is no reply");
  },
);

test(
  "interested: Talking through the one converter, and the lead's waiting sends skipped as wrote back",
  { skip },
  async () => {
    const ro = await wroteTo({ host: `talk-${stamp}.example`, later: true });
    const msg = await replied(ro, { text: "Sounds useful, send details." });
    const { res } = await readAs(msg, { intent: "interested", summary: "Wants details", day: null, refer_to: null });
    assert.equal(res.applied, true);
    const lead = await leadRow(ro.lead);
    assert.equal(lead.stage, "converted");
    assert.deepEqual(
      (await eventsOf(ro.lead, "lead.converted")).map((d) => [d.how, d.message_id]),
      [["reply", msg]],
    );
    const sends = ok(await db.from("reach_out_sends").select("id, state, reason").in("id", ro.waiting));
    assert.deepEqual(
      sends.map((s) => [s.state, s.reason]),
      [
        ["skipped", "outreach_wrote_back"],
        ["skipped", "outreach_wrote_back"],
      ],
      "the planned and the held send are skipped: none waits for an owner",
    );
    const r = await reading(msg);
    assert.deepEqual(
      [r.intent, r.claim, r.lead_id, r.lead_contact_id, r.send_id],
      ["interested", "person", ro.lead, ro.person, ro.send],
    );
    assert.equal(r.plan.changed.skipped, 2);
    assert.deepEqual(
      (await eventsOf(ro.lead, "reach_out.replied")).map((d) => [d.intent, d.claim, d.reread, d.business]),
      [["interested", "person", false, `Fixture Movers ${n}`]],
    );
  },
);

test(
  "not now: resume_at at nine on the day named, and a step on it (a weekend's on the Monday after), their next",
  { skip },
  async () => {
    const ro = await wroteTo({ host: `later-${stamp}.example` });
    const at = Date.parse("2026-09-29T15:00:00Z");
    const msg = await replied(ro, { at, text: "Not now, try me on Saturday 2026-11-07." });
    const { plan } = await readAs(msg, { intent: "not_now", summary: "Not now", day: "2026-11-07", refer_to: null });
    assert.equal(plan.step.dueOn, "2026-11-09", "a Saturday's step is due the Monday after");
    const lead = await leadRow(ro.lead);
    assert.equal(lead.stage, "nurture");
    assert.equal(new Date(lead.resume_at).toISOString(), "2026-11-07T15:00:00.000Z", "nine in Chicago");
    const [step] = ok(
      await db
        .from("person_notes")
        .select("*")
        .eq("contact_id", ro.person)
        .eq("source", "reach_out")
        .eq("source_id", msg),
    );
    assert.deepEqual([step.due_on, step.team_only, step.author_kind], ["2026-11-09", true, "receptionist"]);
    const [row] = ok(await db.rpc("people_list", { p_tenant_id: A, p_contact_id: ro.person }));
    assert.equal(row.step_id, step.id, "the person's next step");
  },
);

test(
  "no, from the business's own domain: opted out by reply, the addresses and the domain on the list, the leads closed, D18 counts it",
  { skip },
  async () => {
    const host = `own-${stamp}.example`;
    const ro = await wroteTo({ host, stage: "nurture" });
    const also = await one(
      db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJfixtureReplyAlso${stamp}`,
        business_name: "Fixture Movers Too",
        email: `sales@${host}`,
        email_state: "ok",
        stage: "ready",
        contact_id: ro.person,
      }),
    );
    const before = await unsubscribed();
    const msg = await replied(ro, { from: `gerencia@${host}`, text: "Gracias, pero no nos interesa." });
    const { plan } = await readAs(msg, NO);
    assert.equal(plan.suppressFrom, `gerencia@${host}`);
    assert.equal(plan.suppressDomain, host);
    assert.deepEqual(await consentOf(ro.person), { email_marketing: "opted_out", email_marketing_source: "reply" });
    for (const a of [ro.address, `gerencia@${host}`, `dana@${host}`]) assert.equal(await held(a), true, a);
    assert.deepEqual(await rowsFor("domain", host), [{ what: "said_no" }]);
    for (const id of [ro.lead, also]) {
      const l = await leadRow(id);
      assert.deepEqual([l.stage, l.closed_reason], ["archived", "said_no"]);
    }
    assert.equal(await unsubscribed(), before + 1, "D18: a reply's no counts beside an unsubscribe");
    const changed = (await reading(msg)).plan.changed;
    assert.equal(changed.consent_was, "unknown");
    assert.equal(
      changed.suppressions.length,
      3,
      "the lead's address, the reply's From and the domain: what this act added",
    );
    assert.deepEqual(changed.leads.map((l) => l.stage).sort(), ["nurture", "ready"]);
  },
);

test("no, from an ISP's address: the addresses on the list and never the ISP's domain (N6)", { skip }, async () => {
  const isp = `isp-${stamp}.example`;
  const ro = await wroteTo({ host: isp, website: `joes-movers-${stamp}.example` });
  const msg = await replied(ro);
  const { plan } = await readAs(msg, NO);
  assert.equal(plan.suppressDomain, null);
  assert.equal(await held(ro.address), true);
  assert.equal(await held(`someone-else@${isp}`), false, "another customer of the ISP is not held");
  assert.deepEqual(await rowsFor("domain", isp), []);
});

test("wrong person: a step due today on the lead's person, naming who", { skip }, async () => {
  const ro = await wroteTo({ host: `wrong-${stamp}.example` });
  const at = Date.now();
  const msg = await replied(ro, { at });
  const { plan } = await readAs(msg, {
    intent: "wrong_person",
    summary: "Points to the office manager",
    day: null,
    refer_to: "Dana at dana@example.com",
  });
  const [step] = ok(
    await db.from("person_notes").select("due_on, body").eq("contact_id", ro.person).eq("source_id", msg),
  );
  assert.equal(step.due_on, plan.step.dueOn);
  assert.match(step.body, /write to Dana at dana@example\.com instead/);
});

test(
  "B1: an automatic no and an automatic wrong person are answers until undone; an automatic away skips nothing yet",
  { skip },
  async () => {
    const host = `auto-${stamp}.example`;
    const ro = await wroteTo({ host, later: true });
    assert.equal(await wroteBack(ro.person), false, "an out-of-office alone is not writing back (00181)");

    const away = await replied(ro, { from: `noreply@${host}`, claim: "auto_reply" });
    const { plan: awayPlan } = await readAs(away, { intent: "away", summary: "Out", day: null, refer_to: null });
    assert.equal(awayPlan.skipSends, "outreach_away");
    const awayRow = await reading(away);
    assert.equal(awayRow.until_at !== null, true, "recorded: 00226's pause reads it");
    const sends = ok(await db.from("reach_out_sends").select("state").in("id", ro.waiting));
    assert.deepEqual(
      sends.map((s) => s.state).sort(),
      ["held", "planned"],
      "PR 4's followers first: nothing is skipped",
    );
    assert.equal(await wroteBack(ro.person), false);

    const no = await replied(ro, {
      from: `noreply@${host}`,
      claim: "auto_reply",
      text: "Please remove us from your list.",
    });
    await readAs(no, NO);
    assert.equal(await wroteBack(ro.person), true, "the lead's person wrote back");
    const writer = (await reading(no)).contact_id;
    assert.equal(await wroteBack(writer), true, "and so did the address that wrote");
    assert.equal((await leadRow(ro.lead)).closed_reason, "said_no");
    assert.equal(await held(`noreply@${host}`), true);
    const now = ok(await db.from("reach_out_sends").select("state, reason").in("id", ro.waiting));
    assert.deepEqual(
      now.map((s) => s.reason),
      ["outreach_wrote_back", "outreach_wrote_back"],
    );

    ok(await owner.c.rpc("reach_out_reply_undo", { p_message_id: no }));
    assert.equal(
      await wroteBack(ro.person),
      false,
      "undone, an automatic reply is not an answer: the undo said it was misread",
    );

    const other = await wroteTo({ host: `auto2-${stamp}.example` });
    const wrong = await replied(other, { from: `bounce@auto2-${stamp}.example`, claim: "auto_reply" });
    await readAs(wrong, { intent: "wrong_person", summary: "Has left", day: null, refer_to: "Dana" });
    assert.equal(await wroteBack(other.person), true);
  },
);

test(
  "once: a second apply changes nothing; a re-read applies a no in place of other and is due a notice again",
  { skip },
  async () => {
    const ro = await wroteTo({ host: `once-${stamp}.example` });
    const msg = await replied(ro);
    assert.equal((await readAs(msg, null, { unread: "day_spent" })).res.applied, true);
    assert.equal((await readAs(msg, NO)).res.applied, false, "the first read is kept once");
    assert.deepEqual(await consentOf(ro.person), { email_marketing: "unknown", email_marketing_source: null });

    const claimed = ok(
      await db.rpc("reach_out_reply_tell_claim", {
        p_tenant_id: A,
        p_message_id: msg,
        p_stale_before: iso(Date.now()),
      }),
    );
    assert.equal(
      ok(await db.rpc("reach_out_reply_told", { p_tenant_id: A, p_message_id: msg, p_claimed_at: claimed })),
      true,
    );
    assert.equal((await readAs(msg, NO, { reread: 2 })).res.applied, false, "only the re-read after the one before");
    assert.equal((await readAs(msg, NO, { reread: 1 })).res.applied, true);
    const r = await reading(msg);
    assert.deepEqual([r.intent, r.unread, r.rereads, r.told_at, r.tell_claimed_at], ["no", null, 1, null, null]);
    assert.deepEqual(await consentOf(ro.person), { email_marketing: "opted_out", email_marketing_source: "reply" });
    assert.equal((await readAs(msg, NO, { reread: 2 })).res.applied, false, "a reading already read is not read again");
  },
);

test("the job's index: one live reply_read per message and stage; a failed one does not count", { skip }, async () => {
  const m = crypto.randomUUID();
  const job = (over = {}) => ({
    tenant_id: A,
    kind: "reply_read",
    due_at: iso(Date.now() + DAY),
    payload: { message_id: m },
    ...over,
  });
  const first = await one(db.from("jobs").insert(job()));
  const again = await db.from("jobs").insert(job({ payload: { message_id: m, stage: "read" } }));
  assert.equal(again.error?.code, "23505", "no stage is the first read's stage");
  ok(await db.from("jobs").insert(job({ payload: { message_id: m, stage: "reread-1" } })));
  ok(await db.from("jobs").update({ state: "canceled" }).eq("id", first));
  assert.equal((await db.from("jobs").insert(job())).error?.code, "23505", "a canceled one still holds it");
  const other = crypto.randomUUID();
  const failed = await one(db.from("jobs").insert(job({ payload: { message_id: other } })));
  ok(
    await db
      .from("jobs")
      .update({ state: "fired", lease_until: iso(Date.now() + 60_000) })
      .eq("id", failed),
  );
  ok(await db.from("jobs").update({ state: "failed" }).eq("id", failed));
  ok(await db.from("jobs").insert(job({ payload: { message_id: other } })));
  await db.from("jobs").delete().eq("tenant_id", A).eq("kind", "reply_read");
});

test(
  "the notice's marks (B2): claimed once, again only once stale; told once, by the claim that holds it",
  { skip },
  async () => {
    const ro = await wroteTo({ host: `tell-${stamp}.example` });
    const msg = await replied(ro);
    await readAs(msg, NO);
    const claim = async (staleBefore, tenant = A) =>
      ok(
        await db.rpc("reach_out_reply_tell_claim", {
          p_tenant_id: tenant,
          p_message_id: msg,
          p_stale_before: staleBefore,
        }),
      );
    const told = async (claimedAt) =>
      ok(await db.rpc("reach_out_reply_told", { p_tenant_id: A, p_message_id: msg, p_claimed_at: claimedAt }));
    const first = await claim(iso(Date.now() - 90_000));
    assert.ok(first, "claimed: the moment it was taken");
    assert.equal(await claim(iso(Date.now() - 90_000)), null, "a live claim holds it");
    const second = await claim(iso(Date.now() + 1000));
    assert.ok(second && second !== first, "a claim older than the lease is taken again");
    assert.equal(await claim(iso(Date.now() + 1000), B), null, "another workspace claims nothing");
    assert.equal(await told(first), false, "a stale claim's run marks nothing: the claim is another run's now");
    assert.equal((await reading(msg)).told_at, null);
    assert.equal(await told(second), true);
    assert.equal(await told(second), false, "told once");
    assert.equal(await claim(iso(Date.now() + 1000)), null, "nothing to claim once told");
    ok(await db.from("notifications").insert({ tenant_id: A, kind: "reach_out_replied", title: "x", body: "y" }));
  },
);

test(
  "a notice owed and never given stays owed across a re-read that tells nothing, and keeps its claim",
  { skip },
  async () => {
    const ro = await wroteTo({ host: `owed-${stamp}.example` });
    const msg = await replied(ro);
    const { plan } = await readAs(msg, null, { unread: "day_spent" });
    assert.equal(plan.tell, true, "a person's unread reply is told");
    // Its notice's mail failed: the claim stands, nothing marked.
    const held = ok(
      await db.rpc("reach_out_reply_tell_claim", {
        p_tenant_id: A,
        p_message_id: msg,
        p_stale_before: iso(Date.now()),
      }),
    );
    const { plan: again } = await readAs(
      msg,
      { intent: "interested", summary: "Yes", day: null, refer_to: null },
      { reread: 1 },
    );
    assert.equal(again.tell, false, "a re-read of interested tells nobody by itself");
    const r = await reading(msg);
    assert.equal(r.plan.tell, true, "the owner was never told: still owed, in this reading's words");
    assert.equal(r.told_at, null);
    assert.equal(
      Date.parse(r.tell_claimed_at),
      Date.parse(held),
      "an owed notice keeps its claim: a run still telling it marks it, and nobody tells it twice",
    );
    assert.equal(
      ok(await db.rpc("reach_out_reply_told", { p_tenant_id: A, p_message_id: msg, p_claimed_at: held })),
      true,
      "the run that held the claim marks it told",
    );

    // An automatic reply's first reading told nobody, and a re-read that tells nothing owes nothing.
    const quiet = await replied(ro, { from: `noreply@owed-${stamp}.example`, claim: "auto_reply" });
    await readAs(quiet, null, { unread: "model_failed" });
    await readAs(quiet, { intent: "interested", summary: "Auto", day: null, refer_to: null }, { reread: 1 });
    assert.equal((await reading(quiet)).plan.tell, false);
  },
);

test("the undo: who may, for how long, and refused after an unsubscribe", { skip }, async () => {
  const ro = await wroteTo({ host: `who-${stamp}.example` });
  const msg = await replied(ro);
  await readAs(msg, NO);
  const undoable = (c) => c.rpc("reach_out_reply_undoable", { p_message_id: msg });
  assert.equal(ok(await undoable(owner.c)), null);
  assert.equal(ok(await undoable(viewer.c)), "role");
  assert.equal(ok(await undoable(stranger.c)), "not_found", "another workspace learns nothing");
  assert.equal(ok(await owner.c.rpc("reach_out_reply_undoable", { p_message_id: crypto.randomUUID() })), "not_found");
  const refused = async (c, words) => {
    const res = await c.rpc("reach_out_reply_undo", { p_message_id: msg });
    assert.ok(res.error, "refused");
    assert.equal(res.error.message, words);
  };
  await refused(viewer.c, "Not allowed to act in this workspace.");
  await refused(stranger.c, "Reply not found.");

  ok(
    await db
      .from("reach_out_replies")
      .update({ read_at: iso(Date.now() - 8 * DAY) })
      .eq("message_id", msg),
  );
  assert.equal(ok(await undoable(owner.c)), "too_late");
  await refused(owner.c, "It's been more than seven days.");
  ok(
    await db
      .from("reach_out_replies")
      .update({ read_at: iso(Date.now()) })
      .eq("message_id", msg),
  );

  ok(
    await db.rpc("set_email_marketing", {
      p_tenant_id: A,
      p_contact_id: ro.person,
      p_state: "opted_out",
      p_source: "unsubscribe",
      p_message_id: ro.sent,
      p_evidence: null,
    }),
  );
  assert.equal(ok(await undoable(owner.c)), "moved");
  await refused(owner.c, "They unsubscribed since, and that stays.");

  const talk = await wroteTo({ host: `who2-${stamp}.example` });
  const yes = await replied(talk);
  await readAs(yes, { intent: "interested", summary: "Yes", day: null, refer_to: null });
  assert.equal(ok(await owner.c.rpc("reach_out_reply_undoable", { p_message_id: yes })), "not_a_no");
});

test("the undo puts back exactly what the no wrote, while nothing else holds it", { skip }, async () => {
  const host = `back-${stamp}.example`;
  const ro = await wroteTo({ host, stage: "nurture" });
  const step2 = await sentAgain(ro);
  const readyToo = await one(
    db.from("leads").insert({
      tenant_id: A,
      place_id: `ChIJfixtureReplyBack${stamp}`,
      business_name: "Fixture Movers Back",
      email: `back@${host}`,
      email_state: "ok",
      stage: "ready",
      contact_id: ro.person,
    }),
  );
  // An address already on the list before the no (an opt-out of someone who unsubscribed then) stays.
  const before = `old-optout@${host}`;
  ok(
    await db
      .from("lead_suppressions")
      .insert({ tenant_id: A, kind: "email", hash: await leadSuppressionHash(A, before), what: "email_opt_out" }),
  );
  const count0 = await unsubscribed();
  // Their first no answers the second email, from another address of theirs; their second answers the first email.
  const first = await replied(ro, { from: before, cites: step2 });
  await readAs(first, NO);
  const second = await replied(ro, { text: "Remove us" });
  await readAs(second, NO);
  assert.deepEqual(
    (await reading(second)).plan.changed.suppressions,
    [],
    "a second no writes nothing the first did not",
  );
  // Another person's business on the same domain says no too: the domain row the first no wrote, it now holds.
  const neighbour = await wroteTo({ host, website: host });
  const theirs = await replied(neighbour);
  await readAs(theirs, NO);
  const domainRow = { kind: "domain", hash: await leadSuppressionHash(A, host) };
  assert.deepEqual(
    (await reading(theirs)).plan.changed.holds.filter((h) => h.kind === "domain"),
    [domainRow],
  );
  assert.equal(await unsubscribed(), count0 + 2, "D18 counts a person once");

  // Undo the first while the second no of the same person stands: nothing of theirs moves.
  const kept = ok(await owner.c.rpc("reach_out_reply_undo", { p_message_id: first }));
  assert.equal(kept.kept.another_no, true);
  assert.deepEqual(kept.restored, { consent: null, suppressions: 0, leads: 0 });
  assert.deepEqual(await consentOf(ro.person), { email_marketing: "opted_out", email_marketing_source: "reply" });
  assert.deepEqual(await rowsFor("email", ro.address), [{ what: "said_no" }]);
  assert.equal((await leadRow(ro.lead)).stage, "archived");
  assert.ok((await reading(first)).undone_at, "the first is undone all the same");

  // Undo the last: the answer back, the leads back to their own stages, the rows only this person's noes held gone.
  const back = ok(await owner.c.rpc("reach_out_reply_undo", { p_message_id: second }));
  assert.equal(back.restored.consent, "unknown");
  assert.equal(back.restored.leads, 2);
  assert.deepEqual(await consentOf(ro.person), { email_marketing: "unknown", email_marketing_source: "reply_undone" });
  assert.deepEqual([(await leadRow(ro.lead)).stage, (await leadRow(readyToo)).stage], ["nurture", "ready"]);
  assert.equal((await leadRow(ro.lead)).closed_reason, null);
  assert.deepEqual(
    await rowsFor("email", ro.address),
    [],
    "the lead's address's own row, which only these noes held, is gone",
  );
  assert.deepEqual(await rowsFor("email", before), [{ what: "email_opt_out" }], "an opt-out from before stays");
  assert.deepEqual(
    await rowsFor("domain", host),
    [{ what: "said_no" }],
    "the domain stays: the neighbour's standing no holds it",
  );
  assert.equal(
    await unsubscribed(),
    count0 + 1,
    "D18 no longer counts the undone no: the undo names the email the no it reverses named (the second email)",
  );
  const undone = (await eventsOf(ro.person, "contact.consent_changed")).find((d) => d.source === "reply_undone");
  assert.equal(undone.message_id, step2.sent);
  assert.equal(await wroteBack(ro.person), true, "a person's reply keeps the chain stopped: they wrote back");
  assert.equal((await reading(second)).intent, "no", "the reading stays a no, marked undone");
  assert.equal((await reading(second)).undone_by, owner.id);
  assert.deepEqual(
    (await eventsOf(ro.lead, "lead.stage")).filter((d) => d.source === "reply_undone").map((d) => d.stage),
    ["nurture"],
  );
  assert.equal((await eventsOf(ro.lead, "reach_out.reply_undone")).length, 2);
  const again = await owner.c.rpc("reach_out_reply_undo", { p_message_id: second });
  assert.equal(again.error?.message, "Already undone.");

  // The neighbour's no undone too: nothing holds the domain now, which a reading wrote, so it goes.
  ok(await owner.c.rpc("reach_out_reply_undo", { p_message_id: theirs }));
  assert.deepEqual(await rowsFor("domain", host), []);
  assert.equal(await held(`anyone@${host}`), false);
  assert.deepEqual(
    await rowsFor("email", before),
    [{ what: "email_opt_out" }],
    "and the opt-out from before still stays",
  );
  assert.equal(await unsubscribed(), count0);
});

test(
  "two noes from one person read at once both apply: the person is locked first, so neither waits in a circle",
  { skip },
  async () => {
    const ro = await wroteTo({ host: `twice-${stamp}.example` });
    const one_ = await replied(ro, { text: "No" });
    const two = await replied(ro, { from: `other@twice-${stamp}.example`, text: "Remove us" });
    const [a, b] = await Promise.all([readAs(one_, NO), readAs(two, NO)]);
    assert.equal(a.res.applied && b.res.applied, true);
    const changed = [(await reading(one_)).plan.changed, (await reading(two)).plan.changed];
    assert.equal(changed.filter((c) => c.consent_changed).length, 1, "the answer is recorded once, by one of them");
    assert.deepEqual(await consentOf(ro.person), { email_marketing: "opted_out", email_marketing_source: "reply" });
  },
);

test(
  "the undo of a no whose lead was erased since is refused: an erasure's tombstone is for good",
  { skip },
  async () => {
    const ro = await wroteTo({ host: `erased-${stamp}.example` });
    const msg = await replied(ro);
    await readAs(msg, NO);
    assert.equal(ok(await owner.c.rpc("reach_out_reply_undoable", { p_message_id: msg })), null);
    ok(
      await db
        .from("leads")
        .update({ erased_at: iso(Date.now()) })
        .eq("id", ro.lead),
    );
    assert.equal(ok(await owner.c.rpc("reach_out_reply_undoable", { p_message_id: msg })), "not_found");
    const res = await owner.c.rpc("reach_out_reply_undo", { p_message_id: msg });
    assert.equal(res.error?.message, "Reply not found.");
    assert.deepEqual(await rowsFor("email", ro.address), [{ what: "said_no" }]);
  },
);

test("the undo is refused whole when the answer cannot go back, and nothing it did stands", { skip }, async () => {
  const ro = await wroteTo({ host: `whole-${stamp}.example` });
  const msg = await replied(ro);
  await readAs(msg, NO);
  // The answer moved by hand to one the consent door will not take back: it refuses, and the whole undo with it.
  ok(await db.from("contacts").update({ email_marketing: "opted_in" }).eq("id", ro.person));
  ok(await db.from("contacts").update({ email_marketing: "opted_out" }).eq("id", ro.person));
  ok(
    await db
      .from("events")
      .update({ data: { purpose: "email_marketing", consent: "opted_out", source: "reply", previous: "opted_out" } })
      .eq("tenant_id", A)
      .eq("subject_id", ro.person)
      .eq("kind", "contact.consent_changed"),
  );
  const res = await owner.c.rpc("reach_out_reply_undo", { p_message_id: msg });
  assert.ok(res.error, "refused");
  const r = await reading(msg);
  assert.equal(r.undone_at, null, "the reading is not marked undone");
  assert.deepEqual(await rowsFor("email", ro.address), [{ what: "said_no" }], "no row taken off the list");
  assert.equal((await leadRow(ro.lead)).stage, "archived", "no lead reopened");
});

test(
  "outreach_wrote_back is 00211's body with the fourth reading and nothing else; the doors are closed to a session",
  { skip },
  async () => {
    const old = bodyIn(migration("00211"), "create or replace function public.outreach_wrote_back(");
    const now = bodyIn(migration("00222"), "create or replace function public.outreach_wrote_back(");
    assert.ok(now.startsWith(old.replace(/\n$/, "")), "00211's three readings, unchanged");
    assert.match(
      now.slice(old.length - 1),
      /^\s*union\s+select rr\.contact_id from public\.reach_out_replies rr[\s\S]*union\s+select rr\.lead_contact_id from public\.reach_out_replies rr/,
    );
    const [proc] = query("select prosrc from pg_proc where proname = 'outreach_wrote_back'");
    assert.equal(proc.prosrc, now, "and pg_proc runs what 00222 wrote");

    const rows = query(
      `select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
            has_function_privilege('service_role', p.oid, 'execute') as service
       from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ('reach_out_read_take', 'reach_out_reply_of', 'reach_out_reply_apply',
            'reach_out_reply_draft', 'reach_out_reply_tell_claim', 'reach_out_reply_told', 'reach_out_reply_undoable',
            'reach_out_reply_undo', 'outreach_wrote_back')
      order by 1`,
    );
    const member = new Set(["reach_out_reply_undo", "reach_out_reply_undoable"]);
    assert.equal(rows.length, 9);
    for (const r of rows) {
      assert.equal(r.anon, false, `${r.proname}: never anon`);
      assert.equal(r.authenticated, member.has(r.proname), `${r.proname}: a session holds only the member's two`);
      if (!member.has(r.proname)) assert.equal(r.service, true, `${r.proname}: the service role's door`);
    }
    const policies = query(
      "select polname, polcmd from pg_policy where polrelid = 'public.reach_out_replies'::regclass",
    );
    assert.deepEqual(
      policies,
      [{ polname: "reach_out_replies_member_select", polcmd: "r" }],
      "no insert or update policy",
    );
    const denied = await owner.c
      .from("reach_out_replies")
      .update({ intent: "other" })
      .eq("tenant_id", A)
      .select("message_id");
    assert.ok(denied.error || denied.data.length === 0, "a member writes no reading directly");
  },
);
