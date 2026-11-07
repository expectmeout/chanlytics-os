/** Rows: channels. */

import { calendarSourceFacts, calendarSourceOf, type CalendarSourceState } from "../calendar-source";
import { agoWords } from "../../shared/time";
import { plural } from "../../shared/words";
import { connectionWords, listingLine } from "../../google/listing";
import { EMAIL_ELSEWHERE_SENTENCE, EMAIL_NOT_ANSWERED_SENTENCE } from "../../email/mailbox";
import { NO_NUMBER_REACH } from "../../people/lists/actions";
import { GET_YES_ROUTE } from "../../people/lists/people-route";
import { lensRoute } from "../../reports/lenses";
import { FIRST_RUN_FIND_ROUTE, firstRunStepRoute } from "../first-run-route";
import { viaWords } from "../../imports/csv";
import type { SetupInputs, SetupRowBuilder } from "../setup";
import type { SetupRowContext, SetupRowDraft } from "../lines";
import { lineRow, receptionistRow, tryRow, keepRow } from "../rows-phone";
import { billingRow, factsRow, handoffRow, whatsappRow } from "./business";

/**
 * Email — the business's own mailbox (decision 0073, R13): connected, the email people write to it comes into the
 * Inbox, and its last six months unless its owner chose from now on (0086); offered where this deployment connects
 * one. A workspace that already has a hosted address keeps it, said as before; no new one is offered (the hosted
 * address is retired for new workspaces). Absent where neither can work: a row never draws a verb that cannot. Never
 * required: a workspace answers without it.
 */
function emailRow(setupInputs: SetupInputs, ctx: SetupRowContext): SetupRowDraft | null {
  const { nowMs } = ctx;
  const mb = setupInputs.email?.mailbox ?? null;
  const sending = setupInputs.email?.sending ?? null;
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
function calendarRow(setupInputs: SetupInputs): SetupRowDraft {
  const calendarSource = calendarSourceOf(
    calendarSourceFacts({ booking_link: setupInputs.business.bookingLink, ...setupInputs.calendar }),
  );
  return {
    id: "calendar",
    icon: "calendar",
    title: "Calendar",
    state: SETUP_STATE_OF[calendarSource.state],
    ...(calendarSource.state === "waiting" || calendarSource.state === "hand"
      ? { stateWords: calendarSource.words }
      : {}),
    required: false,
    sentence: calendarSource.sentence,
    details: [],
    verb: calendarSource.next,
  };
}

/**
 * 7. Team and alerts — someone else who answers, and where alerts go.
 */
function teamRow(setupInputs: SetupInputs): SetupRowDraft {
  const team = setupInputs.team;
  const people = team.members > 1 || team.invitesOpen > 0;
  const person = `${plural(team.members, "person", "people")}${team.invitesOpen ? ` · ${plural(team.invitesOpen, "invite")} open` : ""}`;
  const alerts = team.alertEmails
    ? `alerts go to ${plural(team.alertEmails, "address", "addresses")}`
    : "no alert address yet";
  return {
    id: "team",
    icon: "users",
    title: "Team and alerts",
    state: people && team.alertEmails ? "ready" : !people && !team.alertEmails ? "not_started" : "waiting_you",
    required: false,
    sentence: people
      ? `${person}${team.partner ? ` · ${team.partner} is your partner` : ""} · ${alerts}.`
      : `Only you so far · ${alerts}.`,
    details: people ? [] : ["Invite someone who answers when you can't"],
    verb: !team.alertEmails
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
function yesRow(setupInputs: SetupInputs): SetupRowDraft {
  const offers = setupInputs.consent.offers;
  const sentence = setupInputs.consent.offersSaidYes;
  const talk = setupInputs.consent.yes;
  // Offers by email, where this workspace can send them: the people the rule lets one reach, which is not a yes they gave.
  const byEmail = setupInputs.consent.offers_by_email ?? 0;
  const alsoTalk = talk > sentence ? [`${plural(talk, "person", "people")} said yes to messages`] : [];
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
    : sentence > 0
      ? {
          id: "yes",
          icon: "tag",
          title: "The first yes",
          state: "waiting_you",
          required: false,
          sentence: `${plural(sentence, "person", "people")} said yes to offers, but nobody can be sent one yet — ${NO_NUMBER_REACH}.`,
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
function googleRow(setupInputs: SetupInputs, ctx: SetupRowContext): SetupRowDraft | null {
  if (!setupInputs.google?.ready) return null;
  const { nowMs } = ctx;
  const listing = setupInputs.google.listing;
  const title = "Your Google listing";
  const connected = setupInputs.google.connected === true;
  const reach = connected
    ? "Business Profile connected — every review, replies from Reports"
    : "New reviews reach your bell and Reports";
  // A Business Profile that stopped syncing (an authorisation lapsed, access withdrawn): new reviews stop and their
  // replies with them, and Setup said "connected" while only Connections, if opened, said otherwise (R11 S11-4). Said
  // here as Connections says it (connectionWords), with the way back.
  const connection = setupInputs.google.connection;
  if (connection?.sync_error) {
    return {
      id: "google",
      icon: "star",
      title,
      state: "waiting_you",
      required: false,
      sentence: `${connectionWords(connection, nowMs)}. New reviews and their replies wait until it is connected again.`,
      details: listing ? [listingLine(listing)] : [],
      verb: { label: "Reconnect", to: "admin/integrations" },
    };
  }
  if (listing && listing.check_error) {
    return {
      id: "google",
      icon: "star",
      title,
      state: "waiting_them",
      stateWords: "Waiting on Google",
      required: false,
      sentence: `${listing.name} is on record, but Google could not be read${listing.checked_at ? ` since ${agoWords(Date.parse(listing.checked_at), nowMs)}` : " yet"} — it is read again once a day.`,
      details: [],
      verb: { label: "Open Reports", to: lensRoute("reviews") },
    };
  }
  if (listing) {
    return {
      id: "google",
      icon: "star",
      title,
      state: "ready",
      required: false,
      sentence: `${listingLine(listing)}.`,
      details: [
        listing.checked_at ? `Checked ${agoWords(Date.parse(listing.checked_at), nowMs)}` : "Not read yet",
        reach,
      ],
      verb: { label: "Open Reports", to: lensRoute("reviews") },
    };
  }
  if (setupInputs.google.places !== false) {
    return {
      id: "google",
      icon: "star",
      title,
      state: "not_started",
      required: false,
      sentence: "Find your business on Google so new reviews reach you here.",
      details: [
        setupInputs.business.address
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
function clientsRow(setupInputs: SetupInputs): SetupRowDraft | null {
  if (!setupInputs.imports) return null;
  const row = setupInputs.imports.find((r) => r.source === "clients_file") ?? null;
  const details: string[] = [];
  const base = { id: "clients", icon: "users", title: "Your clients", required: false, details };
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
export const SETUP_ROWS: readonly SetupRowBuilder[] = [
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
