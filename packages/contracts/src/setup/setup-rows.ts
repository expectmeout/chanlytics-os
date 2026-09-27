/**
 * Setup's rows — the decision table setupSteps folds, one builder per row, in the order the page draws them.
 * The phone's rows are setup-rows-phone.ts; the words, the DTO, the view model and the context every row reads
 * are setup.ts.
 *
 * Every row here is read from the workspace: the config, the channels, the
 * templates, the calendar feed, the team, the consent rows. Nothing stores a
 * "done" flag; a row is ready because the thing it names exists. "Later" is
 * the member's own (their saved view, on every device): it puts an optional
 * row off Today's card, and nothing else.
 */
import { CALENDAR_FEED_WORDS } from "../calendar/calendar";
import { agoWords } from "../shared/time";
import { bookingPageOffered, listingLine } from "../google/google";
import { dayWords, trialWords, TRIAL_COVERS, billingDoorOpen, BILLING_TEST_MODE_CLAUSE } from "../workspace/billing";
import { capabilityStatus } from "./capabilities";
import { EMAIL_ELSEWHERE_SENTENCE, EMAIL_NOT_ANSWERED_SENTENCE } from "../email/mailbox";
import { GET_YES_ROUTE, NO_NUMBER_REACH } from "../people/people";
import { FIRST_RUN_FIND_ROUTE } from "./first-run-route";
import {
  activationWords,
  plural,
  rowContextOf,
  BROKEN_CONFIG_WORDS,
  SETUP_STATE_WORDS,
  TRY_SKIPPED,
  type SetupInputs,
  type SetupRowBuilder,
  type SetupRowContext,
  type SetupRowDraft,
  type SetupRowVM,
  type SetupVM,
} from "./setup";
import { lineRow, receptionistRow, tryRow, keepRow } from "./setup-rows-phone";

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
      sentence: "Your receptionist is paused: messages land in the Inbox, nothing is answered.",
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
    verb: { label: none ? "Start in Business" : "Finish in Business", to: "admin/workspace" },
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
        verb: { label: "Change it", to: "admin/workspace" },
      }
    : {
        id: "handoff",
        icon: "phone",
        title: "A person to hand off to",
        state: "waiting_you",
        required: false,
        sentence: "Give the receptionist a number to hand callers to when they insist on a person.",
        details: [],
        verb: { label: "Add a number", to: "admin/workspace" },
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
      t.startersApproved < 5 ? "Add the starter messages: welcome, win-back, the month's offer" : "",
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
            ? { label: "Add the starters", to: "outbound" }
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
 * Email — an address customers write to, answered from the Inbox. Absent until this deployment has the
 * channel: a row must never draw a verb that cannot work. Never required: a workspace answers without it.
 */
function emailRow(i: SetupInputs, ctx: SetupRowContext): SetupRowDraft | null {
  if (!i.email?.ready) return null;
  const { nowMs } = ctx;
  const mb = i.email.mailbox;
  return mb
    ? {
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
          mb.last_received_at
            ? `Last email ${agoWords(Date.parse(mb.last_received_at), nowMs)}`
            : "Nothing received yet",
          EMAIL_ELSEWHERE_SENTENCE,
        ],
        verb: { label: "Open the Inbox", to: "inbox" },
      }
    : {
        id: "email",
        icon: "mail",
        title: "Email",
        state: "not_started",
        required: false,
        sentence: "Give customers an address to write to. Their emails arrive in your Inbox, and you reply from there.",
        details: [EMAIL_NOT_ANSWERED_SENTENCE],
        verb: { label: "Choose the address", to: "admin/integrations" },
      };
}

/**
 * 6. Calendar — what is taken, so the receptionist offers real times.
 */
function calendarRow(i: SetupInputs): SetupRowDraft {
  return i.calendar.state === "ok"
    ? {
        id: "calendar",
        icon: "calendar",
        title: "Calendar",
        state: "ready",
        required: false,
        sentence: `${CALENDAR_FEED_WORDS.ok} — the receptionist offers times from it.`,
        details: [],
        verb: { label: "Open Calendar", to: "calendar" },
      }
    : i.calendar.state === "unavailable"
      ? {
          id: "calendar",
          icon: "calendar",
          title: "Calendar",
          state: "waiting_you",
          required: false,
          sentence: `Your calendar could not be read. ${i.calendar.problem ? `${i.calendar.problem} ` : ""}Check the address in Settings › Business.`,
          details: [],
          verb: { label: "Check the address", to: "admin/workspace" },
        }
      : {
          id: "calendar",
          icon: "calendar",
          title: "Calendar",
          state: "not_started",
          required: false,
          sentence: "Paste your calendar's iCal address so the receptionist knows what is taken.",
          details: [],
          verb: { label: "Paste the address", to: "admin/workspace" },
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
  const alsoTalk =
    talk > said ? [`${plural(talk, "person", "people")} said yes to messages about their own visit`] : [];
  return offers > 0
    ? {
        id: "yes",
        icon: "tag",
        title: "The first yes",
        state: "ready",
        required: false,
        sentence: `${plural(offers, "person", "people")} said yes to offers.`,
        details: alsoTalk,
        verb: { label: "Open Broadcasts", to: "broadcasts" },
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
          sentence: "Nobody has said yes to offers yet. The keyword and the QR are on Broadcasts.",
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
      verb: { label: "Open Reports", to: "reports" },
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
      verb: { label: "Open Reports", to: "reports" },
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
          : "Add your address in Settings › Business for a surer match",
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
  teamRow,
  yesRow,
  googleRow,
];

/**
 * The fold over SETUP_ROWS: the rows drawn, each with its state's words and whether this member put it off; the
 * readiness they add up to; the first open verb; and what the first run's Check reads beside them.
 */
export function setupSteps(i: SetupInputs, nowMs = Date.now()): SetupVM {
  const later = new Set(i.later ?? []);
  const ctx = rowContextOf(i, nowMs);
  const { wa, voice, waReady, voiceReady, answering, waNum, voiceNum, texting } = ctx;
  const rows: SetupRowVM[] = [];
  for (const build of SETUP_ROWS) {
    const r = build(i, ctx);
    if (r)
      rows.push({
        ...r,
        stateWords: r.stateWords ?? SETUP_STATE_WORDS[r.state],
        later: !r.required && later.has(r.id),
      });
  }

  const open = rows.filter((r) => r.state !== "ready" && !r.later);
  const nextRow = open.find((r) => r.verb) ?? null;
  const next =
    nextRow && nextRow.verb
      ? { label: nextRow.verb.label, to: nextRow.verb.to, row: nextRow.id, title: nextRow.title }
      : null;
  const done = rows.filter((r) => r.state === "ready").length;
  const seriousConflict = (i.conflicts ?? []).find((k) => k.severity === "serious") ?? null;
  const sentence = seriousConflict
    ? // "Answering" and "answering correctly" are different claims, and the top
      // line of Setup is where an owner reads the second one.
      seriousConflict.sentence
    : waReady && voiceReady
      ? `Your receptionist answers calls on ${voiceNum} and WhatsApp on ${waNum}. ${texting.sentence}`
      : voiceReady
        ? `Your receptionist answers calls on ${voiceNum}. WhatsApp is not connected. ${texting.sentence}`
        : waReady
          ? `Your receptionist answers WhatsApp on ${waNum}. No phone line yet.`
          : "Your receptionist is not answering yet.";
  return {
    rows,
    readiness: { answering, sentence },
    next,
    done,
    total: rows.length,
    tryIt: answering
      ? {
          voice: voiceReady ? voice.number : null,
          voiceLabel: voiceReady ? voiceNum : null,
          whatsapp: waReady ? wa.number : null,
          whatsappLabel: waReady ? waNum : null,
        }
      : null,
    findable: !!i.google?.ready && i.google.places !== false && !i.google.listing,
    trySkipped: later.has(TRY_SKIPPED),
    check: {
      receptionist: i.business.receptionist,
      listed: !!i.google?.listing,
      unsure: i.google?.unsure ?? [],
      type: i.google?.type ?? null,
      bookingPage: bookingPageOffered(i.google?.bookingPage, i.business.bookingLink),
    },
  };
}
