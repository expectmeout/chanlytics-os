/**
 * Setup's rows — the decision table setupSteps folds, one builder per row, in the order the page draws them.
 * The phone's rows are setup-rows-phone.ts; the words, the DTO, the view model and the context every row reads
 * are setup.ts.
 *
 * Every row here is read from the workspace: the config, the channels, the
 * templates, the calendar feed, the team, the consent rows. Nothing stores a
 * "done" flag; a row is ready because the thing it names exists. "Later" is
 * the member's own (their saved view, on every device): it puts an optional
 * row off Today's card for a week, then for good (setup-put-off.ts setupPutOffNext),
 * and nothing else.
 */
import { calendarSourceFacts, calendarSourceOf, type CalendarSourceState } from "./calendar-source";
import { agoWords } from "../shared/time";
import { plural } from "../shared/words";
import { bookingPageOffered, connectionWords, listingLine } from "../google/google";
import {
  dayWords,
  trialWords,
  TRIAL_COVERS,
  billingDoorOpen,
  BILLING_TEST_MODE_CLAUSE,
  PAUSED_WORDS,
} from "../workspace/billing";
import { capabilityStatus } from "./capabilities";
import { EMAIL_ELSEWHERE_SENTENCE, EMAIL_NOT_ANSWERED_SENTENCE } from "../email/mailbox";
import { NO_NUMBER_REACH } from "../people/people-lists";
import { GET_YES_ROUTE } from "../people/lists/people-route";
import { lensRoute } from "../reports/lenses";
import { FIRST_RUN_FIND_ROUTE, firstRunStepRoute } from "./first-run-route";
import { viaWords } from "../imports/csv";
import {
  activationWords,
  rowContextOf,
  BROKEN_CONFIG_WORDS,
  SETUP_STATE_WORDS,
  forwardedLineOf,
  type SetupInputs,
  type SetupRowBuilder,
  type SetupRowContext,
  type SetupRowDraft,
  type SetupRowVM,
  type SetupVM,
} from "./setup";
import {
  KEEP_ROW,
  RECEPTIONIST_MET,
  CHANNELS_SEEN,
  REHEARSE_SKIPPED,
  GOOGLE_CONNECT_LATER,
  REMIND_SKIPPED,
  TRY_SKIPPED,
  setupBack,
  setupOffNow,
  setupPutOffEver,
  type SetupPutOff,
} from "./setup-put-off";
import { lineRow, receptionistRow, tryRow, keepRow } from "./setup-rows-phone";
import { SEQUENCES_ROUTE } from "../sequences/sequence-address";

/**
 * 0. Billing — first, for a workspace that pays by card: the door before
 * the desk. A direct arrangement has no row; a closed door draws nothing.
 */
function billingRow(i: SetupInputs, ctx: SetupRowContext): SetupRowDraft | null {
  if (!billingDoorOpen(i.billing)) return null;
  const { nowMs } = ctx;
  const b = i.billing;
  // On Stripe's test keys, said before anything the row says about a card or a charge (the wiring audit's S9).
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
      verb: { label: "Open Billing", to: "admin/billing" },
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
        TRIAL_COVERS,
      ],
      verb: { label: "Open Billing", to: "admin/billing" },
    };
  }
  if (b.status === "active" || b.status === "incomplete") {
    return {
      id: "billing",
      icon: "money",
      title: "Billing",
      state: "ready",
      required: true,
      sentence:
        b.status === "active"
          ? `Subscribed · next invoice ${dayWords(b.current_period_end) || "on the renewal date"}.`
          : "Finishing checkout — this page updates by itself.",
      details: [...testMode],
      verb: { label: "Open Billing", to: "admin/billing" },
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
      verb: { label: "Update the card", to: "verb:billing-portal" },
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
        b.status === "paused" ? "The trial ended without a card on file" : "Payment could not be collected",
      ],
      verb: { label: "Resume in Billing", to: "admin/billing" },
    };
  }
  return {
    id: "billing",
    icon: "money",
    title: "Billing",
    state: "not_started",
    required: true,
    sentence:
      b.trial_days > 0
        ? `Start the ${b.trial_days}-day trial with a card — nothing is charged until it ends.`
        : "Subscribe with a card — the first charge is today.",
    details: [
      ...testMode,
      ...(b.trial_days > 0
        ? ["Cancel any time from Billing", "The receptionist answers through the trial"]
        : ["Cancel any time from Billing"]),
    ],
    verb: { label: b.trial_days > 0 ? "Start the trial" : "Subscribe", to: "verb:billing-checkout" },
  };
}

/**
 * The address that opens one of the business's rows, open, on the Settings page that holds it now: Settings reads
 * `admin/workspace/<row>` as the page the row moved to (Hours & booking, How it answers; its tabs.ts paneOfRow), as
 * the calendar's door does (CALENDAR_SETTING_ROUTE). The rows split across three pages on 17 Oct 2026, and a door to
 * `admin/workspace` alone opened Details, where the hand-off number and the hours no longer are.
 */
const settingsRow = (row: "name" | "hours" | "services" | "handoff_number"): string => `admin/workspace/${row}`;

/** The first of the facts the receptionist answers with that is missing, as its row: the name, the hours, the services. */
const firstMissingFact = (b: SetupInputs["business"]): "name" | "hours" | "services" =>
  !b.name ? "name" : !b.hours ? "hours" : "services";

/**
 * 1. Business facts — what the receptionist answers with.
 */
function factsRow(i: SetupInputs, ctx: SetupRowContext): SetupRowDraft {
  const { nowMs } = ctx;
  const b = i.business;
  const missing = [!b.name ? "a name" : "", !b.hours ? "hours" : "", b.services === 0 ? "services" : ""].filter(
    Boolean,
  );
  const serious = (i.conflicts ?? []).find((k) => k.severity === "serious") ?? null;
  if (b.broken) {
    // Only Chanlytics can repair it, so the owner's move is the ask (S8); once asked, it waits on us and says when.
    return i.requests.repair
      ? {
          id: "facts",
          icon: "home",
          title: "Business facts",
          state: "waiting_them",
          required: true,
          sentence: `${BROKEN_CONFIG_WORDS.clause} ${BROKEN_CONFIG_WORDS.requested(i.requests.repair, nowMs)}`,
          details: [],
          verb: { label: "Open Business", to: "admin/workspace" },
        }
      : {
          id: "facts",
          icon: "home",
          title: "Business facts",
          state: "waiting_you",
          required: true,
          sentence: BROKEN_CONFIG_WORDS.clause,
          details: [],
          verb: { label: BROKEN_CONFIG_WORDS.ask, to: "verb:request-repair" },
        };
  }
  if (serious) {
    // Filled in, and wrong in a way a customer feels. The sentence is the
    // resolver's, because it is the one that knows WHY the two disagree.
    return {
      id: "facts",
      icon: "home",
      title: "Business facts",
      state: "waiting_you",
      required: true,
      sentence: serious.sentence,
      details: [`${b.name} · hours set · ${plural(b.services, "service")} on record`],
      verb: { label: "Fix it in Business", to: serious.to },
    };
  }
  if (missing.length === 0) {
    return {
      id: "facts",
      icon: "home",
      title: "Business facts",
      state: "ready",
      required: true,
      sentence: `${b.name} · hours set · ${plural(b.services, "service")} on record`,
      details: [
        b.bookingLink ? "Booking link on record" : "No booking link — the receptionist answers, but cannot send one",
        b.address ? "Address on record" : "No address yet",
      ],
      verb: { label: "Edit in Business", to: "admin/workspace" },
    };
  }
  const none = missing.length === 3;
  return {
    id: "facts",
    icon: "home",
    title: "Business facts",
    state: none ? "not_started" : "waiting_you",
    required: true,
    sentence: none
      ? "Name, hours and services are what the receptionist answers with."
      : `Still missing: ${missing.join(" and ")}.`,
    details: [],
    verb: { label: none ? "Start in Business" : "Finish in Business", to: settingsRow(firstMissingFact(b)) },
  };
}

/**
 * 2. A person to hand off to — the warm transfer the voice shell already makes.
 */
function handoffRow(_i: SetupInputs, ctx: SetupRowContext): SetupRowDraft {
  const { handoffNum } = ctx;
  return handoffNum
    ? {
        id: "handoff",
        icon: "phone",
        title: "A person to hand off to",
        state: "ready",
        required: false,
        sentence: `Callers who insist on a person are transferred to ${handoffNum}.`,
        details: [],
        verb: { label: "Change it", to: settingsRow("handoff_number") },
      }
    : {
        id: "handoff",
        icon: "phone",
        title: "A person to hand off to",
        state: "waiting_you",
        required: false,
        sentence: "Give the receptionist a number to hand callers to when they insist on a person.",
        details: [],
        verb: { label: "Add a number", to: settingsRow("handoff_number") },
      };
}

/**
 * 5. WhatsApp — the number customers write to, and the messages Meta approved.
 */
function whatsappRow(i: SetupInputs, ctx: SetupRowContext): SetupRowDraft {
  const { wa, waReady, waNum, answering, nowMs } = ctx;
  if (waReady) {
    const t = i.templates;
    const metaWaits = t.approved === 0 && t.pending > 0;
    const cap = capabilityStatus("whatsapp", i, nowMs);
    const details = [
      wa.quality ? `Quality ${wa.quality.toLowerCase()}` : "",
      t.approved
        ? `${plural(t.approved, "approved message")}`
        : t.pending
          ? `${plural(t.pending, "message")} with Meta for approval`
          : "No approved messages yet",
      t.startersApproved < 5 ? "Add the starter messages: the reminder, how did it go, the win-back" : "",
      wa.lastInboundAt ? `Last message ${agoWords(Date.parse(wa.lastInboundAt), nowMs)}` : "",
    ].filter(Boolean);
    if (!metaWaits) details.push(activationWords(cap, nowMs));
    return {
      id: "whatsapp",
      icon: "chat",
      title: "WhatsApp",
      state: metaWaits ? "waiting_them" : "ready",
      stateWords: metaWaits ? "Waiting on Meta" : undefined,
      required: !answering,
      sentence: metaWaits
        ? `Connected on ${waNum} — your first messages are with Meta for approval.`
        : `Connected on ${waNum}.`,
      details,
      verb:
        cap.tested && !cap.live && !metaWaits
          ? { label: "Activate", to: "verb:activate:whatsapp" }
          : t.startersApproved < 5 && !metaWaits
            ? { label: "Add the starters", to: SEQUENCES_ROUTE }
            : { label: "Open the Inbox", to: "inbox" },
      undo: cap.live && !metaWaits ? { label: "Withdraw activation", to: "verb:deactivate:whatsapp" } : null,
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
      verb: { label: "Open Connections", to: "admin/integrations" },
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
    verb: { label: "Connect", to: "admin/integrations" },
  };
}

/**
 * Email — the business's own mailbox (decision 0073, R13): connected, the email people write to it comes into the
 * Inbox, six months of it with it; offered where this deployment connects one. A workspace that already has a hosted
 * address keeps it, said as before; no new one is offered (the hosted address is retired for new workspaces). Absent
 * where neither can work: a row never draws a verb that cannot. Never required: a workspace answers without it.
 */
function emailRow(i: SetupInputs, ctx: SetupRowContext): SetupRowDraft | null {
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
      sentence:
        own.state === "reconnect"
          ? `${own.address} signed out. Connect it again so email from people keeps coming into your Inbox.`
          : `Email people write to ${own.address} comes into your Inbox.`,
      details: [EMAIL_NOT_ANSWERED_SENTENCE],
      verb: {
        label: own.state === "reconnect" ? "Connect it again" : "Open the Inbox",
        to: own.state === "reconnect" ? "admin/integrations" : "inbox",
      },
    };
  if (!mb && sending && sending.providers.length > 0)
    return {
      id: "email",
      icon: "mail",
      title: "Email",
      state: "not_started",
      required: false,
      sentence:
        "Connect the mailbox customers write to. Six months of email from people comes into your Inbox, and new email arrives there.",
      details: [EMAIL_NOT_ANSWERED_SENTENCE],
      verb: { label: "Connect your mailbox", to: firstRunStepRoute("channels") },
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
      ...(mb.last_error ? [mb.last_error] : []),
      mb.last_received_at ? `Last email ${agoWords(Date.parse(mb.last_received_at), nowMs)}` : "Nothing received yet",
      EMAIL_ELSEWHERE_SENTENCE,
    ],
    verb: { label: "Open the Inbox", to: "inbox" },
  };
}

/** Setup's state for each of the calendar's (calendar-source.ts): what works is ready, what is the owner's waits on them. */
const SETUP_STATE_OF: Record<CalendarSourceState, SetupRowDraft["state"]> = {
  ready: "ready",
  attention: "waiting_you",
  needs_you: "waiting_you",
  waiting: "waiting_them",
  hand: "ready",
  none: "not_started",
};

/**
 * 6. Calendar — what is taken, so the receptionist offers real times. One answer for every page
 * (calendar-source.ts): the row read the link alone, so a business whose bookings arrive by email was asked
 * for an address its tool does not have, for good. The first email and "booked by hand" are said in the calendar's
 * own words: "Waiting on us" is true of neither.
 */
function calendarRow(i: SetupInputs): SetupRowDraft {
  const s = calendarSourceOf(calendarSourceFacts({ booking_link: i.business.bookingLink, ...i.calendar }));
  return {
    id: "calendar",
    icon: "calendar",
    title: "Calendar",
    state: SETUP_STATE_OF[s.state],
    ...(s.state === "waiting" || s.state === "hand" ? { stateWords: s.words } : {}),
    required: false,
    sentence: s.sentence,
    details: [],
    verb: s.next,
  };
}

/**
 * 7. Team and alerts — someone else who answers, and where alerts go.
 */
function teamRow(i: SetupInputs): SetupRowDraft {
  const t = i.team;
  const people = t.members > 1 || t.invitesOpen > 0;
  const who = `${plural(t.members, "person", "people")}${t.invitesOpen ? ` · ${plural(t.invitesOpen, "invite")} open` : ""}`;
  const alerts = t.alertEmails
    ? `alerts go to ${plural(t.alertEmails, "address", "addresses")}`
    : "no alert address yet";
  return {
    id: "team",
    icon: "users",
    title: "Team and alerts",
    state: people && t.alertEmails ? "ready" : !people && !t.alertEmails ? "not_started" : "waiting_you",
    required: false,
    sentence: people
      ? `${who}${t.partner ? ` · ${t.partner} is your partner` : ""} · ${alerts}.`
      : `Only you so far · ${alerts}.`,
    details: people ? [] : ["Invite someone who answers when you can't"],
    verb: !t.alertEmails
      ? { label: "Set alerts", to: "admin/notifications" }
      : !people
        ? { label: "Invite", to: "admin/team" }
        : { label: "Open Team", to: "admin/team" },
  };
}

/**
 * 8. The first yes to OFFERS — the only answer a promotional broadcast may be
 *    sent on. (A utility template reaches the conversational yes instead; this
 *    row is about the one that gates a promotion.)
 *
 * The OFFERS answer decides this row, because a marketing broadcast is what it
 * sends people to. The conversational count rides along as a detail when the
 * two answers differ, which is the common case and the useful one: "seven
 * answer you, none has said yes to offers" tells the owner exactly what to go
 * and ask for.
 *
 * Ready is a yes an offer can reach, and its number is that reach, in the
 * shorthand People and the send screen use. A yes with no number to send to is
 * the owner's to finish (#663's rule): People is where a number is added, and
 * the QR would ask for an answer they gave. Nobody's yes is the one to go and
 * get, and its door lands on the QR itself, as People's, Today's and
 * Playbooks' do.
 */
function yesRow(i: SetupInputs): SetupRowDraft {
  const offers = i.consent.offers;
  const said = i.consent.offersSaidYes;
  const talk = i.consent.yes;
  // Offers by email, where this workspace can send them: the people the rule lets one reach, which is not a yes they gave.
  const byEmail = i.consent.offers_by_email ?? 0;
  const alsoTalk = talk > said ? [`${plural(talk, "person", "people")} said yes to messages`] : [];
  const alsoEmail = byEmail > 0 ? [`${plural(byEmail, "person", "people")} can be sent an offer by email`] : [];
  return offers > 0 || byEmail > 0
    ? {
        id: "yes",
        icon: "tag",
        title: "The first yes",
        state: "ready",
        required: false,
        sentence:
          offers > 0
            ? `${plural(offers, "person", "people")} said yes to offers.`
            : `${plural(byEmail, "person", "people")} can be sent an offer by email.`,
        details: [...(offers > 0 ? alsoEmail : []), ...alsoTalk],
        verb: { label: "Get their yes", to: GET_YES_ROUTE },
      }
    : said > 0
      ? {
          id: "yes",
          icon: "tag",
          title: "The first yes",
          state: "waiting_you",
          required: false,
          sentence: `${plural(said, "person", "people")} said yes to offers, but nobody can be sent one yet — ${NO_NUMBER_REACH}.`,
          details: alsoTalk,
          verb: { label: "Open People", to: "clients" },
        }
      : {
          id: "yes",
          icon: "tag",
          title: "The first yes",
          state: "not_started",
          required: false,
          sentence: "Nobody has said yes to offers yet. The keyword and the QR are under Get their yes.",
          details: alsoTalk,
          verb: { label: "Get their yes", to: GET_YES_ROUTE },
        };
}

/**
 * 9. Your Google listing — public, found from the facts above; new reviews reach the bell and Reports.
 * Absent until this deployment can look listings up: a row must never draw a verb that cannot work.
 */
function googleRow(i: SetupInputs, ctx: SetupRowContext): SetupRowDraft | null {
  if (!i.google?.ready) return null;
  const { nowMs } = ctx;
  const g = i.google.listing;
  const title = "Your Google listing";
  const connected = i.google.connected === true;
  const reach = connected
    ? "Business Profile connected — every review, replies from Reports"
    : "New reviews reach your bell and Reports";
  // A Business Profile that stopped syncing (an authorisation lapsed, access withdrawn): new reviews stop and their
  // replies with them, and Setup said "connected" while only Connections, if opened, said otherwise (R11 S11-4). Said
  // here as Connections says it (connectionWords), with the way back.
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
      verb: { label: "Reconnect", to: "admin/integrations" },
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
      sentence: `${g.name} is on record, but Google could not be read${g.checked_at ? ` since ${agoWords(Date.parse(g.checked_at), nowMs)}` : " yet"} — it is read again once a day.`,
      details: [],
      verb: { label: "Open Reports", to: lensRoute("reviews") },
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
      verb: { label: "Open Reports", to: lensRoute("reviews") },
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
        i.business.address
          ? "Uses the name and address on record"
          : "Add your address in Settings › Details for a surer match",
      ],
      // One finder: the first run's Find, asked for by name (first-run.ts).
      verb: { label: "Find it", to: FIRST_RUN_FIND_ROUTE },
    };
  }
  // Only the profile door is open here: the listing arrives with the connection.
  return {
    id: "google",
    icon: "star",
    title,
    state: "not_started",
    required: false,
    sentence: "Connect your Google Business Profile so every review reaches you here.",
    details: ["Sign in to Google once, on Connections"],
    verb: { label: "Connect", to: "admin/integrations" },
  };
}

/**
 * 9b. Your clients (decision 0073, R22): the booking tool's client list, brought in once, so People starts with the real
 * customers. Opened from the first run's Where it answers, where the tool's own export steps are. Not drawn on a read
 * from before the imports ledger.
 */
function clientsRow(i: SetupInputs): SetupRowDraft | null {
  if (!i.imports) return null;
  const row = i.imports.find((r) => r.source === "clients_file") ?? null;
  const base = { id: "clients", icon: "users", title: "Your clients", required: false, details: [] as string[] };
  if (row?.state === "done")
    return {
      ...base,
      state: "ready",
      sentence: `${plural(row.counts.people ?? 0, "client")} brought in from ${viaWords(row.via) ? `${viaWords(row.via)}'s file` : "your file"}.`,
      verb: null,
    };
  if (row?.state === "failed")
    return {
      ...base,
      state: "waiting_you",
      sentence: row.last_error ?? "Bringing your clients in stopped part way. What came in is kept.",
      verb: { label: "Try again", to: firstRunStepRoute("channels") },
    };
  return {
    ...base,
    state: row?.state === "running" ? "waiting_them" : "not_started",
    sentence:
      row?.state === "running"
        ? "Bringing your clients in."
        : "Bring your client list from your booking tool, so People starts with your real customers.",
    verb: row?.state === "running" ? null : { label: "Bring your clients", to: firstRunStepRoute("channels") },
  };
}

/**
 * The table: every row in dependency order, each a decision over the inputs and the context. A builder answers
 * null for a row this deployment or workspace does not draw — billing behind a closed door, Try it before calls
 * are answered, email and Google until the deployment has them.
 */
const SETUP_ROWS: readonly SetupRowBuilder[] = [
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
  googleRow,
];

/** What the first run's Check reads beside the rows (SetupVM.check): the receptionist's state and Google's facts. */
const checkFactsOf = (i: SetupInputs): SetupVM["check"] => ({
  receptionist: i.business.receptionist,
  listed: !!i.google?.listing,
  unsure: i.google?.unsure ?? [],
  type: i.google?.type ?? null,
  bookingPage: bookingPageOffered(i.google?.bookingPage, i.business.bookingLink),
});

/**
 * A number the member chose to keep or move, with no forwarding saved for one yet, and "The number you already have"
 * never put off: the first run's Go live still owes its forwarding (first-run.ts stepDone). A new number owes none. A
 * put-off whose week ended still said the forwarding can wait, so the row back on Today does not reopen the step.
 */
const forwardingOwedOf = (i: SetupInputs, off: SetupPutOff): boolean =>
  !!i.want && i.want.way !== "new" && !forwardedLineOf(i.lines) && !setupPutOffEver(off, KEEP_ROW);

/** Setup's top line: a serious conflict first ("answering" and "answering correctly" differ), else what answers where. */
function readinessSentenceOf(i: SetupInputs, ctx: SetupRowContext): string {
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

/** Try it: the numbers that answer, to call or write from a phone; none while nothing answers. */
function tryItOf(ctx: SetupRowContext): SetupVM["tryIt"] {
  const { wa, voice, waReady, voiceReady, answering, waNum, voiceNum } = ctx;
  if (!answering) return null;
  return {
    voice: voiceReady ? voice.number : null,
    voiceLabel: voiceReady ? voiceNum : null,
    whatsapp: waReady ? wa.number : null,
    whatsappLabel: waReady ? waNum : null,
  };
}

/**
 * What the first run reads of Setup beside its rows (decision 0073): what can be found on Google, the member's own
 * put-offs and choices, the forwarding still owed, the rehearsal, Connect it to Google, and Check's facts. The first
 * run's own marks (its receptionist met, the rehearsal skipped, Where it answers seen, Google's connect put off) are
 * answers, written for good; each is read as put off at all (setupPutOffEver), so a step once done is never opened
 * again by a week that ended.
 */
function firstRunFactsOf(i: SetupInputs, ctx: SetupRowContext, off: SetupPutOff, nowMs: number) {
  const google = i.google;
  return {
    findable: !!google?.ready && google.places !== false && !google.listing,
    trySkipped: setupOffNow(off, TRY_SKIPPED, nowMs),
    remindSkipped: setupOffNow(off, REMIND_SKIPPED, nowMs),
    remindBack: setupBack(off, REMIND_SKIPPED, nowMs),
    dayBeforeOn: i.reminders?.day_before === true,
    forwardingOwed: forwardingOwedOf(i, off),
    receptionistMet: setupPutOffEver(off, RECEPTIONIST_MET),
    rehearseSkipped: setupPutOffEver(off, REHEARSE_SKIPPED),
    googleConnect: {
      offered:
        google?.profile === true &&
        !!google.listing &&
        !google.connected &&
        !setupPutOffEver(off, GOOGLE_CONNECT_LATER),
      connected: !!google?.connected,
      email: google?.connection?.google_email ?? null,
    },
    rehearsal: { reviewed: i.rehearsal?.reviewed ?? 0, kept: i.rehearsal?.kept ?? 0 },
    choices: i.choices ?? { whatsapp: null },
    want: i.want ?? null,
    lineUnderway: !!ctx.ownLine || ctx.voice.present || !!i.requests.line || !!i.requests.port,
    numbersHere: !!i.lines?.ready,
    channelsSeen: setupPutOffEver(off, CHANNELS_SEEN),
    calendarLinked: i.calendar.state !== "none",
    check: checkFactsOf(i),
  };
}

/**
 * The fold over SETUP_ROWS: the rows drawn, each with its state's words and whether this member has it put off or back
 * from a week put off; the readiness they add up to; the first open verb; and what the first run's Check reads beside
 * them.
 */
export function setupSteps(i: SetupInputs, nowMs = Date.now()): SetupVM {
  // A fixture written before rests carries none: no rows rest.
  const off: SetupPutOff = { later: i.later ?? [], rests: i.rests ?? {} };
  const ctx = rowContextOf(i, nowMs);
  const rows: SetupRowVM[] = [];
  for (const build of SETUP_ROWS) {
    const r = build(i, ctx);
    if (r)
      rows.push({
        ...r,
        stateWords: r.stateWords ?? SETUP_STATE_WORDS[r.state],
        later: !r.required && setupOffNow(off, r.id, nowMs),
        back: !r.required && setupBack(off, r.id, nowMs),
      });
  }

  const open = rows.filter((r) => r.state !== "ready" && !r.later);
  const nextRow = open.find((r) => r.verb) ?? null;
  const next =
    nextRow && nextRow.verb
      ? { label: nextRow.verb.label, to: nextRow.verb.to, row: nextRow.id, title: nextRow.title }
      : null;
  const done = rows.filter((r) => r.state === "ready").length;
  return {
    rows,
    readiness: { answering: ctx.answering, sentence: readinessSentenceOf(i, ctx) },
    next,
    done,
    total: rows.length,
    tryIt: tryItOf(ctx),
    ...firstRunFactsOf(i, ctx, off, nowMs),
  };
}
