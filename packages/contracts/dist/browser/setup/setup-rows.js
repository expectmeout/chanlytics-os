import { calendarSourceFacts, calendarSourceOf } from "./calendar-source.js";
import { agoWords } from "../shared/time.js";
import { plural } from "../shared/words.js";
import { bookingPageOffered, connectionWords, listingLine } from "../google/google.js";
import {
  dayWords,
  trialWords,
  TRIAL_COVERS,
  billingDoorOpen,
  BILLING_TEST_MODE_CLAUSE,
  PAUSED_WORDS
} from "../workspace/billing.js";
import { capabilityStatus } from "./capabilities.js";
import { EMAIL_ELSEWHERE_SENTENCE, EMAIL_NOT_ANSWERED_SENTENCE } from "../email/mailbox.js";
import { NO_NUMBER_REACH } from "../people/people-lists.js";
import { GET_YES_ROUTE } from "../people/lists/people-route.js";
import { lensRoute } from "../reports/lenses.js";
import { FIRST_RUN_FIND_ROUTE, firstRunStepRoute } from "./first-run-route.js";
import { viaWords } from "../imports/csv.js";
import {
  activationWords,
  rowContextOf,
  BROKEN_CONFIG_WORDS,
  KEEP_ROW,
  RECEPTIONIST_MET,
  CHANNELS_SEEN,
  REHEARSE_SKIPPED,
  GOOGLE_CONNECT_LATER,
  REMIND_SKIPPED,
  SETUP_STATE_WORDS,
  TRY_SKIPPED,
  forwardedLineOf
} from "./setup.js";
import { lineRow, receptionistRow, tryRow, keepRow } from "./setup-rows-phone.js";
import { SEQUENCES_ROUTE } from "../sequences/sequence-address.js";
function billingRow(i, ctx) {
  if (!billingDoorOpen(i.billing)) return null;
  const { nowMs } = ctx;
  const b = i.billing;
  const testMode = b.livemode === false ? [BILLING_TEST_MODE_CLAUSE] : [];
  if (b.status === "trialing" && (b.cancel_at || b.cancel_at_period_end)) {
    return {
      id: "billing",
      icon: "money",
      title: "Billing",
      state: "ready",
      required: true,
      sentence: `On trial, cancelled: the receptionist answers until ${dayWords(b.cancel_at ?? b.trial_end) || "the trial ends"}, then stops.`,
      details: [...testMode, "Nothing is charged; undo the cancellation from Billing before then to keep it"],
      verb: { label: "Open Billing", to: "admin/billing" }
    };
  }
  if (b.status === "trialing") {
    return {
      id: "billing",
      icon: "money",
      title: "Billing",
      state: "ready",
      required: true,
      sentence: `On trial: ${trialWords(b.trial_end, nowMs) || "the card is on file"}.`,
      details: [
        ...testMode,
        "The card on file is charged when the trial ends; cancel from Billing before then if you'd rather not",
        // What the trial does not cover (maySpend), said where the trial is, as Billing says it.
        TRIAL_COVERS
      ],
      verb: { label: "Open Billing", to: "admin/billing" }
    };
  }
  if (b.status === "active" || b.status === "incomplete") {
    return {
      id: "billing",
      icon: "money",
      title: "Billing",
      state: "ready",
      required: true,
      sentence: b.status === "active" ? `Subscribed \xB7 next invoice ${dayWords(b.current_period_end) || "on the renewal date"}.` : "Finishing checkout \u2014 this page updates by itself.",
      details: [...testMode],
      verb: { label: "Open Billing", to: "admin/billing" }
    };
  }
  if (b.status === "past_due") {
    return {
      id: "billing",
      icon: "money",
      title: "Billing",
      state: "waiting_you",
      required: true,
      sentence: "The last payment failed. Update the card to keep the receptionist answering.",
      details: [...testMode, "Stripe retries for a few days, then pauses the subscription"],
      verb: { label: "Update the card", to: "verb:billing-portal" }
    };
  }
  if (b.status === "paused" || b.status === "unpaid") {
    return {
      id: "billing",
      icon: "money",
      title: "Billing",
      state: "waiting_you",
      required: true,
      sentence: `Your receptionist is paused. ${PAUSED_WORDS}`,
      details: [
        ...testMode,
        b.status === "paused" ? "The trial ended without a card on file" : "Payment could not be collected"
      ],
      verb: { label: "Resume in Billing", to: "admin/billing" }
    };
  }
  return {
    id: "billing",
    icon: "money",
    title: "Billing",
    state: "not_started",
    required: true,
    sentence: b.trial_days > 0 ? `Start the ${b.trial_days}-day trial with a card \u2014 nothing is charged until it ends.` : "Subscribe with a card \u2014 the first charge is today.",
    details: [
      ...testMode,
      ...b.trial_days > 0 ? ["Cancel any time from Billing", "The receptionist answers through the trial"] : ["Cancel any time from Billing"]
    ],
    verb: { label: b.trial_days > 0 ? "Start the trial" : "Subscribe", to: "verb:billing-checkout" }
  };
}
const settingsRow = (row) => `admin/workspace/${row}`;
const firstMissingFact = (b) => !b.name ? "name" : !b.hours ? "hours" : "services";
function factsRow(i, ctx) {
  const { nowMs } = ctx;
  const b = i.business;
  const missing = [!b.name ? "a name" : "", !b.hours ? "hours" : "", b.services === 0 ? "services" : ""].filter(
    Boolean
  );
  const serious = (i.conflicts ?? []).find((k) => k.severity === "serious") ?? null;
  if (b.broken) {
    return i.requests.repair ? {
      id: "facts",
      icon: "home",
      title: "Business facts",
      state: "waiting_them",
      required: true,
      sentence: `${BROKEN_CONFIG_WORDS.clause} ${BROKEN_CONFIG_WORDS.requested(i.requests.repair, nowMs)}`,
      details: [],
      verb: { label: "Open Business", to: "admin/workspace" }
    } : {
      id: "facts",
      icon: "home",
      title: "Business facts",
      state: "waiting_you",
      required: true,
      sentence: BROKEN_CONFIG_WORDS.clause,
      details: [],
      verb: { label: BROKEN_CONFIG_WORDS.ask, to: "verb:request-repair" }
    };
  }
  if (serious) {
    return {
      id: "facts",
      icon: "home",
      title: "Business facts",
      state: "waiting_you",
      required: true,
      sentence: serious.sentence,
      details: [`${b.name} \xB7 hours set \xB7 ${plural(b.services, "service")} on record`],
      verb: { label: "Fix it in Business", to: serious.to }
    };
  }
  if (missing.length === 0) {
    return {
      id: "facts",
      icon: "home",
      title: "Business facts",
      state: "ready",
      required: true,
      sentence: `${b.name} \xB7 hours set \xB7 ${plural(b.services, "service")} on record`,
      details: [
        b.bookingLink ? "Booking link on record" : "No booking link \u2014 the receptionist answers, but cannot send one",
        b.address ? "Address on record" : "No address yet"
      ],
      verb: { label: "Edit in Business", to: "admin/workspace" }
    };
  }
  const none = missing.length === 3;
  return {
    id: "facts",
    icon: "home",
    title: "Business facts",
    state: none ? "not_started" : "waiting_you",
    required: true,
    sentence: none ? "Name, hours and services are what the receptionist answers with." : `Still missing: ${missing.join(" and ")}.`,
    details: [],
    verb: { label: none ? "Start in Business" : "Finish in Business", to: settingsRow(firstMissingFact(b)) }
  };
}
function handoffRow(_i, ctx) {
  const { handoffNum } = ctx;
  return handoffNum ? {
    id: "handoff",
    icon: "phone",
    title: "A person to hand off to",
    state: "ready",
    required: false,
    sentence: `Callers who insist on a person are transferred to ${handoffNum}.`,
    details: [],
    verb: { label: "Change it", to: settingsRow("handoff_number") }
  } : {
    id: "handoff",
    icon: "phone",
    title: "A person to hand off to",
    state: "waiting_you",
    required: false,
    sentence: "Give the receptionist a number to hand callers to when they insist on a person.",
    details: [],
    verb: { label: "Add a number", to: settingsRow("handoff_number") }
  };
}
function whatsappRow(i, ctx) {
  const { wa, waReady, waNum, answering, nowMs } = ctx;
  if (waReady) {
    const t = i.templates;
    const metaWaits = t.approved === 0 && t.pending > 0;
    const cap = capabilityStatus("whatsapp", i, nowMs);
    const details = [
      wa.quality ? `Quality ${wa.quality.toLowerCase()}` : "",
      t.approved ? `${plural(t.approved, "approved message")}` : t.pending ? `${plural(t.pending, "message")} with Meta for approval` : "No approved messages yet",
      t.startersApproved < 5 ? "Add the starter messages: the reminder, how did it go, the win-back" : "",
      wa.lastInboundAt ? `Last message ${agoWords(Date.parse(wa.lastInboundAt), nowMs)}` : ""
    ].filter(Boolean);
    if (!metaWaits) details.push(activationWords(cap, nowMs));
    return {
      id: "whatsapp",
      icon: "chat",
      title: "WhatsApp",
      state: metaWaits ? "waiting_them" : "ready",
      stateWords: metaWaits ? "Waiting on Meta" : void 0,
      required: !answering,
      sentence: metaWaits ? `Connected on ${waNum} \u2014 your first messages are with Meta for approval.` : `Connected on ${waNum}.`,
      details,
      verb: cap.tested && !cap.live && !metaWaits ? { label: "Activate", to: "verb:activate:whatsapp" } : t.startersApproved < 5 && !metaWaits ? { label: "Add the starters", to: SEQUENCES_ROUTE } : { label: "Open the Inbox", to: "inbox" },
      undo: cap.live && !metaWaits ? { label: "Withdraw activation", to: "verb:deactivate:whatsapp" } : null
    };
  }
  if (wa.present) {
    return {
      id: "whatsapp",
      icon: "chat",
      title: "WhatsApp",
      state: "waiting_you",
      required: !answering,
      sentence: `${waNum ?? "Your number"} is connected but switched off.`,
      details: [],
      verb: { label: "Open Connections", to: "admin/integrations" }
    };
  }
  return {
    id: "whatsapp",
    icon: "chat",
    title: "WhatsApp",
    state: "waiting_you",
    required: !answering,
    sentence: "Connect the WhatsApp number customers write to.",
    details: ["A new number, or the WhatsApp Business app you already use"],
    verb: { label: "Connect", to: "admin/integrations" }
  };
}
function emailRow(i, ctx) {
  const { nowMs } = ctx;
  const mb = i.email?.mailbox ?? null;
  const sending = i.email?.sending ?? null;
  const own = sending?.mailboxes?.[0] ?? null;
  if (!mb && own)
    return {
      id: "email",
      icon: "mail",
      title: "Email",
      state: own.state === "reconnect" ? "waiting_you" : "ready",
      required: false,
      sentence: own.state === "reconnect" ? `${own.address} signed out. Connect it again so email from people keeps coming into your Inbox.` : `Email people write to ${own.address} comes into your Inbox.`,
      details: [EMAIL_NOT_ANSWERED_SENTENCE],
      verb: {
        label: own.state === "reconnect" ? "Connect it again" : "Open the Inbox",
        to: own.state === "reconnect" ? "admin/integrations" : "inbox"
      }
    };
  if (!mb && sending && sending.providers.length > 0)
    return {
      id: "email",
      icon: "mail",
      title: "Email",
      state: "not_started",
      required: false,
      sentence: "Connect the mailbox customers write to. Six months of email from people comes into your Inbox, and new email arrives there.",
      details: [EMAIL_NOT_ANSWERED_SENTENCE],
      verb: { label: "Connect your mailbox", to: firstRunStepRoute("channels") }
    };
  if (!mb) return null;
  return {
    id: "email",
    icon: "mail",
    title: "Email",
    state: "ready",
    required: false,
    sentence: `Customers write to ${mb.address}, and their emails arrive in your Inbox.`,
    // Still "ready": Setup answers whether the channel is set up, and it
    // is. That an email could not be taken in is a detail here and the
    // row's whole state on Connections, which answers whether it is
    // WORKING. Two questions, two answers, one fact under both.
    details: [
      ...mb.last_error ? [mb.last_error] : [],
      mb.last_received_at ? `Last email ${agoWords(Date.parse(mb.last_received_at), nowMs)}` : "Nothing received yet",
      EMAIL_ELSEWHERE_SENTENCE
    ],
    verb: { label: "Open the Inbox", to: "inbox" }
  };
}
const SETUP_STATE_OF = {
  ready: "ready",
  attention: "waiting_you",
  needs_you: "waiting_you",
  waiting: "waiting_them",
  hand: "ready",
  none: "not_started"
};
function calendarRow(i) {
  const s = calendarSourceOf(calendarSourceFacts({ booking_link: i.business.bookingLink, ...i.calendar }));
  return {
    id: "calendar",
    icon: "calendar",
    title: "Calendar",
    state: SETUP_STATE_OF[s.state],
    ...s.state === "waiting" || s.state === "hand" ? { stateWords: s.words } : {},
    required: false,
    sentence: s.sentence,
    details: [],
    verb: s.next
  };
}
function teamRow(i) {
  const t = i.team;
  const people = t.members > 1 || t.invitesOpen > 0;
  const who = `${plural(t.members, "person", "people")}${t.invitesOpen ? ` \xB7 ${plural(t.invitesOpen, "invite")} open` : ""}`;
  const alerts = t.alertEmails ? `alerts go to ${plural(t.alertEmails, "address", "addresses")}` : "no alert address yet";
  return {
    id: "team",
    icon: "users",
    title: "Team and alerts",
    state: people && t.alertEmails ? "ready" : !people && !t.alertEmails ? "not_started" : "waiting_you",
    required: false,
    sentence: people ? `${who}${t.partner ? ` \xB7 ${t.partner} is your partner` : ""} \xB7 ${alerts}.` : `Only you so far \xB7 ${alerts}.`,
    details: people ? [] : ["Invite someone who answers when you can't"],
    verb: !t.alertEmails ? { label: "Set alerts", to: "admin/notifications" } : !people ? { label: "Invite", to: "admin/team" } : { label: "Open Team", to: "admin/team" }
  };
}
function yesRow(i) {
  const offers = i.consent.offers;
  const said = i.consent.offersSaidYes;
  const talk = i.consent.yes;
  const byEmail = i.consent.offers_by_email ?? 0;
  const alsoTalk = talk > said ? [`${plural(talk, "person", "people")} said yes to messages`] : [];
  const alsoEmail = byEmail > 0 ? [`${plural(byEmail, "person", "people")} can be sent an offer by email`] : [];
  return offers > 0 || byEmail > 0 ? {
    id: "yes",
    icon: "tag",
    title: "The first yes",
    state: "ready",
    required: false,
    sentence: offers > 0 ? `${plural(offers, "person", "people")} said yes to offers.` : `${plural(byEmail, "person", "people")} can be sent an offer by email.`,
    details: [...offers > 0 ? alsoEmail : [], ...alsoTalk],
    verb: { label: "Get their yes", to: GET_YES_ROUTE }
  } : said > 0 ? {
    id: "yes",
    icon: "tag",
    title: "The first yes",
    state: "waiting_you",
    required: false,
    sentence: `${plural(said, "person", "people")} said yes to offers, but nobody can be sent one yet \u2014 ${NO_NUMBER_REACH}.`,
    details: alsoTalk,
    verb: { label: "Open People", to: "clients" }
  } : {
    id: "yes",
    icon: "tag",
    title: "The first yes",
    state: "not_started",
    required: false,
    sentence: "Nobody has said yes to offers yet. The keyword and the QR are under Get their yes.",
    details: alsoTalk,
    verb: { label: "Get their yes", to: GET_YES_ROUTE }
  };
}
function googleRow(i, ctx) {
  if (!i.google?.ready) return null;
  const { nowMs } = ctx;
  const g = i.google.listing;
  const title = "Your Google listing";
  const connected = i.google.connected === true;
  const reach = connected ? "Business Profile connected \u2014 every review, replies from Reports" : "New reviews reach your bell and Reports";
  const c = i.google.connection;
  if (c?.sync_error) {
    return {
      id: "google",
      icon: "star",
      title,
      state: "waiting_you",
      required: false,
      sentence: `${connectionWords(c, nowMs)}. New reviews and their replies wait until it is connected again.`,
      details: g ? [listingLine(g)] : [],
      verb: { label: "Reconnect", to: "admin/integrations" }
    };
  }
  if (g && g.check_error) {
    return {
      id: "google",
      icon: "star",
      title,
      state: "waiting_them",
      stateWords: "Waiting on Google",
      required: false,
      sentence: `${g.name} is on record, but Google could not be read${g.checked_at ? ` since ${agoWords(Date.parse(g.checked_at), nowMs)}` : " yet"} \u2014 it is read again once a day.`,
      details: [],
      verb: { label: "Open Reports", to: lensRoute("reviews") }
    };
  }
  if (g) {
    return {
      id: "google",
      icon: "star",
      title,
      state: "ready",
      required: false,
      sentence: `${listingLine(g)}.`,
      details: [g.checked_at ? `Checked ${agoWords(Date.parse(g.checked_at), nowMs)}` : "Not read yet", reach],
      verb: { label: "Open Reports", to: lensRoute("reviews") }
    };
  }
  if (i.google.places !== false) {
    return {
      id: "google",
      icon: "star",
      title,
      state: "not_started",
      required: false,
      sentence: "Find your business on Google so new reviews reach you here.",
      details: [
        i.business.address ? "Uses the name and address on record" : "Add your address in Settings \u203A Details for a surer match"
      ],
      // One finder: the first run's Find, asked for by name (first-run.ts).
      verb: { label: "Find it", to: FIRST_RUN_FIND_ROUTE }
    };
  }
  return {
    id: "google",
    icon: "star",
    title,
    state: "not_started",
    required: false,
    sentence: "Connect your Google Business Profile so every review reaches you here.",
    details: ["Sign in to Google once, on Connections"],
    verb: { label: "Connect", to: "admin/integrations" }
  };
}
function clientsRow(i) {
  if (!i.imports) return null;
  const row = i.imports.find((r) => r.source === "clients_file") ?? null;
  const base = { id: "clients", icon: "users", title: "Your clients", required: false, details: [] };
  if (row?.state === "done")
    return {
      ...base,
      state: "ready",
      sentence: `${plural(row.counts.people ?? 0, "client")} brought in from ${viaWords(row.via) ? `${viaWords(row.via)}'s file` : "your file"}.`,
      verb: null
    };
  if (row?.state === "failed")
    return {
      ...base,
      state: "waiting_you",
      sentence: row.last_error ?? "Bringing your clients in stopped part way. What came in is kept.",
      verb: { label: "Try again", to: firstRunStepRoute("channels") }
    };
  return {
    ...base,
    state: row?.state === "running" ? "waiting_them" : "not_started",
    sentence: row?.state === "running" ? "Bringing your clients in." : "Bring your client list from your booking tool, so People starts with your real customers.",
    verb: row?.state === "running" ? null : { label: "Bring your clients", to: firstRunStepRoute("channels") }
  };
}
const SETUP_ROWS = [
  billingRow,
  factsRow,
  handoffRow,
  lineRow,
  receptionistRow,
  tryRow,
  keepRow,
  whatsappRow,
  emailRow,
  calendarRow,
  clientsRow,
  teamRow,
  yesRow,
  googleRow
];
const checkFactsOf = (i) => ({
  receptionist: i.business.receptionist,
  listed: !!i.google?.listing,
  unsure: i.google?.unsure ?? [],
  type: i.google?.type ?? null,
  bookingPage: bookingPageOffered(i.google?.bookingPage, i.business.bookingLink)
});
const forwardingOwedOf = (i, later) => !!i.want && i.want.way !== "new" && !forwardedLineOf(i.lines) && !later.has(KEEP_ROW);
function readinessSentenceOf(i, ctx) {
  const { waReady, voiceReady, waNum, voiceNum, texting } = ctx;
  const seriousConflict = (i.conflicts ?? []).find((k) => k.severity === "serious") ?? null;
  if (seriousConflict) return seriousConflict.sentence;
  if (waReady && voiceReady)
    return `Your receptionist answers calls on ${voiceNum} and WhatsApp on ${waNum}. ${texting.sentence}`;
  if (voiceReady)
    return `Your receptionist answers calls on ${voiceNum}. WhatsApp is not connected. ${texting.sentence}`;
  if (waReady) return `Your receptionist answers WhatsApp on ${waNum}. No phone line yet.`;
  return "Your receptionist is not answering yet.";
}
function tryItOf(ctx) {
  const { wa, voice, waReady, voiceReady, answering, waNum, voiceNum } = ctx;
  if (!answering) return null;
  return {
    voice: voiceReady ? voice.number : null,
    voiceLabel: voiceReady ? voiceNum : null,
    whatsapp: waReady ? wa.number : null,
    whatsappLabel: waReady ? waNum : null
  };
}
function firstRunFactsOf(i, ctx, later) {
  const google = i.google;
  return {
    findable: !!google?.ready && google.places !== false && !google.listing,
    trySkipped: later.has(TRY_SKIPPED),
    remindSkipped: later.has(REMIND_SKIPPED),
    dayBeforeOn: i.reminders?.day_before === true,
    forwardingOwed: forwardingOwedOf(i, later),
    receptionistMet: later.has(RECEPTIONIST_MET),
    rehearseSkipped: later.has(REHEARSE_SKIPPED),
    googleConnect: {
      offered: google?.profile === true && !!google.listing && !google.connected && !later.has(GOOGLE_CONNECT_LATER),
      connected: !!google?.connected,
      email: google?.connection?.google_email ?? null
    },
    rehearsal: { reviewed: i.rehearsal?.reviewed ?? 0, kept: i.rehearsal?.kept ?? 0 },
    choices: i.choices ?? { whatsapp: null },
    want: i.want ?? null,
    lineUnderway: !!ctx.ownLine || ctx.voice.present || !!i.requests.line || !!i.requests.port,
    numbersHere: !!i.lines?.ready,
    channelsSeen: later.has(CHANNELS_SEEN),
    calendarLinked: i.calendar.state !== "none",
    check: checkFactsOf(i)
  };
}
export function setupSteps(i, nowMs = Date.now()) {
  const later = new Set(i.later ?? []);
  const ctx = rowContextOf(i, nowMs);
  const rows = [];
  for (const build of SETUP_ROWS) {
    const r = build(i, ctx);
    if (r)
      rows.push({
        ...r,
        stateWords: r.stateWords ?? SETUP_STATE_WORDS[r.state],
        later: !r.required && later.has(r.id)
      });
  }
  const open = rows.filter((r) => r.state !== "ready" && !r.later);
  const nextRow = open.find((r) => r.verb) ?? null;
  const next = nextRow && nextRow.verb ? { label: nextRow.verb.label, to: nextRow.verb.to, row: nextRow.id, title: nextRow.title } : null;
  const done = rows.filter((r) => r.state === "ready").length;
  return {
    rows,
    readiness: { answering: ctx.answering, sentence: readinessSentenceOf(i, ctx) },
    next,
    done,
    total: rows.length,
    tryIt: tryItOf(ctx),
    ...firstRunFactsOf(i, ctx, later)
  };
}
