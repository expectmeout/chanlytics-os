/**
 * Connections — everything a workspace can be joined to, as one row shape.
 *
 * The Integrations page used to be three hand-built cards and a paragraph
 * of names "not yet". Every connection is the same question asked of the
 * same facts: can this deployment do it at all, where does this workspace
 * stand with it, what is the one sentence, what is the one verb, since
 * when. So every connection is one row, and "later" is a state a row can
 * be in rather than a list at the bottom. Setup says what to do next;
 * this says what is joined. Both derive from the same facts and cannot
 * disagree. Pure: the page feeds it window globals, the tests fixtures.
 */
import type { Tone } from "../shell/tone";
import { MESSAGES_ROUTE } from "../shell/address";
import { numberHealth } from "../broadcasts/broadcasts";
import { PHONE_LINE_OFF } from "../lines/caller-gets";
import { channelFor, type ChannelVM } from "../lines/channels";
import type { ConnectionNote } from "../lines/connection-note";
import { codeNotes, type LineCodeDto } from "../lines/line-codes";
import { standingNotes, standingRow } from "../lines/number-standing";
import { whatsappCostNotes } from "../lines/whatsapp-cost";
import { tryItNotes } from "../lines/whatsapp-try-it";
import type { GoogleListingDto, GoogleConnectionDto, GoogleAudience } from "../google/google";
import { googleAudienceWords } from "../google/audience";
import type { LineDto, SetupDto } from "./setup";
import { SETUP_STATE_WORDS, textingWords, SOLE_PROP_CEILING_SENTENCE, TEXTING_NEEDS_RECORD_SENTENCE } from "./setup";
import { ownLineStandOf } from "./setup-rows-phone";
import { agoWords, HOUR_MS } from "../shared/time";
import { checkedWords, connectionWords, listingLine } from "../google/google";
import { formatPhoneDisplay } from "../shared/phone";
import { bookingToolName } from "../calendar/booking-notice";
import { calendarSourceFacts, calendarSourceOf, type CalendarSourceState } from "./calendar-source";
import type { EmailSetupDto } from "../email/mailbox";
import { emailRow, instagramRow, mailboxRow } from "./connection-rows";
import { firstRunStepRoute, FIRST_RUN_FIND_ROUTE } from "./first-run-route";
import { importNotesOf, type ImportRowDto, type ImportSource } from "../imports/ledger";

export type ConnectionKind =
  | "whatsapp"
  | "phone"
  | "sms"
  | "google_listing"
  | "google_profile"
  | "calendar"
  | "instagram"
  | "email"
  | "mailbox"
  | "deposits";
export const CONNECTION_KINDS: readonly ConnectionKind[] = [
  "whatsapp",
  "phone",
  "sms",
  "google_profile",
  "google_listing",
  "calendar",
  "instagram",
  "email",
  "mailbox",
  "deposits",
];

/** Where the row sits: joined, joinable from here, or not built yet. */
export type ConnectionGroup = "connected" | "available" | "later";
/** Where this workspace stands with it. `attention` is joined but not working. */
export type ConnectionState = "connected" | "attention" | "off" | "waiting_you" | "waiting_them" | "none" | "later";
/** One of the product's six tones (tone.ts): a channel that waits on someone is "in progress", not "live". */
export type ConnectionTone = Tone;
/** Who may press the verb: an owner (team-level), or anyone who may approve (operators and owners). */
export type ConnectionWho = "owner" | "operator";

export interface ConnectionVerb {
  label: string;
  /** A route ("start", "messages") or a `verb:` id the page runs; the address itself where `href` is set. */
  to: string;
  who: ConnectionWho;
  /** A page of someone else's that mends the row (Meta's billing page for a WhatsApp account), opened in a new tab. */
  href?: string;
}

export interface ConnectionRow {
  kind: ConnectionKind;
  icon: string;
  title: string;
  /** The number, the account, the listing's address — what makes this row this workspace's. */
  detail: string | null;
  group: ConnectionGroup;
  state: ConnectionState;
  stateWords: string;
  tone: ConnectionTone;
  /** One line, in the owner's words, with "since" on every wait. */
  sentence: string;
  verb: ConnectionVerb | null;
  /** A second way to join, beside Connect: WhatsApp's keeping the Business app (coexistence, decision 0073, R12). */
  also?: ConnectionVerb;
  /** The page's own hook for the parts a row cannot say in one line: a choice of locations, a form. */
  body: "google_choose" | "business_record" | "email_setup" | "mailboxes" | null;
  /**
   * What the row says beside its sentence, each its own short line, with a link after it where there is somewhere to go: what Meta
   * will ask and what WhatsApp costs before Connect, what Meta holds about a connected number, how to try it, and what it costs,
   * the codes sent to the line. Empty for a row with none, which is nearly every row.
   */
  notes: ConnectionNote[];
}

export interface ConnectionInputs {
  /** The rows of tenant_channels as the page already shows them. */
  channels: ChannelVM[];
  /**
   * Meta's Embedded Signup: whether this deployment can start it, and whether its configuration offers keeping the
   * WhatsApp Business app (`keep_app`, coexistence). `undefined` = still asking.
   */
  whatsapp: { ready: boolean; reason: string | null; keep_app?: boolean } | null | undefined;
  lines: { rows: LineDto[]; ready: boolean };
  /** When the owner asked a person at Chanlytics for a line; null = never. */
  lineRequestedAt: string | null;
  google: {
    ready: { places: boolean; profile: boolean; audience?: GoogleAudience | null };
    listing: GoogleListingDto | null;
    connection: GoogleConnectionDto | null;
  } | null;
  /** The calendar as Setup is told it (SetupDto.calendar): the link's read, the tool named and its emails. */
  calendar: SetupDto["calendar"] | null;
  /** Email as Setup is told it (mailbox.ts); null or absent while Setup has not been read, or on a deployment without it. */
  email?: EmailSetupDto | null;
  /** The one-time codes sent to the workspace's own line lately (`GET lines/codes`); absent where none were read. */
  codes?: LineCodeDto[];
  /**
   * When a WhatsApp sign-up was started on this page and never came back to it (the instant the page's mark in
   * sessionStorage holds: Meta's window outlives a reload, and a reload takes with it the listener the window answers to);
   * null or absent where there is none. Said by the WhatsApp row for an hour, while the workspace has no number.
   */
  signupLeftOpenAt?: string | null;
  /** What each connection brought in (decision 0073, the imports ledger, SetupDto.imports); absent reads as nothing. */
  imports?: readonly ImportRowDto[] | null;
  /**
   * Whether this deployment can connect an Instagram account (the edge holds the app: decision 0001, step 8). Absent,
   * null or still asking (`undefined`) reads as not yet: the row says Later.
   */
  instagram?: { ready: boolean } | null;
}

const TONE: Record<ConnectionState, ConnectionTone> = {
  connected: "ok",
  attention: "warn",
  // A line that is off is drawn in the tone its standing value gives (lines/caller-gets.ts), here and wherever it is told.
  off: PHONE_LINE_OFF.tone,
  waiting_you: "info",
  waiting_them: "info",
  none: "plain",
  later: "plain",
};

const GROUP: Record<ConnectionState, ConnectionGroup> = {
  connected: "connected",
  attention: "connected",
  off: "connected",
  waiting_you: "available",
  waiting_them: "available",
  none: "available",
  later: "later",
};

const ORDER: Record<ConnectionKind, number> = {
  whatsapp: 0,
  phone: 1,
  sms: 2,
  google_profile: 3,
  google_listing: 4,
  calendar: 5,
  instagram: 6,
  email: 7,
  mailbox: 8,
  deposits: 9,
};

/** A row as a builder says it: the group, tone, body and notes are the fold's (row()) unless the builder sets them. */
export type ConnectionDraft = Omit<ConnectionRow, "group" | "tone" | "body" | "notes"> & {
  body?: ConnectionRow["body"];
  notes?: ConnectionNote[];
};
type Draft = ConnectionDraft;

function row(d: Draft): ConnectionRow {
  return { ...d, group: GROUP[d.state], tone: TONE[d.state], body: d.body ?? null, notes: d.notes ?? [] };
}

/** The texting states of a line, in the owner's words. The carriers' vocabulary stays out. */
export function smsStateRow(line: LineDto | null, nowMs: number): Draft {
  const num = line ? formatPhoneDisplay(line.e164) : null;
  const since = line ? agoWords(Date.parse(line.state_since), nowMs) : null;
  const base = { kind: "sms" as const, icon: "chat", title: "Texting", detail: num, verb: null };
  // A line that answers calls already has everything a text needs except
  // the carriers' permission, so it OFFERS texting rather than filing it
  // under "later" — which is what it did, so the one thing an owner could
  // do about it was invisible.
  const ready = line?.voice_state === "answering";
  if (ready && (!line?.sms_state || line.sms_state === "none")) {
    return {
      ...base,
      state: "waiting_you",
      stateWords: SETUP_STATE_WORDS.waiting_you,
      sentence: TEXTING_NEEDS_RECORD_SENTENCE,
      verb: { label: "Fill it in", to: "verb:business-record", who: "owner" },
      body: "business_record",
    };
  }

  // A filing made against the carriers' TEST registry, before any of the real
  // states below: it reports itself as approved, delivers nothing, and expires
  // in thirty days. This row used to read the state underneath it and tell the
  // owner their texting was days from switching itself on. `attention` is
  // exactly what it is -- joined, not working -- and the sentence is the one
  // Setup says, from one function, so the two pages cannot drift apart.
  if (line?.reg_mock) {
    return {
      ...base,
      state: "attention",
      stateWords: SETUP_STATE_WORDS.waiting_them,
      sentence: textingWords(line).sentence,
    };
  }
  switch (line?.sms_state) {
    case "active":
      // The narrow registration says so here too, from the same sentence Setup
      // uses: a workspace that can send about one message a second has to be
      // able to read that somewhere it will actually look.
      return {
        ...base,
        state: "connected",
        stateWords: "On",
        sentence: line?.reg_sole_prop
          ? `Customers text ${num ?? "this number"} and the receptionist answers inside your hours. ${SOLE_PROP_CEILING_SENTENCE}`
          : `Customers text ${num ?? "this number"}; the receptionist answers inside your hours.`,
      };
    case "approved":
      return {
        ...base,
        state: "waiting_them",
        stateWords: "Waiting on carriers",
        sentence: `Your business is approved. One last check on the line is with the carriers — usually days, and texting switches itself on${since ? `; approved ${since}` : ""}.`,
      };
    case "needs_record":
      // The pre-flight's own sentences when it has them, exactly as `rejected` and
      // `failed` two cases below already do. Gate 8's whole argument is that a
      // refusal must say what to fix; the edge duly writes "what is wrong AND what
      // to do" onto `last_error` — and this row threw it away and said "two
      // minutes, once" instead. For a workspace whose NAME does not match its
      // record, that sentence is also false twice over: the record is complete,
      // and the form it points at cannot fix the workspace's name.
      return line?.last_error
        ? {
            ...base,
            state: "waiting_you",
            stateWords: SETUP_STATE_WORDS.waiting_you,
            sentence: line.last_error,
            verb: { label: "Open the record", to: "verb:business-record", who: "owner" },
            body: "business_record",
          }
        : {
            ...base,
            state: "waiting_you",
            stateWords: SETUP_STATE_WORDS.waiting_you,
            sentence: TEXTING_NEEDS_RECORD_SENTENCE,
            verb: { label: "Fill it in", to: "verb:business-record", who: "owner" },
            body: "business_record",
          };
    case "otp_waiting":
      // REPLY to it, not type it. The carriers text the owner's own mobile and
      // the reply must come from that handset -- there is no code to bring back
      // here, and telling somebody to type one sends them looking for a field
      // that does not exist while a 24-hour window runs out.
      //
      // NO VERB, deliberately. This row used to offer "Send it again" pointing
      // at `verb:resend-otp`, which no page handles -- the click did nothing at
      // all, on the one row in this product where a person is against a
      // 24-hour clock. Resending needs a call whose shape cannot be confirmed
      // without a real sole-proprietor brand to make it against, and a brand
      // costs money and cannot be withdrawn. So the sentence says who does it
      // instead of pretending the owner can, and the button comes back the day
      // the endpoint is verified rather than the day somebody thinks the row
      // looks bare.
      return {
        ...base,
        state: "waiting_you",
        stateWords: SETUP_STATE_WORDS.waiting_you,
        sentence:
          "The carriers texted your mobile — reply to that message from the handset itself and texting switches on. There is nothing to type here. The code lasts a day; if it runs out, Chanlytics asks the carriers for another.",
      };
    case "registering":
    case "hosting":
      return {
        ...base,
        state: "waiting_them",
        stateWords: "Waiting on carriers",
        sentence: `The carriers are registering your line, since ${since} · usually a week.`,
      };
    case "rejected":
      // NO "resubmit" VERB, and for the same reason `otp_waiting` above has none:
      // the button did not work. Gate 6 put resubmitting behind `platform_admins`
      // on purpose — a rejection needs somebody who can read what the carriers
      // said — so `refile: true` is never sent by the owner's route, and an owner
      // who corrected their record and pressed "Fix and resubmit" got "The
      // carriers did not answer" about a message the carriers had explicitly sent.
      //
      // Correcting the record IS still theirs, and it is the thing that unblocks
      // the resubmit, so the row still opens the form — it just no longer claims
      // that pressing File sends it, and it says who does.
      return {
        ...base,
        state: "attention",
        stateWords: "Sent back",
        sentence: `The carriers sent the registration back${line?.last_error ? `: ${line.last_error}` : ""}. Correct what they named and Chanlytics sends it again — resubmitting is ours to do, and it costs nothing.`,
        verb: { label: "Open the record", to: "verb:business-record", who: "owner" },
        body: "business_record",
      };
    case "failed":
      return {
        ...base,
        state: "attention",
        stateWords: SETUP_STATE_WORDS.waiting_them,
        sentence: line?.last_error || "Registering stopped. A person at Chanlytics has it.",
      };
    default:
      return {
        ...base,
        state: "later",
        stateWords: "Later",
        sentence:
          "Plain text messages — arrives with a line that registers with the carriers; this page will say when.",
      };
  }
}

/**
 * What the rows are drawn from, found once: the channel rows that speak for WhatsApp and the phone, the workspace's
 * own line (the phone row and the texting row both read it), Google's connection and listing (the listing's verb
 * reads the connection), and the clock.
 */
interface ConnectionFacts {
  nowMs: number;
  wa: ChannelVM | null;
  voice: ChannelVM | null;
  ig: ChannelVM | null;
  own: LineDto | null;
  connection: GoogleConnectionDto | null;
  listing: GoogleListingDto | null;
}

function connectionFactsOf(i: ConnectionInputs, nowMs: number): ConnectionFacts {
  // `channelFor`, not `.find`: a workspace that released a line keeps its disabled
  // voice row beside the new active one, and an arbitrary pick between them draws
  // "Off" over a channel that is answering.
  const channel = (kind: string) => channelFor(i.channels, kind);
  return {
    nowMs,
    wa: channel("whatsapp"),
    voice: channel("voice"),
    ig: channel("instagram"),
    own: i.lines.rows.find((l) => l.provider !== "carrier") ?? null,
    connection: i.google?.connection ?? null,
    listing: i.google?.listing ?? null,
  };
}

/**
 * The one thing to do while Meta's window is open: a reload takes with it the listener the window answers to, and the one-time code
 * the window hands back has nowhere to go (6 October, 12:11 to 12:48 UTC: a sign-up Meta finished and Chanlytics never heard).
 */
const KEEP_SIGNUP_PAGE_OPEN = "Keep this page open until Meta's window closes.";

/**
 * Where the code Meta texts to the number arrives, said with the one thing to do while its window is open (the code is what the owner
 * waits for there). On the workspace's own Chanlytics line the text reaches the Texting row, and a call would be answered by the
 * receptionist, so the owner chooses a text; a number of the business's own is the phone in its hand.
 */
function signupCodeNote(own: ConnectionFacts["own"]): ConnectionNote {
  const line = own?.e164 ? formatPhoneDisplay(own.e164) : null;
  return {
    text: line
      ? `Meta texts a code to the number. If it is your Chanlytics number, ${line}, the code shows here on the Texting row: choose Text message, not Phone call. ${KEEP_SIGNUP_PAGE_OPEN}`
      : `Meta texts a code to the number: have its phone at hand. ${KEEP_SIGNUP_PAGE_OPEN}`,
  };
}

/**
 * What Meta's sign-up window asks of the owner, said before it opens, in the order the owner meets it: the sign-in, the code texted
 * to the number (and to keep the page open while it is awaited), and what WhatsApp costs and who bills it (Chanlytics is a Tech
 * Provider: Meta bills the business, to its own card, for the messages it starts, so the card Meta asks for at the end is said
 * with the cost). Three lines: a row says one thing at a time, and what a new business may start in a day is the connected row's
 * to say (number-standing.ts), where it is read from Meta and not assumed.
 */
function whatsappConnectNotes(own: ConnectionFacts["own"]): ConnectionNote[] {
  return [
    { text: "Meta asks you to sign in with Facebook and choose or create your business." },
    signupCodeNote(own),
    ...whatsappCostNotes(),
  ];
}

/** How long the mark a sign-up leaves is taken for a sign-up somebody is still finishing at Meta's. */
const SIGNUP_LEFT_OPEN_WITHIN_MS = HOUR_MS;

/**
 * What the Connect row says of a sign-up that was started on this page and did not come back to it. A reload cannot get the
 * code back (it rides the SDK's own callback), so the way on is to press Connect again and choose the account Meta already made.
 */
const SIGNUP_LEFT_OPEN_NOTE =
  "A WhatsApp sign-up was started here and did not come back to Chanlytics — if you finished it in Meta's window, press Connect WhatsApp again and choose the WhatsApp account Meta already made.";

/** The left-open note, while the mark is under an hour old (a mark in the future, or one that is no time, is no sign-up anyone is waiting on). */
function signupLeftOpenNotes(startedAt: string | null | undefined, nowMs: number): ConnectionNote[] {
  const age = startedAt ? nowMs - Date.parse(startedAt) : Number.NaN;
  return age >= 0 && age < SIGNUP_LEFT_OPEN_WITHIN_MS ? [{ text: SIGNUP_LEFT_OPEN_NOTE, live: true }] : [];
}

/** Keeping the WhatsApp Business app (coexistence, decision 0073, R12, R21): Meta's own flow, beside Connect. */
const KEEP_APP_VERB: ConnectionVerb = {
  label: "Keep the WhatsApp Business app",
  to: "verb:whatsapp-connect-keep",
  who: "owner",
};
const KEEP_APP_NOTE: ConnectionNote = {
  text: "Already answering on the WhatsApp Business app? Keep the app: you go on using it, the receptionist answers what you don't, and your contacts and last six months of chats come in if you share them in the app.",
};

/** The WhatsApp row's own verb: the Library, what the receptionist and the campaigns send on the number. */
const LIBRARY: ConnectionVerb = { label: "Messages", to: MESSAGES_ROUTE, who: "operator" };

/**
 * The row of a connected number. What Meta holds against it comes first (channel.standing, 00338, in contracts' words: a
 * payment method missing or failing is "Payment needed", a number Meta has stopped for anything else "Needs attention", each
 * with the one act that mends it, a page of Meta's), else its rating (a flagged number is the "joined but not working" the
 * attention state exists for), else on. The notes say what changes what the owner can do, and no more (standingNotes). A row
 * says one daily limit, the quality webhook's once Meta has sent one, else the tier the standing read: in the sentence where
 * the rating is known, in the verification's note where it is not. A switched-off number says nothing of Meta's.
 */
function whatsappNumberRow(base: Pick<Draft, "kind" | "icon" | "title">, wa: ChannelVM, nowMs: number): Draft {
  const row = { ...base, detail: wa.number };
  if (!wa.on) return { ...row, state: "off", stateWords: "Off", sentence: wa.healthLabel, verb: LIBRARY };
  const limit = wa.messagingLimit ?? wa.standing?.limit ?? null;
  const standing = wa.standing && { ...wa.standing, limit };
  if (standing) {
    const stood = standingRow(standing);
    if (stood)
      return {
        ...row,
        state: "attention",
        stateWords: stood.stateWords,
        sentence: stood.sentence,
        verb: stood.act ? { label: stood.act.label, to: stood.act.href, href: stood.act.href, who: "owner" } : null,
        // A number Meta lets send still answers the customer who writes first while it waits on its owner's card (Meta
        // holds back only what the business starts), and a new account waits so the moment it connects: the way to try it
        // is said here too. A BLOCKED number answers nobody, so it is not one to try (standingRow says the same of it).
        notes: [
          ...(standing.can_send === "BLOCKED" ? [] : tryItNotes(wa, nowMs)),
          ...standingNotes(standing, { limitSaid: false }),
        ],
      };
  }
  const h = numberHealth({ quality: wa.quality, event: wa.qualityEvent, limit });
  const flagged = h.tone === "danger";
  const health = h.tone !== "unknown" ? ` · ${h.label}` : "";
  return {
    ...row,
    state: flagged ? "attention" : "connected",
    stateWords: flagged ? "Needs attention" : "On",
    sentence: `${wa.healthLabel}${health}`,
    verb: LIBRARY,
    // How to try it from a phone, first, on a row nobody has written to yet; then what Meta holds that the owner can act on.
    notes: [
      ...(flagged ? [] : tryItNotes(wa, nowMs)),
      ...standingNotes(standing, { limitSaid: h.tone !== "unknown" && h.limitPerDay !== null }),
    ],
  };
}

/** WhatsApp: the channel row when there is one; Meta's door when there is not. */
function whatsappRow(i: ConnectionInputs, { wa, own, nowMs }: ConnectionFacts): Draft {
  const base = { kind: "whatsapp" as const, icon: "chat", title: "WhatsApp Business" };
  if (wa) return whatsappNumberRow(base, wa, nowMs);
  if (i.whatsapp === undefined) {
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not connected",
      sentence: "Checking whether Chanlytics can connect a number…",
      verb: null,
    };
  }
  if (i.whatsapp?.ready) {
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not connected",
      sentence:
        "Sign in to Meta, pick the number, and the receptionist answers on it. Nothing here touches a phone line.",
      verb: { label: "Connect WhatsApp", to: "verb:whatsapp-connect", who: "owner" },
      ...(i.whatsapp.keep_app ? { also: KEEP_APP_VERB } : {}),
      notes: [
        ...signupLeftOpenNotes(i.signupLeftOpenAt, nowMs),
        ...(i.whatsapp.keep_app ? [KEEP_APP_NOTE] : []),
        ...whatsappConnectNotes(own),
      ],
    };
  }
  const why =
    i.whatsapp?.reason === "no_config_id"
      ? " — the Embedded Signup configuration is missing on the Chanlytics side"
      : i.whatsapp?.reason === "preview"
        ? " — only on the production dashboard"
        : "";
  return {
    ...base,
    detail: null,
    state: "none",
    stateWords: "Not connected",
    sentence: `Chanlytics isn't set up to connect numbers yet${why}.`,
    verb: null,
  };
}

/** The phone line: the voice channel, or where getting one stands. */
function phoneRow(i: ConnectionInputs, { voice, own, nowMs }: ConnectionFacts): Draft {
  const base = { kind: "phone" as const, icon: "phone", title: "Phone line" };
  if (voice) {
    return {
      ...base,
      detail: voice.number,
      state: voice.on ? "connected" : "off",
      stateWords: voice.on ? "On" : "Off",
      sentence: voice.healthLabel,
      verb: null,
    };
  }
  // The own line from bought to answering, as Start's row says it (ownLineStandOf): stuck past its deadline, still setting up,
  // stopped at the vault (no Retry that cannot help) or elsewhere (Retry, in place). Its number is the row's detail.
  const stand = own ? ownLineStandOf(own, nowMs, null) : null;
  if (own && stand && stand.kind !== "connecting") {
    return {
      ...base,
      detail: formatPhoneDisplay(own.e164),
      state: "waiting_them",
      stateWords: SETUP_STATE_WORDS.waiting_them,
      sentence: [stand.sentence, ...stand.details.slice(0, 1).map((d) => `${d}.`)].join(" "),
      verb: stand.retry ? { label: "Retry", to: stand.retry, who: "owner" } : null,
    };
  }
  if (i.lineRequestedAt) {
    return {
      ...base,
      detail: null,
      state: "waiting_them",
      stateWords: SETUP_STATE_WORDS.waiting_them,
      sentence: `Requested ${agoWords(Date.parse(i.lineRequestedAt), nowMs)} — a person at Chanlytics will set up your line with you and reach you by email.`,
      verb: null,
    };
  }
  if (i.lines.ready) {
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not connected",
      sentence: "Get a number the receptionist answers, or keep the one you have.",
      verb: { label: "Get a line", to: firstRunStepRoute("channels"), who: "owner" },
    };
  }
  return {
    ...base,
    detail: null,
    state: "none",
    stateWords: "Not connected",
    sentence: "We set up your phone line with you.",
    verb: { label: "Ask for a line", to: firstRunStepRoute("channels"), who: "owner" },
  };
}

/**
 * Texting: where the workspace's own line stands with the carriers, and the one-time codes sent to it lately (Meta's, when
 * the owner connects that number to WhatsApp), which no one else will ever see: a line the business kept at its carrier
 * has no texts of ours, so it has no notes.
 */
function smsRow(i: ConnectionInputs, { own, nowMs }: ConnectionFacts): Draft {
  return { ...smsStateRow(own, nowMs), notes: own ? codeNotes(i.codes ?? [], nowMs) : [] };
}

/** Google: the owner's Business Profile, then the public listing (googleListingRow). */
function googleProfileRow(i: ConnectionInputs, { connection: c, nowMs }: ConnectionFacts): Draft {
  const g = i.google;
  const base = { kind: "google_profile" as const, icon: "shield", title: "Google Business Profile" };
  if (c && c.location_name) {
    return {
      ...base,
      detail: c.location_title,
      state: c.sync_error ? "attention" : "connected",
      stateWords: c.sync_error ? "Could not sync" : "Connected",
      sentence: connectionWords(c, nowMs),
      verb: { label: "Disconnect", to: "verb:google-disconnect", who: "owner" },
    };
  }
  if (c) {
    return {
      ...base,
      detail: null,
      state: "waiting_you",
      stateWords: SETUP_STATE_WORDS.waiting_you,
      sentence: `${connectionWords(c, nowMs)}.`,
      verb: null,
      body: "google_choose",
    };
  }
  if (g?.ready.profile) {
    const note = googleAudienceWords(g.ready.audience);
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not connected",
      sentence: `Sign in to Google once; every review and the right to answer them follow.${note ? ` ${note}` : ""}`,
      verb: { label: "Connect Google", to: "verb:google-connect", who: "owner" },
    };
  }
  return {
    ...base,
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "Every review and the replies you send from Reports arrive with the Business Profile connection.",
    verb: null,
  };
}

/** Google's public listing: watched once it is found; with the Business Profile connected, a read is a sync. */
function googleListingRow(i: ConnectionInputs, { connection: c, listing: l, nowMs }: ConnectionFacts): Draft {
  const g = i.google;
  const base = { kind: "google_listing" as const, icon: "star", title: "Your listing on Google" };
  if (l) {
    return {
      ...base,
      detail: l.address,
      state: l.check_error ? "attention" : "connected",
      stateWords: l.check_error ? "Could not be read" : "Watched",
      sentence: `${listingLine(l)} · ${checkedWords(l, nowMs)}`,
      verb: { label: c && c.location_name ? "Sync now" : "Check now", to: "verb:google-check", who: "operator" },
    };
  }
  if (g?.ready.places) {
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not watched",
      sentence: "Find it from the name and address on record; new reviews then reach your bell and Reports.",
      verb: { label: "Find it", to: FIRST_RUN_FIND_ROUTE, who: "owner" },
    };
  }
  return {
    ...base,
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "Your public listing on Google Maps, read once a day for new reviews.",
    verb: null,
  };
}

/** The calendar: the feed the receptionist reads today. */
function calendarRow(i: ConnectionInputs): Draft {
  const s = calendarSourceOf(calendarSourceFacts(i.calendar ?? { state: "none" }));
  const tool = bookingToolName(i.calendar?.tool);
  // What makes the row this workspace's: the tool it books with, the link it reads, or both. A business that books by
  // hand has neither, and its own word is the row's state: said here too, the row read "Booked by hand" twice, beside
  // its name and in its pill (seen on a real save, 8 Oct 2026).
  // A calendar read through the mailbox (decision 0073, R20) names its provider's calendar, never "link".
  const granted = i.calendar?.granted ? `${i.calendar.source ?? "Your calendar"} · through your mailbox` : null;
  const DETAIL = {
    both: `${tool} · ${granted ?? "calendar link"}`,
    link: granted ?? "Calendar link",
    emails: tool,
    hand: null,
    nothing: null,
  };
  const detail = DETAIL[s.by];
  return {
    kind: "calendar",
    icon: "calendar",
    title: "Calendar",
    detail,
    state: CONNECTION_STATE_OF[s.state],
    stateWords: s.words,
    sentence: s.sentence,
    // Opening the board is anyone's who may read it; the row in Settings is the owner's to change.
    verb: { ...s.next, who: s.next.to === "calendar" ? "operator" : "owner" },
  };
}

/** A connection's state for each of the calendar's (calendar-source.ts). A business that books by hand has none, by its own word. */
const CONNECTION_STATE_OF: Record<CalendarSourceState, ConnectionState> = {
  ready: "connected",
  attention: "attention",
  needs_you: "waiting_you",
  waiting: "waiting_them",
  hand: "none",
  none: "none",
};

/** Deposits: not built yet, so always later. */
function depositsRow(): Draft {
  return {
    kind: "deposits",
    icon: "money",
    title: "Deposits",
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "Deposits and payments taken by the receptionist.",
    verb: null,
  };
}

type ConnectionRowBuilder = (i: ConnectionInputs, facts: ConnectionFacts) => Draft;

/** One builder per connection, in the page's order (ORDER): each says where this workspace stands with it. */
const ROW_BUILDERS: readonly ConnectionRowBuilder[] = [
  whatsappRow,
  phoneRow,
  smsRow,
  googleProfileRow,
  googleListingRow,
  calendarRow,
  instagramRow,
  emailRow,
  mailboxRow,
  depositsRow,
];

/**
 * The sources of the imports ledger each connection brought (decision 0073, R23): Google's reviews on the profile, the
 * visits and the clients' file on the calendar (the booking tool's own), the mail and the contacts on the mailbox, and
 * WhatsApp's contacts and chats on WhatsApp.
 */
const BROUGHT_BY: Readonly<Partial<Record<ConnectionKind, readonly ImportSource[]>>> = {
  google_profile: ["google_reviews"],
  calendar: ["calendar", "clients_file"],
  mailbox: ["mailbox", "contacts"],
  whatsapp: ["whatsapp_contacts", "whatsapp_history"],
};

/**
 * One row for email (the mailbox canvas, 27 Oct 2026): with a mailbox connected, the hosted address is its backup, said
 * in the mailbox's sheet, so the Email row folds into the mailbox's, which takes its name. A hosted address that could
 * not take an email in keeps its own row, to say so.
 */
function foldEmail(rows: ConnectionRow[], i: ConnectionInputs): ConnectionRow[] {
  if (!i.email?.sending?.mailboxes.length) return rows;
  const hosted = rows.find((r) => r.kind === "email");
  if (hosted?.state === "attention") return rows;
  return rows
    .filter((r) => r.kind !== "email")
    .map((r) => (r.kind === "mailbox" ? { ...r, title: "Email", icon: "mail" } : r));
}

/** The fold over ROW_BUILDERS: every connection's row, drawn from one set of facts, in the page's order. */
export function connectionRows(i: ConnectionInputs, nowMs = Date.now()): ConnectionRow[] {
  const facts = connectionFactsOf(i, nowMs);
  const rows = ROW_BUILDERS.map((build) => {
    const r = row(build(i, facts));
    const brought = importNotesOf(BROUGHT_BY[r.kind], i.imports);
    return brought.length ? { ...r, notes: [...r.notes, ...brought] } : r;
  }).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  return foldEmail(rows, i);
}

export const CONNECTION_GROUP_WORDS: Record<
  ConnectionGroup,
  { title: string; sub: (rows: ConnectionRow[]) => string }
> = {
  connected: {
    title: "Connected",
    sub: (rows) => {
      const bad = rows.filter((r) => r.state !== "connected").length;
      return `${rows.length} connected${bad ? ` · ${bad} need${bad === 1 ? "s" : ""} attention` : ""}`;
    },
  },
  available: {
    title: "Available",
    sub: (rows) =>
      rows.some((r) => r.state === "waiting_you")
        ? "something here waits on you"
        : rows.some((r) => r.state === "waiting_them")
          ? "in progress"
          : "ready when you are",
  },
  later: { title: "Later", sub: () => "not yet: nothing here is connected" },
};
