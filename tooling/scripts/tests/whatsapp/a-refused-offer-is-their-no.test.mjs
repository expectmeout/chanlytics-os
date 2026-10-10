/**
 * An offer WhatsApp refused because the person stopped marketing messages from the business is that person's no to
 * offers (the 4 Oct wiring review, Consent edges). Meta said so in the failed receipt (Cloud API error 131050), the
 * receipt was stored on the message and nothing was learned from it: the person stayed a yes, and the next offer was
 * written to them and refused again. The receipts door now records the no the way a no to offers is recorded, once,
 * with WhatsApp as its source, and leaves every other answer alone. The real door runs, over a database in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { waStoppedMarketing } from "@chanlytics/channels";
import {
  consentChangeOf,
  consentChangeWords,
  consentSourceLabel,
  WHATSAPP_CONSENT_SOURCE,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";
import { logLineOf } from "../_log-lines.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { recordReceipts } = await import(at("apps/edge/lib/whatsapp/receipts.ts"));

const T = "aaaaaaaa-0000-4000-8000-0000000000d4";
/** What Meta posts in a failed receipt for a person who stopped marketing messages from the business. */
const STOPPED = [
  {
    code: 131050,
    title: "User stopped marketing messages",
    message:
      "Unable to deliver the message. This recipient has chosen to stop receiving marketing messages on WhatsApp from your business.",
  },
];

/** One workspace: four people an offer was written to, and the offers themselves. */
function world(over = {}) {
  const person = (id, marketing, more = {}) => ({
    id,
    tenant_id: T,
    consent: "opted_in",
    dnc: false,
    marketing_consent: marketing,
    marketing_consent_source: marketing === "unknown" ? null : "customer_message",
    marketing_consent_updated_at: marketing === "unknown" ? null : "2026-09-01T10:00:00Z",
    erased_at: null,
    ...more,
  });
  const tables = {
    contacts: [
      person("yes", "opted_in"),
      person("no", "opted_out"),
      person("gone", "opted_in", { erased_at: "2026-09-20T10:00:00Z" }),
      person("never", "unknown"),
    ],
    messages: ["yes", "no", "gone", "never"].map((who, i) => ({
      id: `m${i + 1}`,
      tenant_id: T,
      contact_id: who,
      external_id: `wamid.${who}`,
      status: "sent",
      direction: "outbound",
      meta: {},
    })),
    events: [],
    ...over,
  };
  return { tables, db: fakeDb(tables) };
}
const receipt = (id, status, over = {}) => ({ id, status, recipient_id: "15550139999", ...over });
const ledger = (w) => w.tables.events.filter((e) => e.kind === "contact.consent_changed");
async function logged(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...args) => lines.push(args);
  try {
    await fn();
    return lines.map(logLineOf).filter(Boolean);
  } finally {
    Object.assign(console, real);
  }
}

test("only Meta's own code for it is read as the person's choice, and nothing else in a receipt's errors is", () => {
  assert.equal(waStoppedMarketing(STOPPED), true);
  assert.equal(waStoppedMarketing([{ code: "131050" }]), true, "the code as a word is the same code");
  assert.equal(waStoppedMarketing([{ code: 131026 }, { code: 131050 }]), true, "among others");
  for (const not of [
    undefined,
    null,
    "131050",
    131050,
    {},
    { code: 131050 },
    [],
    [null],
    ["131050"],
    [{}],
    // Meta's own limit on marketing templates per person, and the reply window: neither is the person's answer.
    [{ code: 131049 }],
    [{ code: 131047 }],
    [{ code: 131026 }],
    [{ title: "User stopped marketing messages" }],
  ])
    assert.equal(waStoppedMarketing(not), false, JSON.stringify(not));
});

test("a refused offer is recorded as their no to offers, once, with WhatsApp as its source, and messages about their visit still reach them", async () => {
  const w = world();
  const lines = await logged(() => recordReceipts(w.db, T, [receipt("wamid.yes", "failed", { errors: STOPPED })]));
  const [yes] = w.tables.contacts;
  assert.equal(w.tables.messages[0].status, "failed", "the receipt lands as it always did");
  assert.deepEqual(w.tables.messages[0].error, { errors: STOPPED }, "with what Meta said about it");
  assert.deepEqual(
    [yes.marketing_consent, yes.marketing_consent_source, yes.consent, yes.dnc],
    ["opted_out", WHATSAPP_CONSENT_SOURCE, "opted_in", false],
    "a no to offers, and nothing of the other answer: this is not a STOP",
  );
  assert.notEqual(yes.marketing_consent_updated_at, "2026-09-01T10:00:00Z", "stamped");
  assert.deepEqual(
    ledger(w).map((e) => [e.category, e.subject_type, e.subject_id, e.data]),
    [
      [
        "contact",
        "contact",
        "yes",
        {
          purpose: "marketing",
          consent: "opted_out",
          previous: "opted_in",
          source: WHATSAPP_CONSENT_SOURCE,
          channel: "whatsapp",
          message_external_id: "wamid.yes",
        },
      ],
    ],
    "one ledger row, the shape every consent change has, naming the message Meta refused",
  );
  assert.deepEqual(
    lines.filter((l) => l.event === "wa_marketing_stopped").map((l) => [l.id, l.recorded]),
    [["wamid.yes", true]],
  );

  // Meta sends a receipt again, and a second offer to them fails the same way: the no is not recorded twice.
  const again = await logged(() => recordReceipts(w.db, T, [receipt("wamid.yes", "failed", { errors: STOPPED })]));
  assert.equal(ledger(w).length, 1);
  assert.deepEqual(
    again.filter((l) => l.event === "wa_marketing_stopped").map((l) => l.recorded),
    [false],
  );
});

test("a person who already said no, one who was erased, and a message nobody knows are left as they are", async () => {
  const w = world();
  await recordReceipts(w.db, T, [
    receipt("wamid.no", "failed", { errors: STOPPED }),
    receipt("wamid.gone", "failed", { errors: STOPPED }),
    receipt("wamid.unknown", "failed", { errors: STOPPED }),
  ]);
  const [, no, gone] = w.tables.contacts;
  assert.deepEqual(
    [no.marketing_consent, no.marketing_consent_source],
    ["opted_out", "customer_message"],
    "their own no keeps its own source",
  );
  assert.deepEqual([gone.marketing_consent, gone.marketing_consent_source], ["opted_in", "customer_message"]);
  assert.equal(ledger(w).length, 0);
});

test("a person who was never asked is a no from then on too: Meta refused them for their own choice, whatever our row said", async () => {
  const w = world();
  await recordReceipts(w.db, T, [receipt("wamid.never", "failed", { errors: STOPPED })]);
  const never = w.tables.contacts[3];
  assert.deepEqual([never.marketing_consent, never.marketing_consent_source], ["opted_out", WHATSAPP_CONSENT_SOURCE]);
  assert.deepEqual(
    ledger(w).map((e) => [e.subject_id, e.data.previous, e.data.consent]),
    [["never", "unknown", "opted_out"]],
  );
});

test("any other failure, and any receipt that is not a failure, records no answer", async () => {
  const w = world();
  const lines = await logged(() =>
    recordReceipts(w.db, T, [
      receipt("wamid.yes", "failed", { errors: [{ code: 131049, title: "Marketing limit" }] }),
      receipt("wamid.yes", "failed", { errors: [{ code: 131047, title: "Re-engagement message" }] }),
      receipt("wamid.yes", "failed"),
      // Meta never says it on a delivery, and a receipt that did would not be believed over its own status.
      receipt("wamid.yes", "delivered", { errors: STOPPED }),
    ]),
  );
  assert.equal(w.tables.contacts[0].marketing_consent, "opted_in");
  assert.equal(ledger(w).length, 0);
  assert.equal(lines.filter((l) => l.event === "wa_marketing_stopped").length, 0);
});

test("a database that refuses the answer costs the receipt nothing, and says so on the log", async () => {
  // The answer is the door's one write (record_provider_stop, 00380): a database that refuses it refuses the rpc.
  const w = world();
  const real = w.db.rpc.bind(w.db);
  w.db.rpc = (name, args) =>
    name === "record_provider_stop"
      ? Promise.resolve({ data: null, error: { message: "contacts is away" } })
      : real(name, args);
  const lines = await logged(() => recordReceipts(w.db, T, [receipt("wamid.yes", "failed", { errors: STOPPED })]));
  assert.equal(w.tables.messages[0].status, "failed", "the status landed first");
  assert.deepEqual(
    lines.filter((l) => l.event === "pg_offers_stop_failed" || l.event === "wa_marketing_stopped").map((l) => l.event),
    ["pg_offers_stop_failed"],
    "the failure says so once, and no line says an answer the database never gave",
  );
});

test("the person's page says whose word it is: WhatsApp's report, never their words to us and never a member's record", () => {
  assert.equal(WHATSAPP_CONSENT_SOURCE, "whatsapp");
  assert.equal(consentSourceLabel(WHATSAPP_CONSENT_SOURCE), "Reported by WhatsApp");
  const change = consentChangeOf({
    id: "ev-1",
    subject_id: "yes",
    created_at: "2026-10-05T14:00:00Z",
    data: {
      purpose: "marketing",
      consent: "opted_out",
      previous: "opted_in",
      source: WHATSAPP_CONSENT_SOURCE,
      channel: "whatsapp",
      message_external_id: "wamid.yes",
    },
  });
  assert.deepEqual(consentChangeWords(change), {
    who: "Offers",
    text: "Said no to offers",
    sub: "Reported by WhatsApp: they chose there to stop marketing messages from your business, so a message to them was not delivered",
  });
});
