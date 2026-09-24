/**
 * One sheet for every deal move, and the deal where the work is (docs/decisions/0008-a-proposal-is-part-of-the-deal.md).
 *
 * The deal was recorded in a fold under a row of the person's card, the proposal's link was an About row of its own,
 * and sending the proposal was a third place, the More menu's: nothing joined the three. Now one sheet records every
 * move and can send the proposal as it records it, the person page says the deal as a card with its one next act, and
 * the thread's Actions open the same sheet. Every word, field, default and body is contracts' (deal-sheet.ts); the
 * sheet is drawn by the shell's host (components/deal-sheet.jsx) over the profile's own courier and the Inbox's own
 * reply.
 *
 * Run against contracts, and the sheet itself on the stub React, through the real couriers (people-detail.ts,
 * inbox-verbs.ts, thread-pane.jsx threadVerbs) over a stubbed wire. Nothing here reads a source file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, unmount, again, settle, find, byTestId, textOf, press } from "./_legacy-react.mjs";

const {
  DEAL_ACT_HINTS,
  DEAL_ACT_WORDS,
  DEAL_REFUSALS,
  DEAL_SEND_WHY,
  DEAL_SHEET_WORDS,
  dealCardsOf,
  dealMenuActs,
  dealNextAct,
  dealSendOf,
  dealSheetBody,
  dealSheetDirty,
  dealSheetFor,
  dealSheetMerge,
  dealSheetMessage,
  dealSheetRefusal,
  pickCurrentDeal,
  proposalFollowUp,
  proposalMessage,
  toPersonVM,
  whyNotALink,
} = contracts;

const ZONE = "America/New_York";
const H = 3_600_000;
const D = 24 * H;
/** Noon in New York on Wednesday, 23 September 2026: the contracts' clock. The sheet's own tests run on the real one. */
const NOW = Date.parse("2026-09-23T16:00:00Z");
const LINK = "https://docs.example.com/p/dani";

/**
 * A person as the profile reads them (people-vm.test.mjs's shapes), their deals as the route lists them (newest
 * first) and the row's deal columns as people_list's lateral join picks them (pickCurrentDeal). Built for a clock, so
 * the sheet's tests can build the same person against the real one.
 */
const fixtures = (now) => {
  const at = (ms) => new Date(now - ms).toISOString();
  const row = (over = {}) => ({
    id: "p1",
    display_name: "Daniela Reyes",
    wa_profile_name: null,
    phone_e164: "+17865550181",
    consent: "opted_in",
    consent_source: "in_person",
    consent_updated_at: at(20 * D),
    marketing_consent: "unknown",
    marketing_consent_source: null,
    marketing_consent_updated_at: null,
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: "cv1",
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: at(3 * H),
    last_message_at: at(3 * H),
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: "Sounds good",
    last_inbound_at: at(3 * H),
    last_call_at: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: at(40 * D),
    earliest_row_at: at(40 * D),
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
    ...over,
  });
  const msg = (id, ago, over = {}) => ({
    id,
    conversation_id: "cv1",
    direction: "inbound",
    sender: "customer",
    type: "text",
    body: "Sounds good",
    media: null,
    meta: null,
    status: "received",
    channel: "whatsapp",
    created_at: at(ago),
    ...over,
  });
  /** The proposal going out on a wire, as the thread keeps it. */
  const sentMsg = (ago, over = {}) =>
    msg(`s${ago}`, ago, {
      direction: "outbound",
      sender: "human",
      body: proposalMessage(LINK),
      status: "sent",
      ...over,
    });
  const dealDto = (over = {}) => ({
    id: "d1",
    contact_id: "p1",
    service: "Ad management",
    stage: "proposed",
    proposed_at: at(9 * D),
    decided_at: null,
    ended_at: null,
    amount_cents: 120_000,
    per: "once",
    currency: "USD",
    note: null,
    version: 2,
    created_at: at(9 * D),
    proposal_url: LINK,
    valid_until: null,
    lost_reason: null,
    ...over,
  });
  const columnsOf = (deals) => {
    const d = pickCurrentDeal(deals);
    return d
      ? {
          deal_id: d.id,
          deal_stage: d.stage,
          deal_service: d.service,
          deal_proposed_at: d.proposed_at,
          deal_decided_at: d.decided_at,
          deal_ended_at: d.ended_at,
          deal_amount_cents: d.amount_cents,
          deal_per: d.per,
          deal_proposal_url: d.proposal_url,
          deal_valid_until: d.valid_until,
          deal_lost_reason: d.lost_reason,
        }
      : {};
  };
  /** Their last visit, a consultation that ended `ago` ago, titled as the calendar titled it. */
  const consulted = (ago, title = "Consultation") => {
    const last = {
      id: "b0:1",
      start: at(ago + H),
      end: at(ago),
      title,
      all_day: false,
      via: "phone",
      consultation: true,
    };
    return { timezone: ZONE, source: "Google Calendar", state: "ok", next: null, last, all: [last] };
  };
  const detail = ({ deals = [], messages = [msg("m1", 3 * H)], rowOver = {}, ...over } = {}) => ({
    row: row({ ...columnsOf(deals), ...rowOver }),
    identities: [],
    conversations: [
      {
        id: "cv1",
        state: "open",
        paused_until: null,
        last_wa_inbound_at: rowOver.latest_wa_inbound_at ?? at(3 * H),
        last_message_at: at(3 * H),
        contact: {
          id: "p1",
          display_name: "Daniela Reyes",
          wa_profile_name: null,
          phone_e164: "+17865550181",
          consent: "opted_in",
          dnc: false,
        },
        messages,
      },
    ],
    calls: [],
    escalations: [],
    decisions: [],
    receptionist_mode: null,
    workspace_reply_mode: "auto",
    deals,
    deals_on: true,
    services: ["Ad management", "SEO"],
    ...over,
  });
  const person = (opts) => toPersonVM(detail(opts), ZONE, new Date(now));
  return { at, row, msg, sentMsg, dealDto, consulted, detail, person };
};

const F = fixtures(NOW);
const { at, msg, sentMsg, dealDto, consulted, person } = F;

/* ------------------------------------------- the sheet's words ------------------------------------------- */

test("each mode's sheet says what it is for, draws only its fields, in contracts' words, and opens with the deal as it stands", () => {
  // A new proposal, for someone with two services and no deal.
  const none = person();
  let s = dealSheetFor("propose", none, NOW, ZONE);
  assert.equal(s.title, "New proposal");
  assert.equal(s.sub, "Daniela Reyes");
  assert.equal(s.blocked, null);
  assert.deepEqual(
    s.service.options.map((o) => o.label),
    ["Any service", "Ad management", "SEO"],
  );
  assert.deepEqual(
    [s.link.label, s.link.hint],
    ["Proposal link", "A Google Doc, a PDF or any page you would send them."],
  );
  assert.deepEqual(
    [s.value.label, s.value.hint],
    ["Value", "Optional. Only you see it: the receptionist never says a figure."],
  );
  assert.deepEqual(
    s.value.pers.map((p) => [p.value, p.label]),
    [
      ["once", "Once"],
      ["month", "A month"],
      ["year", "A year"],
    ],
  );
  assert.deepEqual([s.validUntil.label, s.validUntil.hint], ["Valid until", "Optional."]);
  assert.deepEqual([s.when, s.reason, s.note, s.how], [null, null, null, null], "a new proposal asks nothing of a yes");
  assert.deepEqual([s.send.label, s.send.can, s.send.why], ["Send it now on WhatsApp", true, null]);
  assert.equal(s.draft.send, true, "where it can go, it goes by default: recording and sending are one act");
  assert.deepEqual([s.save.label, s.save.withSend], ["Record", "Record and send"]);
  // One service: nothing to choose. A service named by whoever opened it is where the picker starts.
  assert.equal(dealSheetFor("propose", person({ services: ["Ad management"] }), NOW, ZONE).service, null);
  assert.equal(dealSheetFor("propose", none, NOW, ZONE, { service: "SEO" }).draft.service, "SEO");
  // The link left on a person with no deal at all (00154) is where a new proposal's box starts.
  const own = "https://docs.example.com/p/own";
  assert.equal(dealSheetFor("propose", person({ proposal_url: own }), NOW, ZONE).draft.link, own);

  // The proposal out, edited: its link, its value and its day.
  const out = person({ deals: [dealDto({ valid_until: "2026-09-30" })] });
  s = dealSheetFor("edit", out, NOW, ZONE);
  assert.equal(s.title, "Edit proposal", "the act's own words (DEAL_ACT_WORDS), no ellipsis");
  assert.equal(s.sub, "Daniela Reyes · Ad management");
  assert.deepEqual(
    [s.draft.link, s.draft.value, s.draft.per, s.draft.validUntil],
    [LINK, "$1,200", "once", "2026-09-30"],
    "the value as amountWords says it, in its currency and without how often",
  );
  assert.equal(contracts.parseAmount(s.draft.value), 120_000, "and read back to the same cents");
  const euros = person({ deals: [dealDto({ currency: "EUR", amount_cents: 99_950 })] });
  assert.equal(dealSheetFor("edit", euros, NOW, ZONE).draft.value, "€999.50");
  assert.equal(s.send, null, "an edit sends nothing");
  assert.equal(s.service, null);
  assert.equal(s.save.label, "Save");

  // A yes: the day it happened, the amount agreed (the proposal's by default), and how they said it.
  s = dealSheetFor("won", out, NOW, ZONE);
  assert.equal(s.title, "Mark as client");
  assert.deepEqual(
    [s.value.label, s.value.hint, s.draft.value],
    ["Agreed amount", "The proposal's value, unless they agreed another.", "$1,200"],
  );
  assert.deepEqual([s.when.label, s.draft.when, s.when.max], ["When they said yes", "2026-09-23", "2026-09-23"]);
  assert.deepEqual(
    s.how.options.map((o) => o.label),
    ["Not recorded", "In their own message", "Signed elsewhere"],
  );
  assert.equal(s.draft.messageId, "m1", "their newest message, to choose from theirs");
  assert.deepEqual([s.link, s.send, s.validUntil], [null, null, null]);
  assert.equal(s.save.label, "Mark as client");
  assert.deepEqual(
    dealSheetFor("won", person({ deals: [dealDto({ amount_cents: null, per: null })] }), NOW, ZONE).value.hint,
    "Optional.",
  );

  // A pass: the day, why, a note of the owner's.
  s = dealSheetFor("lost", out, NOW, ZONE);
  assert.deepEqual([s.title, s.when.label, s.reason.label], ["Mark as passed", "When they passed", "Why they passed"]);
  assert.deepEqual(
    s.reason.options.map((o) => o.label),
    ["Price", "Timing", "Went elsewhere", "No reply", "Not a fit", "Other"],
  );
  assert.equal(s.draft.reason, "", "no reason is chosen for them");
  assert.deepEqual([s.note.label, s.note.hint, s.note.max], ["Note", "Optional. Only your team sees it.", 200]);
  assert.equal(s.value, null);
  assert.equal(s.save.label, "Record");

  // Proposed again: the passed proposal's link and value, a new day asked for, sent by default where it can go.
  const passed = person({
    deals: [dealDto({ stage: "lost", decided_at: at(2 * D), lost_reason: "price", valid_until: "2026-09-20" })],
  });
  s = dealSheetFor("again", passed, NOW, ZONE);
  assert.equal(s.title, "Propose again");
  assert.deepEqual([s.draft.link, s.draft.value, s.draft.validUntil, s.draft.send], [LINK, "$1,200", "", true]);
  assert.equal(s.service, null, "it is the passed deal's own service");
  assert.equal(s.save.withSend, "Record and send");

  // An end.
  const client = person({
    deals: [dealDto({ stage: "won", decided_at: at(3 * D), per: "month", amount_cents: 250_000 })],
  });
  s = dealSheetFor("ended", client, NOW, ZONE);
  assert.deepEqual([s.title, s.when.label, s.save.label], ["End the engagement", "When it ended", "End it"]);
  assert.deepEqual([s.link, s.value, s.reason], [null, null, null]);

  // A move the deal no longer fits -- the page read it before someone moved it -- is said, with nothing to save.
  s = dealSheetFor("won", passed, NOW, ZONE);
  assert.equal(s.blocked, DEAL_SHEET_WORDS.moved);
  assert.deepEqual([s.link, s.when, s.value, s.send], [null, null, null, null]);
});

test("the send is one rule -- a conversation, no stop, free text on their wire -- and where it cannot go the switch says which, and the proposal is still recorded", () => {
  const base = person();
  assert.deepEqual(dealSendOf(base), { can: true, reach: true, why: null, label: "Send it now on WhatsApp" });
  assert.equal(dealSendOf({ ...base, replyVia: "Email" }).label, "Send it now by email");
  assert.equal(dealSendOf({ ...base, replyVia: "Text" }).label, "Send it now as a text");
  // WhatsApp's window, shut a day after they last wrote.
  const shut = person({
    rowOver: { latest_wa_inbound_at: at(30 * H), last_inbound_at: at(30 * H) },
    messages: [msg("m1", 30 * H)],
  });
  assert.deepEqual(
    [dealSendOf(shut).can, dealSendOf(shut).reach, dealSendOf(shut).why],
    [false, true, DEAL_SEND_WHY.window],
    "no free text, but their thread still reaches them with an approved message",
  );
  assert.equal(
    DEAL_SEND_WHY.window,
    "Their WhatsApp window has closed. Record it now, and send it from their thread when they write next.",
  );
  const s = dealSheetFor("propose", shut, NOW, ZONE);
  assert.deepEqual([s.draft.send, s.save.withSend], [false, null], "off where it cannot go, and Save says Record");
  // Stop, and do-not-contact: not reached at all, by the one rule the More menu's sends ask too (people.ts mayReach).
  for (const stopped of [person({ rowOver: { consent: "opted_out" } }), person({ rowOver: { dnc: true } })]) {
    assert.deepEqual(
      [dealSendOf(stopped).can, dealSendOf(stopped).reach, dealSendOf(stopped).why],
      [false, false, "They asked not to be messaged."],
    );
    assert.equal(contracts.mayReach(stopped), false);
  }
  assert.equal(contracts.mayReach(base), true);
  // Someone who has only ever phoned has no conversation to send it in.
  const phoned = person({
    rowOver: { has_chat: false, latest_conversation_id: null, channels: ["voice"], call_count: 1 },
    conversations: [],
  });
  assert.deepEqual(
    [dealSendOf(phoned).reach, dealSendOf(phoned).why],
    [false, "There is no conversation with them yet."],
  );
});

test("the body is the route's: a new proposal names its service, a move its row and version, an emptied field is cleared, and what is wrong is said under its field before a round trip", () => {
  const opts = { tz: ZONE, nowMs: NOW, canSend: true };
  const opened = dealSheetFor("propose", person(), NOW, ZONE).draft;
  // A link without its scheme is stored with it; a value is cents and its per; the words go with the link.
  let out = dealSheetBody(
    "propose",
    {
      ...opened,
      service: "SEO",
      link: " docs.example.com/p/2 ",
      value: "2,500",
      per: "month",
      validUntil: "2026-10-01",
    },
    null,
    opts,
  );
  assert.deepEqual(out.body, {
    stage: "proposed",
    service: "SEO",
    proposal_url: "https://docs.example.com/p/2",
    amount_cents: 250_000,
    per: "month",
    valid_until: "2026-10-01",
  });
  assert.deepEqual(out.send, { text: proposalMessage("https://docs.example.com/p/2") });
  assert.equal(
    dealSheetBody("propose", { ...opened, link: LINK }, null, { ...opts, canSend: false }).send,
    null,
    "nothing goes where it cannot, whatever the switch says",
  );
  // A proposal recorded without a link is honest (a PDF by email): recorded, nothing sent.
  assert.deepEqual(dealSheetBody("propose", { ...opened, send: false }, null, opts), {
    body: { stage: "proposed" },
    send: null,
  });
  assert.deepEqual(dealSheetBody("propose", { ...opened, link: "docs" }, null, opts).problem, {
    field: "link",
    words: whyNotALink("docs"),
  });
  for (const bad of ["abc", "-5"])
    assert.deepEqual(
      dealSheetBody("propose", { ...opened, link: LINK, value: bad }, null, opts).problem,
      { field: "value", words: "An amount is a number, like 2,500." },
      `REGRESSION: "${bad}" was recorded as an amount`,
    );
  assert.deepEqual(dealSheetBody("propose", { ...opened, link: "" }, null, opts).problem, {
    field: "link",
    words: "Add the link to send it, or turn sending off.",
  });
  assert.deepEqual(dealSheetBody("propose", { ...opened, link: LINK, message: "See you soon" }, null, opts).problem, {
    field: "message",
    words: "The message has to carry the link.",
  });

  // An edit: each field emptied is cleared, and the row and the version it was opened at go with it.
  const out2 = person({ deals: [dealDto({ valid_until: "2026-09-30" })] });
  const edit = dealSheetFor("edit", out2, NOW, ZONE);
  assert.deepEqual(
    dealSheetBody("edit", { ...edit.draft, link: "", value: "", validUntil: "" }, edit.deal, opts).body,
    {
      stage: "proposed",
      deal_id: "d1",
      version: 2,
      clear: ["amount", "proposal_url", "valid_until"],
    },
  );
  assert.deepEqual(dealSheetBody("edit", edit.draft, edit.deal, opts), {
    body: {
      stage: "proposed",
      deal_id: "d1",
      version: 2,
      amount_cents: 120_000,
      per: "once",
      proposal_url: LINK,
      valid_until: "2026-09-30",
    },
    send: null,
  });

  // Proposed again: the old day was the passed proposal's (the door drops it), so there is none of it to clear.
  const passed = person({ deals: [dealDto({ stage: "lost", decided_at: at(2 * D), lost_reason: "price" })] });
  const again2 = dealSheetFor("again", passed, NOW, ZONE);
  assert.deepEqual(
    dealSheetBody("again", { ...again2.draft, link: "", value: "", send: false }, again2.deal, opts).body,
    { stage: "proposed", deal_id: "d1", version: 2, clear: ["amount", "proposal_url"] },
  );

  // A yes today is now; another day is noon on it by the business's clock; never a day still to come.
  const won = dealSheetFor("won", out2, NOW, ZONE);
  assert.deepEqual(dealSheetBody("won", won.draft, won.deal, opts).body, {
    stage: "won",
    deal_id: "d1",
    version: 2,
    amount_cents: 120_000,
    per: "once",
  });
  assert.equal(
    dealSheetBody("won", { ...won.draft, when: "2026-09-20" }, won.deal, opts).body.when,
    "2026-09-20T16:00:00.000Z",
  );
  assert.deepEqual(dealSheetBody("won", { ...won.draft, when: "2026-09-24" }, won.deal, opts).problem, {
    field: "when",
    words: "Pick today or a day before it.",
  });
  assert.equal(dealSheetBody("won", { ...won.draft, how: "customer_message" }, won.deal, opts).body.message_id, "m1");
  assert.equal(
    dealSheetBody("won", { ...won.draft, how: "form", formNote: " DocuSign, Sep 20 " }, won.deal, opts).body.form_note,
    "DocuSign, Sep 20",
  );
  assert.deepEqual(dealSheetBody("won", { ...won.draft, value: "" }, won.deal, opts).body.clear, ["amount"]);

  // A pass says why, and in the owner's words too.
  const lost = dealSheetFor("lost", out2, NOW, ZONE);
  assert.deepEqual(
    dealSheetBody("lost", { ...lost.draft, reason: "price", note: " Went with a cheaper quote " }, lost.deal, opts)
      .body,
    { stage: "lost", deal_id: "d1", version: 2, lost_reason: "price", note: "Went with a cheaper quote" },
  );
  assert.deepEqual(dealSheetBody("lost", { ...lost.draft, note: "x".repeat(201) }, lost.deal, opts).problem, {
    field: "note",
    words: DEAL_REFUSALS.note_too_long,
  });
  // A move with no row to move says so, and sends nothing.
  assert.deepEqual(dealSheetBody("ended", { ...lost.draft }, null, opts).problem, {
    field: null,
    words: DEAL_SHEET_WORDS.moved,
  });
});

test("what the sheet opened with is what 'changed' is judged by, the words follow the link until someone changes them, and a refusal names its field", () => {
  const s = dealSheetFor("propose", person(), NOW, ZONE);
  assert.equal(dealSheetDirty(s.draft, s.draft), false);
  assert.equal(dealSheetDirty({ ...s.draft, link: "docs.example.com/p/9" }, s.draft), true);
  assert.equal(dealSheetDirty({ ...s.draft, per: "month" }, s.draft), true);
  assert.equal(
    dealSheetMessage({ link: "docs.example.com/p/9", message: null }),
    proposalMessage("https://docs.example.com/p/9"),
    "the stored address, so 'Sent' can be read back from the thread",
  );
  assert.equal(dealSheetMessage({ link: "docs.example.com/p/9", message: "Mine" }), "Mine");
  assert.equal(dealSheetMessage({ link: "", message: null }), "");
  assert.deepEqual(dealSheetRefusal(DEAL_REFUSALS.already_open), {
    field: "service",
    words: DEAL_REFUSALS.already_open,
  });
  assert.deepEqual(dealSheetRefusal(DEAL_REFUSALS.bad_link), { field: "link", words: DEAL_REFUSALS.bad_link });
  assert.deepEqual(dealSheetRefusal(DEAL_REFUSALS.moved), { field: null, words: DEAL_REFUSALS.moved });
  assert.deepEqual(dealSheetRefusal(""), { field: null, words: "Could not record this." });
  assert.equal(proposalFollowUp(LINK), `Just checking the proposal reached you. Here it is again: ${LINK}`);
});

test("read again with the sheet open, what was typed stays and every field left alone takes the fresh value, so a second Save never puts back a teammate's change", () => {
  const opts = { tz: ZONE, nowMs: NOW, canSend: false };
  // Opened on the proposal as it stood: $1,200 once, valid until the 30th, at version 2.
  const was = dealSheetFor("edit", person({ deals: [dealDto({ valid_until: "2026-09-30" })] }), NOW, ZONE);
  // A teammate since: $1,500 a month, valid until the 2nd, and the row at version 3.
  const since = dealDto({ amount_cents: 150_000, per: "month", valid_until: "2026-10-02", version: 3 });
  const now = dealSheetFor("edit", person({ deals: [since] }), NOW, ZONE);
  // Here, only the link was changed.
  const merged = dealSheetMerge({ ...was.draft, link: "docs.example.com/p/new" }, was.draft, now.draft);
  assert.deepEqual(
    [merged.link, merged.value, merged.per, merged.validUntil],
    ["docs.example.com/p/new", "$1,500", "month", "2026-10-02"],
  );
  assert.equal(dealSheetDirty(merged, now.draft), true, "what was typed is still a change against the fresh draft");
  assert.deepEqual(
    dealSheetBody("edit", merged, now.deal, opts).body,
    {
      stage: "proposed",
      deal_id: "d1",
      version: 3,
      amount_cents: 150_000,
      per: "month",
      proposal_url: "https://docs.example.com/p/new",
      valid_until: "2026-10-02",
    },
    "REGRESSION: the second Save sent $1,200 once and the 30th back over the teammate's move",
  );
  // What was emptied here stays emptied, and is cleared against the row as it now stands.
  const emptied = dealSheetMerge({ ...was.draft, validUntil: "" }, was.draft, now.draft);
  assert.deepEqual(dealSheetBody("edit", emptied, now.deal, opts).body.clear, ["valid_until"]);
  // A field the teammate emptied and nobody touched here is not cleared again: it is simply empty.
  const bare = dealSheetFor("edit", person({ deals: [dealDto({ amount_cents: null, per: null })] }), NOW, ZONE);
  const kept = dealSheetMerge({ ...was.draft, link: LINK }, was.draft, bare.draft);
  assert.deepEqual([kept.value, dealSheetBody("edit", kept, bare.deal, opts).body.clear], ["", undefined]);
  // Nothing typed: the fresh draft, whole.
  assert.deepEqual(dealSheetMerge(was.draft, was.draft, now.draft), now.draft);
});

/* ----------------------------------------------- the card ----------------------------------------------- */

const acts = (list) => list.map((a) => [a.id, a.label, a.mode]);

test("the card's one next act follows the stage: the proposal's link, its send, a follow-up after a quiet week, else the yes; a pass is proposed again; nothing open, start one", () => {
  assert.deepEqual(acts([dealNextAct(person(), NOW)]), [["propose", "Start a proposal", "propose"]]);
  // No link yet: the edit gives it one, in the edit's own words.
  assert.deepEqual(acts([dealNextAct(person({ deals: [dealDto({ proposal_url: null })] }), NOW)]), [
    ["edit", "Edit proposal", "edit"],
  ]);
  assert.deepEqual(dealNextAct(person({ deals: [dealDto()] }), NOW), {
    id: "send",
    label: "Send proposal",
    mode: null,
    text: proposalMessage(LINK),
  });
  // Their WhatsApp window shut, and it never went: still the send, opening their thread, which offers an approved
  // message -- nothing in the box, and the hover says so.
  const shut = person({
    deals: [dealDto()],
    rowOver: { latest_wa_inbound_at: at(30 * H), last_inbound_at: at(30 * H) },
    messages: [msg("m1", 30 * H)],
  });
  assert.deepEqual(dealNextAct(shut, NOW), {
    id: "send",
    label: "Send proposal",
    mode: null,
    hint: DEAL_ACT_HINTS.approved,
  });
  assert.equal(
    DEAL_ACT_HINTS.approved,
    "Only an approved message reaches them until they write again; their thread offers those",
  );
  // On its way (a send still in the seconds it can be undone): the yes, and no second send.
  const sending = person({ deals: [dealDto()], messages: [msg("m1", 3 * H), sentMsg(0, { status: "queued" })] });
  assert.equal(dealNextAct(sending, NOW).id, "won");
  // Sent two days ago: the yes.
  const recent = person({
    deals: [dealDto({ proposed_at: at(2 * D), created_at: at(2 * D) })],
    messages: [msg("m1", 3 * H), sentMsg(2 * D)],
  });
  assert.equal(dealNextAct(recent, NOW).id, "won");
  // Sent by email nine days ago, nothing back since: follow up, with the link again. (On WhatsApp the window that lets
  // free text go is only open when they wrote in the last day, which is not nothing back.)
  const quiet = person({
    deals: [dealDto()],
    rowOver: { last_inbound_at: at(12 * D), latest_wa_inbound_at: null, message_channels: ["email"] },
    messages: [msg("m1", 12 * D, { channel: "email" }), sentMsg(9 * D, { channel: "email" })],
  });
  assert.deepEqual(dealNextAct(quiet, NOW), {
    id: "follow-up",
    label: "Follow up",
    mode: null,
    text: proposalFollowUp(LINK),
  });
  // On WhatsApp, eight days after it went with nothing back, their window is shut: the follow-up still leads, opening
  // their thread with nothing in the box. REGRESSION: it fell to the yes, so a quiet week on WhatsApp -- the usual
  // quiet week -- was never followed up.
  const waQuiet = { rowOver: { latest_wa_inbound_at: at(12 * D), last_inbound_at: at(12 * D) } };
  const waSent = [msg("m1", 12 * D), sentMsg(8 * D)];
  assert.deepEqual(dealNextAct(person({ deals: [dealDto()], messages: waSent, ...waQuiet }), NOW), {
    id: "follow-up",
    label: "Follow up",
    mode: null,
    hint: DEAL_ACT_HINTS.approved,
  });
  // Nobody the page may not reach is offered a send or a follow-up: said stop, do-not-contact, no conversation.
  for (const [why, over] of [
    ["said stop", { rowOver: { ...waQuiet.rowOver, consent: "opted_out" } }],
    ["do-not-contact", { rowOver: { ...waQuiet.rowOver, dnc: true } }],
  ]) {
    assert.equal(dealNextAct(person({ deals: [dealDto()], messages: waSent, ...over }), NOW).id, "won", why);
    assert.equal(dealNextAct(person({ deals: [dealDto()], ...over }), NOW).id, "won", `${why}, never sent`);
  }
  const phoned = person({
    deals: [dealDto()],
    rowOver: { has_chat: false, latest_conversation_id: null, channels: ["voice"], call_count: 1 },
    conversations: [],
  });
  assert.equal(dealNextAct(phoned, NOW).id, "won", "no conversation to send it in");
  assert.equal(dealNextAct(person({ deals: [dealDto({ stage: "won", decided_at: at(D) })] }), NOW), null);
  assert.deepEqual(acts([dealNextAct(person({ deals: [dealDto({ stage: "lost", decided_at: at(D) })] }), NOW)]), [
    ["again", "Propose again", "again"],
  ]);
  assert.deepEqual(
    acts([dealNextAct(person({ deals: [dealDto({ stage: "ended", decided_at: at(9 * D), ended_at: at(D) })] }), NOW)]),
    [["propose", "Start a proposal", "propose"]],
  );
});

test("the thread's Deal group is the stage's moves, each opening the sheet but the send, which is the thread's own", () => {
  const menu = (d) => dealMenuActs(d).map((a) => [a.label, a.mode]);
  assert.deepEqual(menu(null), [["Start a proposal", "propose"]]);
  assert.deepEqual(menu({ stage: "proposed" }), [
    ["Send proposal", null],
    ["Mark as client", "won"],
    ["Mark as passed", "lost"],
    ["Edit proposal", "edit"],
  ]);
  assert.deepEqual(menu({ stage: "won" }), [["End the engagement", "ended"]]);
  assert.deepEqual(menu({ stage: "lost" }), [["Propose again", "again"]]);
  assert.deepEqual(menu({ stage: "ended" }), [["Start a proposal", "propose"]]);
  // One act, one label, wherever it is drawn, and no label trails off.
  assert.deepEqual(Object.values(DEAL_ACT_WORDS), [
    "Start a proposal",
    "Propose again",
    "Edit proposal",
    "Mark as client",
    "Mark as passed",
    "End the engagement",
    "Send proposal",
    "Follow up",
  ]);
  assert.ok(Object.values(DEAL_ACT_WORDS).every((w) => !w.endsWith("…") && !w.endsWith("...")));
  // A sheet a move opens is titled by that move.
  for (const mode of ["edit", "again", "won", "lost", "ended"])
    assert.equal(DEAL_SHEET_WORDS.titles[mode], DEAL_ACT_WORDS[mode], mode);
});

test("the person's More menu offers the proposal's send only where the card does not lead with it, and none while one is on its way", () => {
  const proposalAct = (p) => p.acts.find((a) => a.id === "proposal") ?? null;
  // Never sent: the card leads with the send, so the menu does not say it again.
  const out = person({ deals: [dealDto()] });
  assert.equal(dealNextAct(out, NOW).id, "send");
  assert.equal(proposalAct(out), null, "REGRESSION: Send proposal on the card and again under More");
  // Sent two days ago: the card leads with the yes, and the menu keeps the send again.
  const went = person({
    deals: [dealDto({ proposed_at: at(2 * D), created_at: at(2 * D) })],
    messages: [msg("m1", 3 * H), sentMsg(2 * D)],
  });
  assert.equal(dealNextAct(went, NOW).id, "won");
  assert.equal(proposalAct(went).label, "Send proposal again");
  // On its way: neither offers a send.
  const sending = person({ deals: [dealDto()], messages: [msg("m1", 3 * H), sentMsg(0, { status: "queued" })] });
  assert.equal(proposalAct(sending), null);
  // A link left on someone with no deal (00154): the card starts a proposal, so the menu's send is its own.
  const own = person({ proposal_url: "https://docs.example.com/p/own" });
  assert.equal(dealNextAct(own, NOW).id, "propose");
  assert.equal(proposalAct(own).label, DEAL_ACT_WORDS.send);
});

test("the card says each open deal once: its steps, its link and whether it went, its day, a quiet week, and its acts; with none open, one line", () => {
  const steps = (c) => c.steps.map((s) => [s.label, s.day, s.at, s.tone]);
  // A consultation that ended on the 18th, a proposal sent on the 19th, and they have written since.
  const out = person({
    deals: [dealDto({ proposed_at: at(4 * D), created_at: at(4 * D), valid_until: "2026-09-30" })],
    messages: [sentMsg(4 * D), msg("m1", 3 * H)],
    visits: consulted(5 * D),
  });
  let vm = dealCardsOf(out, NOW, ZONE);
  assert.equal(vm.quiet, null);
  let [card] = vm.cards;
  assert.deepEqual([card.title, card.value], ["Ad management", "$1,200"]);
  assert.deepEqual(steps(card), [
    ["Consultation", "Sep 18", "done", null],
    ["Proposal out", "Sep 19", "current", "info"],
    ["Client", null, "ahead", null],
  ]);
  assert.deepEqual(card.link, { url: LINK, host: "docs.example.com" });
  assert.deepEqual(card.facts, ["Sent Sep 19 on WhatsApp", "Valid until Sep 30"]);
  assert.deepEqual(card.flags, [], "they wrote back since, and the day has not passed: nothing wants a look");
  assert.deepEqual(acts([card.next]), [["won", "Mark as client", "won"]]);
  assert.deepEqual(acts(card.more), [
    ["lost", "Mark as passed", "lost"],
    ["edit", "Edit proposal", "edit"],
  ]);

  // Not sent yet, and it can go: the send leads, and the yes waits among the quiet ones. No consultation, no step.
  [card] = dealCardsOf(person({ deals: [dealDto({ valid_until: "2026-09-20" })] }), NOW, ZONE).cards;
  assert.deepEqual(
    card.steps.map((s) => s.key),
    ["proposal", "client"],
  );
  assert.deepEqual(card.facts, ["Not sent yet"]);
  assert.deepEqual(
    card.flags,
    [{ words: "Lapsed Sep 20", tone: "warn" }],
    "a day that has passed is a state in its tone; a link that never went has not waited on anyone",
  );
  assert.equal(card.next.id, "send");
  assert.deepEqual(
    card.more.map((a) => a.id),
    ["won", "lost", "edit"],
  );

  // On its way (queued, in the seconds its send can be undone): said, and the card offers no send until it went.
  [card] = dealCardsOf(
    person({ deals: [dealDto()], messages: [msg("m1", 3 * H), sentMsg(0, { status: "queued" })] }),
    NOW,
    ZONE,
  ).cards;
  assert.deepEqual([card.facts[0], card.next.id], ["Sending", "won"]);
  assert.ok(![card.next, ...card.more].some((a) => a.id === "send" || a.id === "follow-up"), "no second send");

  // By email, nine days with nothing back: said in the warn tone's line, and the follow-up leads.
  [card] = dealCardsOf(
    person({
      deals: [dealDto()],
      rowOver: { last_inbound_at: at(12 * D), latest_wa_inbound_at: null, message_channels: ["email"] },
      messages: [msg("m1", 12 * D, { channel: "email" }), sentMsg(9 * D, { channel: "email" })],
    }),
    NOW,
    ZONE,
  ).cards;
  assert.equal(card.facts[0], "Sent Sep 14 by email");
  assert.deepEqual(card.flags, [{ words: "Nothing back in 9 days", tone: "warn" }]);
  assert.equal(card.next.id, "follow-up");

  // Recorded without a link: said, the link is what to add, and a quiet week still counts (it went some other way).
  [card] = dealCardsOf(
    person({ deals: [dealDto({ proposal_url: null })], rowOver: { last_inbound_at: at(12 * D) } }),
    NOW,
    ZONE,
  ).cards;
  assert.deepEqual([card.link, card.facts[0], card.next.id], [null, "No link", "edit"]);
  assert.deepEqual(card.flags, [{ words: "Nothing back in 9 days", tone: "warn" }]);
  assert.deepEqual(
    card.more.map((a) => a.id),
    ["won", "lost"],
    "the edit leads: not said twice",
  );

  // A client beside a newer proposal for another service: two cards, newest first. A client's card is its steps.
  vm = dealCardsOf(
    person({
      deals: [
        dealDto({ id: "d2", service: "SEO", proposed_at: at(D), created_at: at(D), proposal_url: null }),
        dealDto({ stage: "won", decided_at: at(3 * D), per: "month", amount_cents: 250_000 }),
      ],
    }),
    NOW,
    ZONE,
  );
  assert.deepEqual(
    vm.cards.map((c) => [c.title, c.stage, c.value]),
    [
      ["SEO", "proposed", "$1,200"],
      ["Ad management", "won", "$2,500 a month"],
    ],
  );
  const won = vm.cards[1];
  assert.deepEqual(steps(won), [
    ["Proposal out", "Sep 14", "done", null],
    ["Client", "Sep 20", "current", "ok"],
  ]);
  assert.deepEqual([won.link, won.facts, won.flags, won.next], [null, [], [], null]);
  assert.deepEqual(acts(won.more), [["ended", "End the engagement", "ended"]]);

  // A consultation is a step on one card only: the deal whose service its title names, else the newest.
  const two = (title) =>
    dealCardsOf(
      person({
        deals: [
          dealDto({ id: "d2", service: "SEO", proposed_at: at(D), created_at: at(D) }),
          dealDto({ stage: "won", decided_at: at(3 * D) }),
        ],
        visits: consulted(5 * D, title),
      }),
      NOW,
      ZONE,
    ).cards.map((c) => [c.title, c.steps[0].key]);
  assert.deepEqual(two("Ad management consultation · Daniela Reyes"), [
    ["SEO", "proposal"],
    ["Ad management", "consultation"],
  ]);
  assert.deepEqual(two("Consultation: SEO"), [
    ["SEO", "consultation"],
    ["Ad management", "proposal"],
  ]);
  assert.deepEqual(
    two("Consultation"),
    [
      ["SEO", "consultation"],
      ["Ad management", "proposal"],
    ],
    "REGRESSION: every open card drew the one consultation",
  );
  // Named by a word that only starts with the service: it names nothing, and the newest has it.
  const swapped = dealCardsOf(
    person({
      deals: [
        dealDto({ proposed_at: at(D), created_at: at(D) }),
        dealDto({ id: "d2", service: "SEO", stage: "won", decided_at: at(3 * D) }),
      ],
      visits: consulted(5 * D, "Seoul trip consult"),
    }),
    NOW,
    ZONE,
  ).cards.map((c) => [c.title, c.steps[0].key]);
  assert.deepEqual(swapped, [
    ["Ad management", "consultation"],
    ["SEO", "proposal"],
  ]);
  assert.equal(
    dealCardsOf(person({ deals: [dealDto({ service: null, stage: "won", decided_at: at(D) })] }), NOW, ZONE).cards[0]
      .title,
    "Engagement",
  );
  assert.equal(dealCardsOf(person({ deals: [dealDto({ service: null })] }), NOW, ZONE).cards[0].title, "Proposal");

  // None open: one line and one act. Nothing at all...
  const quietOf = (p) => {
    const q = dealCardsOf(p, NOW, ZONE).quiet;
    return [q.words, q.sub, q.act.id, q.act.label, q.dealId, q.primary];
  };
  assert.deepEqual(quietOf(person()), ["No proposal yet", null, "propose", "Start a proposal", null, false]);
  // ...a consultation this week with no proposal since: said, and the act is the next step nobody has taken.
  assert.deepEqual(quietOf(person({ visits: consulted(2 * D) })), [
    "No proposal yet",
    "Consultation was Mon, Sep 21",
    "propose",
    "Start a proposal",
    null,
    true,
  ]);
  // A consultation more than a week ago is History's, not a next step.
  assert.deepEqual(quietOf(person({ visits: consulted(9 * D) })).slice(0, 2), ["No proposal yet", null]);
  // The last that closed: a pass, with its reason and its row to propose again; an end.
  const passed = dealDto({ stage: "lost", decided_at: at(3 * D), lost_reason: "price" });
  assert.deepEqual(quietOf(person({ deals: [passed] })), [
    "Ad management · Passed Sep 20 · Price",
    null,
    "again",
    "Propose again",
    "d1",
    false,
  ]);
  assert.deepEqual(
    quietOf(person({ deals: [dealDto({ stage: "ended", decided_at: at(20 * D), ended_at: at(3 * D) })] })).slice(0, 4),
    ["Ad management · Ended Sep 20", null, "propose", "Start a proposal"],
  );
  // A consultation since the pass began something new: a new proposal, not the passed one again.
  assert.deepEqual(
    quietOf(
      person({
        deals: [dealDto({ stage: "lost", decided_at: at(6 * D), lost_reason: "price" })],
        visits: consulted(2 * D),
      }),
    ),
    [
      "Ad management · Passed Sep 17 · Price",
      "Consultation was Mon, Sep 21",
      "propose",
      "Start a proposal",
      null,
      true,
    ],
  );
});

/* ------------------------------------ the sheet, drawn by the shell's host ------------------------------------ */

installLegacyReact({ __DEMO_MODE: false, __chrome: { state: contracts.stateOf } });
const W = globalThis;
Object.assign(W, {
  CHANLY: { nav: () => {}, R: {} },
  canDo: () => true,
  gate: () => ({}),
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
});
const L = "../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
for (const f of ["record-row", "record-field", "record-fold", "record-sheet", "deal-sheet"])
  await import(`${L}/components/${f}.jsx`);
await import(`${L}/pages/thread-pane.jsx`);
const quietly = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const { installPeopleCourier } = await import("../../../apps/dashboard/src/legacy-bridge/people-detail.ts");
const { installInboxVerbs } = await quietly(() => import("../../../apps/dashboard/src/legacy-bridge/inbox-verbs.ts"));
const { installClock } = await import("../../../apps/dashboard/src/legacy-bridge/zone.ts");
const { clearReadCaches } = await import("../../../apps/dashboard/src/legacy-bridge/read-cache.ts");
// What a write reads again after it lands (loaded by the client on a first write): loaded now, so a write's answer is
// not waiting on a module's first load while the test waits on the write.
await quietly(() => import("../../../apps/dashboard/src/legacy-bridge/refresh-map.ts"));
installPeopleCourier();
installInboxVerbs();
installClock();
// The host's toasts, as the page's stack would draw them.
const toasts = [];
W.usePPToast = () => [null, (t) => toasts.push(t)];

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** Requests the wire has not answered yet: what "settled" waits out. */
let busy = 0;
/** The wire: the person's read, the deal's door, the reply and its cancel, each answered as the test says. */
const wire = (dto) => {
  const calls = [];
  const answers = {
    person: () => json(200, { ok: true, data: { person: dto } }),
    deal: (body) =>
      json(200, { ok: true, data: { deal: { id: "d9", stage: body.stage }, from: null, decision_id: "x1" } }),
    reply: () =>
      json(200, {
        ok: true,
        data: { message_id: "msg9", cancelable_until: new Date(Date.now() + 10_000).toISOString() },
      }),
  };
  const answer = (u, body) => {
    if (u.pathname === "/api/v1/contacts/p1") return answers.person();
    if (u.pathname === "/api/v1/contacts/p1/deal") return answers.deal(body);
    if (u.pathname === "/api/v1/conversations/cv1/reply") return answers.reply(body);
    if (u.pathname === "/api/v1/messages/msg9/cancel-send") return json(200, { ok: true, data: { canceled: true } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
  W.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({
      method: init.method || "GET",
      path: u.pathname,
      body,
      key: init.headers?.["idempotency-key"] ?? null,
    });
    busy += 1;
    await settle();
    busy -= 1;
    return answer(u, body);
  };
  return { calls, answers };
};
const recorded = [];
W.addEventListener("deal:recorded", (e) => recorded.push(e.detail));

let drawn = null;
const open = () => {
  unmount();
  W.__recordFolds.reset();
  clearReadCaches();
  toasts.length = 0;
  recorded.length = 0;
  drawn = () => W.React.createElement(W.DealSheetHost, {});
  return drawn();
};
const redraw = () => again(drawn);
/**
 * Until what the test waits for is so, drawing the sheet again each time it looks, as React would after a state
 * change. A write's answer goes through the client's refresh (a module the loader hands over off the main thread), so
 * a fixed number of turns is not enough; a condition is.
 */
const until = async (what, pred) => {
  for (let i = 0; i < 3000; i += 1) {
    const tree = redraw();
    const got = pred(tree);
    if (got) return tree;
    await (i % 25 === 24 ? new Promise((r) => setTimeout(r, 5)) : settle());
  }
  throw new Error(`never: ${what}`);
};
/** The box itself, not the kit's field that carries its test id down to it. */
const input = (tree, id) => find(tree, (n) => typeof n.type === "string" && n.props?.["data-testid"] === id);
const type = (node, value) => node.props.onChange({ target: { value } });
const sheetOf = (tree) => byTestId(tree, "rec-sheet-deal-sheet");
const saveOf = (tree) => byTestId(tree, "rec-sheet-save-deal-sheet");
const title = (tree) => textOf(find(tree, (n) => n.props?.className === "rec-sheet-title"));
const sub = (tree) => textOf(find(tree, (n) => n.props?.className === "rec-sheet-sub"));
const alertIn = (node) => textOf(find(node, (n) => n.props?.role === "alert"));
const reads = (calls) => calls.filter((c) => c.method === "GET" && c.path === "/api/v1/contacts/p1").length;

test("the sheet opens where it is asked for, reads the person through the profile's courier, records a proposal through the real courier and sends it through the Inbox's own reply, then closes, says so once and tells the page", async () => {
  const R = fixtures(Date.now());
  const { calls } = wire(R.detail());
  let tree = open();
  assert.equal(sheetOf(tree), null, "nothing drawn until it is asked for");
  assert.equal(W.openDealSheet({ personId: "p1", mode: "propose" }), true);
  tree = redraw();
  // Open at once, with its title, while the person is read.
  assert.ok(sheetOf(tree));
  assert.equal(title(tree), "New proposal");
  assert.match(textOf(sheetOf(tree)), /Reading…/);
  tree = await until("the person is read", (t) => input(t, "deal-sheet-link-input"));
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.path}`),
    ["GET /api/v1/contacts/p1"],
    "the profile's own read",
  );
  assert.equal(sub(tree), "Daniela Reyes");
  // Its fields, and the switch on: the proposal goes as it is recorded.
  assert.ok(byTestId(tree, "deal-sheet-service"), "two services: which one");
  assert.ok(byTestId(tree, "deal-sheet-per"));
  assert.equal(byTestId(tree, "deal-sheet-send-switch").props["aria-checked"], true);
  assert.equal(textOf(saveOf(tree)), "Record and send");
  assert.equal(input(tree, "deal-sheet-message-input"), null, "no words to show before there is a link to carry");
  type(input(tree, "deal-sheet-link-input"), "docs.example.com/p/dani-2");
  type(input(tree, "deal-sheet-value-input"), "2,500");
  tree = redraw();
  const url = "https://docs.example.com/p/dani-2";
  assert.equal(input(tree, "deal-sheet-message-input").props.value, proposalMessage(url), "the words follow the link");
  assert.equal(W.__recordFolds.dirty(), true, "typed: the tab asks before closing over it");
  press(saveOf(tree));
  tree = await until("recorded and sent", () => recorded.length > 0);
  const writes = calls.filter((c) => c.method === "POST");
  assert.deepEqual(
    writes.map((c) => c.path),
    ["/api/v1/contacts/p1/deal", "/api/v1/conversations/cv1/reply"],
    "recorded first, then sent",
  );
  assert.deepEqual(writes[0].body, { stage: "proposed", proposal_url: url, amount_cents: 250_000, per: "once" });
  assert.deepEqual(writes[1].body, { text: proposalMessage(url) });
  assert.ok(writes[1].key, "the Inbox's own send, with its idempotency key");
  // One toast, the send's own: its receipt and its Undo.
  assert.equal(toasts.length, 1);
  assert.match(textOf(toasts[0].msg), /^Daniela — proposal recorded and on its way · sends in \d+ s unless you undo$/);
  assert.equal(typeof toasts[0].undo, "function");
  assert.deepEqual(recorded, [{ personId: "p1" }], "the page is told, and reads them again");
  assert.equal(sheetOf(tree), null, "and the sheet has closed");
  assert.equal(W.__recordFolds.open(), null);
  assert.equal(W.__recordFolds.dirty(), false);
  // The Undo stops the message, never the record.
  toasts[0].undo();
  await until("the send is canceled", () => toasts.length === 2);
  assert.equal(calls.at(-1).path, "/api/v1/messages/msg9/cancel-send");
  assert.equal(textOf(toasts[1].msg), "Send canceled — nothing was delivered");
  assert.equal(calls.filter((c) => c.path === "/api/v1/contacts/p1/deal").length, 1);
});

test("a move opens on the deal as it stands, says it once when recorded and sends nothing; a refusal stays in the sheet, under the field it names or by its Save", async () => {
  const R = fixtures(Date.now());
  const { calls, answers } = wire(R.detail({ deals: [R.dealDto()] }));
  let tree = open();
  W.openDealSheet({ personId: "p1", mode: "won", dealId: "d1" });
  tree = await until("the person is read", (t) => input(t, "deal-sheet-value-input"));
  assert.equal(title(tree), "Mark as client");
  assert.equal(sub(tree), "Daniela Reyes · Ad management");
  assert.equal(input(tree, "deal-sheet-value-input").props.value, "$1,200", "the proposal's value");
  assert.match(input(tree, "deal-sheet-when-input").props.value, /^\d{4}-\d{2}-\d{2}$/, "today");
  assert.equal(byTestId(tree, "deal-sheet-send"), null);
  assert.equal(textOf(saveOf(tree)), "Mark as client");
  // Someone moved it since: the door refuses, the sheet says so by its Save and stays open, and reads them again.
  answers.deal = () => json(400, { ok: false, error: { code: "validation", message: DEAL_REFUSALS.moved } });
  press(saveOf(tree));
  tree = await until("the refusal is said", (t) => byTestId(t, "deal-sheet-problem") && reads(calls) === 2);
  assert.ok(sheetOf(tree), "a refusal keeps it open");
  assert.equal(textOf(byTestId(tree, "deal-sheet-problem")), DEAL_REFUSALS.moved);
  assert.equal(recorded.length, 0);
  // Accepted: closed, one toast in the stage's word, the page told, nothing sent.
  answers.deal = (body) =>
    json(200, { ok: true, data: { deal: { id: "d1", stage: body.stage }, from: "proposed", decision_id: "x2" } });
  press(saveOf(tree));
  tree = await until("recorded", () => recorded.length > 0);
  assert.deepEqual(calls.filter((c) => c.path === "/api/v1/contacts/p1/deal").at(-1).body, {
    stage: "won",
    deal_id: "d1",
    version: 2,
    amount_cents: 120_000,
    per: "once",
  });
  assert.equal(sheetOf(tree), null);
  assert.deepEqual(
    toasts.map((t) => textOf(t.msg)),
    ["Daniela · Client"],
  );
  assert.deepEqual(recorded, [{ personId: "p1" }]);
  assert.equal(calls.filter((c) => c.path.endsWith("/reply")).length, 0, "a yes sends nothing");

  // A new proposal refused for a service already open: said under the service it names, and nothing sent.
  tree = open();
  W.openDealSheet({ personId: "p1", mode: "propose" });
  tree = await until("the person is read", (t) => input(t, "deal-sheet-link-input"));
  answers.deal = () => json(400, { ok: false, error: { code: "validation", message: DEAL_REFUSALS.already_open } });
  type(input(tree, "deal-sheet-link-input"), "docs.example.com/p/again");
  press(saveOf(redraw()));
  tree = await until("the refusal is said", (t) => alertIn(byTestId(t, "deal-sheet-service")));
  assert.equal(alertIn(byTestId(tree, "deal-sheet-service")), DEAL_REFUSALS.already_open);
  assert.equal(byTestId(tree, "deal-sheet-problem"), null, "under its field, not by the Save");
  assert.equal(calls.filter((c) => c.path.endsWith("/reply")).length, 0, "nothing sent for a proposal not recorded");
  // A link that is not one is said before a round trip.
  const before = calls.filter((c) => c.method === "POST").length;
  type(input(tree, "deal-sheet-link-input"), "docs");
  press(saveOf(redraw()));
  tree = redraw();
  assert.equal(alertIn(byTestId(tree, "deal-sheet-link")), whyNotALink("docs"));
  assert.equal(calls.filter((c) => c.method === "POST").length, before, "nothing asked of the door");
  await until("the wire is quiet", () => busy === 0);
});

test("read again with the sheet open -- after a refusal, or over the tab's held copy -- what was typed stays and the rest is the row as it stands, so the second Save never puts back a teammate's change", async () => {
  const R = fixtures(Date.now());
  // As the page first read it: $1,200 once, valid until the 30th, version 2. A teammate since: $1,500 a month, valid
  // until the 2nd, version 3.
  const was = R.detail({ deals: [R.dealDto({ valid_until: "2026-09-30" })] });
  const since = R.detail({
    deals: [R.dealDto({ amount_cents: 150_000, per: "month", valid_until: "2026-10-02", version: 3 })],
  });
  const { calls, answers } = wire(was);
  const person = (dto) => () => json(200, { ok: true, data: { person: dto } });
  const deals = () => calls.filter((c) => c.path === "/api/v1/contacts/p1/deal");
  const accept = (body) =>
    json(200, { ok: true, data: { deal: { id: "d1", stage: body.stage }, from: "proposed", decision_id: "x3" } });
  const fields = (t) => ["link", "value", "valid"].map((f) => input(t, `deal-sheet-${f}-input`).props.value);

  // A refusal: the link was changed here, the door says the deal moved on, and they are read again.
  let tree = open();
  W.openDealSheet({ personId: "p1", mode: "edit", dealId: "d1" });
  tree = await until("the person is read", (t) => input(t, "deal-sheet-link-input"));
  assert.deepEqual(fields(tree), [R.dealDto().proposal_url, "$1,200", "2026-09-30"]);
  type(input(tree, "deal-sheet-link-input"), "docs.example.com/p/new");
  answers.deal = () => json(400, { ok: false, error: { code: "validation", message: DEAL_REFUSALS.moved } });
  answers.person = person(since);
  press(saveOf(redraw()));
  tree = await until(
    "read again after the refusal",
    (t) => input(t, "deal-sheet-value-input")?.props.value === "$1,500",
  );
  assert.deepEqual(fields(tree), ["docs.example.com/p/new", "$1,500", "2026-10-02"], "what was typed stays");
  assert.equal(textOf(byTestId(tree, "deal-sheet-problem")), DEAL_REFUSALS.moved, "and what was said about it");
  answers.deal = accept;
  press(saveOf(tree));
  await until("recorded", () => recorded.length > 0);
  assert.deepEqual(
    deals().at(-1).body,
    {
      stage: "proposed",
      deal_id: "d1",
      version: 3,
      amount_cents: 150_000,
      per: "month",
      proposal_url: "https://docs.example.com/p/new",
      valid_until: "2026-10-02",
    },
    "REGRESSION: the second Save put $1,200 once and the 30th back over the teammate's move",
  );

  // The tab's held copy, behind the row: painted at once, typed into before the fresh read lands, then merged.
  tree = open();
  answers.person = person(was);
  await W.__personDetail("p1");
  answers.person = person(since);
  W.openDealSheet({ personId: "p1", mode: "edit", dealId: "d1" });
  tree = redraw();
  assert.deepEqual(fields(tree), [R.dealDto().proposal_url, "$1,200", "2026-09-30"], "the held copy, at once");
  type(input(tree, "deal-sheet-valid-input"), "2026-10-09");
  tree = await until("the fresh read lands", (t) => input(t, "deal-sheet-value-input")?.props.value === "$1,500");
  assert.deepEqual(fields(tree), [R.dealDto().proposal_url, "$1,500", "2026-10-09"]);
  answers.deal = accept;
  press(saveOf(tree));
  await until("recorded", () => recorded.length > 0);
  assert.deepEqual(deals().at(-1).body, {
    stage: "proposed",
    deal_id: "d1",
    version: 3,
    amount_cents: 150_000,
    per: "month",
    proposal_url: R.dealDto().proposal_url,
    valid_until: "2026-10-09",
  });
  await until("the wire is quiet", () => busy === 0);
});

test("a send refused after a good record says both and closes; where it cannot go the switch is off and says why; Cancel asks once about what was typed", async () => {
  const R = fixtures(Date.now());
  const { calls, answers } = wire(R.detail());
  let tree = open();
  W.openDealSheet({ personId: "p1", mode: "propose" });
  tree = await until("the person is read", (t) => input(t, "deal-sheet-link-input"));
  answers.reply = () =>
    json(409, { ok: false, error: { code: "window_closed", message: "Their WhatsApp window has closed." } });
  type(input(tree, "deal-sheet-link-input"), "docs.example.com/p/late");
  press(saveOf(redraw()));
  tree = await until("recorded", () => recorded.length > 0);
  assert.equal(sheetOf(tree), null, "recorded, so it closes");
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].tone, "danger");
  assert.equal(textOf(toasts[0].msg), "Recorded. It did not send: Their WhatsApp window has closed.");
  assert.deepEqual(recorded, [{ personId: "p1" }]);
  assert.equal(calls.filter((c) => c.path === "/api/v1/contacts/p1/deal").length, 1);

  // No reply courier where the sheet is drawn: recorded, and it says nothing went. REGRESSION: it said only the
  // stage's word, "Proposal out", as though the proposal were on its way.
  const courier = W.threadVerbs;
  delete W.threadVerbs;
  try {
    const bare = wire(R.detail());
    tree = open();
    W.openDealSheet({ personId: "p1", mode: "propose" });
    tree = await until("the person is read", (t) => input(t, "deal-sheet-link-input"));
    type(input(tree, "deal-sheet-link-input"), "docs.example.com/p/bare");
    assert.equal(textOf(saveOf(redraw())), "Record and send");
    press(saveOf(redraw()));
    tree = await until("recorded", () => recorded.length > 0);
    assert.deepEqual(
      toasts.map((t) => [t.tone, textOf(t.msg)]),
      [["danger", "Recorded. It did not send."]],
    );
    assert.equal(bare.calls.filter((c) => c.path.endsWith("/reply")).length, 0);
  } finally {
    W.threadVerbs = courier;
  }

  // Their window shut: the switch is off, a press cannot turn it on, it says why, and Save says Record.
  const shut = fixtures(Date.now());
  wire(
    shut.detail({
      rowOver: { latest_wa_inbound_at: shut.at(30 * H), last_inbound_at: shut.at(30 * H) },
      messages: [shut.msg("m1", 30 * H)],
    }),
  );
  tree = open();
  W.openDealSheet({ personId: "p1", mode: "propose" });
  tree = await until("the person is read", (t) => byTestId(t, "deal-sheet-send-switch"));
  const sw = byTestId(tree, "deal-sheet-send-switch");
  assert.deepEqual([sw.props["aria-checked"], sw.props["aria-disabled"]], [false, true]);
  press(sw);
  tree = redraw();
  assert.equal(byTestId(tree, "deal-sheet-send-switch").props["aria-checked"], false, "a press does nothing");
  assert.equal(textOf(byTestId(tree, "deal-sheet-send-why")), DEAL_SEND_WHY.window);
  assert.equal(textOf(saveOf(tree)), "Record");

  // Nothing typed: Cancel closes at once. Something typed: it asks once, Keep editing keeps it, Yes throws it away.
  press(byTestId(tree, "rec-sheet-cancel-deal-sheet"));
  tree = redraw();
  assert.equal(sheetOf(tree), null);
  W.openDealSheet({ personId: "p1", mode: "propose" });
  tree = redraw();
  assert.ok(input(tree, "deal-sheet-link-input"), "read before, so drawn at once from the tab's copy");
  type(input(tree, "deal-sheet-link-input"), "docs.example.com/p/draft");
  press(byTestId(redraw(), "rec-sheet-cancel-deal-sheet"));
  tree = redraw();
  assert.equal(
    textOf(find(byTestId(tree, "deal-sheet-cancel-confirm"), (n) => n.props?.className === "confirm-q")),
    "Discard your changes?",
  );
  press(byTestId(tree, "deal-sheet-cancel-no"));
  tree = await until("read behind it, what was typed kept", () => busy === 0);
  assert.ok(sheetOf(tree));
  assert.equal(input(tree, "deal-sheet-link-input").props.value, "docs.example.com/p/draft", "what was typed stays");
  press(byTestId(tree, "rec-sheet-cancel-deal-sheet"));
  press(byTestId(redraw(), "deal-sheet-cancel-yes"));
  tree = redraw();
  assert.equal(sheetOf(tree), null);
  assert.equal(W.__recordFolds.dirty(), false);
});

test("a person the sheet cannot work out is said in the sheet as a read that failed, never a throw that takes the shell with it", async () => {
  const R = fixtures(Date.now());
  wire(R.detail());
  const was = W.__deal.sheet;
  const said = console.error;
  W.__deal.sheet = () => {
    throw new Error("a view model the sheet was not written for");
  };
  console.error = () => {};
  try {
    let tree = open();
    W.openDealSheet({ personId: "p1", mode: "propose" });
    tree = await until("the person is read", (t) => byTestId(t, "deal-sheet-failed"));
    assert.ok(sheetOf(tree), "the sheet stands, and says so");
    assert.equal(saveOf(tree), null, "with nothing to save");
  } finally {
    W.__deal.sheet = was;
    console.error = said;
  }
  await until("the wire is quiet", () => busy === 0);
});

test("a proposal started after a consultation names the service the consultation was for, as the Calendar's does", () => {
  const after = (title, consultFirst = ["SEO"], deals = []) =>
    person({ deals, visits: consulted(2 * D, title), consult_first: consultFirst });
  // The quiet line's act and the card's next act both carry it, into the sheet (person-deal.jsx pdRun).
  assert.equal(dealCardsOf(after("Consultation: SEO"), NOW, ZONE).quiet.act.service, "SEO");
  assert.equal(dealNextAct(after("Consultation: SEO"), NOW).service, "SEO");
  // A title that names no consult-first service, or a workspace with none: nothing is named.
  assert.equal(dealCardsOf(after("Consultation"), NOW, ZONE).quiet.act.service, undefined);
  assert.equal(dealCardsOf(after("Consultation: SEO", []), NOW, ZONE).quiet.act.service, undefined);
  // An engagement that ended, then a consultation for SEO: the new proposal is for SEO.
  const ended = dealDto({ stage: "ended", decided_at: at(40 * D), ended_at: at(20 * D) });
  assert.equal(dealNextAct(after("SEO consult", ["SEO"], [ended]), NOW).service, "SEO");
});
