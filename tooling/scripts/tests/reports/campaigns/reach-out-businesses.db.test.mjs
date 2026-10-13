/**
 * 00404 on a real Postgres: a reach-out is counted in the businesses it wrote to. reach_out_report and
 * reach_out_chain_totals counted what came back (wrote back, interested, booked, said no) in businesses, each once a
 * chain at its last email of the window, and what was written in emails; every share a page drew put the one over the
 * other, so a business that got three emails said a third of what it did. They now say both: `businesses` beside
 * `written` on the totals, on each step, on each angle (and past the top eight) and on each chain, and `before`, the
 * emails the period before wrote (written, delivered, bounced: outcomes are state now, so they have no period before).
 *
 *   1. A world of five businesses and two steps: each is counted once, at its last email, and every outcome is of them.
 *   2. The chain's totals are the report's steps summed, in businesses as in emails; a chain that wrote nothing is zeros.
 *   3. A window that ended counts nothing after it, and its period before is the days before that window.
 *   4. A member of another workspace is refused, and a partner's seat without the second factor is refused.
 *   5. A step every business moved past has emails and no businesses; a business two reach-outs wrote to is one of each;
 *      a send never lacks a business (the schema forbids it).
 *   6. The angles past the top eight are summed in businesses too.
 *   7. The period before holds exactly its days: its first and last second in, the window's and the day after out.
 *   8. It begins at its midnight in the workspace's zone, not in UTC's: a workspace east of UTC and one west of it.
 *
 * Every workspace is UTC but test 8's; every email is dated at noon of its day unless a test needs an edge. Local stack
 * only: it makes workspaces, members, reach-outs, businesses and their emails, and removes them.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { showSecondFactor } from "../../_second-factor.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });
const tenants = [];
const users = [];
let seq = 0;

const ok = (res, what = "the read") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single(), "the write").id;
const iso = (ms) => new Date(ms).toISOString();
/** `hour:min:sec` UTC on the day `n` days before today's UTC date, as milliseconds: noon unless an edge is asked. */
const dayAt = (n, hour = 12, min = 0, sec = 0) => {
  const t = new Date();
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - n, hour, min, sec);
};
const dayKey = (n) => iso(dayAt(n)).slice(0, 10);
/** The calendar day `n` days from a "YYYY-MM-DD". */
const dayFrom = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 24 * 3_600_000).toISOString().slice(0, 10);
/** The wall clock of an instant in `timeZone`, as the milliseconds the same reading would be in UTC. */
const wallClock = (date, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
};
/** The instant (milliseconds) at which `timeZone`'s clock reads `hour:min` on `day` ("YYYY-MM-DD"), daylight time included. */
const localAt = (day, hour, min, timeZone) => {
  const reading = Date.parse(`${day}T00:00:00Z`) + (hour * 60 + min) * 60_000;
  let at = reading;
  for (let i = 0; i < 3; i += 1) at = reading - (wallClock(new Date(at), timeZone) - at);
  return at;
};
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const sum = (steps, key) => steps.reduce((t, s) => t + s[key], 0);

after(async () => {
  if (skip) return;
  // A workspace's events keep no foreign key to it, so they go by hand.
  for (const t of tenants) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** A signed-in member of a workspace: both functions ask who is calling. */
async function member(tenant, role) {
  seq += 1;
  const email = `businesses-${role}-${RUN}-${seq}@example.com`;
  const password = `pw-${RUN}-${role}-${seq}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), "the membership");
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }), "the sign-in");
  return { id: made.data.user.id, c };
}

/** A workspace (in UTC unless a zone is named), with the operator who writes its reach-outs and a viewer who reads them. */
async function workspace(name, timezone = "UTC") {
  seq += 1;
  const tenant = await one(
    db.from("tenants").insert({ slug: `businesses-${name}-${RUN}-${seq}`, name: `Businesses ${name}`, timezone }),
  );
  tenants.push(tenant);
  return { tenant, operator: await member(tenant, "operator"), viewer: (await member(tenant, "viewer")).c };
}

let far = 0;
/**
 * A reach-out of `steps` emails, made by the real door (reach_out_save), and one run for each step to hang the sends on:
 * `{ root, steps: [step ids], runs: [run ids] }`.
 */
async function reachOut(w, name, steps = 2) {
  const search = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: w.tenant, via: "people", card: "movers", name, asked: name, plan: {} }),
  );
  const chain = {
    name,
    search_id: search,
    include_unconfirmed: false,
    gap_minutes: 12,
    mailbox_ids: [],
    signed_by: "Sam",
    steps: Array.from({ length: steps }, (_, i) =>
      i === 0
        ? { subject: "Quick one for {{business}}", body: "{{opening}}\n\n{{your name}}", after_days: null }
        : { subject: null, body: "Just checking in.", after_days: 4 },
    ),
  };
  const saved = ok(await db.rpc("reach_out_save", { p_tenant_id: w.tenant, p_user_id: w.operator.id, p_chain: chain }));
  const runs = [];
  for (const step of saved.step_ids) {
    far += 1;
    const { template_id } = ok(await db.from("playbooks").select("template_id").eq("id", step).single());
    runs.push(
      await one(
        db.from("broadcasts").insert({
          tenant_id: w.tenant,
          name,
          template_id,
          template_name: "reach_businesses",
          template_language: "en",
          audience: { kind: "reach_out", root_id: saved.root_id, step_id: step },
          state: "sent",
          scheduled_for: iso(Date.now()),
          playbook_id: step,
          run_for: new Date(Date.UTC(2097, 0, 1 + far)).toISOString().slice(0, 10),
        }),
      ),
    );
  }
  return { root: saved.root_id, steps: saved.step_ids, runs };
}

/** A business: its lead, the person behind it and their thread. */
async function business(w, label) {
  seq += 1;
  const email = `${label}-${RUN}-${seq}@example.com`;
  const contact = await one(db.from("contacts").insert({ tenant_id: w.tenant, display_name: `Biz ${label}`, email }));
  const thread = await one(db.from("conversations").insert({ tenant_id: w.tenant, contact_id: contact }));
  const lead = await one(
    db.from("leads").insert({
      tenant_id: w.tenant,
      place_id: `ChIJbusinesses${RUN}${seq}`,
      business_name: `Biz Movers ${label}`,
      city: "Austin",
      region: "TX",
      email,
      email_state: "ok",
      stage: "nurture",
      contact_id: contact,
    }),
  );
  return { lead, contact, thread };
}

/**
 * An email of a reach-out's step to a business at `at` (milliseconds), with the message it left as. A bounce is how the
 * clock settles one: the send failed with no time of its own, its email dated by when it left (00179 email_left).
 */
async function write(w, r, step, b, at, { angle = null, status = "delivered", bounced = false } = {}) {
  const message = await one(
    db.from("messages").insert({
      tenant_id: w.tenant,
      conversation_id: b.thread,
      contact_id: b.contact,
      channel: "email",
      direction: "outbound",
      sender: "human",
      type: "text",
      body: "Saw your shop.",
      status: bounced ? "failed" : status,
      meta: { source: "reach_out", status_at: { sent: iso(at) } },
      ...(bounced ? { error: { provider: "bounced", kind: "permanent" } } : {}),
    }),
  );
  ok(
    await db.from("reach_out_sends").insert({
      id: crypto.randomUUID(),
      tenant_id: w.tenant,
      broadcast_id: r.runs[r.steps.indexOf(step)],
      playbook_id: step,
      root_id: r.root,
      lead_id: b.lead,
      contact_id: b.contact,
      state: bounced ? "failed" : "sent",
      reason: bounced ? "bounced" : null,
      send_at: iso(at),
      sent_at: bounced ? null : iso(at),
      angle,
      message_id: message,
    }),
    "an email that left",
  );
}

/** The business wrote back: a customer's message in its person's thread. Answers the message. */
const wroteBack = async (w, b) =>
  one(
    db.from("messages").insert({
      tenant_id: w.tenant,
      conversation_id: b.thread,
      contact_id: b.contact,
      channel: "email",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Tell me more.",
      status: "received",
      meta: {},
    }),
  );

/** The reading of a business's reply: a question is interested. */
const question = async (w, b, message) =>
  ok(
    await db.from("reach_out_replies").insert({
      message_id: message,
      tenant_id: w.tenant,
      conversation_id: b.thread,
      contact_id: b.contact,
      lead_id: b.lead,
      lead_contact_id: b.contact,
      claim: "person",
      intent: "question",
      summary: "Asks what it costs",
      read_at: iso(dayAt(1)),
    }),
    "the reading of a reply",
  );

const report = async (w, args) =>
  ok(await w.viewer.rpc("reach_out_report", { p_tenant_id: w.tenant, p_days: 7, ...args }), "the report");
const totalsOf = async (w, args) =>
  ok(await w.viewer.rpc("reach_out_chain_totals", { p_tenant_id: w.tenant, p_days: 7, ...args }), "the chains");

/** An outcome is a count of the businesses, so none is more than them: in the totals, a step, an angle and past eight. */
function everyOutcomeIsOfBusinesses(rep) {
  const objects = [
    ["totals", rep.totals],
    ["other angles", rep.other_angles],
    ...rep.chains.flatMap((c) => c.steps.map((s, i) => [`${c.name}, step ${i + 1}`, s])),
    ...rep.angles.map((a) => [`angle ${a.angle}`, a]),
  ];
  for (const [what, o] of objects) {
    assert.equal(typeof o.businesses, "number", `${what}: says its businesses`);
    for (const k of ["wrote_back", "interested", "booked", "said_no"].filter((key) => key in o))
      assert.ok(o[k] <= o.businesses, `${what}: ${k} ${o[k]} is of ${o.businesses} businesses`);
  }
}

/**
 * Five businesses and two steps (S1, then S2 after it), a second reach-out that wrote nothing, and a viewer:
 *   L1  S1 (a1) 5 days ago, S2 (a2) 2 days ago; wrote back
 *   L2  S1 (a1) 5 days ago; booked
 *   L3  S1 (a1) 4 days ago, S2 (a2) 1 day ago; wrote back with a question
 *   L4  S1 (a1) 3 days ago, bounced
 *   L5  S1 (a1) 9 days ago: the period before a week.
 */
let world;
const worldA = () => (world ??= buildA());
async function buildA() {
  const w = await workspace("a");
  const r = await reachOut(w, "Reach out · Movers", 2);
  const none = await reachOut(w, "Reach out · Nothing yet", 1);
  const [S1, S2] = r.steps;
  const L = {};
  for (const n of [1, 2, 3, 4, 5]) L[n] = await business(w, `l${n}`);
  await write(w, r, S1, L[1], dayAt(5), { angle: "a1" });
  await write(w, r, S2, L[1], dayAt(2), { angle: "a2" });
  await write(w, r, S1, L[2], dayAt(5), { angle: "a1" });
  await write(w, r, S1, L[3], dayAt(4), { angle: "a1" });
  await write(w, r, S2, L[3], dayAt(1), { angle: "a2" });
  await write(w, r, S1, L[4], dayAt(3), { angle: "a1", bounced: true });
  await write(w, r, S1, L[5], dayAt(9), { angle: "a1" });
  await wroteBack(w, L[1]);
  await question(w, L[3], await wroteBack(w, L[3]));
  ok(
    await db
      .from("leads")
      .update({ booked_at: iso(dayAt(1)) })
      .eq("id", L[2].lead),
    "L2 booked",
  );
  return { w, r, none, S1, S2, L };
}

test("businesses are counted once, at their last email, and every outcome is of them", { skip }, async () => {
  const { w, r, S1, S2 } = await worldA();
  const rep = await report(w);
  // Six emails left to four businesses: L1 and L3 got two, so the 2 who wrote back are 2 of 4, never 2 of 6 (before
  // 00404 a page divided an outcome by `written`).
  assert.deepEqual(rep.totals, {
    written: 6,
    businesses: 4,
    delivered: 5,
    bounced: 1,
    wrote_back: 2,
    interested: 1,
    booked: 1,
    won: 0,
    said_no: 0,
    handed: 0,
  });
  assert.ok(rep.totals.businesses >= 1, "an email written always counts its business");
  // The period before a week: L5's email nine days ago, and only emails.
  assert.deepEqual(rep.before, { written: 1, delivered: 1, bounced: 0 });
  assert.deepEqual(
    rep.chains.map((c) => c.root_id),
    [r.root],
    "the reach-out that wrote nothing is not listed",
  );
  const steps = rep.chains[0].steps;
  assert.deepEqual(steps, [
    {
      id: S1,
      n: 0,
      hand: null,
      written: 4,
      delivered: 3,
      bounced: 1,
      businesses: 2,
      wrote_back: 0,
      interested: 0,
      booked: 1,
      won: 0,
      said_no: 0,
      handed: 0,
    },
    {
      id: S2,
      n: 1,
      hand: null,
      written: 2,
      delivered: 2,
      bounced: 0,
      businesses: 2,
      wrote_back: 2,
      interested: 1,
      booked: 0,
      won: 0,
      said_no: 0,
      handed: 0,
    },
  ]);
  // S1 wrote to four, but L1 and L3 moved on to S2: the two businesses whose last email was S1 are L2 and L4.
  assert.deepEqual(rep.angles, [
    { angle: "a1", written: 4, businesses: 2, wrote_back: 0 },
    { angle: "a2", written: 2, businesses: 2, wrote_back: 2 },
  ]);
  assert.deepEqual(rep.other_angles, { written: 0, businesses: 0, wrote_back: 0 });
  assert.equal(rep.no_angle, 0);
  assert.equal(sum(steps, "businesses"), rep.totals.businesses, "each business at one step only");
  everyOutcomeIsOfBusinesses(rep);
});

test("the chain's totals are the report's steps summed, in businesses as in emails", { skip }, async () => {
  const { w, r, none } = await worldA();
  const rep = await report(w);
  const chains = await totalsOf(w);
  const { last_at, ...counts } = chains[r.root];
  assert.deepEqual(counts, { written: 6, businesses: 4, wrote_back: 2 });
  assert.equal(Date.parse(last_at), dayAt(1), "when it last wrote");
  const steps = rep.chains[0].steps;
  assert.deepEqual(counts, {
    written: sum(steps, "written"),
    businesses: sum(steps, "businesses"),
    wrote_back: sum(steps, "wrote_back"),
  });
  assert.deepEqual(
    chains[none.root],
    { written: 0, businesses: 0, wrote_back: 0, last_at: null },
    "a reach-out that wrote nothing is zeros, and never absent",
  );
  assert.deepEqual(Object.keys(chains).sort(), [r.root, none.root].sort(), "every reach-out of the workspace");
  assert.ok(counts.businesses >= 1, "an email written always counts its business");
});

test(
  "a window that ended counts nothing after it, and the period before is the days before that window",
  { skip },
  async () => {
    const { w, r, S1, S2 } = await worldA();
    // Seven days to three days ago: L1's and L3's S2 (two and one days ago) are after it, so their last email in it is S1.
    const end = dayKey(3);
    const rep = await report(w, { p_end: end });
    assert.equal(rep.end, end);
    assert.deepEqual(rep.totals, {
      written: 5,
      businesses: 5,
      delivered: 4,
      bounced: 1,
      wrote_back: 2,
      interested: 1,
      booked: 1,
      won: 0,
      said_no: 0,
      handed: 0,
    });
    assert.ok(rep.totals.businesses >= 1, "an email written always counts its business");
    // L5's email nine days ago was in the period before a week from today, and is in this window: written now.
    assert.deepEqual(rep.before, { written: 0, delivered: 0, bounced: 0 }, "nothing in the seven days before");
    const [first, second] = rep.chains[0].steps;
    assert.deepEqual(pick(first, ["id", "written", "businesses", "wrote_back", "interested", "booked"]), {
      id: S1,
      written: 5,
      businesses: 5,
      wrote_back: 2,
      interested: 1,
      booked: 1,
    });
    assert.deepEqual(
      pick(second, ["id", "written", "businesses", "wrote_back", "interested", "booked"]),
      { id: S2, written: 0, businesses: 0, wrote_back: 0, interested: 0, booked: 0 },
      "REGRESSION: counted what came after the window",
    );
    assert.deepEqual(rep.angles, [{ angle: "a1", written: 5, businesses: 5, wrote_back: 2 }]);
    everyOutcomeIsOfBusinesses(rep);
    const { last_at, ...counts } = (await totalsOf(w, { p_end: end }))[r.root];
    assert.deepEqual(counts, { written: 5, businesses: 5, wrote_back: 2 });
    assert.equal(Date.parse(last_at), dayAt(3), "the window's last email, L4's");

    // The same world over two days to the same day: the period before is the two days before THAT window (L1's and L2's
    // emails five days ago), not the two days before today.
    const short = await report(w, { p_days: 2, p_end: end });
    assert.deepEqual(pick(short.totals, ["written", "businesses", "delivered", "bounced", "wrote_back", "booked"]), {
      written: 2,
      businesses: 2,
      delivered: 1,
      bounced: 1,
      wrote_back: 1,
      booked: 0,
    });
    assert.deepEqual(short.before, { written: 2, delivered: 2, bounced: 0 });
  },
);

test(
  "a member of another workspace is refused, and a partner's seat without the second factor is refused",
  { skip },
  async () => {
    const { w } = await worldA();
    const other = await workspace("a-stranger");
    for (const [who, client] of [
      ["another workspace's member", other.viewer],
      ["the service role, nobody signed in", db],
    ])
      for (const fn of ["reach_out_report", "reach_out_chain_totals"]) {
        const res = await client.rpc(fn, { p_tenant_id: w.tenant, p_days: 7 });
        assert.ok(res.error, `${who}, ${fn}: refused`);
        assert.equal(res.error.code, "P0002", `${who}, ${fn}: ${res.error.message}`);
      }
    const partner = (await member(w.tenant, "partner")).c;
    for (const fn of ["reach_out_report", "reach_out_chain_totals"]) {
      const res = await partner.rpc(fn, { p_tenant_id: w.tenant, p_days: 7 });
      assert.equal(res.error?.code, "P0002", `a partner's password alone, ${fn}: ${res.error?.message}`);
    }
    await showSecondFactor(partner);
    const rep = ok(await partner.rpc("reach_out_report", { p_tenant_id: w.tenant, p_days: 7 }), "once it showed it");
    assert.equal(rep.totals.businesses, 4, "a partner who showed the second factor reads the same");
    ok(await partner.rpc("reach_out_chain_totals", { p_tenant_id: w.tenant, p_days: 7 }), "and the chains");
  },
);

test(
  "a step every business moved past has emails and no businesses, and a business two reach-outs wrote to is one of each",
  { skip },
  async () => {
    const w = await workspace("moved");
    const first = await reachOut(w, "Reach out · Moved on", 2);
    const second = await reachOut(w, "Reach out · Also", 2);
    const [S1, S2] = first.steps;
    const M1 = await business(w, "m1");
    const M2 = await business(w, "m2");
    for (const m of [M1, M2]) {
      await write(w, first, S1, m, dayAt(3), { angle: "m1" });
      await write(w, first, S2, m, dayAt(1), { angle: "m2" });
    }
    // M1 is a business of the second reach-out as well, and wrote back: by its follow-up, since no lead has two first
    // emails (00427), as the reach-outs before 00197 could leave behind.
    await write(w, second, second.steps[1], M1, dayAt(2), { angle: "x1" });
    await wroteBack(w, M1);

    const rep = await report(w);
    const step = (i) =>
      pick(rep.chains.find((c) => c.root_id === first.root).steps[i], ["written", "businesses", "wrote_back"]);
    assert.deepEqual(
      step(0),
      { written: 2, businesses: 0, wrote_back: 0 },
      "S1 wrote two emails and is nobody's last: every business moved past it",
    );
    assert.deepEqual(step(1), { written: 2, businesses: 2, wrote_back: 1 });
    assert.deepEqual(
      rep.angles,
      [
        { angle: "m1", written: 2, businesses: 0, wrote_back: 0 },
        { angle: "m2", written: 2, businesses: 2, wrote_back: 1 },
        { angle: "x1", written: 1, businesses: 1, wrote_back: 1 },
      ],
      "an angle every business moved past is the same",
    );
    // M1 is counted once in each reach-out it was written to, as it is in wrote back: the outcome is never past it.
    assert.deepEqual(pick(rep.totals, ["written", "businesses", "wrote_back"]), {
      written: 5,
      businesses: 3,
      wrote_back: 2,
    });
    const chains = await totalsOf(w);
    assert.deepEqual(pick(chains[first.root], ["written", "businesses", "wrote_back"]), {
      written: 4,
      businesses: 2,
      wrote_back: 1,
    });
    assert.deepEqual(pick(chains[second.root], ["written", "businesses", "wrote_back"]), {
      written: 1,
      businesses: 1,
      wrote_back: 1,
    });
    for (const [what, o] of [["the workspace", rep.totals], ...Object.entries(chains)]) {
      const key = what === "the workspace" ? what : `the reach-out ${what}`;
      assert.ok(o.businesses >= 1, `${key}: an email written always counts its business`);
    }
    everyOutcomeIsOfBusinesses(rep);

    // A send cannot lack its business: the schema forbids a send with no lead, and a lead's removal takes its sends.
    const lost = await db.from("reach_out_sends").insert({
      id: crypto.randomUUID(),
      tenant_id: w.tenant,
      broadcast_id: first.runs[0],
      playbook_id: S1,
      root_id: first.root,
      lead_id: null,
      state: "sent",
      send_at: iso(dayAt(1)),
      sent_at: iso(dayAt(1)),
    });
    assert.equal(lost.error?.code, "23502", `a send with no lead: ${lost.error?.message}`);
    ok(await db.from("leads").delete().eq("id", M2.lead), "M2 removed");
    const gone = await report(w);
    assert.deepEqual(pick(gone.totals, ["written", "businesses", "wrote_back"]), {
      written: 3,
      businesses: 2,
      wrote_back: 2,
    });
  },
);

test("the angles past the top eight are summed in businesses too", { skip }, async () => {
  const w = await workspace("angles");
  const r = await reachOut(w, "Reach out · Angles", 2);
  const [S1, S2] = r.steps;
  const bs = [];
  for (let i = 0; i < 10; i += 1) {
    bs.push(await business(w, `g${i}`));
    await write(w, r, S1, bs[i], dayAt(3), { angle: `g${i}` });
  }
  // g8's business was written to again, with g0's angle: g8 wrote one email and no business is left at it.
  await write(w, r, S2, bs[8], dayAt(1), { angle: "g0" });
  await wroteBack(w, bs[9]);
  const rep = await report(w);
  assert.deepEqual(
    rep.angles.map((a) => [a.angle, a.written, a.businesses, a.wrote_back]),
    [["g0", 2, 2, 0], ...[1, 2, 3, 4, 5, 6, 7].map((i) => [`g${i}`, 1, 1, 0])],
    "the top eight by emails, then by name",
  );
  assert.deepEqual(
    rep.other_angles,
    { written: 2, businesses: 1, wrote_back: 1 },
    "g8 and g9: two emails, one business (g9's), who wrote back",
  );
  assert.deepEqual(pick(rep.totals, ["written", "businesses", "wrote_back"]), {
    written: 11,
    businesses: 10,
    wrote_back: 1,
  });
  everyOutcomeIsOfBusinesses(rep);
});

test(
  "the period before holds exactly its days: its first and last second in, the window's and the day after out",
  { skip },
  async () => {
    const w = await workspace("edges");
    const r = await reachOut(w, "Reach out · Edges", 1);
    const [S1] = r.steps;
    // Two days to yesterday (the window), so the period before is the two days before it: from four days ago to the
    // midnight that opens the window.
    const at = async (label, when, how) => write(w, r, S1, await business(w, label), when, how);
    await at("window-last", dayAt(1, 23, 59, 59));
    await at("window-first", dayAt(2, 0, 0, 0));
    await at("before-last", dayAt(3, 23, 59, 59));
    await at("before-first", dayAt(4, 0, 0, 0), { bounced: true });
    await at("older", dayAt(5, 23, 59, 59));
    await at("after", dayAt(0, 0, 0, 0));
    const rep = await report(w, { p_days: 2, p_end: dayKey(1) });
    assert.deepEqual(pick(rep.totals, ["written", "businesses", "delivered"]), {
      written: 2,
      businesses: 2,
      delivered: 2,
    });
    assert.deepEqual(rep.before, { written: 2, delivered: 1, bounced: 1 });
  },
);

// East of UTC the workspace's midnight comes hours before UTC's, west of it hours after: a period before that began at UTC's
// midnight (`v_prior` without `at time zone v_tz`, read in the session's zone) loses an email in one and takes another in
// the other. Each email is half an hour either side of a midnight of the workspace's own day.
for (const zone of ["Pacific/Auckland", "America/Los_Angeles"])
  test(
    `the period before begins at its midnight in the workspace's zone, not in UTC's (${zone})`,
    { skip },
    async () => {
      const w = await workspace("zone", zone);
      const r = await reachOut(w, "Reach out · Zone", 1);
      const [S1] = r.steps;
      const today = (await report(w)).today;
      const day = (n) => dayFrom(today, -n);
      const local = (n, hour, min) => localAt(day(n), hour, min, zone);
      const at = async (label, when, how) => write(w, r, S1, await business(w, label), when, how);
      // Two days to yesterday (the window): the period before is the two days before it, from the midnight that opens day -4.
      await at("older", local(5, 23, 30)); // half an hour before the period before begins: in neither
      await at("before-first", local(4, 0, 30), { bounced: true }); // half an hour after it begins
      await at("before-last", local(3, 23, 30)); // half an hour before the window begins
      await at("window-first", local(2, 0, 30)); // half an hour after the window begins
      await at("window-last", local(1, 23, 30)); // half an hour before the window ends
      // The zone matters for this test: a reading at UTC's midnight of that day would put one of the two edge emails on the
      // wrong side.
      const utcMidnight = Date.parse(`${day(4)}T00:00:00Z`);
      assert.ok(
        local(4, 0, 30) < utcMidnight || local(5, 23, 30) >= utcMidnight,
        `${zone}: a UTC midnight misplaces an edge email`,
      );
      const rep = await report(w, { p_days: 2, p_end: day(1) });
      assert.equal(rep.timezone, zone);
      assert.equal(rep.since, day(2), "the window's first day, the workspace's");
      assert.deepEqual(
        pick(rep.totals, ["written", "businesses", "delivered"]),
        { written: 2, businesses: 2, delivered: 2 },
        "the window holds the two emails of its own two days",
      );
      assert.deepEqual(
        rep.before,
        { written: 2, delivered: 1, bounced: 1 },
        "the period before holds the two emails of the two days before it, by the workspace's day",
      );
    },
  );
