/**
 * A one-off send honours the breath (spec §5.6): a person who heard from a campaign or a broadcast within the week
 * (contracts PLAYBOOK_BREATH_MS) is left out of a broadcast too, never sent it. They are enrolled with everyone, their row
 * marked in the run's own transaction (LEFT_OUT_FACTS, which the send's check at the wire skips them for), and skipped the
 * moment the run exists with RECIPIENT_REASON_HEARD, so the run's page says who was left out and why; a person sending it
 * may switch that off on the composer (`breathe: false`), and Ask never does. Who heard is ONE read, the composer's own:
 * packages/db recentTouches over touchesSince, so the number on the page, on Ask's card and in the skips the send writes is
 * one number for one moment.
 *
 * Run over the core verb (createBroadcast) with its ports faked, over packages/db's hold and read on a database in memory,
 * and over the dashboard's port for the window: two days ago is this week, eight days ago is not. The breath is the week
 * before a person RECEIVES the message (contracts leftOutBy, the one rule): a send scheduled ahead leaves out who heard within
 * the week before it goes, as known at the press, so one three days ahead leaves out a touch two days ago and keeps one
 * five days ago, and one ten days ahead leaves nobody out.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  LEFT_OUT_FACTS,
  PLAYBOOK_BREATH_MS,
  RECIPIENT_REASON_HEARD,
  allLeftOutWords,
  breathSplit,
  channelsReady,
  heardTooWords,
  heardWords,
  leftOutBy,
  leftOutByFacts,
  numberHealth,
} from "@chanlytics/contracts";
import { holdRecipients, recentTouches } from "@chanlytics/db";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { createBroadcast } = await importSrc("packages/core/src/campaigns/create-broadcast.ts");
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const { createBroadcastPorts } = await import(at("apps/dashboard/src/server/ports/campaign-ports.ts"));
after(() => setServiceClient(null));

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-09-06T14:00:00Z");
const DAY = 86_400_000;
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
/** Who heard, as db recentTouches answers it (contact id -> their latest touch): each two days ago, unless given. */
const heard = (...ids) => Object.fromEntries(ids.map((id) => [id, ago(2 * DAY)]));
/** An instant `days` after NOW with its offset, as the route takes a scheduled send (10:00 in New York). */
const ahead = (days) => new Date(NOW.getTime() + days * DAY).toISOString();
const T1 = "77777777-7777-4777-8777-777777777771";
const EMAIL_V = "77777777-7777-4777-8777-777777777772";
/** Three people, each a contact id the database in memory below can name. */
const ANA = "99999999-9999-4999-8999-999999999991";
const BEA = "99999999-9999-4999-8999-999999999992";
const CY = "99999999-9999-4999-8999-999999999993";

/** The message as the port answers it (db messageVersionRowsOf): WhatsApp's approved row, and an email version where asked. */
const row = (over = {}) => ({
  id: T1,
  channel: "whatsapp",
  name: "month_offer",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  variables: [],
  hidden_at: null,
  title: null,
  source: "meta",
  components: [],
  body_preview: null,
  rejected_reason: null,
  ...over,
});
const messageOf =
  ({ email = false, category = "marketing" } = {}) =>
  (id) =>
    id === T1 || (email && id === EMAIL_V)
      ? [
          row({ category }),
          ...(email ? [row({ id: EMAIL_V, channel: "email", category: null, source: "chanlytics" })] : []),
        ]
      : [];
/** A person as the People page reads them: quiet for 40 days, a number, and a yes to messages and to offers. */
const person = (id, over = {}) => ({
  id,
  state: "quiet",
  hasChat: true,
  calls: 0,
  phone: `+1555010${id.slice(-1)}00`,
  consent: {
    state: "opted_in",
    dnc: false,
    label: "Opted in",
    sub: "",
    source: "in_person",
    marketing: "opted_in",
    marketingSource: "in_person",
    marketingSub: "",
  },
  lastContact: { ts: NOW.getTime() - 40 * DAY, label: "" },
  heardDays: 40,
  ...over,
});
const THREE = [person(ANA), person(BEA), person(CY)];
const GREEN = numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" });
/** WhatsApp alone is ready, as every workspace was before the channels; `email` opens email (and offers by it) too. */
const workspace = ({ email = false } = {}) => ({
  ready: channelsReady({
    whatsapp: { canSend: GREEN.canSend, refusal: GREEN.refusal },
    textLine: null,
    email: {
      mailbox: email,
      domain: email,
      ...(email ? { offers: { campaigns: true, address: true, paused: null } } : {}),
    },
  }),
  health: GREEN,
});

const WRITES = new Set(["assemble", "holdRecipients"]);
/** Every port answers a value or a function of its arguments; the writes, and each read of who heard, log their call. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    message: messageOf(),
    bookingLink: null,
    reviewLink: null,
    people: THREE,
    list: null,
    channels: workspace(),
    // 14:00 UTC is 10:00 in New York: inside the hours a send may go out in.
    timezone: "America/New_York",
    assemble: (_row, _recipients, _sendAt, decision) => ({ id: "b1", decisionId: decision ? "d1" : null }),
    monthSent: 0,
    // The hold skips everyone it was handed, unless a case says it found fewer still queued, or failed part-way.
    holdRecipients: (_id, ids) => ({ skipped: ids, error: null }),
    // Who heard from a campaign or a broadcast within the week before now, and when last (db recentTouches): nobody,
    // unless a case says who.
    touches: {},
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      if (WRITES.has(name) || name === "touches") log.push([name, ...args]);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return {
    ports,
    ops: () => log.filter((l) => WRITES.has(l[0])).map((l) => l[0]),
    of: (name) => log.filter((l) => l[0] === name),
  };
}
const EVERYONE = { kind: "everyone" };
const make = (f, body) =>
  createBroadcast(f.ports, { userId: "u1", body: { template_id: T1, audience: EVERYONE, ...body }, now: NOW });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    assert.equal(e.message, words);
    return true;
  });
}
/** The lines a call logged (the logger writes one JSON object to console.error), and what it answered or threw. */
async function logged(p) {
  const said = [];
  const error = console.error;
  console.error = (...args) => said.push(JSON.parse(args[0]));
  try {
    return {
      out: await p.then(
        (v) => ({ v }),
        (e) => ({ e }),
      ),
      said,
    };
  } finally {
    console.error = error;
  }
}

test("the words: who a send leaves out before it goes, the switch that sends to them too, and the reason a skipped row keeps after", () => {
  assert.equal(RECIPIENT_REASON_HEARD, "heard_this_week");
  // A send that goes now says this week; one scheduled ahead, the week before it goes.
  assert.equal(heardWords(1, true, false), "1 left out: heard from you this week");
  assert.equal(heardWords(3, true, false), "3 left out: heard from you this week");
  assert.equal(heardWords(3, true, true), "3 left out: heard from you within the week before it goes");
  assert.equal(heardWords(3, false, false), "3 of them heard from a campaign or a broadcast this week.");
  assert.equal(heardWords(1, false, false), "One of them heard from a campaign or a broadcast this week.");
  assert.equal(
    heardWords(1, false, true),
    "One of them heard from a campaign or a broadcast within the week before it goes.",
  );
  assert.equal(heardWords(0, true, false), null, "nobody heard, nothing said");
  assert.equal(heardWords(undefined, true, false), null, "a receipt from before the breath says nothing");
  assert.equal(heardTooWords(3, false), "Also send to the 3 who heard this week");
  assert.equal(heardTooWords(1, false), "Also send to the one who heard this week");
  assert.equal(heardTooWords(2, true), "Also send to the 2 who heard within the week before it goes");
  assert.equal(
    allLeftOutWords("Regulars", 3, false),
    "Everyone it reaches on “Regulars” heard from you this week, so all 3 are left out.",
  );
  assert.equal(
    allLeftOutWords("Regulars", 1, false),
    "Everyone it reaches on “Regulars” heard from you this week, so the one person is left out.",
  );
  assert.equal(
    allLeftOutWords("Regulars", 2, true),
    "Everyone it reaches on “Regulars” heard from you within the week before it goes, so all 2 are left out.",
  );
  // One split, whoever counts: the composer's preview, Ask's card and the verb.
  assert.deepEqual(
    breathSplit(["a", "b", "c"], (x) => x, new Set(["b", "z"])),
    { goes: ["a", "c"], leftOut: ["b"] },
  );
  // The row's own word for it, one spelling: the reason.
  assert.deepEqual(LEFT_OUT_FACTS, { breath: RECIPIENT_REASON_HEARD });
  assert.equal(leftOutByFacts(LEFT_OUT_FACTS), true);
  assert.equal(leftOutByFacts({}), false);
  assert.equal(leftOutByFacts({ breath: "something_else", appointment: "a1" }), false);
});

test("three people, one of whom heard from a run two days ago: all three are enrolled, the one who heard marked on the row in the run's own write, two go, and the one is skipped as heard_this_week the moment the run exists", async () => {
  const f = fakes({ touches: heard(BEA) });
  const r = await make(f, {});
  assert.deepEqual(f.of("touches"), [["touches", NOW]], "who heard is read once, at the press");
  const [, run, recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((x) => [x.contact_id, x.facts]),
    [
      [ANA, null],
      [BEA, LEFT_OUT_FACTS],
      [CY, null],
    ],
    "everyone is on the run, so its page says who was left out and why; the left out carry it on their row",
  );
  assert.equal(run.recipient_count, 3);
  assert.deepEqual(f.of("holdRecipients"), [["holdRecipients", "b1", [BEA], RECIPIENT_REASON_HEARD]]);
  assert.equal(r.left_out, 1, "the receipt says how many were left out");
  assert.equal(r.recipient_count, 3);
  const payload = f.of("assemble")[0][4].payload;
  assert.equal(payload.left_out, 1, "and the ledger's line");
  assert.equal("breathe" in payload, false, "a send that breathes says nothing of it");
});

test("breathe: false sends to all three, and who heard is never read", async () => {
  const f = fakes({ touches: new Error("never asked") });
  const r = await make(f, { breathe: false });
  assert.deepEqual(f.of("touches"), [], "not read: nothing waits on it");
  assert.deepEqual(f.ops(), ["assemble"], "nobody held");
  assert.deepEqual(
    f.of("assemble")[0][2].map((x) => [x.contact_id, x.facts]),
    [
      [ANA, null],
      [BEA, null],
      [CY, null],
    ],
  );
  assert.equal(r.left_out, 0);
  assert.equal(f.of("assemble")[0][4].payload.breathe, false, "the ledger says the person sent past the breath");
  // `breathe: true`, or none, is the default: the same send as above.
  const named = fakes({ touches: heard(BEA) });
  await make(named, { breathe: true });
  assert.deepEqual(named.of("holdRecipients")[0][2], [BEA]);
});

test("a breathe that is not true or false is refused in words before anything is read or written", async () => {
  for (const breathe of ["no", 0, "false", {}]) {
    const f = fakes();
    await refused(
      make(f, { breathe }),
      "validation",
      400,
      "breathe is true or false: whether the people who heard from you this week are left out.",
    );
    assert.deepEqual(f.of("touches"), []);
    assert.deepEqual(f.ops(), []);
  }
  // Null is no answer, and a send breathes.
  const f = fakes({ touches: heard(BEA) });
  await make(f, { breathe: null });
  assert.deepEqual(f.of("holdRecipients")[0][2], [BEA]);
});

test("everyone it reaches heard this week: refused in words, with nothing written -- never a run of skips", async () => {
  const f = fakes({ touches: heard(ANA, BEA, CY) });
  await refused(make(f, {}), "conflict", 409, allLeftOutWords("Everyone", 3, false));
  assert.deepEqual(f.ops(), []);
  // Scheduled a day ahead, everyone it reaches heard within the week before it goes: said so.
  await refused(
    make(fakes({ touches: heard(ANA, BEA, CY) }), { scheduled_for: ahead(1) }),
    "conflict",
    409,
    allLeftOutWords("Everyone", 3, true),
  );
  // Sent to them too, it goes.
  const anyway = fakes({ touches: heard(ANA, BEA, CY) });
  await make(anyway, { breathe: false });
  assert.deepEqual(anyway.ops(), ["assemble"]);
});

test("who heard this week could not be read: refused, nothing written, and the log says which step -- 'nobody heard' is the reading that messages people twice", async () => {
  const f = fakes({ touches: new Error("rpc: connection reset") });
  const { out, said } = await logged(make(f, {}));
  assert.equal(out.e.code, "internal");
  assert.equal(out.e.status, 500);
  assert.equal(out.e.message, "Who heard from you this week could not be read just now. Nothing was sent; try again.");
  assert.equal(out.e.details, undefined, "the database's words are the log's, never the answer's");
  assert.deepEqual(f.ops(), []);
  assert.deepEqual(
    said.map((l) => [l.event, l.step, l.error]),
    [["campaign_step_failed", "touches", "Error: rpc: connection reset"]],
  );
});

test("the breath's skip is written before the month's hold, and who is left out is never counted against the month", async () => {
  // Four people by email, room for two this month: Ana heard this week. The month counts Bea, Cy and Dee, who go, and holds
  // the last of them; Ana is skipped for the breath, first.
  const DEE = "99999999-9999-4999-8999-999999999994";
  const byEmail = (id) => ({
    ...person(id, { phone: null }),
    email: `p${id.slice(-1)}@example.com`,
    lastChannel: null,
  });
  const f = fakes({
    message: messageOf({ email: true, category: "utility" }),
    channels: workspace({ email: true }),
    people: [byEmail(ANA), byEmail(BEA), byEmail(CY), byEmail(DEE)].map((p) => ({
      ...p,
      consent: { ...p.consent, channels: ["whatsapp", "sms"], marketingChannels: null, relationship: true },
    })),
    monthSent: (channel) => (channel === "email" ? 1998 : 0),
    touches: heard(ANA),
  });
  const r = await make(f, { channels: ["email"] });
  assert.deepEqual(
    f.of("holdRecipients").map((h) => [h[2], h[3]]),
    [
      [[ANA], RECIPIENT_REASON_HEARD],
      [[DEE], "month_allowance"],
    ],
  );
  assert.equal(f.of("assemble")[0][1].recipient_count, 4, "all four are on the run");
  assert.deepEqual([r.left_out, r.held_for_allowance], [1, 1]);
});

test("a skip the hold did not write -- it failed, failed part-way, or found the person already claimed -- is never claimed on the receipt, and the log names it for what it is; the row's mark still holds them at the wire", async () => {
  // It failed.
  const failed = fakes({ touches: heard(BEA), holdRecipients: new Error("write failed") });
  const one = await logged(make(failed, {}));
  assert.equal(one.out.v.id, "b1", "the run stands");
  assert.equal(one.out.v.left_out, 0, "nothing was written as left out");
  assert.equal(
    failed.of("assemble")[0][4].payload.left_out,
    1,
    "the ledger's line, written with the run, says what was asked",
  );
  assert.deepEqual(
    failed.of("assemble")[0][2][1].facts,
    LEFT_OUT_FACTS,
    "and the row's mark was in the run's own write",
  );
  assert.deepEqual(
    one.said.map((l) => [l.event, l.broadcast_id, l.reason, l.left_out_unwritten, l.error]),
    [["campaign_hold_unwritten", "b1", RECIPIENT_REASON_HEARD, 1, "Error: write failed"]],
  );
  // Part-way: what the hold wrote before it failed is claimed, and only that.
  const partWay = fakes({
    touches: heard(ANA, BEA),
    holdRecipients: (_id, ids) => ({ skipped: ids.slice(0, 1), error: "hold_recipients: connection reset" }),
  });
  const two = await logged(make(partWay, {}));
  assert.equal(two.out.v.left_out, 1, "the first step was written, the second not");
  assert.deepEqual(
    two.said.map((l) => [l.event, l.reason, l.left_out_unwritten, l.error]),
    [["campaign_hold_unwritten", RECIPIENT_REASON_HEARD, 1, "hold_recipients: connection reset"]],
  );
  // The send's first batch claimed her first: the hold skipped nobody, and the wire's own check is what holds her.
  const raced = fakes({ touches: heard(BEA), holdRecipients: () => ({ skipped: [], error: null }) });
  const three = await logged(make(raced, {}));
  assert.equal(three.out.v.left_out, 0);
  assert.deepEqual(
    three.said.map((l) => [l.event, l.reason, l.left_out_unwritten, l.error]),
    [["campaign_hold_unwritten", RECIPIENT_REASON_HEARD, 1, "no longer queued"]],
  );
  // The month's hold keeps its own field's name.
  const month = fakes({
    message: messageOf({ email: true, category: "utility" }),
    channels: workspace({ email: true }),
    people: [person(ANA, { phone: null, email: "a@example.com", lastChannel: null })].map((p) => ({
      ...p,
      consent: { ...p.consent, channels: ["whatsapp", "sms"], marketingChannels: null, relationship: true },
    })),
    monthSent: (channel) => (channel === "email" ? 2000 : 0),
    holdRecipients: new Error("write failed"),
  });
  const four = await logged(make(month, { channels: ["email"] }));
  assert.equal(four.out.v.held_for_allowance, 0);
  assert.deepEqual(
    four.said.map((l) => [l.event, l.reason, l.unheld, "left_out_unwritten" in l]),
    [["campaign_hold_unwritten", "month_allowance", 1, false]],
  );
});

/* ---- packages/db: the hold answers who it skipped; who heard is read where the touches are ---- */

const RUN_2 = "88888888-8888-4888-8888-888888888882";
const RUN_8 = "88888888-8888-4888-8888-888888888888";
/** A run made and sent `days` ago, as broadcasts holds it. */
const sentRun = (id, days) => ({
  id,
  tenant_id: TENANT,
  name: "Spring offer",
  template_id: T1,
  template_name: "month_offer",
  template_language: "en_US",
  params: [],
  audience: { kind: "everyone", id: null, label: "Everyone" },
  state: "sent",
  scheduled_for: ago(days * DAY),
  started_at: ago(days * DAY),
  finished_at: ago(days * DAY - 60_000),
  recipient_count: 1,
  failure: null,
  created_at: ago(days * DAY),
  playbook_id: null,
  run_for: null,
});
const sentTo = (run, contact, days, over = {}) => ({
  broadcast_id: run,
  tenant_id: TENANT,
  contact_id: contact,
  state: "sent",
  reason: null,
  sent_at: ago(days * DAY),
  facts: null,
  ...over,
});
const world = (over = {}) =>
  fakeDb({
    tenants: [{ id: TENANT, name: "Harbor", timezone: "America/New_York" }],
    broadcasts: [sentRun(RUN_2, 2), sentRun(RUN_8, 8)],
    broadcast_recipients: [sentTo(RUN_2, BEA, 2), sentTo(RUN_8, CY, 8)],
    ...over,
  });

test("the hold answers who it skipped: a person still queued is skipped with the reason, one the send already claimed is left as it is and not counted", async () => {
  const tables = {
    broadcast_recipients: [
      sentTo(RUN_2, ANA, 0, { state: "queued", sent_at: null }),
      // Claimed by the send's first batch before the hold came: the row it writes before the wire (outcome_unknown).
      sentTo(RUN_2, BEA, 0, { state: "failed", reason: "outcome_unknown", sent_at: null }),
    ],
  };
  const db = fakeDb(tables);
  const done = await holdRecipients(db, {
    tenantId: TENANT,
    broadcastId: RUN_2,
    contactIds: [ANA, BEA],
    reason: RECIPIENT_REASON_HEARD,
  });
  assert.deepEqual(done, { skipped: [ANA], error: null });
  assert.deepEqual(
    tables.broadcast_recipients.map((r) => [r.contact_id, r.state, r.reason]),
    [
      [ANA, "skipped", RECIPIENT_REASON_HEARD],
      [BEA, "failed", "outcome_unknown"],
    ],
  );
});

test("the window is the breath's constant: who heard is db recentTouches, two days ago in and eight out, and the dashboard's port is it", async () => {
  assert.equal(PLAYBOOK_BREATH_MS, 7 * DAY, "a week");
  assert.deepEqual(Object.keys(await recentTouches(world(), TENANT, NOW)), [BEA]);
  const ports = createBroadcastPorts({ supabase: world(), userId: "u1" }, TENANT, { fresh: false });
  assert.deepEqual(await ports.touches(NOW), { [BEA]: ago(2 * DAY) }, "who heard, and when last");
  // The verb over that port: Bea is left out, Cy (eight days ago) goes with Ana.
  const f = fakes({ touches: (now) => ports.touches(now) });
  const r = await make(f, {});
  assert.deepEqual(f.of("holdRecipients"), [["holdRecipients", "b1", [BEA], RECIPIENT_REASON_HEARD]]);
  assert.equal(r.left_out, 1);
});

/* ---- The week before it goes: a send scheduled ahead is judged by its own time ---- */

test("the one rule: a person is left out when their latest touch is within the week before the send goes -- its scheduled time, or now -- as known at the press", () => {
  const now = NOW.getTime();
  const touches = { a: ago(2 * DAY), b: ago(5 * DAY), c: ago(6.9 * DAY) };
  const out = (sendsAt) => [...leftOutBy(touches, sendsAt, now)].sort();
  assert.deepEqual(out(now), ["a", "b", "c"], "now: the week before now, everyone the read holds");
  assert.deepEqual(out(now + 3 * DAY), ["a"], "three days ahead: the four days before now");
  assert.deepEqual(out(now + 10 * DAY), [], "a week or more ahead: nobody known at the press");
  assert.deepEqual(out(now - 3 * DAY), ["a", "b", "c"], "a time before now is now");
  // A run due later that is already on its way counts from when it is due.
  assert.deepEqual(
    [...leftOutBy({ d: ahead(1) }, now + 5 * DAY, now)],
    ["d"],
    "due tomorrow, four days before it goes",
  );
});

test("a send scheduled three days ahead leaves out a person touched two days ago and keeps one touched five days ago; ten days ahead it leaves out nobody; and it reads who heard once, at the press", async () => {
  const touches = { [BEA]: ago(2 * DAY), [CY]: ago(5 * DAY) };
  const soon = fakes({ touches });
  const r = await make(soon, { scheduled_for: ahead(3) });
  assert.deepEqual(soon.of("touches"), [["touches", NOW]], "read at the press, as the composer read it");
  assert.deepEqual(
    soon.of("assemble")[0][2].map((x) => [x.contact_id, x.facts]),
    [
      [ANA, null],
      [BEA, LEFT_OUT_FACTS],
      [CY, null],
    ],
  );
  assert.deepEqual(soon.of("holdRecipients"), [["holdRecipients", "b1", [BEA], RECIPIENT_REASON_HEARD]]);
  assert.equal(r.left_out, 1);
  // Now, both are within the week: the send that goes at once is as it was.
  const at = fakes({ touches });
  assert.equal((await make(at, {})).left_out, 2);
  // Ten days ahead: nobody known at the press heard within the week before it goes.
  const far = fakes({ touches });
  const later = await make(far, { scheduled_for: ahead(10) });
  assert.deepEqual(far.ops(), ["assemble"], "nobody to skip");
  assert.equal(later.left_out, 0);
  assert.equal("left_out" in far.of("assemble")[0][4].payload, false);
});
