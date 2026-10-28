import { clockDate, clockTime } from "../shared/clock.js";
import { appointmentWords } from "../journey/appointment-word.js";
import { plural } from "../shared/words.js";
import { DEAL_ACT_WORDS } from "../deals/deal-words.js";
import { dealPaceOf } from "../deals/deal-waits.js";
import { MERGE_WORDS } from "./person-merge.js";
import { DOUBT_WORDS } from "./person-doubts.js";
import { personName } from "./person-name.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { DM_CLOSED, mayReach, proposalAction } from "./person-reach.js";
import { campaignsOf, inSequencesOf, ts } from "./person-helpers.js";
import { personNotesVM } from "../notes/person-notes.js";
import { PERSON_CHANNEL_WORDS, REPLY_WIRE } from "./person-words.js";
import { wayOff, writeWaysOf } from "../new-conversation/write-ways.js";
import { messageAt } from "../conversations/thread-dto.js";
import { draftSendsAtMs, heldDraftOf } from "../conversations/message-words.js";
import { replyWaitsOnYou } from "../conversations/standing.js";
import { isIdentifierName, shortName } from "../conversations/thread-contact.js";
import {
  aboutOf,
  personFactsOf,
  lastExchangeOf,
  leadOf,
  personCardContext,
  receptionistModeOf,
  replyFields,
  rightNowOf,
  sinceWords,
  smartListsOf
} from "./person-cards.js";
import {
  comingUpOf,
  timelineOf
} from "./person-timeline.js";
import { dealCardsOf } from "../deals/sheet/deal-card.js";
import { LEAD_CONSENT_REFUSAL, LEAD_STAGE_WORDS } from "../leads/lead-words.js";
import {
  businessRecordOf,
  personHeadOf,
  worksAtOf
} from "../person-page/business.js";
import { personFiguresOf } from "../person-page/figures.js";
import { personNextOf } from "../person-page/next.js";
import { lastWordsOf } from "../person-page/last-words.js";
import { personNoticesOf } from "../person-page/notices.js";
import { personTabsOf } from "../person-page/route.js";
import { personVisitsOf } from "../person-page/visits.js";
import { callBackWaits } from "../person-page/call.js";
import { holderOf } from "./person-state.js";
import { callFactsOf } from "../person-page/call-facts.js";
import { contactEvidenceOf, personBeforeOf, personOriginOf, reachRowsOf } from "../person-page/origin.js";
import { WORKS_AT_WORDS } from "../person-page/words.js";
export const TIMELINE_FILTERS = [
  { id: "all", label: "All", kinds: null },
  { id: "messages", label: "Messages", kinds: ["customer", "receptionist", "team", "escalation", "decision"] },
  { id: "calls", label: "Calls", kinds: ["call"] },
  { id: "visits", label: "Appointments", kinds: ["visit"] },
  { id: "consent", label: "Consent", kinds: ["consent"] },
  { id: "deals", label: "Deals", kinds: ["deal"] }
];
export function timelineFilterLabel(f, word) {
  return f.id === "visits" ? appointmentWords(word).Many : f.label;
}
export function filterTimeline(items, id) {
  const kinds = TIMELINE_FILTERS.find((f) => f.id === id)?.kinds ?? null;
  return kinds ? items.filter((i) => kinds.includes(i.kind)) : [...items];
}
function doubtsOf(d) {
  return (d.doubts ?? []).map((x) => {
    const other = personName(x.other);
    return {
      id: x.id,
      otherId: x.other.id,
      other,
      phone: x.other.phone_e164 ? formatPhoneDisplay(x.other.phone_e164) : null,
      email: x.other.email,
      seen: x.seen,
      sentence: DOUBT_WORDS.seen[x.seen](other)
    };
  });
}
export const PERSON_ACT_WORDS = {
  call: "Call",
  callHint: "From your own phone",
  text: "Text them",
  email: "Email them",
  booking: "Send booking link",
  startProposal: "Start a proposal",
  addToList: "Add to a list",
  copyPhone: "Copy the number",
  copyEmail: "Copy the address",
  deletePerson: "Delete person\u2026",
  /**
   * A sender of automated mail made a person (00483): the act of its own, where it rode Delete person alone and the live
   * walk never found it (27 Oct 2026). It opens the same question with the switch on.
   */
  notAPerson: "Not a person\u2026",
  notAPersonHint: "A notice or a newsletter: its mail stays in your mailbox, and it leaves People",
  /** Their own copy (R14 X5): everything kept about them, for when they ask what the business holds. */
  download: "Download their records",
  downloadHint: "Everything kept about them, in one file: for when they ask what you hold",
  /** Why a send into their thread cannot go: there is none (a wire's own reasons are the sheet's, writeWaysOf). */
  noThread: "No conversation with them yet.",
  ready: (on) => `Opens their thread with it ready to send${on}`
};
export const PERSON_DELETE_WORDS = {
  title: "Delete person",
  detail: "Removes their messages, media and recordings from Chanlytics and stops any reply still queued. This cannot be undone.",
  // The foot's question: the sheet's title asks what is done (title), so the foot asks only for the name.
  typed: (name) => `Type ${name} to confirm.`,
  yes: "Delete this person",
  busy: "Deleting\u2026",
  cancel: "Cancel",
  failed: "Could not delete this person.",
  done: (name) => `${name} deleted: their messages, media and recordings are gone`
};
function threadOff(p) {
  if (!p.openThread) return PERSON_ACT_WORDS.noThread;
  if (p.replyVia === "Instagram") return p.replyWindow && !p.replyWindow.open ? DM_CLOSED : null;
  return p.replyVia ? wayOff(p.ways, REPLY_WIRE[p.replyVia]) : null;
}
export function personActs(p) {
  const W = PERSON_ACT_WORDS;
  const acts = [];
  const reach = mayReach(p);
  const off = threadOff(p);
  const on = p.replyVia === "Email" ? " by email" : p.replyVia === "Text" ? " as a text" : p.replyVia ? " on WhatsApp" : "";
  if (p.phone && !p.consent.dnc)
    acts.push({ id: "call", label: W.call, hint: W.callHint, group: "reach", needs: "any", off: null });
  if (p.phone)
    acts.push({ id: "text", label: W.text, hint: null, group: "reach", needs: "record", off: wayOff(p.ways, "sms") });
  if (p.email)
    acts.push({
      id: "email",
      label: W.email,
      hint: null,
      group: "reach",
      needs: "record",
      off: wayOff(p.ways, "email")
    });
  if (p.bookingLink && p.bookingLinkAction.offered)
    acts.push({
      id: "booking",
      label: W.booking,
      hint: reach && p.bookingLinkAction.ready ? W.ready(on) : p.bookingLinkAction.title,
      group: "reach",
      needs: "record",
      off
    });
  const cardSends = p.deal?.stage === "proposed" && (!p.proposal?.sent || !!p.deal.proposal?.sending);
  if (reach && p.proposal && p.proposalAction.ready && !cardSends)
    acts.push({
      id: "proposal",
      label: p.proposal.sent ? `${DEAL_ACT_WORDS.send} again` : DEAL_ACT_WORDS.send,
      hint: W.ready(on),
      group: "reach",
      needs: "record",
      off
    });
  acts.push({
    id: "start-proposal",
    label: W.startProposal,
    hint: null,
    group: "record",
    needs: "record",
    off: null
  });
  acts.push({ id: "add-to-list", label: W.addToList, hint: null, group: "record", needs: "record", off: null });
  if (p.phone)
    acts.push({ id: "copy-phone", label: W.copyPhone, hint: null, group: "record", needs: "any", off: null });
  if (p.email)
    acts.push({ id: "copy-email", label: W.copyEmail, hint: null, group: "record", needs: "any", off: null });
  if (p.worksAt && !p.worksAt.gone)
    acts.push({
      id: "leave-business",
      label: WORKS_AT_WORDS.leave,
      hint: WORKS_AT_WORDS.leaveHint,
      group: "delete",
      needs: "record",
      off: null
    });
  acts.push({
    id: "download",
    label: W.download,
    hint: W.downloadHint,
    group: "delete",
    needs: "owner",
    off: null
  });
  acts.push({
    id: "merge",
    label: MERGE_WORDS.act,
    hint: MERGE_WORDS.actHint,
    group: "delete",
    needs: "owner",
    off: null
  });
  if (p.email)
    acts.push({
      id: "not-a-person",
      label: W.notAPerson,
      hint: W.notAPersonHint,
      group: "delete",
      needs: "owner",
      off: null,
      danger: true
    });
  acts.push({
    id: "delete",
    label: W.deletePerson,
    hint: null,
    group: "delete",
    needs: "owner",
    off: null,
    danger: true
  });
  return acts;
}
const OWN_MESSAGE_CHOICES = 10;
const EVIDENCE_WORDS = 80;
function ownMessagesOf(d, stamp) {
  const found = [];
  for (const c of d.conversations) {
    for (const m of c.messages) {
      if (m.direction !== "inbound" || m.sender !== "customer" || m.channel === "voice" || m.channel === "system")
        continue;
      const said = [m.body, m.media?.caption].map((s) => (s ?? "").replace(/\s+/g, " ").trim()).find(Boolean);
      const t = ts(messageAt(m));
      if (!said || t === null) continue;
      const chars = Array.from(said);
      const at = stamp(t);
      found.push({
        t,
        vm: {
          id: m.id,
          words: chars.length > EVIDENCE_WORDS ? `${chars.slice(0, EVIDENCE_WORDS).join("")}\u2026` : said,
          via: PERSON_CHANNEL_WORDS[m.channel] ?? "",
          when: `${at.day}, ${at.time}`
        }
      });
    }
  }
  return found.sort((a, b) => b.t - a.t).slice(0, OWN_MESSAGE_CHOICES).map((f) => f.vm);
}
export function toPersonVM(d, tz, now = /* @__PURE__ */ new Date(), viewerId = null, page = {}) {
  const ctx = personCardContext(d, tz, now, viewerId, page?.names ?? null);
  const { base, nowMs, word, reply } = ctx;
  const vm = {
    ...base,
    ...reply ? replyFields(reply, base.emailSuppressed, { optedOut: base.stopped, who: base.name }) : {},
    since: sinceWords(base),
    metaLine: `${plural(base.threads, "conversation")} \xB7 ${plural(base.calls, "call")}`,
    lastExchange: lastExchangeOf(ctx),
    facts: personFactsOf(ctx),
    rightNow: rightNowOf(ctx),
    timeline: timelineOf(ctx),
    comingUp: comingUpOf(ctx),
    visitTab: personVisitsOf(ctx),
    about: aboutOf(ctx),
    noteList: personNotesVM(d.person_notes, tz, nowMs),
    noteTeam: d.note_team ?? [],
    bookingLink: d.booking_link?.trim() || null,
    openThread: base.threadId ? `inbox/${base.threadId}` : null,
    receptionistMode: receptionistModeOf(d),
    ownMessages: ownMessagesOf(d, ctx.stamp),
    smartLists: smartListsOf(d, base),
    campaigns: campaignsOf(d, tz, nowMs),
    inSequences: inSequencesOf(d, tz, nowMs),
    lead: leadOf(d, base, tz, nowMs),
    // The doors' own test, as far as the page can see it: a lead names them, or they work at one.
    yesLocked: d.lead || base.worksAt ? LEAD_CONSENT_REFUSAL : null,
    callBackOpen: callBackWaits(d.escalations, holderOf(ctx.row, nowMs, viewerId) === "theirs"),
    doubts: doubtsOf(d),
    deal: ctx.current,
    deals: ctx.deals,
    word,
    dealPace: dealPaceOf(d.deal_pace),
    services: d.services ?? [],
    consultFirst: d.consult_first ?? [],
    // The one rule's answer, wire by wire, over People's own row for them (the sheet asks the same of the same row).
    ways: writeWaysOf(ctx.row, page?.ready ?? null, now)
  };
  const whole = {
    ...vm,
    proposal: ctx.proposal,
    proposalAction: proposalAction(
      { via: vm.replyVia ?? null, window: vm.replyWindow ?? null, emailStopped: vm.emailSuppressed },
      ctx.sentWords
    )
  };
  const withActs = { ...whole, acts: personActs(whole) };
  return { ...withActs, ...personPageOf(withActs, d, tz, now) };
}
function callLength(seconds) {
  return seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`;
}
function recordedOf(deals) {
  const open = deals.filter((x) => x.stage === "proposed" || x.stage === "won");
  const amounts = open.map((x) => x.amount).filter((x) => !!x);
  if (!amounts.length) return null;
  return amounts.length === 1 ? `${amounts[0]} recorded` : `${amounts.length} amounts recorded`;
}
export function personNextFor(p, dealP, tz, nowMs) {
  return personNextOf({
    notes: p.noteList,
    // The newest visit that ended with nobody saying (the Visits tab's To mark), else the calendar's last: the calendar's
    // last may be one the record holds no row for, which cannot be asked, while an older one waits.
    lastVisit: p.visitTab.toMark[0]?.visit ?? p.lastVisitLine,
    ahead: p.comingUp,
    deals: dealCardsOf(dealP, nowMs, tz),
    // A business you are talking to (the lead's stage converted, said "Talking"): with no deal, a proposal is next.
    talking: !!p.business && p.business.stage.word === LEAD_STAGE_WORDS.converted,
    step: p.nextStep,
    // Not asked, with a visit ahead and a number its reminder goes to: it would be held for want of a yes (canvas A), so
    // the yes is the next thing. With no number there is no reminder to hold.
    visitYesHeld: p.consent.state === "unknown" && p.comingUp.length > 0 && !!p.phone,
    who: isIdentifierName(p.name) ? "they" : shortName(p.name)
  });
}
function personPageOf(p, d, tz, now) {
  const nowMs = now.getTime();
  const reachOut = d.lead?.reach_out ?? null;
  const firstCall = d.calls.map((c) => ts(c.started_at)).filter((x) => x !== null).sort((a, b) => a - b)[0];
  const saidNo = reachOut?.readings.find((r) => r.said_no && !r.undone) ?? null;
  const head = personHeadOf(
    {
      name: p.name,
      initials: p.initials,
      givenName: p.givenName,
      nameSource: p.nameSource,
      worksAt: p.worksAt,
      business: d.business ?? null,
      signers: d.signers ?? [],
      addedMs: ts(d.added?.at ?? null),
      calledMs: firstCall ?? null,
      saidNoMs: saidNo ? ts(saidNo.read_at) : null
    },
    tz,
    nowMs
  );
  const business = d.business ? businessRecordOf(d.business, { personId: p.id, reachOut }, tz, now) : null;
  const past = p.timeline.filter((t) => !t.ahead);
  const thin = p.threads === 0 && p.deals.length === 0 && past.length < 6;
  const visitsSeen = p.timeline.filter((t) => t.kind === "visit").length;
  const earlier = d.visits?.earlier;
  const earlierSaid = (earlier?.kept ?? 0) + (earlier?.missed ?? 0);
  const sent = reachOut ? reachOut.sends.filter((x) => !!x.sent_at).length : 0;
  const figures = personFiguresOf({
    thin,
    last: p.lastContact.ts !== null ? { value: clockDate(p.lastContact.ts, tz, nowMs), sub: p.lastContact.by } : null,
    lead: business ? { stage: business.stage.word, since: business.stage.note } : null,
    deals: { count: p.openDeals.length, recorded: recordedOf(p.openDeals) },
    step: p.nextStep ? { day: p.nextStep.day.near, words: p.nextStep.words } : null,
    calls: { count: p.calls, minutes: callLength(p.callSeconds) },
    visits: {
      ahead: p.comingUp.length,
      kept: p.visitTab.head.kept,
      toMark: p.visitTab.head.toMark,
      any: p.calendar === "ok" && (p.comingUp.length > 0 || visitsSeen > 0 || earlierSaid > 0)
    },
    emails: reachOut ? { out: sent, back: reachOut.readings.filter((r) => !r.undone).length } : null,
    word: p.word
  });
  const tabFacts = {
    id: p.id,
    history: past.length,
    visits: visitsSeen,
    marked: earlierSaid,
    deals: p.deals.length,
    campaigns: p.campaigns.length + p.inSequences.length,
    thin,
    word: p.word
  };
  const evidence = contactEvidenceOf(d, { ...p.firstContact, cameFrom: p.cameFrom?.key ?? null });
  return {
    head,
    worksAtRow: worksAtOf(p.worksAt, d.business ?? null, tz, nowMs),
    business,
    thin,
    figures,
    next: personNextFor({ ...p, business }, p, tz, nowMs),
    notices: pageNoticesOf({ p, d, head, business, messages: evidence.messages, tz, nowMs }),
    lastWords: lastWordsOf(past),
    tabs: { desk: personTabsOf(tabFacts, false), phone: personTabsOf(tabFacts, true) },
    reach: reachRowsOf(evidence, tz, nowMs),
    origin: personOriginOf(evidence, tz, nowMs),
    before: personBeforeOf(d.before, nowMs)
  };
}
function pageNoticesOf(f) {
  const { p, d, head, business, tz, nowMs } = f;
  const notNames = [d.business?.lead.business_name ?? null, ...(d.note_team ?? []).map((t) => t.name)];
  const calls = callFactsOf(d.calls, notNames, tz, nowMs);
  const stepAt = calls.step?.atMs ?? null;
  return personNoticesOf({
    head,
    business,
    doubts: p.doubts,
    email: p.email,
    phone: d.row.phone_e164,
    named: !!p.givenName,
    heardFrom: p.askedMs !== null,
    peopleHere: (d.business?.people ?? []).filter((x) => x.id !== p.id).map((x) => ({
      id: x.id,
      name: personName(x),
      email: x.email,
      nameSource: x.name_source,
      phone: x.phone_e164,
      named: !!x.display_name
    })),
    calls,
    givenName: p.givenName,
    openStep: p.nextStep !== null,
    stepNoted: stepAt !== null && (d.person_notes ?? []).some((n) => n.source === "call" && (ts(n.created_at) ?? 0) >= stepAt),
    draft: heldDraftWaiting(f.messages, p.openThread, tz, nowMs)
  });
}
function heldDraftWaiting(messages, thread, tz, nowMs) {
  const held = heldDraftOf(messages);
  if (!held || !thread) return null;
  const at = draftSendsAtMs(held);
  return replyWaitsOnYou({ endsAtMs: at }, nowMs) ? { to: thread, sends: clockTime(at, tz) } : null;
}
