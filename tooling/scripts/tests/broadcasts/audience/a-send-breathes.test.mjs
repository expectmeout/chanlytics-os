/**
 * A one-off send honours the breath (spec §5.6): a person who heard from a campaign or a broadcast within the week
 * (contracts PLAYBOOK_BREATH_MS) waits a week on a broadcast too. They are enrolled with everyone and skipped the moment the
 * run exists, with RECIPIENT_REASON_HEARD, so the run's page says who waited and why; a person sending it may switch that
 * off on the composer (`breathe: false`), and Ask never does. Who heard is ONE read, the composer's own: the dashboard's
 * port is recentTouches over packages/db touchesSince, so "N wait a week" on the page, on Ask's card and in the skips the
 * send writes are one number for one moment.
 *
 * Run over the core verb (createBroadcast) with its ports faked, and over the dashboard's port on a database in memory for
 * the window: two days ago is this week, eight days ago is not.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PLAYBOOK_BREATH_MS,
  RECIPIENT_REASON_HEARD,
  allWaitWords,
  breathSplit,
  channelsReady,
  heardTooWords,
  heardWords,
  numberHealth,
} from "@chanlytics/contracts";
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
    holdRecipients: undefined,
    // Who heard from a campaign or a broadcast this week: nobody, unless a case says who.
    touched: new Set(),
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      if (WRITES.has(name) || name === "touched") log.push([name, ...args]);
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

test("the words: who waits a week while a send breathes, the switch that sends to them too, and the reason a skipped row keeps", () => {
  assert.equal(RECIPIENT_REASON_HEARD, "heard_this_week");
  assert.equal(heardWords(1, true), "1 waits a week");
  assert.equal(heardWords(3, true), "3 wait a week");
  assert.equal(heardWords(3, false), "3 of them heard from a campaign or a broadcast this week.");
  assert.equal(heardWords(1, false), "One of them heard from a campaign or a broadcast this week.");
  assert.equal(heardWords(0, true), null, "nobody heard, nothing said");
  assert.equal(heardTooWords(3), "Also send to the 3 who heard this week");
  assert.equal(heardTooWords(1), "Also send to the one who heard this week");
  assert.equal(
    allWaitWords("Regulars", 3),
    "All 3 on “Regulars” it reaches heard from a campaign or a broadcast this week, so they wait a week.",
  );
  // One split, whoever counts: the composer's preview, Ask's card and the verb.
  assert.deepEqual(
    breathSplit(["a", "b", "c"], (x) => x, new Set(["b", "z"])),
    { goes: ["a", "c"], waits: ["b"] },
  );
});

test("three people, one of whom heard from a run two days ago: all three are enrolled, two go, and the one who heard is skipped as heard_this_week the moment the run exists", async () => {
  const f = fakes({ touched: new Set([BEA]) });
  const r = await make(f, {});
  assert.deepEqual(f.of("touched"), [["touched", NOW]], "who heard is read once, at the send's own clock");
  const [, run, recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((x) => x.contact_id),
    [ANA, BEA, CY],
    "everyone is on the run, so its page says who waited and why",
  );
  assert.equal(run.recipient_count, 3);
  assert.deepEqual(f.of("holdRecipients"), [["holdRecipients", "b1", [BEA], RECIPIENT_REASON_HEARD]]);
  assert.equal(r.waits_a_week, 1, "the receipt says how many wait");
  assert.equal(r.recipient_count, 3);
  const payload = f.of("assemble")[0][4].payload;
  assert.equal(payload.waits_a_week, 1, "and the ledger's line");
  assert.equal("breathe" in payload, false, "a send that breathes says nothing of it");
});

test("breathe: false sends to all three, and who heard is never read", async () => {
  const f = fakes({ touched: new Error("never asked") });
  const r = await make(f, { breathe: false });
  assert.deepEqual(f.of("touched"), [], "not read: nothing waits on it");
  assert.deepEqual(f.ops(), ["assemble"], "nobody held");
  assert.deepEqual(
    f.of("assemble")[0][2].map((x) => x.contact_id),
    [ANA, BEA, CY],
  );
  assert.equal(r.waits_a_week, 0);
  assert.equal(f.of("assemble")[0][4].payload.breathe, false, "the ledger says the person sent past the breath");
  // `breathe: true`, or none, is the default: the same send as above.
  const named = fakes({ touched: new Set([BEA]) });
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
      "breathe is true or false: whether the people who heard from you this week wait a week.",
    );
    assert.deepEqual(f.of("touched"), []);
    assert.deepEqual(f.ops(), []);
  }
  // Null is no answer, and a send breathes.
  const f = fakes({ touched: new Set([BEA]) });
  await make(f, { breathe: null });
  assert.deepEqual(f.of("holdRecipients")[0][2], [BEA]);
});

test("everyone it reaches heard this week: refused in words, with nothing written -- never a run of skips", async () => {
  const f = fakes({ touched: new Set([ANA, BEA, CY]) });
  await refused(make(f, {}), "conflict", 409, allWaitWords("Everyone", 3));
  assert.deepEqual(f.ops(), []);
  // Sent to them too, it goes.
  const anyway = fakes({ touched: new Set([ANA, BEA, CY]) });
  await make(anyway, { breathe: false });
  assert.deepEqual(anyway.ops(), ["assemble"]);
});

test("who heard this week could not be read: refused, nothing written, and the log says which step -- 'nobody heard' is the reading that messages people twice", async () => {
  const f = fakes({ touched: new Error("rpc: connection reset") });
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

test("the breath's skip is written before the month's hold, and who waits is never counted against the month", async () => {
  // Four people by email, room for two this month: Ana heard this week. The month counts Bea, Cy and Dee, who go, and holds
  // the last of them; Ana is skipped for the breath, first -- nothing at the wire would hold her, as the allowance has.
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
    touched: new Set([ANA]),
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
  assert.deepEqual([r.waits_a_week, r.held_for_allowance], [1, 1]);
});

test("a breath's skip that could not be written leaves them queued, and the receipt claims no skip it did not write; the log says so by name", async () => {
  const f = fakes({ touched: new Set([BEA]), holdRecipients: new Error("write failed") });
  const { out, said } = await logged(make(f, {}));
  assert.equal(out.v.id, "b1", "the run stands");
  assert.equal(out.v.waits_a_week, 0, "nothing was written as waiting");
  assert.equal(
    f.of("assemble")[0][4].payload.waits_a_week,
    1,
    "the ledger's line, written with the run, says what was asked",
  );
  assert.deepEqual(
    said.map((l) => [l.event, l.broadcast_id, l.reason, l.unheld, l.error]),
    [["campaign_hold_unwritten", "b1", RECIPIENT_REASON_HEARD, 1, "Error: write failed"]],
  );
});

/* ---- The window: the dashboard's port is the composer's own read of who heard ---- */

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
const sentTo = (run, contact, days) => ({
  broadcast_id: run,
  tenant_id: TENANT,
  contact_id: contact,
  state: "sent",
  reason: null,
  sent_at: ago(days * DAY),
  facts: null,
});
const world = () =>
  fakeDb({
    tenants: [{ id: TENANT, name: "Harbor", timezone: "America/New_York" }],
    broadcasts: [sentRun(RUN_2, 2), sentRun(RUN_8, 8)],
    broadcast_recipients: [sentTo(RUN_2, BEA, 2), sentTo(RUN_8, CY, 8)],
  });

test("the window is the breath's constant: the dashboard's port reads who a run reached two days ago, and not eight", async () => {
  assert.equal(PLAYBOOK_BREATH_MS, 7 * DAY, "a week");
  const db = world();
  const ports = createBroadcastPorts({ supabase: db, userId: "u1" }, TENANT, { fresh: false });
  assert.deepEqual([...(await ports.touched(NOW))], [BEA]);
  // The verb over that port: Bea waits a week, Cy (eight days ago) goes with Ana.
  const f = fakes({ touched: (now) => ports.touched(now) });
  const r = await make(f, {});
  assert.deepEqual(f.of("holdRecipients"), [["holdRecipients", "b1", [BEA], RECIPIENT_REASON_HEARD]]);
  assert.equal(r.waits_a_week, 1);
});
