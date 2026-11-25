/**
 * A broadcast refused in the person's words before anything is written, an empty audience's two causes, the
 * business's own news, when it goes and what it is called; a playbook's run approved on its day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BROADCAST_MAX_RECIPIENTS,
  CAMPAIGNS_PAUSED_WORDS,
  EVERYONE_LABEL,
  broadcastName,
  campaignMessageOf,
  emptyAudienceRefusal,
  noNumberWords,
  numberHealth,
  paramLabel,
  SEND_ONCE_STOP_MS,
  toPersonRowVM,
} from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { localDate as tzDate } from "@chanlytics/contracts";
import {
  ACTIVE_LINE,
  D,
  GOES,
  NOW,
  OFFERS_OPEN,
  S1,
  T1,
  ZONE,
  approveRun,
  cancelBroadcast,
  checkPlaybook,
  createBroadcast,
  everyone,
  fakes,
  make,
  messageOf,
  noOne,
  person,
  reachable,
  refused,
  refusedLoudly,
  template,
  workspace,
} from "./_core-campaigns.mjs";

test("a broadcast is refused in the person's words, in order, before anything is written: the template, who, the list, the template as Meta holds it, the values, the link", async () => {
  const f = fakes();
  await refused(make(f, { template_id: "nope", audience: everyone }), "validation", 400, "Pick a template.");
  await refused(
    make(f, { template_id: T1, audience: { kind: "carrier pigeons" } }),
    "validation",
    400,
    "Pick who this goes to.",
  );
  await refused(make(f, { template_id: T1, audience: { kind: "saved", id: "x" } }), "validation", 400, "Pick a list.");
  await refused(
    make(f, { template_id: T1, audience: { kind: "list", id: "nope" } }),
    "validation",
    400,
    "Pick a list.",
  );
  await refused(
    make(fakes({ message: messageOf({ whatsapp: null }) }), { template_id: T1, audience: everyone }),
    "not_found",
    404,
    "Template not found.",
  );
  await refused(
    make(fakes({ message: messageOf({ whatsapp: template({ meta_status: "rejected" }) }) }), {
      template_id: T1,
      audience: everyone,
    }),
    "conflict",
    409,
    "WhatsApp asked for a change to this message's words. AI writes new words for you to send back.",
  );
  await refused(
    make(fakes({ message: messageOf({ whatsapp: template({ variables: ["1"] }) }) }), {
      template_id: T1,
      params: [],
      audience: everyone,
    }),
    "validation",
    400,
    "This template takes 1 value.",
  );
  await refused(
    make(f, { template_id: T1, params: ["extra"], audience: everyone }),
    "validation",
    400,
    "This template takes no values.",
  );
  await refused(
    make(fakes({ message: messageOf({ whatsapp: template({ variables: ["1"] }) }) }), {
      template_id: T1,
      params: [{ kind: "moon_phase" }],
      audience: everyone,
    }),
    "validation",
    400,
    "Each value is typed text",
  );
  await refused(
    make(fakes({ message: messageOf({ whatsapp: template({ variables: ["1"] }) }) }), {
      template_id: T1,
      params: ["line\nbreak"],
      audience: everyone,
    }),
    "validation",
    400,
    "without line breaks or tabs",
  );
  await refused(
    make(fakes({ message: messageOf({ whatsapp: template({ variables: ["1"] }) }), bookingLink: null }), {
      template_id: T1,
      params: ["@booking_link"],
      audience: everyone,
    }),
    "conflict",
    409,
    "This message takes the booking link, and none is on file.",
  );
  // REGRESSION (C6): a one-off broadcast has no visit, so a visit's slot left every person held back as a missing value and the broadcast read as sent.
  await refused(
    make(fakes({ message: messageOf({ whatsapp: template({ variables: ["1"] }) }) }), {
      template_id: T1,
      params: ["@visit_when"],
      audience: everyone,
    }),
    "validation",
    400,
    "Only a message about one booking can fill in the booked time or service: a reminder before it, the check the day after, or the message after a missed one.",
  );
  await refused(
    make(fakes({ message: messageOf({ whatsapp: template({ variables: ["1"] }) }) }), {
      template_id: T1,
      params: [{ kind: "visit_service" }],
      audience: everyone,
    }),
    "validation",
    400,
    "Only a message about one booking can fill in the booked time or service: a reminder before it, the check the day after, or the message after a missed one.",
  );
  assert.deepEqual(f.ops(), [], "nothing enrolled, nothing scheduled, nothing on the ledger");
});

test("a list the send can't count here is refused in its own words, never sent to nobody (decision 0009)", async () => {
  const f = fakes({
    list: () => ({
      label: "Lapsed regulars",
      unknown: "This list reads your calendar, which can't be read right now.",
    }),
  });
  await refused(
    make(f, { template_id: T1, audience: { kind: "saved", id: S1 } }),
    "conflict",
    409,
    "Lapsed regulars can't be counted here. This list reads your calendar, which can't be read right now.",
  );
  assert.deepEqual(f.ops(), [], "nothing enrolled, nothing scheduled, nothing on the ledger");
  // Every People list is an audience now, not the five the refusal once named: resolved through the one port.
  const booked = fakes({ list: (ref) => (ref.id === "booked" ? { label: "Booked", memberIds: ["a"] } : null) });
  await make(booked, { template_id: T1, audience: { kind: "list", id: "booked" } });
  assert.deepEqual(
    booked.of("assemble")[0][2].map((r) => r.contact_id),
    ["a"],
  );
});

test("the audience: everyone, a People list, or a list kept by hand, crossed with the yes this template's category needs; an empty audience says which yes was missing", async () => {
  const all = fakes();
  await make(all, { template_id: T1, audience: everyone });
  assert.deepEqual(
    all.of("assemble")[0][2].map((r) => r.contact_id),
    ["a", "b"],
    "marketing: the yes to offers",
  );
  assert.equal(all.of("assemble")[0][1].audience.label, EVERYONE_LABEL);
  const utility = fakes({ message: messageOf({ whatsapp: template({ category: "utility" }) }) });
  await make(utility, { template_id: T1, audience: everyone });
  assert.deepEqual(
    utility.of("assemble")[0][2].map((r) => r.contact_id),
    ["a", "b", "c"],
    "a utility message needs only the yes to messages",
  );
  const quiet = fakes();
  await make(quiet, { template_id: T1, audience: { kind: "list", id: "quiet" } });
  assert.deepEqual(
    quiet.of("assemble")[0][2].map((r) => r.contact_id),
    ["a"],
  );
  // The send keeps the list as it was counted (decision 0009): its token, and its rule then.
  const counted = { counted_at: NOW.toISOString(), rule: null };
  assert.deepEqual(quiet.of("assemble")[0][1].audience, {
    kind: "list",
    id: "quiet",
    label: "Quiet 30+ days",
    list: { token: "seg:quiet", ...counted },
  });
  const saved = fakes({ list: (ref) => (ref.id === S1 ? { label: "VIPs", memberIds: ["b", "d"] } : null) });
  await make(saved, { template_id: T1, audience: { kind: "saved", id: S1 } });
  assert.deepEqual(
    saved.of("assemble")[0][2].map((r) => r.contact_id),
    ["b"],
    "on the list and said yes",
  );
  assert.deepEqual(saved.of("assemble")[0][1].audience, {
    kind: "saved",
    id: S1,
    label: "VIPs",
    list: { token: `list:${S1}`, ...counted },
  });
  await refused(
    make(fakes(), { template_id: T1, audience: { kind: "saved", id: S1 } }),
    "not_found",
    404,
    "List not found.",
  );
  const nobody = fakes({ people: noOne });
  await refused(
    make(nobody, { template_id: T1, audience: everyone }),
    "conflict",
    409,
    emptyAudienceRefusal("marketing", EVERYONE_LABEL, noOne, { channels: ["whatsapp"], about: "ours" }),
  );
  await refused(
    make(fakes({ people: noOne, message: messageOf({ whatsapp: template({ category: "utility" }) }) }), {
      template_id: T1,
      audience: everyone,
    }),
    "conflict",
    409,
    emptyAudienceRefusal("conversational", EVERYONE_LABEL, noOne, { channels: ["whatsapp"], about: "ours" }),
  );
  const crowd = Array.from({ length: BROADCAST_MAX_RECIPIENTS + 1 }, (_, i) => person(i));
  await refused(
    make(fakes({ people: crowd }), { template_id: T1, audience: everyone }),
    "validation",
    400,
    `At most ${BROADCAST_MAX_RECIPIENTS} people in one send.`,
  );
  assert.deepEqual(nobody.ops(), []);
});

test("REGRESSION: an empty audience says which of its two causes it has -- a yes with no number to send to read 'Nobody there has said yes', and every refusal sent the owner to a QR 'on this page'", async () => {
  // People's rows as the route reads them: the database's rows through contracts' toPersonRowVM.
  const at = (days) => new Date(NOW.getTime() - days * D).toISOString();
  const row = (over) =>
    toPersonRowVM(
      {
        id: "x",
        display_name: null,
        wa_profile_name: null,
        phone_e164: null,
        email: null,
        consent: "opted_in",
        consent_source: "in_person",
        consent_updated_at: at(20),
        dnc: false,
        marketing_consent: null,
        marketing_consent_source: null,
        marketing_consent_updated_at: null,
        channels: ["whatsapp"],
        conversation_count: 1,
        escalation_count: 0,
        needs_human: false,
        open_escalation_reason: null,
        open_escalation_since: null,
        latest_conversation_id: null,
        latest_state: "open",
        latest_paused_until: null,
        latest_assignee_user_id: null,
        latest_snooze_until: null,
        latest_wa_inbound_at: null,
        last_message_at: at(3),
        last_message_direction: "inbound",
        last_message_sender: "customer",
        last_inbound_text: "Thanks!",
        last_inbound_at: at(3),
        last_call_at: null,
        call_count: 0,
        call_seconds: 0,
        first_contact_at: at(30),
        earliest_row_at: at(30),
        has_backfill: false,
        has_chat: true,
        queued_reply_at: null,
        ...over,
      },
      ZONE,
      NOW,
    );
  const rows = [
    // Wrote in by email and said yes to both there: an address, and no number (the email channel, live since 18 Sep).
    row({
      id: "ana",
      display_name: "Ana Reyes",
      email: "ana@example.com",
      channels: ["email"],
      consent_source: "customer_message",
      marketing_consent: "opted_in",
      marketing_consent_source: "customer_message",
      marketing_consent_updated_at: at(20),
    }),
    // Walked in, said yes to messages at the desk, and left no number.
    row({
      id: "bea",
      display_name: "Bea Soto",
      channels: [],
      has_chat: false,
      conversation_count: 0,
      latest_state: null,
      last_message_at: null,
      last_message_direction: null,
      last_message_sender: null,
      last_inbound_text: null,
      last_inbound_at: null,
    }),
    // A number, and a yes to messages only: offers he was never asked about.
    row({ id: "luis", display_name: "Luis Mora", wa_profile_name: "Luis", phone_e164: "+17865550183" }),
    // A number, and no yes to anything yet.
    row({
      id: "cleo",
      display_name: "Cleo Park",
      phone_e164: "+17865550184",
      consent: null,
      consent_source: null,
      consent_updated_at: null,
    }),
  ];
  const REGULARS = "66666666-6666-4666-8666-666666666662";
  const WALK_INS = "66666666-6666-4666-8666-666666666663";
  const DESK = "66666666-6666-4666-8666-666666666664";
  const NEW = "66666666-6666-4666-8666-666666666665";
  const lists = {
    [REGULARS]: { name: "Regulars", memberIds: ["ana", "luis"] },
    [WALK_INS]: { name: "Walk-ins", memberIds: ["luis"] },
    [DESK]: { name: "At the desk", memberIds: ["bea"] },
    [NEW]: { name: "New", memberIds: ["cleo"] },
  };
  // Where a yes is got: in Sent, the ledger's card since #758. Not "on this page" -- these words are read in a
  // toast on the send screen, which has no QR, and in Ask, which is no page at all.
  const noYesToOffers =
    "Nobody there has said yes to offers yet · that is a separate answer from saying yes to messages, and only it puts somebody on a promotional send. Record it under “Offers and news” on a person's profile, or get their yes with the phrase and the QR in Sent.";
  const noYesToMessages =
    "Nobody there has said yes to messages yet. Even a reminder needs their recorded yes. Record it on a person's profile, or get their yes with the phrase and the QR in Sent.";
  /** The route's refusal of one list, for a message of this category: its status and its words, whole. */
  const refusalOf = async (list, category = "marketing") => {
    const f = fakes({
      people: rows,
      list: (ref) => (lists[ref.id] ? { label: lists[ref.id].name, memberIds: lists[ref.id].memberIds } : null),
      message: messageOf({ whatsapp: template({ category }) }),
    });
    try {
      await make(f, { template_id: T1, audience: { kind: "saved", id: list } });
    } catch (e) {
      assert.deepEqual(f.ops(), [], "nothing enrolled, nothing scheduled, nothing on the ledger");
      return [e.status, e.message];
    }
    assert.fail(`a broadcast to ${lists[list].name} went out`);
  };

  // Ana said yes to offers, and there is no number to send one to: the list is missing a number, not an answer.
  // People's words for it (#663), naming the list as the send screen names it (#811) -- and no QR, which would ask
  // Ana for the yes she gave.
  assert.deepEqual(
    await refusalOf(REGULARS),
    [409, noNumberWords("“Regulars”", "marketing")],
    "REGRESSION: 'Nobody there has said yes to offers yet'",
  );
  // Nobody on Walk-ins said yes to offers -- Ana did, and she is not on it: that IS a missing answer.
  assert.deepEqual(await refusalOf(WALK_INS), [409, noYesToOffers]);
  // The yes is the message's own. Bea said yes to messages, so a message to her list is missing a number...
  assert.deepEqual(await refusalOf(DESK, "utility"), [409, noNumberWords("“At the desk”", "conversational")]);
  // ...and an offer to it is missing her answer.
  assert.deepEqual(await refusalOf(DESK), [409, noYesToOffers]);
  // Cleo has a number and has said yes to nothing: a message to her is missing its answer too.
  assert.deepEqual(await refusalOf(NEW, "utility"), [409, noYesToMessages]);
});

test("the number: none connected, flagged, or an audience past the day's limit, refused before a row", async () => {
  await refused(
    make(fakes({ channels: workspace({ health: null }) }), { template_id: T1, audience: everyone }),
    "conflict",
    409,
    "Connect a WhatsApp number first",
  );
  const flagged = fakes({
    channels: workspace({ health: numberHealth({ quality: "RED", event: null, limit: "TIER_1K" }) }),
  });
  await refused(
    make(flagged, { template_id: T1, audience: everyone }),
    "conflict",
    409,
    "WhatsApp flagged this number's quality",
  );
  const many = Array.from({ length: 51 }, (_, i) => person(i));
  const over = fakes({
    people: many,
    channels: workspace({ health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_50" }) }),
  });
  await refused(
    make(over, { template_id: T1, audience: everyone }),
    "validation",
    400,
    "Send to a smaller list or split it.",
  );
  assert.deepEqual(over.ops(), []);
});

test("a broadcast goes by the channels it ticks, each person once on the first that reaches them, the channel written on their row", async () => {
  // A utility message: no yes to offers needed. By email it is the business's news, which waits for the workspace's offers as
  // an offer does (decision D2): this workspace's are open.
  const utility = template({ category: "utility" });
  const ready = workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true, offers: OFFERS_OPEN });
  const people = [
    reachable("a"), // a number and an address, never wrote: WhatsApp, the first of the three
    reachable("b", { lastChannel: "email" }), // wrote by email last: the channel they last wrote on comes first
    reachable("c", { phone: null }), // an address and no number: email
    reachable("d", { email: null, lastChannel: "sms" }), // wrote by text last, and said yes by text: text
    reachable("e", { phone: null, email: null }), // nowhere to send: held
  ];
  const f = fakes({ message: messageOf({ whatsapp: utility, own: ["email", "sms"] }), people, channels: ready });
  await make(f, { template_id: T1, audience: everyone, channels: ["whatsapp", "sms", "email"] });
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(row.channels, ["whatsapp", "sms", "email"]);
  assert.equal(row.recipient_count, 4, "four reached, once each; the one with nowhere to send is not enrolled");
  assert.deepEqual(
    recipients.map((r) => [r.contact_id, r.channel]),
    [
      ["a", "whatsapp"],
      ["b", "email"],
      ["c", "email"],
      ["d", "sms"],
    ],
    "the channel a person last wrote on comes first; else WhatsApp, text, email; each person once",
  );
});

test("a broadcast is the business's own news, whatever its template's category: by email it enrols whoever has a relationship on record or a yes covering email, and not an address alone (decision D1)", async () => {
  // A utility template (the yes to messages is the one asked) with Email ticked: its WhatsApp twin is a utility, which was
  // all an email asked, so every address went. Now an address alone is held, as it is for an offer.
  const utility = template({ category: "utility" });
  const ready = workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true, offers: OFFERS_OPEN });
  /** An address and no number; the consent says what the person has done, and by default nothing at all. */
  const byEmail = (id, consent = {}) => {
    const r = reachable(id, { phone: null });
    return { ...r, consent: { ...r.consent, state: "unknown", channels: null, relationship: false, ...consent } };
  };
  const people = [
    byEmail("a"), // an address, nothing else: held
    byEmail("b", { relationship: true }), // wrote, called or has a deal: enrolled
    byEmail("c", { state: "opted_in", channels: ["whatsapp", "sms", "email"] }), // a yes covering email: enrolled
    byEmail("d", { state: "opted_in", channels: ["whatsapp", "sms"] }), // a yes that does not cover email: held
    byEmail("e", { state: "opted_in", channels: null }), // a yes from before the channels, WhatsApp alone: held
    byEmail("f", { relationship: true, emailMarketing: "opted_out" }), // they pressed Unsubscribe: held, whatever else
    byEmail("g", { state: "opted_out", relationship: true }), // STOP: held
  ];
  const f = fakes({ message: messageOf({ whatsapp: utility, own: ["email"] }), people, channels: ready });
  const r = await make(f, { template_id: T1, audience: everyone, channels: ["email"] });
  assert.deepEqual(
    f.of("assemble")[0][2].map((x) => [x.contact_id, x.channel]),
    [
      ["b", "email"],
      ["c", "email"],
    ],
    "the two the business may send its news by email; the address alone is not enrolled",
  );
  assert.equal(r.recipient_count, 2);
  // Nobody qualifies: the broadcast is refused before a row, as one to an audience that has nobody to send to is.
  const strangers = fakes({
    message: messageOf({ whatsapp: utility, own: ["email"] }),
    people: [byEmail("a"), byEmail("d", { state: "opted_in", channels: ["whatsapp", "sms"] })],
    channels: ready,
  });
  // Said as what an email of the business's news asks (consent/asks.ts, from the one predicate), never as "a number".
  await refused(
    make(strangers, { template_id: T1, audience: everyone, channels: ["email"] }),
    "conflict",
    409,
    "people with a yes to hearing from you by email or a relationship with you on record, and an email address that works",
  );
  assert.deepEqual(strangers.ops(), [], "nothing enrolled, nothing scheduled, nothing on the ledger");
  // By WhatsApp, people are asked what they always were: the yes to messages, kept for WhatsApp (an unknown state holds
  // them; a yes recorded before the channels were covers it, with no relationship asked of anyone).
  const withNumber = (id, consent) => ({ ...byEmail(id, consent), phone: "+15551230009" });
  const wa = fakes({
    message: messageOf({ whatsapp: utility, own: ["email"] }),
    people: [withNumber("a", {}), withNumber("e", { state: "opted_in", channels: null })],
    channels: ready,
  });
  await make(wa, { template_id: T1, audience: everyone, channels: ["whatsapp"] });
  assert.deepEqual(
    wa.of("assemble")[0][2].map((x) => [x.contact_id, x.channel]),
    [["e", "whatsapp"]],
    "email's rule is email's alone: the same two, by WhatsApp, are held for the yes and sent on it",
  );
});

test("a broadcast is refused while the workspace is paused, in the words the composers say it in, before the people are read, and AI's card is refused with it", async () => {
  const { readCampaignHowOf } = await importSrc("packages/core/src/campaigns/create-broadcast.ts");
  const { CAMPAIGNS_PAUSED_WORDS } = await import("@chanlytics/contracts");
  const f = fakes({ channels: workspace({ paused: true }), people: new Error("the people must not be read") });
  await refused(make(f, { template_id: T1, audience: everyone }), "payment_required", 402, CAMPAIGNS_PAUSED_WORDS);
  assert.deepEqual(f.ops(), [], "no run, no people, no job, nothing on the ledger");
  // By any channel, and whatever the message: a pause is the workspace's.
  for (const channels of [["whatsapp"], ["whatsapp", "email"]])
    await refused(
      make(fakes({ channels: workspace({ paused: true, mailbox: true, domain: true, offers: OFFERS_OPEN }) }), {
        template_id: T1,
        audience: everyone,
        channels,
      }),
      "payment_required",
      402,
      "paused",
    );
  // The one rule a broadcast's ticks keep, which Ask asks before it proposes one: a card the route would refuse is never shown.
  const asked = fakes({ channels: workspace({ paused: true }) });
  const message = campaignMessageOf([template()], "month_offer", "en_US");
  await refused(readCampaignHowOf(asked.ports, message, ["whatsapp"], "marketing"), "payment_required", 402, "paused");
  // Not paused, the same broadcast is made.
  const fine = fakes({ channels: workspace({ paused: false }) });
  await make(fine, { template_id: T1, audience: everyone });
  assert.deepEqual(fine.ops(), ["assemble"]);
});

test("a broadcast of the business's news by email is refused at create while the workspace's offers are closed, with the reason an offer's tick gives (decision D2): the campaigns domain, the address, a pause", async () => {
  const utility = template({ category: "utility" });
  const news = (offers) =>
    fakes({
      message: messageOf({ whatsapp: utility, own: ["email"] }),
      people: [reachable("a")],
      channels: workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true, ...(offers ? { offers } : {}) }),
    });
  const tick = (f, channels = ["whatsapp", "email"]) => make(f, { template_id: T1, audience: everyone, channels });
  const f = news();
  await refused(tick(f), "conflict", 409, "Emails carry no offers or news for now.");
  assert.deepEqual(f.ops(), [], "refused before anyone is enrolled, a row or a decision");
  await refused(
    tick(news({ ...OFFERS_OPEN, campaigns: false })),
    "conflict",
    409,
    "Emails carry no offers or news for now.",
  );
  await refused(tick(news({ ...OFFERS_OPEN, address: false })), "conflict", 409, "Add your business's address");
  await refused(
    tick(news({ ...OFFERS_OPEN, paused: { at: "2026-10-01T10:00:00Z", reason: "bounces" } })),
    "conflict",
    409,
    "Offers by email are paused while complaints and bounces settle.",
  );
  // Open, it goes; and by WhatsApp alone the news was never held by it.
  await tick(news(OFFERS_OPEN));
  await tick(news(), ["whatsapp"]);
});

test("a broadcast that ticks nothing goes by WhatsApp alone, as every one went before; the ledger says the channels", async () => {
  const f = fakes({ channels: workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true }) });
  await make(f, { template_id: T1, audience: everyone });
  assert.deepEqual(f.of("assemble")[0][1].channels, ["whatsapp"]);
  assert.deepEqual(f.of("assemble")[0][4].payload.channels, ["whatsapp"]);
  // An unknown channel, an empty list and a bare word are no ticks (a channel named twice is one tick).
  for (const channels of [["carrier pigeon"], ["whatsapp", "carrier pigeon"], [], "email"])
    await refused(
      make(fakes(), { template_id: T1, audience: everyone, channels }),
      "validation",
      400,
      "Pick WhatsApp, text or email to send by.",
    );
});

test("a tick the send cannot keep is refused at create, in the words the composer's greyed tick says: the purpose never carries it, the workspace is not ready on it, the message has no version there", async () => {
  const ready = workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true });
  const offer = (over = {}) => fakes({ channels: ready, message: messageOf({ own: ["email", "sms"] }), ...over });
  const tick = (f, channels) => make(f, { template_id: T1, audience: everyone, channels });
  // Offers: texts carry none (a request that is wrong), and an email goes only once the workspace can send offers by
  // email (a state of the workspace, with the reason that is true).
  await refused(tick(offer(), ["sms"]), "validation", 400, "Texts carry no offers.");
  await refused(tick(offer(), ["whatsapp", "email"]), "conflict", 409, "Emails carry no offers or news for now.");
  const withOffers = (offers) =>
    offer({ channels: workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true, offers }) });
  await refused(
    tick(withOffers({ ...OFFERS_OPEN, address: false }), ["email"]),
    "conflict",
    409,
    "Add your business's address to send offers by email.",
  );
  await refused(
    tick(withOffers({ ...OFFERS_OPEN, paused: { at: "2026-10-01T10:00:00Z", reason: "complaints" } }), ["email"]),
    "conflict",
    409,
    "Offers by email are paused while complaints and bounces settle.",
  );
  await tick(withOffers(OFFERS_OPEN), ["whatsapp", "email"]);
  // A message that is not an offer goes by email and text, when the workspace is ready on them and the message has a version.
  // By email a broadcast's is the business's news, which waits for the workspace's offers as an offer does (decision D2).
  const utility = template({ category: "utility" });
  const opened = workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true, offers: OFFERS_OPEN });
  const visit = (over = {}) =>
    fakes({
      message: messageOf({ whatsapp: utility, own: ["email", "sms"] }),
      channels: opened,
      people: [reachable("a")],
      ...over,
    });
  await tick(visit(), ["email"]);
  await refused(
    tick(visit({ channels: ready }), ["email"]),
    "conflict",
    409,
    "Emails carry no offers or news for now.",
  );
  await refused(tick(visit({ channels: workspace() }), ["sms"]), "conflict", 409, "No texting line yet.");
  await refused(
    tick(visit({ channels: workspace({ textLine: { sms_state: "pending", reg_mock: false } }) }), ["sms"]),
    "conflict",
    409,
    "Texting isn't approved for your number yet.",
  );
  await refused(
    tick(visit({ channels: workspace({ textLine: { sms_state: "active", reg_mock: true } }) }), ["sms"]),
    "conflict",
    409,
    "Your texting line is a test filing: it sends nothing.",
  );
  await refused(
    tick(visit({ channels: workspace({ mailbox: false, domain: true, offers: OFFERS_OPEN }) }), ["email"]),
    "conflict",
    409,
    "Set up email in Settings",
  );
  await refused(
    tick(visit({ channels: workspace({ mailbox: true, domain: false, offers: OFFERS_OPEN }) }), ["email"]),
    "conflict",
    409,
    "not switched on",
  );
  // Ready on the channel but no version of the message there: it cannot be said on it.
  await refused(
    tick(visit({ message: messageOf({ whatsapp: utility, own: ["sms"] }) }), ["email"]),
    "conflict",
    409,
    "This message has no email version yet.",
  );
  await refused(
    tick(visit({ message: messageOf({ whatsapp: utility, own: ["email"] }) }), ["sms"]),
    "conflict",
    409,
    "This message has no text version yet.",
  );
  // Refused before anyone is enrolled, a row or a decision.
  const f = visit({ message: messageOf({ whatsapp: utility }) });
  await refused(tick(f, ["whatsapp", "email"]), "conflict", 409, "no email version");
  assert.deepEqual(f.ops(), []);
});

test("the WhatsApp number is asked about only when WhatsApp is ticked; the day's limit counts the people who go by it alone", async () => {
  const utility = template({ category: "utility" });
  const noNumber = workspace({ health: null, mailbox: true, domain: true, offers: OFFERS_OPEN });
  // No number at all, and an email send goes: it never asks.
  const email = fakes({
    message: messageOf({ whatsapp: utility, own: ["email"] }),
    channels: noNumber,
    people: [reachable("a")],
  });
  await make(email, { template_id: T1, audience: everyone, channels: ["email"] });
  assert.deepEqual(email.of("assemble")[0][2], [{ contact_id: "a", facts: null, channel: "email" }]);
  // Ticking WhatsApp with none refuses.
  await refused(
    make(fakes({ message: messageOf({ whatsapp: utility, own: ["email"] }), channels: noNumber }), {
      template_id: T1,
      audience: everyone,
      channels: ["whatsapp", "email"],
    }),
    "conflict",
    409,
    "Connect a WhatsApp number first",
  );
  // Past the number's tier, the people who go by WhatsApp are counted; a person by email is not Meta's limit.
  const tier = workspace({
    health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_50" }),
    mailbox: true,
    domain: true,
    offers: OFFERS_OPEN,
  });
  const crowd = (n, over) => Array.from({ length: n }, (_, i) => reachable(`${over?.lastChannel ?? "w"}${i}`, over));
  const mixed = fakes({
    message: messageOf({ whatsapp: utility, own: ["email"] }),
    channels: tier,
    people: [...crowd(40), ...crowd(30, { lastChannel: "email" })],
  });
  const r = await make(mixed, { template_id: T1, audience: everyone, channels: ["whatsapp", "email"] });
  assert.equal(r.recipient_count, 70, "forty on WhatsApp, thirty by email: Meta's fifty a day is not past");
  const past = fakes({
    message: messageOf({ whatsapp: utility, own: ["email"] }),
    channels: tier,
    people: crowd(51),
  });
  await refused(
    make(past, { template_id: T1, audience: everyone, channels: ["whatsapp", "email"] }),
    "validation",
    400,
    "Send to a smaller list or split it.",
  );
});

test("when, and what it is called: not a time, past the window, a past time is now, a future time is kept; a name given is trimmed, none given is the template and the day", async () => {
  await refused(
    make(fakes(), { template_id: T1, audience: everyone, scheduled_for: "nope" }),
    "validation",
    400,
    "That is not a time.",
  );
  // An instant names its offset: a bare date is midnight UTC (the evening
  // before, in New York) and a wall-clock time without one is the server's.
  await refused(
    make(fakes(), { template_id: T1, audience: everyone, scheduled_for: "2026-09-20" }),
    "validation",
    400,
    "Give the time with its offset",
  );
  await refused(
    make(fakes(), { template_id: T1, audience: everyone, scheduled_for: "2026-09-20T15:00" }),
    "validation",
    400,
    "Give the time with its offset",
  );
  await refused(
    make(fakes(), {
      template_id: T1,
      audience: everyone,
      scheduled_for: new Date(NOW.getTime() + 31 * D).toISOString(),
    }),
    "validation",
    400,
    "Schedule within 30 days.",
  );
  // The ceiling is judged on the moment it really goes: asked for an hour
  // inside the thirty days but after twenty, it would move past them.
  const night = new Date("2026-09-07T03:00:00Z");
  await refused(
    createBroadcast(fakes().ports, {
      userId: "u1",
      body: { template_id: T1, audience: everyone, scheduled_for: "2026-10-07T02:00:00Z" },
      now: night,
    }),
    "validation",
    400,
    "Schedule within 30 days.",
  );
  const past = fakes();
  const r1 = await make(past, {
    template_id: T1,
    audience: everyone,
    scheduled_for: new Date(NOW.getTime() - D).toISOString(),
  });
  // A past time is now, and now goes ten minutes on with a Stop (decision 0064, step 3).
  assert.equal(r1.scheduled_for, GOES.toISOString(), "a past time is now, with its ten minutes to stop it");
  assert.deepEqual([r1.pressed_now, r1.scheduled_ahead], [true, false]);
  assert.equal(r1.name, broadcastName("month_offer", ZONE, NOW, null), "the template and the day");
  const later = new Date(NOW.getTime() + 2 * D);
  const future = fakes();
  const r2 = await make(future, {
    template_id: T1,
    audience: everyone,
    scheduled_for: later.toISOString(),
    name: "  Spring offer  ",
  });
  assert.equal(r2.scheduled_for, later.toISOString());
  assert.equal(r2.pressed_now, false, "set for a time ahead: no ten minutes added");
  assert.deepEqual(future.of("assemble")[0][3], later, "the job is due when the run is");
  assert.equal(future.of("assemble")[0][1].scheduled_for, later.toISOString());
  assert.equal(r2.name, "Spring offer");
});

test("the rows, then the job, then the ledger: the row as the person composed it, the people with no words to keep, the send at its time, the decision, the receipt", async () => {
  const f = fakes({ message: messageOf({ whatsapp: template({ variables: ["1", "2"], title: "Monthly offer" }) }) });
  const r = await make(f, { template_id: T1, params: ["@first_name", "  20% off  "], audience: everyone });
  const specs = [{ kind: "first_name" }, { kind: "text", value: "20% off" }];
  const name = broadcastName("month_offer", ZONE, NOW, "Monthly offer");
  assert.deepEqual(f.ops(), ["assemble"], "the run, its people, its job and the ledger's line, whole");
  assert.deepEqual(f.of("assemble")[0][1], {
    name,
    template_id: T1,
    template_name: "month_offer",
    template_language: "en_US",
    params: specs,
    audience: { kind: "everyone", id: null, label: EVERYONE_LABEL },
    state: "scheduled",
    scheduled_for: GOES.toISOString(),
    recipient_count: 2,
    created_by: "u1",
    // Step 3: the run says the channels it may go by (WhatsApp alone when it names none), each person the one they are on.
    channels: ["whatsapp"],
  });
  assert.deepEqual(f.of("assemble")[0][2], [
    { contact_id: "a", facts: null, channel: "whatsapp" },
    { contact_id: "b", facts: null, channel: "whatsapp" },
  ]);
  assert.deepEqual(f.of("assemble")[0][3], GOES, "pressed now, the job is due ten minutes on (decision 0064)");
  // The ledger's line rides with the run (00381): whose decision the send is, and what is kept of it.
  assert.deepEqual(f.of("assemble")[0][4], {
    by: { kind: "user", userId: "u1" },
    payload: {
      name,
      template: "month_offer/en_US",
      category: "marketing",
      audience: { kind: "everyone", id: null, label: EVERYONE_LABEL },
      channels: ["whatsapp"],
      values: specs.map(paramLabel),
      recipients: 2,
      scheduled_for: GOES.toISOString(),
    },
  });
  assert.deepEqual(r, {
    id: "b1",
    name,
    state: "scheduled",
    recipient_count: 2,
    scheduled_for: GOES.toISOString(),
    moved_from: null,
    held_for_allowance: 0,
    left_out: 0,
    // Sent now, not set for a time ahead: its breath was this week's, and it goes ten minutes on with a Stop.
    scheduled_ahead: false,
    pressed_now: true,
    decision_id: "d1",
  });
});

test("what could not be written says so: the run, its people and its job are one write, so a refusal leaves nothing behind to fail and nothing on the ledger", async () => {
  // They were three writes with a compensating fail between them (a run with no people, people with no job); the
  // transaction itself is proved against Postgres (broadcasts/assemble-broadcast.db.test.mjs).
  for (const why of ["insert refused", "3 of the 40 people are not this workspace's to send to"]) {
    const f = fakes({ assemble: new Error(why) });
    const { e, wire, said } = await refusedLoudly(make(f, { template_id: T1, audience: everyone }));
    assert.equal(e.code, "internal");
    assert.equal(e.status, 500);
    assert.equal(e.message, "The send could not be created. Nothing was sent; try again.");
    assert.deepEqual(f.ops(), ["assemble"], "nothing to fail, nothing recorded");
    // The database's words are the log's: the answer the route sends carries none of them.
    assert.equal(e.details, undefined, "no details to send");
    assert.ok(!wire.includes(why), `the response says ${wire}`);
    assert.deepEqual(
      said.map((l) => [l.event, l.step, l.error]),
      [["campaign_step_failed", "assemble", why]],
      "and the cause is said, by name, where support reads it",
    );
  }
});

test("approve: a playbook's run is a day's run: approved on a later day it is refused before anything moves, and the one for today goes", async () => {
  const tz = await fakes().ports.timezone();
  const today = tzDate(tz, NOW);
  const stale = {
    id: "b1",
    tenant_id: "t1",
    state: "pending_approval",
    name: "Visit reminder · yesterday",
    recipient_count: 3,
    playbook_id: "p1",
    run_for: "2026-09-05",
  };
  const f = fakes();
  await refused(
    approveRun(f.ports, { row: stale, now: NOW }),
    "conflict",
    409,
    "This run was made for 2026-09-05 and that day has passed: its people and its words were that day's. Skip it · the next run reads the calendar again.",
  );
  assert.deepEqual(f.ops(), [], "nothing moved");
  const fresh = fakes();
  const r = await approveRun(fresh.ports, { row: { ...stale, run_for: today }, now: NOW });
  assert.equal(r.state, "scheduled");
  const hand = fakes();
  assert.equal(
    (await approveRun(hand.ports, { row: { ...stale, playbook_id: null, run_for: null }, now: NOW })).state,
    "scheduled",
    "a broadcast made by hand has no day",
  );
});

test("approve: a visit's run made for today is refused when approving would send it on a later day: approved after the last sending hour it waits for nine, with the day before's words", async () => {
  const night = new Date("2026-09-07T03:00:00Z"); // 11 PM in New York on 6 September: the next open moment is 9 AM on the 7th
  const made = {
    id: "b1",
    tenant_id: "t1",
    state: "pending_approval",
    name: "Visit reminder · 2026-09-06",
    recipient_count: 3,
    playbook_id: "p1",
    run_for: "2026-09-06",
    audience: { kind: "playbook", trigger: "visit_tomorrow" },
  };
  const words =
    "This run was made for 2026-09-06 and that day has passed: its people and its words were that day's. Skip it · the next run reads the calendar again.";
  for (const trigger of ["visit_tomorrow", "visited"]) {
    const f = fakes();
    await refused(
      approveRun(f.ports, { row: { ...made, audience: { kind: "playbook", trigger } }, now: night }),
      "conflict",
      409,
      words,
    );
    assert.deepEqual(f.ops(), [], `${trigger}: refused before anything moves`);
  }
  // Inside the hours it goes now; before nine on the morning of the day it was made for, it goes at nine that morning.
  const noon = await approveRun(fakes().ports, { row: made, now: NOW });
  assert.deepEqual([noon.state, noon.scheduled_for, noon.moved_from], ["scheduled", NOW.toISOString(), null]);
  const early = new Date("2026-09-06T10:00:00Z"); // 6 AM in New York
  const dawn = await approveRun(fakes().ports, { row: made, now: early });
  assert.deepEqual([dawn.scheduled_for, dawn.moved_from], ["2026-09-06T13:00:00.000Z", early.toISOString()]);
  // Another moment's words name no day, and a run that kept no moment is as it was: approved at night, it goes at nine.
  for (const audience of [{ kind: "playbook", trigger: "quiet_30" }, { kind: "playbook" }, null]) {
    const r = await approveRun(fakes().ports, { row: { ...made, audience }, now: night });
    assert.deepEqual([r.state, r.scheduled_for], ["scheduled", "2026-09-07T13:00:00.000Z"], JSON.stringify(audience));
  }
});

test("approve: a paused workspace approves nothing: refused in the pause's words before anything moves, for a playbook's run, a broadcast's and a reach-out's; one that was not waiting is still said so first", async () => {
  const waiting = {
    id: "b1",
    tenant_id: "t1",
    state: "pending_approval",
    name: "Win-back · 2026-09-06",
    recipient_count: 3,
    playbook_id: "p1",
    run_for: "2026-09-06",
  };
  for (const row of [
    waiting,
    { ...waiting, playbook_id: null, run_for: null },
    { ...waiting, audience: { kind: "reach_out", root_id: "r1" } },
  ]) {
    const f = fakes({ paused: true });
    await refused(approveRun(f.ports, { row, now: NOW }), "payment_required", 402, CAMPAIGNS_PAUSED_WORDS);
    assert.deepEqual(f.ops(), [], "nothing was released, scheduled or recorded");
  }
  assert.match(CAMPAIGNS_PAUSED_WORDS, /paused/);
  await refused(
    approveRun(fakes({ paused: true }).ports, { row: { ...waiting, state: "sending" }, now: NOW }),
    "conflict",
    409,
    "This run is not waiting for approval.",
  );
  // A pause that could not be read is not a workspace that is not paused: the approval fails, and moves nothing.
  const unreadable = fakes({ paused: new Error("cannot read the workspace") });
  await assert.rejects(approveRun(unreadable.ports, { row: waiting, now: NOW }), /cannot read the workspace/);
  assert.deepEqual(unreadable.ops(), []);
  // Not paused, it goes.
  assert.equal((await approveRun(fakes().ports, { row: waiting, now: NOW })).state, "scheduled");
});

test("approve: a run not waiting is refused; one that changed under the approver says so; a door that failed leaves it waiting; else the run released, its job and the approver's decision in one write", async () => {
  const row = {
    id: "b1",
    tenant_id: "t1",
    state: "pending_approval",
    name: "Win-back · 2026-09-06",
    recipient_count: 3,
    playbook_id: "p1",
  };
  await refused(
    approveRun(fakes().ports, { row: { ...row, state: "sending" }, now: NOW }),
    "conflict",
    409,
    "This run is not waiting for approval.",
  );
  // The door answers null when the run moved while the person looked (approved by someone else, skipped): nothing was
  // written, and the approver is told to look again.
  const moved = fakes({ approve: null });
  await refused(
    approveRun(moved.ports, { row, now: NOW }),
    "conflict",
    409,
    "This run just changed state; look again.",
  );
  assert.deepEqual(moved.ops(), ["approve"]);
  // The release, the job and the decision are one transaction (00353), so a door that failed left the run waiting: the
  // words say so, and they are true. There is no put-back to fail and no run left "scheduled" with nothing to send it.
  const failed = fakes({ approve: new Error("approve_broadcast: violates check constraint jobs_kind_check") });
  const stuck = await refusedLoudly(approveRun(failed.ports, { row, now: NOW }));
  assert.equal(stuck.e.code, "upstream_meta");
  assert.equal(stuck.e.status, 502);
  assert.equal(stuck.e.message, "The send could not be scheduled. The run is still waiting; try again.");
  assert.deepEqual(failed.ops(), ["approve"], "one write asked for, and nothing after it");
  // What the database said is the log's, never the response's.
  assert.equal(stuck.e.details, undefined);
  assert.ok(!stuck.wire.includes("approve_broadcast"), `the response says ${stuck.wire}`);
  assert.deepEqual(
    stuck.said.map((l) => [l.event, l.step, l.broadcast_id, l.error]),
    [["campaign_step_failed", "approve", "b1", "Error: approve_broadcast: violates check constraint jobs_kind_check"]],
  );
  const f = fakes();
  const r = await approveRun(f.ports, { row, now: NOW });
  assert.deepEqual(f.log, [
    [
      "approve",
      "b1",
      NOW,
      {
        job: true,
        decision: {
          name: row.name,
          playbook_id: "p1",
          recipients: 3,
          approved: true,
          scheduled_for: NOW.toISOString(),
        },
      },
    ],
  ]);
  assert.deepEqual(r, {
    id: "b1",
    state: "scheduled",
    recipient_count: 3,
    scheduled_for: NOW.toISOString(),
    moved_from: null,
    decision_id: "d1",
  });
});

test("never at 3 AM: a send asked for outside nine to twenty by the business's clock moves to the next nine, and the receipt says so", async () => {
  // 03:00 UTC is 23:00 the evening before in New York: outside the window, so
  // "now" itself moves to 09:00 New York (13:00 UTC) the same calendar day.
  const night = new Date("2026-09-07T03:00:00Z");
  const nine = new Date("2026-09-07T13:00:00Z");
  const f = fakes();
  const r = await createBroadcast(f.ports, { userId: "u1", body: { template_id: T1, audience: everyone }, now: night });
  assert.equal(r.scheduled_for, nine.toISOString(), "nine in the morning, by the business's clock");
  // What was asked for: now, ten minutes on (decision 0064, step 3), outside the hours.
  assert.equal(
    r.moved_from,
    new Date(night.getTime() + SEND_ONCE_STOP_MS).toISOString(),
    "and it says what was asked for",
  );
  assert.deepEqual(f.of("assemble")[0][3], nine);
  assert.equal(f.of("assemble")[0][1].scheduled_for, nine.toISOString(), "the row says when it really goes");
  assert.equal(
    f.of("assemble")[0][4].payload.moved_from,
    new Date(night.getTime() + SEND_ONCE_STOP_MS).toISOString(),
    "the ledger keeps the move",
  );
  // Asked for 05:30 New York (09:30 UTC): the same morning's nine.
  const early = new Date("2026-09-07T09:30:00Z");
  const r2 = await createBroadcast(fakes().ports, {
    userId: "u1",
    body: { template_id: T1, audience: everyone, scheduled_for: early.toISOString() },
    now: NOW.getTime() < early.getTime() ? NOW : new Date(early.getTime() - 3_600_000),
  });
  assert.equal(r2.scheduled_for, nine.toISOString());
  assert.equal(r2.moved_from, early.toISOString());
  // Asked for 21:30 New York (01:30 UTC next day): nine the next morning.
  const late = new Date("2026-09-08T01:30:00Z");
  const r3 = await createBroadcast(fakes().ports, {
    userId: "u1",
    body: { template_id: T1, audience: everyone, scheduled_for: late.toISOString() },
    now: NOW,
  });
  assert.equal(r3.scheduled_for, new Date("2026-09-08T13:00:00Z").toISOString());
  // Inside the window nothing moves, and the receipt says so too.
  const f4 = fakes();
  const r4 = await createBroadcast(f4.ports, {
    userId: "u1",
    body: { template_id: T1, audience: everyone },
    now: NOW,
  });
  assert.equal(r4.scheduled_for, GOES.toISOString(), "now, and its ten minutes to stop it");
  assert.equal(r4.moved_from, null);
  assert.ok(!("moved_from" in f4.of("assemble")[0][4].payload), "nothing recorded about a move that did not happen");
  // An approval at night goes at nine as well.
  const a = fakes();
  const ap = await approveRun(a.ports, {
    row: {
      id: "b1",
      tenant_id: "t1",
      state: "pending_approval",
      name: "Win-back",
      recipient_count: 3,
      playbook_id: "p1",
    },
    now: night,
  });
  assert.deepEqual(a.of("approve")[0].slice(0, 3), ["approve", "b1", nine]);
  assert.equal(a.of("approve")[0][3].decision.moved_from, night.toISOString(), "the ledger keeps the move");
  assert.equal(ap.scheduled_for, nine.toISOString());
  assert.equal(ap.moved_from, night.toISOString());
});

test("cancel: scheduled withdraws the job; sending stops at the next batch; waiting is skipped; anything ended says how; a row that changed under them says so; each on the ledger", async () => {
  const row = (state) => ({ id: "b1", tenant_id: "t1", state, name: "Reminder" });
  const scheduled = fakes();
  const r = await cancelBroadcast(scheduled.ports, { row: row("scheduled") });
  assert.deepEqual(
    scheduled.log,
    [
      ["cancel", "b1", "scheduled"],
      ["withdraw", "b1"],
      ["record", "broadcast", "b1", "cancel_broadcast", { name: "Reminder", was: "scheduled" }],
    ],
    "the row first: a job withdrawn before a row that did not change would leave a run that never goes",
  );
  assert.deepEqual(r, { id: "b1", state: "canceled", was: "scheduled", decision_id: "d1" });
  for (const state of ["sending", "pending_approval"]) {
    const f = fakes();
    assert.equal((await cancelBroadcast(f.ports, { row: row(state) })).was, state);
    assert.deepEqual(f.ops(), ["cancel", "record"], `${state}: no job to withdraw`);
  }
  for (const [state, said] of [
    ["sent", "already been sent"],
    ["canceled", "already been canceled"],
    ["failed", "already failed"],
  ]) {
    const f = fakes();
    await refused(cancelBroadcast(f.ports, { row: row(state) }), "conflict", 409, `This send has ${said}.`);
    assert.deepEqual(f.ops(), []);
  }
  await refused(
    cancelBroadcast(fakes({ cancel: false }).ports, { row: row("sending") }),
    "conflict",
    409,
    "This send just changed state; look again.",
  );
});

test("the playbook's check refuses a tick its purpose never carries, accepts one the workspace is not ready on (a run holds those people), and keeps the channels an edit does not name", async () => {
  const visit = { trigger: "visit_tomorrow", template_id: T1, params: [] };
  // A calendar is connected: a new reminder is made only where one is (D44).
  const reminder = () =>
    fakes({
      calendarOn: true,
      message: messageOf({ whatsapp: template({ category: "utility" }), own: ["email", "sms"] }),
    }).ports;
  // A reminder goes by email and text, ready or not: the check has no readiness, a run holds whom it cannot reach. It
  // asks only that the message holds a version of one of the ticks (a message that holds none could not be sent).
  const both = await checkPlaybook(reminder(), { ...visit, channels: ["email", "whatsapp", "sms"] });
  assert.deepEqual(both.channels, ["whatsapp", "sms", "email"], "in the product's order, whatever order they came in");
  // An offer never goes by text; by email it is kept ticked whether or not the workspace can send it yet (a run holds those
  // people until it can: the composer's greyed tick says why).
  const offer = { trigger: "everyone_monthly", template_id: T1, params: [] };
  await refused(
    checkPlaybook(fakes().ports, { ...offer, channels: ["sms"] }),
    "validation",
    400,
    "Texts carry no offers.",
  );
  const byEmail = await checkPlaybook(fakes().ports, { ...offer, channels: ["whatsapp", "email"] });
  assert.deepEqual(byEmail.channels, ["whatsapp", "email"]);
  await refused(
    checkPlaybook(reminder(), { ...visit, channels: ["fax"] }),
    "validation",
    400,
    "Pick WhatsApp, text or email to send by.",
  );
  // An edit that names none keeps the ones the playbook has; one made before has none and goes by WhatsApp.
  const kept = await checkPlaybook(reminder(), visit, { trigger: "visit_tomorrow", channels: ["email"] });
  assert.deepEqual(kept.channels, ["email"]);
  const before = await checkPlaybook(reminder(), visit, { trigger: "visit_tomorrow", channels: null });
  assert.deepEqual(before.channels, ["whatsapp"]);
  // A playbook kept on a channel is held to what its message may be as it is changed: an offer is refused on text.
  await refused(
    checkPlaybook(fakes().ports, offer, { trigger: "everyone_monthly", channels: ["sms"] }),
    "validation",
    400,
    "Texts carry no offers.",
  );
});
