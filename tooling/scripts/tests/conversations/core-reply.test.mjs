/**
 * The reply, run: every branch of the operator's reply through fakes that log
 * their calls, so what is proved is the order and the outcome, not the
 * route's text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { importSrc, ROOT } from "../_source.mjs";

const { replyToConversation, IDEMPOTENCY_WINDOW_MS, HOLD_EXPIRY_MS, SEND_GRACE_MS } = await importSrc(
  "packages/core/src/conversations/reply.ts",
);
const NOW = Date.parse("2026-09-11T12:00:00Z");
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const conv = (over = {}) => ({
  id: "c1",
  tenant_id: "t1",
  phone_e164: "+15550000001",
  contact_id: "k1",
  last_wa_inbound_at: iso(NOW - HOUR),
  consent: "opted_in",
  dnc: false,
  marketing_consent: null,
  ...over,
});
const approved = {
  name: "reservar_ahora",
  language: "en_US",
  body_preview: "Book with {{1}}: {{2}}",
  meta_status: "approved",
  category: "utility",
};
const READS = new Set(["pauseMs", "replyChannel", "template", "templateFacts", "hash", "now"]);

/** Every port answers a value (or a function of its arguments); the writes log their call as [name, ...args]. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    pauseMs: 2 * HOUR,
    now: () => NOW,
    replyChannel: "whatsapp",
    claimKey: { won: true },
    takeKey: true,
    releaseKey: undefined,
    template: approved,
    templateFacts: { business_name: "Marisa's", booking_link: "https://book.example/m" },
    hash: (s) => `h(${s})`,
    claimForReply: true,
    takeControl: undefined,
    withdrawDrafts: 1,
    queue: "m1",
    schedule: undefined,
    cancelOrphan: undefined,
    record: "d1",
    resolveEscalation: undefined,
    storeReceipt: true,
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    if (name === "now" || name === "hash") {
      ports[name] = answer;
      continue;
    }
    ports[name] = async (...args) => {
      if (!READS.has(name)) log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  // By NAME, never by position: these assertions used to index the log, so
  // adding one step to the order re-numbered a dozen of them in files that had
  // nothing to do with the change.
  const call = (name) => log.find((l) => l[0] === name);
  return { ports, log, call, ops: () => log.map((l) => l[0]) };
}
const cmd = (over = {}) => ({
  conv: conv(),
  userId: "u1",
  body: { text: "On our way." },
  idempotencyKey: null,
  ...over,
});
const refused = async (p, code, words) => assert.rejects(p, (e) => e.code === code && words.test(e.message));

test("a person who opted out is refused before anything is paused or queued; so is a thread with no phone", async () => {
  const { ports, ops } = fakes();
  await refused(replyToConversation(ports, cmd({ conv: conv({ consent: "opted_out" }) })), "conflict", /opt/i);
  assert.deepEqual(ops(), []);
  const bare = fakes();
  await refused(replyToConversation(bare.ports, cmd({ conv: conv({ phone_e164: null }) })), "conflict", /phone/);
  assert.deepEqual(bare.ops(), []);
});

test("inside the window: the words go as they are; the thread is paused and claimed BEFORE any row a job could send exists; the draft is withdrawn; the receipt says so", async () => {
  const { ports, call, ops } = fakes();
  const r = await replyToConversation(ports, cmd());
  // takeControl sits between the claim and the withdrawal: the wire asks who is
  // speaking now (00130), and a draft written in the same second still reaches it.
  assert.deepEqual(ops(), [
    "claimForReply",
    "takeControl",
    "withdrawDrafts",
    "queue",
    "schedule",
    "record",
    "resolveEscalation",
  ]);
  // The claim IS the pause: one statement, and the row it writes is the one
  // the receptionist reads. It used to be preceded by a mirror into a second
  // store, keyed by the number, with a release to undo it.
  assert.deepEqual(call("claimForReply")[2], new Date(NOW + 2 * HOUR).toISOString());
  assert.deepEqual(call("claimForReply"), ["claimForReply", "c1", iso(NOW + 2 * HOUR), "u1", iso(NOW)]);
  assert.equal(call("queue")[1].body, "On our way.");
  assert.equal(call("queue")[1].type, "text");
  assert.equal(call("queue")[1].sent_by, "u1");
  assert.equal(call("queue")[1].channel, "whatsapp");
  assert.equal(call("schedule")[2].toISOString(), iso(NOW + SEND_GRACE_MS));
  assert.deepEqual(call("schedule")[3], {
    message_id: "m1",
    conversation_id: "c1",
    to_phone: "+15550000001",
    body: "On our way.",
  });
  assert.deepEqual(call("record"), [
    "record",
    "t1",
    "conversation",
    "c1",
    "reply",
    { message_id: "m1", window_open: true, template: null },
  ]);
  assert.deepEqual(call("resolveEscalation"), ["resolveEscalation", "c1", "d1"]);
  assert.deepEqual(r, {
    message_id: "m1",
    status: "queued",
    cancelable_until: iso(NOW + SEND_GRACE_MS),
    window_open: true,
    withdrawn_drafts: 1,
    decision_id: "d1",
  });
});

test("inside the window, empty text is refused; a reply longer than its wire takes is refused in that wire's words; all before anything is touched", async () => {
  const empty = fakes();
  await refused(replyToConversation(empty.ports, cmd({ body: { text: "  " } })), "validation", /required/);
  assert.deepEqual(empty.ops(), []);
  const wa = fakes();
  await refused(
    replyToConversation(wa.ports, cmd({ body: { text: "x".repeat(4097) } })),
    "validation",
    /WhatsApp refuses a message over 4096/,
  );
  assert.deepEqual(
    wa.ops(),
    [],
    "REGRESSION guard: one over the limit was once stored, reported queued, and failed fifteen seconds later",
  );
  const sms = fakes({ replyChannel: "sms" });
  await refused(replyToConversation(sms.ports, cmd({ body: { text: "x".repeat(1601) } })), "validation", /1600/);
  assert.deepEqual(sms.ops(), []);
  const fine = fakes({ replyChannel: "sms" });
  const r = await replyToConversation(fine.ports, cmd({ body: { text: "x".repeat(1600) } }));
  assert.equal(fine.call("queue")[1].channel, "sms");
  assert.equal(r.status, "queued");
});

test("outside the window: only an approved template goes, a promotion needs a yes to offers, and the params are the workspace's facts, never the client's", async () => {
  const closed = conv({ last_wa_inbound_at: iso(NOW - 25 * HOUR) });
  const noTemplate = fakes();
  await refused(replyToConversation(noTemplate.ports, cmd({ conv: closed })), "window_closed", /24-hour/);
  assert.deepEqual(noTemplate.ops(), []);
  const pending = fakes({ template: { ...approved, meta_status: "pending" } });
  await refused(
    replyToConversation(
      pending.ports,
      cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }),
    ),
    "validation",
    /not approved/,
  );
  const promo = fakes({ template: { ...approved, category: "marketing" } });
  await refused(
    replyToConversation(
      promo.ports,
      cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }),
    ),
    "forbidden",
    /offers/,
  );
  const yes = fakes({ template: { ...approved, category: "marketing" } });
  assert.equal(
    (
      await replyToConversation(
        yes.ports,
        cmd({
          conv: { ...closed, marketing_consent: "opted_in" },
          body: { template: { name: "reservar_ahora", language: "en_US" } },
        }),
      )
    ).status,
    "queued",
    "a yes to offers lets the promotion through",
  );
  const { ports, call } = fakes();
  const r = await replyToConversation(
    ports,
    cmd({
      conv: closed,
      body: { template: { name: "reservar_ahora", language: "en_US", params: ["client", "params"] } },
    }),
  );
  assert.equal(
    call("queue")[1].body,
    "Book with Marisa's: book.example/m",
    "the workspace's facts, the scheme stripped, over the client's",
  );
  assert.equal(call("queue")[1].type, "template");
  assert.deepEqual(call("schedule")[3].template, {
    name: "reservar_ahora",
    language: "en_US",
    params: ["Marisa's", "book.example/m"],
  });
  assert.deepEqual(call("record")[5], { message_id: "m1", window_open: false, template: "reservar_ahora" });
  assert.equal(r.window_open, false);
  const bare = fakes({ templateFacts: null });
  await refused(
    replyToConversation(
      bare.ports,
      cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US", params: ["A", "B"] } } }),
    ),
    "validation",
    /no template facts/,
  );
  assert.deepEqual(
    bare.ops(),
    [],
    "the client's params are never a fallback: the browser does not choose the link that lands on a phone",
  );
  const typed = fakes({
    template: {
      ...approved,
      variables: [
        { label: "Business name", position: 1 },
        { label: "Offer", position: 2 },
      ],
    },
  });
  await refused(
    replyToConversation(
      typed.ports,
      cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }),
    ),
    "validation",
    /needs words for “Offer”/,
  );
  assert.deepEqual(
    typed.ops(),
    [],
    "a template with words to write is refused here, not by Meta fifteen seconds after 'queued'",
  );
  const two = fakes({
    template: {
      ...approved,
      variables: [
        { label: "Business name", position: 1 },
        { label: "Booking link", position: 2 },
      ],
    },
  });
  assert.equal(
    (
      await replyToConversation(
        two.ports,
        cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }),
      )
    ).status,
    "queued",
  );
  const none = fakes({ templateFacts: null });
  await refused(
    replyToConversation(
      none.ports,
      cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }),
    ),
    "validation",
    /no template facts/,
  );
  assert.deepEqual(none.ops(), []);
});

test("REGRESSION (I6): a template is filled by its own slots, as broadcasts and the assistant fill them -- the workspace's starters open with the customer's first name; one with words to write is refused in its own label", async () => {
  const closed = conv({ last_wa_inbound_at: iso(NOW - 30 * HOUR), display_name: "Rosa Díaz", wa_profile_name: null });
  // The shape the salon's starters have on the row: "Value n" labels, the examples Meta read.
  const welcome = {
    name: "welcome_new",
    language: "en_US",
    body_preview: "Hi {{1}}, welcome to {{2}}! Book whenever you're ready: {{3}}",
    meta_status: "approved",
    category: "utility",
    variables: [
      { label: "Value 1", example: "Dani", position: 1 },
      { label: "Value 2", example: "Luna Studio", position: 2 },
      { label: "Value 3", example: "https://booksy.com/luna-studio", position: 3 },
    ],
  };
  const { ports, log } = fakes({ template: welcome });
  const r = await replyToConversation(
    ports,
    cmd({ conv: closed, body: { template: { name: "welcome_new", language: "en_US" } } }),
  );
  assert.equal(
    r.status,
    "queued",
    "REGRESSION: 'This template takes 3 values; the Inbox fills two' turned away the workspace's own starter",
  );
  assert.deepEqual(
    log.find((l) => l[0] === "schedule")[3].template.params,
    ["Rosa", "Marisa's", "book.example/m"],
    "the first name, the business, the link: the starter's own slots",
  );
  assert.equal(
    log.find((l) => l[0] === "queue")[1].body,
    "Hi Rosa, welcome to Marisa's! Book whenever you're ready: book.example/m",
  );

  const nameless = fakes({ template: welcome });
  await replyToConversation(
    nameless.ports,
    cmd({
      conv: { ...closed, display_name: null, wa_profile_name: null },
      body: { template: { name: "welcome_new", language: "en_US" } },
    }),
  );
  assert.equal(
    nameless.log.find((l) => l[0] === "schedule")[3].template.params[0],
    "there",
    "no name on file reads 'Hi there', as a broadcast does",
  );

  const note = {
    ...welcome,
    name: "quick_note",
    body_preview: "Hi {{1}}, a quick note from {{2}}: {{3}}",
    variables: [
      welcome.variables[0],
      welcome.variables[1],
      { label: "Value 3", example: "we're open late on Thursdays this month.", position: 3 },
    ],
  };
  const q = fakes({ template: note });
  await refused(
    replyToConversation(q.ports, cmd({ conv: closed, body: { template: { name: "quick_note", language: "en_US" } } })),
    "validation",
    /needs words for “The note”, which the Inbox does not ask for/,
  );
  assert.deepEqual(q.ops(), [], "nothing is queued for a template the Inbox cannot fill");

  const hello = fakes({
    template: {
      name: "hello_world",
      language: "en_US",
      body_preview: "Hello World",
      meta_status: "approved",
      category: "utility",
      variables: [],
    },
  });
  assert.equal(
    (
      await replyToConversation(
        hello.ports,
        cmd({ conv: closed, body: { template: { name: "hello_world", language: "en_US" } } }),
      )
    ).status,
    "queued",
    "REGRESSION: a template with nothing to fill read 'takes 0 values'",
  );
  assert.deepEqual(hello.log.find((l) => l[0] === "schedule")[3].template.params, []);
});

test("a claim that changed no row releases the pause it mirrored and is a 409; nothing was queued", async () => {
  const { ports, ops } = fakes({ claimForReply: false });
  await refused(replyToConversation(ports, cmd()), "conflict", /nothing was sent/);
  assert.deepEqual(ops(), ["claimForReply"], "nothing ran before it, so there is nothing to undo after it");
});

test("a job that could not be scheduled cancels the row it would have sent, and the error is the caller's", async () => {
  const { ports, log, ops } = fakes({
    schedule: () => {
      throw new Error("queue down");
    },
  });
  await assert.rejects(replyToConversation(ports, cmd()), /queue down/);
  assert.deepEqual(ops(), ["claimForReply", "takeControl", "withdrawDrafts", "queue", "schedule", "cancelOrphan"]);
  assert.deepEqual(log.at(-1), ["cancelOrphan", "m1"]);
});

test("a replay: the same key and intent inside the window returns the stored receipt and sends nothing; after the window, or for a different intent, it sends and the receipt is stored under the caller's key", async () => {
  const stored = {
    message_id: "m0",
    status: "queued",
    cancelable_until: iso(NOW),
    window_open: true,
    withdrawn_drafts: 0,
  };
  const key = "u1:k1";
  const intent = 'h({"text":"On our way."})';
  /** The claim lost to a hold: the stored receipt, fresh and for these words unless said otherwise. */
  const hold = (over = {}) => ({
    won: false,
    held: { response: stored, created_at: iso(NOW - 5_000), request_hash: intent, ...over },
  });
  const fresh = fakes({ claimKey: (t, k) => (k === key ? hold() : { won: true }) });
  assert.deepEqual(await replyToConversation(fresh.ports, cmd({ idempotencyKey: "k1" })), stored);
  assert.deepEqual(fresh.ops(), ["claimKey"], "the claim, and nothing after it");
  const old = fakes({ claimKey: hold({ created_at: iso(NOW - IDEMPOTENCY_WINDOW_MS - 1) }) });
  assert.equal(
    (await replyToConversation(old.ports, cmd({ idempotencyKey: "k1" }))).message_id,
    "m1",
    "an old receipt does not answer",
  );
  assert.deepEqual(
    old.call("takeKey"),
    ["takeKey", "t1", key, intent, iso(NOW), iso(NOW - IDEMPOTENCY_WINDOW_MS - 1)],
    "taken over by the stamp it was read at",
  );
  const other = fakes({ claimKey: hold({ request_hash: "h(other)" }) });
  assert.equal(
    (await replyToConversation(other.ports, cmd({ idempotencyKey: "k1" }))).message_id,
    "m1",
    "a different intent under the same key goes through",
  );
  const taken = fakes({ claimKey: hold({ request_hash: "h(other)" }), takeKey: false });
  await refused(replyToConversation(taken.ports, cmd({ idempotencyKey: "k1" })), "conflict", /already being sent/);
  assert.deepEqual(
    taken.ops(),
    ["claimKey", "takeKey"],
    "another caller took it first: nothing queued, nothing let go",
  );
  const gone = fakes({ claimKey: { won: false, held: null } });
  await refused(replyToConversation(gone.ports, cmd({ idempotencyKey: "k1" })), "conflict", /already being sent/);
  assert.deepEqual(gone.ops(), ["claimKey"], "a hold that went between the claim and the read is refused, not taken");
  assert.deepEqual(other.log.at(-1), [
    "storeReceipt",
    "t1",
    key,
    intent,
    {
      message_id: "m1",
      status: "queued",
      cancelable_until: iso(NOW + SEND_GRACE_MS),
      window_open: true,
      withdrawn_drafts: 1,
      decision_id: "d1",
    },
    iso(NOW),
  ]);
  // The receipt is kept before the job exists, on the claim's stamp: a ledger
  // that fails after the job still leaves a retry under the same key
  // something to find, or the customer receives the words twice.
  const ledgerDown = fakes({
    record: () => {
      throw new Error("decisions down");
    },
  });
  await assert.rejects(replyToConversation(ledgerDown.ports, cmd({ idempotencyKey: "k1" })), /decisions down/);
  assert.deepEqual(ledgerDown.ops(), [
    "claimKey",
    "claimForReply",
    "takeControl",
    "withdrawDrafts",
    "queue",
    "storeReceipt",
    "schedule",
    "record",
  ]);
  assert.deepEqual(ledgerDown.call("storeReceipt"), [
    "storeReceipt",
    "t1",
    key,
    intent,
    {
      message_id: "m1",
      status: "queued",
      cancelable_until: iso(NOW + SEND_GRACE_MS),
      window_open: true,
      withdrawn_drafts: 1,
    },
    iso(NOW),
  ]);
  // A write of the second receipt (the decision's id) that fails is not the
  // reply's failure: the send is certain, and the first receipt answers a replay.
  let stores = 0;
  const idDown = fakes({
    storeReceipt: () => {
      if (++stores === 2) throw new Error("keys down");
      return true;
    },
  });
  assert.equal((await replyToConversation(idDown.ports, cmd({ idempotencyKey: "k1" }))).decision_id, "d1");
  assert.equal(stores, 2);
  const noKey = fakes();
  await replyToConversation(noKey.ports, cmd());
  assert.ok(!noKey.ops().includes("storeReceipt"), "no key, nothing stored");
  assert.ok(!noKey.ops().includes("claimKey"), "no key, nothing claimed");
});

/* ------------------------------------------------------------ the key, claimed
 * The key is a row the reply CLAIMS before anything else is written, on the
 * table's unique (tenant_id, key). These fakes keep ONE table for every caller
 * in a case, so what is proved is the race itself: the first claim wins, a
 * second under the same key is shown the first's hold and what it left.
 */
function keyTable(seed = []) {
  const rows = new Map(seed);
  const shared = {
    // What the reply READ before it claimed anything (the defect): the receipt
    // under the key, or nothing. Answered from the same table, so the verb as
    // it was runs these cases too, and fails them with two messages queued.
    priorReceipt: (t, k) => (rows.get(k)?.response ? { ...rows.get(k) } : null),
    claimKey: (t, k, hash, nowIso) => {
      if (rows.has(k)) return { won: false, held: { ...rows.get(k) } };
      rows.set(k, { response: null, created_at: nowIso, request_hash: hash });
      return { won: true };
    },
    takeKey: (t, k, hash, nowIso, from) => {
      const h = rows.get(k);
      if (!h || h.created_at !== from) return false;
      rows.set(k, { response: null, created_at: nowIso, request_hash: hash });
      return true;
    },
    releaseKey: (t, k, nowIso) => {
      if (rows.get(k)?.created_at === nowIso) rows.delete(k);
    },
    // Written only onto the row that still carries the caller's stamp, as the table's is.
    storeReceipt: (t, k, hash, response, stamp) => {
      const h = rows.get(k);
      if (!h || h.created_at !== stamp) return false;
      rows.set(k, { response, created_at: stamp, request_hash: hash });
      return true;
    },
  };
  return { rows, shared };
}
/** Callers over one table, each with its own log, and no two of them sharing a message id. */
function callers(table, over = {}) {
  let n = 0;
  const one = () => fakes({ ...table.shared, queue: () => `m${++n}`, ...over });
  return [one(), one()];
}
const writes = (...fs) => fs.flatMap((f) => f.log);
const SAME_KEY = () => cmd({ idempotencyKey: "k1" });

test("REGRESSION (audit 15.1): two replies under one key at once -- the key is claimed before anything is written, so one message is queued and one send scheduled; the other caller is refused as in progress, and once the receipt is kept the key answers with it", async () => {
  const table = keyTable();
  const [a, b] = callers(table);
  const outcomes = await Promise.allSettled([
    replyToConversation(a.ports, SAME_KEY()),
    replyToConversation(b.ports, SAME_KEY()),
  ]);
  assert.equal(writes(a, b).filter((l) => l[0] === "queue").length, 1, "one message queued");
  assert.equal(writes(a, b).filter((l) => l[0] === "schedule").length, 1, "one send scheduled");
  const won = outcomes.filter((o) => o.status === "fulfilled");
  const lost = outcomes.filter((o) => o.status === "rejected");
  assert.equal(won.length, 1);
  assert.equal(lost.length, 1);
  assert.equal(won[0].value.status, "queued");
  assert.equal(lost[0].reason.code, "conflict");
  assert.equal(lost[0].reason.status, 409);
  assert.match(lost[0].reason.message, /already being sent/);
  // The loser held nothing, so it let nothing go: the winner's claim stands, completed by its receipt.
  assert.ok(!writes(a, b).some((l) => l[0] === "releaseKey"));
  assert.deepEqual(table.rows.get("u1:k1").response, won[0].value);
  // A third call under the key, once the receipt is kept, is the replay: the receipt, and nothing queued.
  const [c] = callers(table);
  assert.deepEqual(await replyToConversation(c.ports, SAME_KEY()), won[0].value);
  assert.deepEqual(c.ops(), ["claimKey"]);
});

test("a reply that fails after its claim and before its receipt lets the key go, so a retry is not told it is in progress; one that fails after the receipt keeps it", async () => {
  const table = keyTable();
  const { ports, ops } = fakes({ ...table.shared, claimForReply: false });
  await refused(replyToConversation(ports, SAME_KEY()), "conflict", /nothing was sent/);
  assert.deepEqual(ops(), ["claimKey", "claimForReply", "releaseKey"]);
  assert.equal(table.rows.size, 0, "the claim is gone");
  const again = fakes(table.shared);
  assert.equal(
    (await replyToConversation(again.ports, SAME_KEY())).message_id,
    "m1",
    "the retry claims afresh, and sends",
  );
  // A refusal of the words themselves, after the claim, lets it go the same way.
  const empty = fakes(keyTable().shared);
  await refused(
    replyToConversation(empty.ports, cmd({ idempotencyKey: "k1", body: { text: "  " } })),
    "validation",
    /required/,
  );
  assert.deepEqual(empty.ops(), ["claimKey", "releaseKey"]);
  // After the receipt, the ledger failing keeps it: the send is certain, and a retry must find it.
  const kept = keyTable();
  const ledgerDown = fakes({
    ...kept.shared,
    record: () => {
      throw new Error("decisions down");
    },
  });
  await assert.rejects(replyToConversation(ledgerDown.ports, SAME_KEY()), /decisions down/);
  assert.ok(!ledgerDown.ops().includes("releaseKey"), "kept");
  assert.equal(kept.rows.get("u1:k1").response.message_id, "m1");
});

test("a hold with no receipt is the other caller's reply on its way until it is older than HOLD_EXPIRY_MS (past the replay window is not enough); older, it is abandoned and taken over -- by exactly one of two callers who both read it", async () => {
  const INTENT = 'h({"text":"On our way."})';
  const live = keyTable([
    ["u1:k1", { response: null, created_at: iso(NOW - HOLD_EXPIRY_MS + 1), request_hash: INTENT }],
  ]);
  const [x, y] = callers(live);
  await refused(replyToConversation(x.ports, SAME_KEY()), "conflict", /already being sent/);
  await refused(replyToConversation(y.ports, SAME_KEY()), "conflict", /already being sent/);
  assert.deepEqual(
    writes(x, y).map((l) => l[0]),
    ["claimKey", "claimKey"],
    "a hold a reply could still be writing under is never taken: nothing queued, nothing let go",
  );
  assert.equal(live.rows.get("u1:k1").response, null);

  const stale = keyTable([["u1:k1", { response: null, created_at: iso(NOW - HOLD_EXPIRY_MS), request_hash: INTENT }]]);
  const [a, b] = callers(stale);
  const outcomes = await Promise.allSettled([
    replyToConversation(a.ports, SAME_KEY()),
    replyToConversation(b.ports, SAME_KEY()),
  ]);
  assert.equal(writes(a, b).filter((l) => l[0] === "queue").length, 1, "one message queued");
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((o) => o.status === "rejected").length, 1);
  assert.equal(writes(a, b).filter((l) => l[0] === "takeKey").length, 2, "both tried; the table let one through");
  assert.equal(stale.rows.get("u1:k1").response.status, "queued", "and completed it");
});

test("a caller slow past HOLD_EXPIRY_MS is taken over and cannot complete: its receipt is refused on its stamp, the row it queued is canceled before any job exists, and the taker's is the one send scheduled", async () => {
  const table = keyTable();
  let wake;
  const stalled = new Promise((r) => (wake = r));
  const a = fakes({ ...table.shared, queue: () => "m1", withdrawDrafts: () => stalled.then(() => 1) });
  const b = fakes({ ...table.shared, queue: () => "m2", now: () => NOW + HOLD_EXPIRY_MS });
  const pa = replyToConversation(a.ports, SAME_KEY());
  // A claims and stalls after the thread is its: past its hold, before its row.
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(a.ops(), ["claimKey", "claimForReply", "takeControl", "withdrawDrafts"]);
  const rb = await replyToConversation(b.ports, SAME_KEY());
  assert.equal(rb.message_id, "m2", "B took the abandoned hold over and sent");
  assert.deepEqual(b.call("takeKey"), [
    "takeKey",
    "t1",
    "u1:k1",
    'h({"text":"On our way."})',
    iso(NOW + HOLD_EXPIRY_MS),
    iso(NOW),
  ]);
  wake();
  await refused(pa, "conflict", /already being sent/);
  assert.deepEqual(a.ops(), [
    "claimKey",
    "claimForReply",
    "takeControl",
    "withdrawDrafts",
    "queue",
    "storeReceipt",
    "cancelOrphan",
    "releaseKey",
  ]);
  assert.deepEqual(
    a.call("cancelOrphan"),
    ["cancelOrphan", "m1"],
    "A's row is canceled, and no job was ever made for it",
  );
  assert.equal(writes(a, b).filter((l) => l[0] === "schedule").length, 1, "exactly one send scheduled");
  assert.equal(b.call("schedule")[3].message_id, "m2");
  assert.equal(
    table.rows.get("u1:k1").response.message_id,
    "m2",
    "B's receipt stands: A's release named a stamp that had moved",
  );
});

test("a hold outlives any reply the route can run: HOLD_EXPIRY_MS is above the reply route's maxDuration, which the route pins", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
  const route = await import(
    pathToFileURL(path.join(ROOT, "apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts")).href
  );
  assert.equal(route.maxDuration, 60, "the reply route pins its lifetime, in seconds");
  assert.ok(
    HOLD_EXPIRY_MS > route.maxDuration * 1000,
    "a hold this old was left by a caller the platform has already ended",
  );
});

/* ------------------------------------------------------------------ email
 * A reply by email: where it goes is the address on the person's page, what it
 * leaves as is frozen before anything is claimed, and its row is born with both.
 */
const ADDRESS = "ana@example.com";
const PARENT = {
  messageId: "m0",
  from: "Ana@Example.com",
  rfcMessageId: "<q1@customer.example>",
  references: ["<q0@customer.example>"],
  subject: "Quote for Saturday",
};
const FROZEN = {
  request: { to: [ADDRESS], subject: "Re: Quote for Saturday", idempotency_key: "id-1" },
  subject: "Re: Quote for Saturday",
};
const byEmail = (over = {}) =>
  conv({ phone_e164: null, last_wa_inbound_at: null, email: ADDRESS, email_suppressed_at: null, ...over });
/** The flat fakes, plus email's port group logged the same way. */
function emailFakes(over = {}, email = {}) {
  const f = fakes({ replyChannel: "email", ...over });
  const answers = { parent: PARENT, freeze: FROZEN, ...email };
  f.ports.email = { newId: () => "id-1" };
  for (const [name, answer] of Object.entries(answers)) {
    f.ports.email[name] = async (...args) => {
      f.log.push([`email.${name}`, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return f;
}

test("a reply by email goes to the address on the person's page; its request is frozen before the thread is claimed, and the row is born with its id and that request", async () => {
  const { ports, call, ops } = emailFakes({ queue: (row) => row.id });
  const r = await replyToConversation(ports, cmd({ conv: byEmail(), body: { text: "We can do Saturday at 9." } }));
  assert.deepEqual(
    ops(),
    [
      "email.parent",
      "email.freeze",
      "claimForReply",
      "takeControl",
      "withdrawDrafts",
      "queue",
      "schedule",
      "record",
      "resolveEscalation",
    ],
    "no mirror to pause: this person has no number",
  );
  assert.deepEqual(call("email.freeze"), [
    "email.freeze",
    {
      tenantId: "t1",
      conversationId: "c1",
      messageId: "id-1",
      to: ADDRESS,
      parent: PARENT,
      body: "We can do Saturday at 9.",
    },
  ]);
  const row = call("queue")[1];
  assert.deepEqual([row.id, row.channel, row.type, row.body], ["id-1", "email", "text", "We can do Saturday at 9."]);
  assert.deepEqual(row.meta, {
    email: {
      subject: "Re: Quote for Saturday",
      to: [ADDRESS],
      parent_id: "m0",
      in_reply_to: "<q1@customer.example>",
      request: FROZEN.request,
    },
  });
  assert.deepEqual(
    call("schedule")[3],
    { message_id: "id-1", conversation_id: "c1", to_email: ADDRESS, body: "We can do Saturday at 9." },
    "an address never travels as to_phone",
  );
  assert.equal(r.window_open, true, "email has no window");

  // An answer to a reach-out on an own domain verified now carries its twin beside the mailbox's request (C15).
  const twin = {
    to: [ADDRESS],
    subject: "Re: Quote for Saturday",
    idempotency_key: "id-1",
    from: "Sam <sam@owndomain.example.com>",
  };
  const owned = emailFakes({ queue: (row) => row.id }, { freeze: { ...FROZEN, own: twin } });
  await replyToConversation(owned.ports, cmd({ conv: byEmail() }));
  const kept = owned.call("queue")[1].meta.email;
  assert.deepEqual([kept.request, kept.own_request], [FROZEN.request, twin]);

  const both = emailFakes();
  await replyToConversation(both.ports, cmd({ conv: byEmail({ phone_e164: "+15550000001" }) }));
  assert.deepEqual(
    both.ops().slice(0, 3),
    ["email.parent", "email.freeze", "claimForReply"],
    "the reply is frozen before the thread is claimed, whether or not the person also has a number",
  );
});

test("an email reply that cannot go is refused in words before anything is touched: no address, a stopped address, no email to answer, no mailbox, too long", async () => {
  const none = emailFakes();
  await refused(
    replyToConversation(none.ports, cmd({ conv: byEmail({ email: null }) })),
    "conflict",
    /no email address on their page/,
  );
  const stopped = emailFakes();
  await refused(
    replyToConversation(stopped.ports, cmd({ conv: byEmail({ email_suppressed_at: iso(NOW) }) })),
    "conflict",
    /has stopped/,
  );
  const orphan = emailFakes({}, { parent: null });
  await refused(replyToConversation(orphan.ports, cmd({ conv: byEmail() })), "conflict", /no email from this person/);
  const unset = emailFakes({}, { freeze: null });
  await refused(
    replyToConversation(unset.ports, cmd({ conv: byEmail() })),
    "conflict",
    /no email address to send from/,
  );
  const long = emailFakes();
  await refused(
    replyToConversation(long.ports, cmd({ conv: byEmail(), body: { text: "x".repeat(20001) } })),
    "validation",
    /20,000/,
  );
  for (const f of [none, stopped, orphan, unset, long])
    assert.deepEqual(
      f.ops().filter((o) => !o.startsWith("email.")),
      [],
      "nothing claimed, queued or scheduled",
    );
  // It never crosses wires: a person with a number and no address is not texted instead.
  const crossed = emailFakes();
  await refused(
    replyToConversation(crossed.ports, cmd({ conv: byEmail({ email: null, phone_e164: "+15550000001" }) })),
    "conflict",
    /no email address/,
  );
  assert.deepEqual(crossed.ops(), []);
});

test("when the address on their page is not the one they wrote from, the operator is told where the reply will go and agrees by value; nothing is sent until they do", async () => {
  const elsewhere = { ...PARENT, from: "ana.personal@example.com" };
  const asked = emailFakes({}, { parent: elsewhere });
  await assert.rejects(
    replyToConversation(asked.ports, cmd({ conv: byEmail() })),
    (e) =>
      e.code === "conflict" &&
      e.status === 409 &&
      e.details?.confirm_email_to === ADDRESS &&
      /came from ana\.personal@example\.com/.test(e.message) &&
      /will go to ana@example\.com/.test(e.message),
  );
  assert.deepEqual(asked.ops(), ["email.parent"]);

  const stale = emailFakes({}, { parent: elsewhere });
  await assert.rejects(
    replyToConversation(stale.ports, cmd({ conv: byEmail(), body: { text: "Hi", email_to: "old@example.com" } })),
    (e) => e.details?.confirm_email_to === ADDRESS,
    "agreeing to an address that is no longer theirs is asked again",
  );

  const agreed = emailFakes({}, { parent: elsewhere });
  const r = await replyToConversation(agreed.ports, cmd({ conv: byEmail(), body: { text: "Hi", email_to: ADDRESS } }));
  assert.equal(r.status, "queued");
  assert.equal(
    agreed.log.find((l) => l[0] === "email.freeze")[1].to,
    ADDRESS,
    "to the page's address, never the header's",
  );
});

test("a business with no booking link (one that quotes each job) replies with any template that does not send one; one that does is refused in words, before anything is touched", async () => {
  const closed = conv({ last_wa_inbound_at: iso(NOW - 30 * HOUR) });
  const quotes = { templateFacts: { business_name: "Harbor Moving", booking_link: null } };
  const linked = fakes(quotes);
  await refused(
    replyToConversation(
      linked.ports,
      cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }),
    ),
    "validation",
    /takes the booking link, and none is on file/,
  );
  assert.deepEqual(linked.ops(), [], "refused before the thread is claimed or anything queued");
  const named = fakes({
    ...quotes,
    template: {
      ...approved,
      body_preview: "Thanks for asking {{1}}! We will be in touch with your quote.",
      variables: [{ label: "Business name", position: 1 }],
    },
  });
  const r = await replyToConversation(
    named.ports,
    cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }),
  );
  assert.equal(r.status, "queued");
  assert.deepEqual(named.call("schedule")[3].template.params, ["Harbor Moving"]);
});

test("the facts port answers with the business name alone: no link is null, and no name is no facts", async () => {
  const { replyPorts } = await import("../../../../apps/dashboard/src/server/ports/core-ports.ts");
  const { fakeDb } = await import("../_fake-db.mjs");
  const at = (config) =>
    replyPorts({ supabase: fakeDb({ tenant_config: [{ tenant_id: "t1", config }] }), userId: "u1" }).templateFacts(
      "t1",
    );
  assert.deepEqual(await at({ brain: { business_name: "Harbor Moving" } }), {
    business_name: "Harbor Moving",
    booking_link: null,
  });
  assert.deepEqual(
    await at({ brain: { business_name: "Harbor Moving", booking_link: "https://book.example/harbor" } }),
    {
      business_name: "Harbor Moving",
      booking_link: "https://book.example/harbor",
    },
  );
  assert.equal(await at({ brain: { booking_link: "https://book.example/harbor" } }), null, "no name, no facts");
  assert.equal(await at({}), null, "and no receptionist, none");
});

test("the key ports over the fake table: a claim wins once and the next is shown the hold; the receipt completes it on its own stamp only; a hold is taken over on its stamp once, and the caller taken over cannot complete; a release removes the row the caller stamped, and only that", async () => {
  const { replyPorts } = await import("../../../../apps/dashboard/src/server/ports/core-ports.ts");
  const { fakeDb } = await import("../_fake-db.mjs");
  const tables = { idempotency_keys: [] };
  const ports = replyPorts({ supabase: fakeDb(tables), userId: "u1" });
  const row = () => tables.idempotency_keys[0];
  const T = iso(NOW);
  assert.deepEqual(await ports.claimKey("t1", "u1:k1", "h1", T), { won: true });
  assert.deepEqual(
    await ports.claimKey("t1", "u1:k1", "h2", iso(NOW + 1)),
    { won: false, held: { response: null, created_at: T, request_hash: "h1" } },
    "the winner's stamp and words, not the loser's",
  );
  assert.equal(tables.idempotency_keys.length, 1);
  assert.equal(row().route, "reply");
  const receipt = {
    message_id: "m1",
    status: "queued",
    cancelable_until: iso(NOW + SEND_GRACE_MS),
    window_open: true,
    withdrawn_drafts: 0,
  };
  assert.equal(
    await ports.storeReceipt("t1", "u1:k1", "h1", receipt, iso(NOW + 1)),
    false,
    "not the row's stamp: kept nothing",
  );
  assert.equal(row().response, null);
  assert.equal(await ports.storeReceipt("t1", "u1:k1", "h1", receipt, T), true, "the claim's own stamp keeps it");
  const completed = await ports.claimKey("t1", "u1:k1", "h1", iso(NOW + 2));
  assert.equal(completed.won, false);
  assert.deepEqual(
    completed.held,
    { response: receipt, created_at: T, request_hash: "h1" },
    "the stamp stays: the window runs from the claim",
  );
  // Taken over on the stamp it was read at; a second reader of the same stamp changes nothing, and the caller taken
  // over finds its stamp gone when it comes to keep its receipt.
  const from = completed.held.created_at;
  assert.equal(await ports.takeKey("t1", "u1:k1", "h3", iso(NOW + 3), from), true);
  assert.equal(await ports.takeKey("t1", "u1:k1", "h4", iso(NOW + 4), from), false);
  assert.deepEqual([row().request_hash, row().response, row().created_at], ["h3", null, iso(NOW + 3)]);
  assert.equal(
    await ports.storeReceipt("t1", "u1:k1", "h1", receipt, T),
    false,
    "the caller taken over cannot complete",
  );
  assert.equal(row().response, null, "and the taker's hold is untouched");
  // A release names its own stamp: another's removes nothing; its own goes, whatever it holds.
  await ports.releaseKey("t1", "u1:k1", iso(NOW + 4));
  assert.equal(tables.idempotency_keys.length, 1);
  await ports.releaseKey("t1", "u1:k1", iso(NOW + 3));
  assert.equal(tables.idempotency_keys.length, 0, "the claim is gone");
  assert.deepEqual(await ports.claimKey("t1", "u1:k1", "h5", T), { won: true }, "free again");
  assert.equal(await ports.storeReceipt("t1", "u1:k1", "h5", receipt, T), true);
  await ports.releaseKey("t1", "u1:k1", T);
  assert.equal(tables.idempotency_keys.length, 0, "a receipt kept before a job that then failed goes with its stamp");
});
