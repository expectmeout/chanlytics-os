/** Setup: lines. */

import type { SchemaSet } from "../shared/schema-sets";
import { lineCredentialFailure } from "../lines/failure";
import type { FactConflict } from "../config/facts";
import { agoWords, MIN_MS } from "../shared/time";
import type { SetupGoogleFacts } from "../google/listing";
import type { SetupBillingFacts } from "../workspace/billing/checkout";
import { SOLE_PROP_LIMITS } from "../lines/registration-path";
import type { ActivationRecord } from "./capabilities";
import type { EmailSetupDto } from "../email/mailbox";
import type { ReceptionistState } from "../config/workspace-config/config-schema";
import type { ImportRowDto } from "../imports/ledger";
import type { BusinessReadDto } from "../imports/business-reads";

export interface SetupDto {
  business: {
    name: string | null;
    hours: boolean;
    services: number;
    bookingLink: boolean;
    address: boolean;
    /** The number the phone receptionist warm-transfers to, E.164. */
    handoff: string | null;
    /**
     * The business's own phone greeting as stored, {business} unfilled (decision 0051), or null for the standard one.
     * Optional: a server older than the field answers without it, and the first run then says the standard greeting.
     */
    phone_greeting?: string | null;
    /** The config row exists but the parser refused it. */
    broken: boolean;
    /** Whether the receptionist is set up, by the one test (config.ts personReceptionistOf): none, set, or broken. */
    receptionist: ReceptionistState;
  };
  channels: {
    whatsapp: {
      present: boolean;
      active: boolean;
      number: string | null;
      quality: string | null;
      lastInboundAt: string | null;
    };
    voice: { present: boolean; active: boolean; number: string | null; lastInboundAt: string | null };
  };
  /** Email: whether this deployment has the channel, and the workspace's mailbox when it has one (mailbox.ts). Absent reads as off. */
  email?: EmailSetupDto;
  templates: { approved: number; pending: number; startersApproved: number };
  /**
   * What the calendar is fed by, as the one rule reads it (calendar-source.ts): the link's last read, the
   * booking tool the owner named and what is known of its emails, and the owner's word that they book by hand. The
   * parts after `problem` are absent on a read from before them, which then says what the link alone says.
   */
  calendar: {
    state: "ok" | "unavailable" | "none";
    problem?: string | null;
    /** The latest read failed, and the one stated is the last good one. */
    stale?: boolean;
    tool?: string | null;
    by_hand?: boolean;
    emails?: { address: boolean; forwarding: boolean; last_at: string | null; held: number } | null;
    /** Whether the receptionist has a booking link to send. */
    booking_link?: boolean;
    /**
     * Read through a connected mailbox (decision 0073, R20) rather than a link, and the calendar it is ("Google
     * Calendar", "Outlook"). Absent on a read from before it.
     */
    granted?: boolean;
    source?: string | null;
  };
  team: {
    /**
     * Who answers: every member but the partner who brought the workspace (0012), who sits on its team to set it up and
     * is no one to back the owner up. Counted so on both reads, the member's and the back office's.
     */
    members: number;
    invitesOpen: number;
    alertEmails: number;
    /** The partner who brought the workspace and sits on its team (0012), by name; the member's read alone carries it. */
    partner?: string | null;
  };
  /**
   * The routine messages around a visit that already run: a day-before reminder is a running step on the visit_tomorrow
   * moment (packages/db listRunningStepsOn), and the routes refuse a second (playbook-row.ts findVisitTwinRefusal), so Today's
   * card stops offering one. Absent on a read from before it, or where it could not be read: the card offers, and the
   * route is still the door that refuses.
   */
  reminders?: { day_before: boolean };
  /**
   * The two answers, counted separately.
   *
   * `yes` is the conversational one -- they answer and they hear about their own
   * visit. `offers` is the promotional one, and it is the ONLY one that puts a
   * person on a marketing broadcast. This row used to read `yes` and say "said
   * yes to offers", so a workspace with seven people who had texted START was
   * told it had seven people it could send an offer to, and the composer then
   * refused all seven.
   *
   * `offers` is who a promotional broadcast REACHES: that yes, and a number to
   * send it to (`mayReceive`). `offersSaidYes` is everyone who gave the answer,
   * a number or not (`saidYesTo`), so `offers` is never larger. A zero reach has
   * two causes and only one is a missing yes: someone who has only ever emailed,
   * or a walk-in recorded with a yes and no number, said it and cannot be sent
   * an offer. Read from `offers` alone, the row told that owner nobody had said
   * yes, and sent them to the QR for an answer they had (#663's rule).
   *
   * Counted from the columns, not by reachFor: an offer goes by WhatsApp whatever else the workspace can send on (texts
   * carry none: reach-for.ts channelNeverCarries), so a number is the way to reach them, and the WhatsApp row above says
   * whether the number can send. Offers by email have their own arm, `offers_by_email`: the people an offer by email reaches
   * (an address that has not stopped, no unsubscribe, and their own yes to offers by email or a relationship on record:
   * the rule, consent.ts mayMessageFor), counted by the database (offers_email_reach) only while this workspace can send
   * them (email-offers.ts: the campaigns domain verified, the business's address on file, no pause). Absent while it
   * cannot, or where the count could not be read, and never a zero standing in for either.
   */
  consent: { yes: number; offers: number; offersSaidYes: number; offers_by_email?: number };
  /**
   * Facts that disagree with what the platform knows (contracts/facts.ts).
   *
   * The checklist called Business facts "ready" on a workspace whose
   * receptionist was publishing the number it transfers to instead of the line
   * it answers -- because "ready" only ever meant "the fields are filled in",
   * and nothing compared a filled-in field to anything. A checklist that says
   * ready while a customer-facing fact is wrong is worse than no checklist.
   */
  conflicts?: FactConflict[];
  /**
   * What the owner has asked a person at Chanlytics for, and when: the newest
   * ask of each thing (00123 added bringing a number and a repair). Optional
   * beyond the line, so a reader built before them still parses.
   */
  requests: { line: string | null; port?: string | null; repair?: string | null; forwarding?: string | null };
  /** The workspace's own lines, and whether this deployment can get one. */
  lines?: { rows: LineDto[]; ready: boolean; provider: string | null; costs: { local_number_month_usd: number } };
  /** The business on Google: whether it can be found here, and the listing once it is. */
  google?: SetupGoogleFacts;
  /** How the workspace pays, when it pays by card and this deployment can charge. */
  billing?: SetupBillingFacts;
  /** The owner's activations (00108), one per capability, as recorded. */
  activations?: ActivationRecord[];
  /**
   * The rehearsals (decision 0069): the conversations reviewed (rehearsed, typed or a real call), the changes kept from
   * them, and when the newest was made. The first run's Rehearse step is done at the first review (decision 0073).
   * Absent on a read from before them, which reads as none.
   */
  rehearsal?: { reviewed: number; kept: number; last_at: string | null };
  /** What was brought in, one row per source (decision 0073, the imports ledger). Absent reads as nothing yet. */
  imports?: ImportRowDto[];
  /** What the Business Profile and the website said, for Check to offer (decision 0073, R10, R17). Absent: none read. */
  reads?: BusinessReadDto[];
  /** How many people the workspace holds (decision 0073: the dashboard filling in, Live's yes count); absent where unread. */
  people?: number;
  /**
   * What the first run chose for the workspace (setup_choices, 00513, decision 0091): the number and how calls reach it,
   * where WhatsApp answers, and the marks that say a step was done. The same for every member and the back office;
   * absent on a server or a database from before it, which reads the member's own view instead (setupSteps).
   */
  workspace_choices?: SetupWorkspaceChoicesDto | null;
}

/** The workspace's setup choices as the wire carries them: the shapes contracts reads (setupPhoneWantOf, setupChoicesOf). */
export interface SetupWorkspaceChoicesDto {
  /**
   * The number chosen and how calls reach it (setupPhoneWantOf), as the database keeps it (jsonb), as any build wrote
   * it, which each reader takes apart as it reads it: the surface cache's fingerprint leaves it out
   * (tooling/scripts/gen/surface-shapes.mjs).
   * @stored
   */
  phone: unknown;
  whatsapp: string | null;
  marks: string[];
  version: number;
}

/** A line as the page may see it — states in words, never a provider id. */
export interface LineDto {
  id: string;
  e164: string | null;
  kind: string;
  provider: string;
  area_code: number | null;
  voice_state: SchemaSet<"lines.voice_state">;
  sms_state: string;
  /** Where a carrier registration stopped, when one did. */
  reg_step?: string | null;
  /** Filed against Twilio's free test registry rather than the carriers. */
  reg_mock?: boolean;
  /**
   * The registration on this line is the sole-proprietor one: one number, one
   * campaign, about one message a second. A fact about the FILING, so it is
   * read from the row and never re-derived from the business record, which can
   * change after the brand is registered.
   */
  reg_sole_prop?: boolean;
  /** Both the brand and the campaign are on record. */
  registered?: boolean;
  whatsapp_state: string;
  port_state: string;
  forwarding_state: string;
  step: string | null;
  last_error: string | null;
  state_since: string;
  created_at: string;
  /** A forwarded line's facts, in words: the carrier, the mode, where the calls go, the test window. */
  forwarding?: {
    carrier: string;
    mode: string;
    destination_e164: string | null;
    test_until: string | null;
    verified_at: string | null;
  } | null;
}

/**
 * How long a line may be "setting up" before something has gone wrong.
 *
 * THE SAGA CANNOT ALWAYS FINISH INSIDE ITS OWN LAMBDA. `api/admin/lines.ts` is
 * capped at 60 seconds (apps/edge/vercel.json) and the saga makes ten Twilio
 * calls at a 15-second timeout each plus four Retell calls at eight — about 180
 * seconds worst case, three times the ceiling. So a run is killed not by a crash
 * but by a slow afternoon at the provider, and when it is killed the `catch` that
 * would write `voice_state: 'failed'` never runs. The row stays `provisioning`.
 *
 * Nothing used to move it again: no sweep reads `lines` for this, `retry` demanded
 * `failed`, `buy` refused because a line already existed, and `number_drift()`
 * deliberately exempts a line still being set up. The owner's Setup row said
 * "usually a minute or two" with no button, for ever. The only exit was a platform
 * admin handing the number back.
 *
 * Five minutes, because the honest worst case is three and a state that is
 * genuinely still running must never be declared dead underneath itself.
 */
export const PROVISIONING_DEADLINE_MS = 5 * MIN_MS;

/**
 * Has this line been setting up longer than a line can legitimately take?
 *
 * One predicate, because four places have to agree about it: the Setup row that
 * offers the owner a Retry, the back office's action list, the route that accepts
 * that Retry, and the sweep that resumes them unasked. A deadline that each of
 * them spelled out for itself is a deadline they would drift apart on.
 */
export function lineStuckProvisioning(
  line: Pick<LineDto, "voice_state" | "state_since"> | null | undefined,
  nowMs: number,
): boolean {
  if (!line || line.voice_state !== "provisioning") return false;
  const since = Date.parse(line.state_since);
  // An unparseable stamp is not evidence of being stuck. Reading it as stuck would
  // let a bad clock or a null restart a saga that is running right now.
  return Number.isFinite(since) && nowMs - since > PROVISIONING_DEADLINE_MS;
}

export function lineRetryRefusal(
  line: (Pick<LineDto, "voice_state" | "state_since"> & Partial<Pick<LineDto, "last_error">>) | null | undefined,
  nowMs: number,
): string | null {
  if (!line) return "no such line";
  if (line.voice_state === "failed" && lineCredentialFailure(line.last_error))
    return "the line's credentials could not be kept — a retry cannot help until a person at Chanlytics restores them, and we have been told";
  if (line.voice_state === "failed") return null;
  if (lineStuckProvisioning(line, nowMs)) return null;
  return line.voice_state === "provisioning"
    ? "the line is still setting up — give it a few minutes, and it is retried automatically after that"
    : `the line is ${line.voice_state}, not failed`;
}

/** The saga's step, in the owner's words — the row, the bell and the platform email say the same thing. */
export const LINE_STEP_WORDS: Record<string, string> = {
  subaccount: "opening your account with the carrier",
  number: "buying the number",
  trunk: "connecting the number to the receptionist",
  agent: "creating the receptionist",
  import: "handing the number to the receptionist",
  messaging: "setting up texting",
  channel: "recording the line",
};

export type SetupState = "not_started" | "waiting_you" | "waiting_them" | "ready";

export const SETUP_STATE_WORDS: Record<SetupState, string> = {
  not_started: "Not started",
  waiting_you: "Waiting on you",
  waiting_them: "Waiting on us",
  ready: "Ready",
};

/** A verb whose `to` starts with "verb:" is an action the page performs; "tel:" dials; anything else is a route. */
export interface SetupVerb {
  label: string;
  to: string;
}

export interface SetupRowVM {
  id: string;
  icon: string;
  title: string;
  state: SetupState;
  /** The state in words; "Waiting on Meta" when Meta is the one waited on. */
  stateWords: string;
  sentence: string;
  details: string[];
  verb: SetupVerb | null;
  /** The quieter second act on a row: switching an activated capability off again. */
  undo?: SetupVerb | null;
  /** Counts toward "answering"; cannot be put off for later. */
  required: boolean;
  /** Put off just now: for good, or for a week that has not ended (setupOffNow). */
  later: boolean;
  /** Put off for a week, and back since it ended: the next put-off is for good (setupBack, putOffEnds). */
  back: boolean;
}

/**
 * A row as its builder states it: everything but what the fold adds — the state's words, and whether this member put it
 * off or has it back.
 */
export type SetupRowDraft = Omit<SetupRowVM, "later" | "back" | "stateWords"> & { stateWords?: string };

/**
 * What every row reads in common, computed once by setupSteps (rowContextOf): which channels answer, the numbers
 * in words, the workspace's own line and what its texting is, and the clock every "ago" is measured from.
 */
export interface SetupRowContext {
  nowMs: number;
  wa: SetupDto["channels"]["whatsapp"];
  voice: SetupDto["channels"]["voice"];
  waReady: boolean;
  voiceReady: boolean;
  /** Either channel answers: a channel row is required only until one does. */
  answering: boolean;
  /** The numbers in words. A channel row without a number is still a channel: never read "null" aloud. */
  waNum: string;
  voiceNum: string;
  handoffNum: string | null;
  /** The workspace's lines, or none on a deployment that cannot get one. */
  lines: NonNullable<SetupDto["lines"]>;
  /** Whether this workspace may put a charge on Chanlytics' account (maySpend). */
  canSpend: boolean;
  /** The workspace's own line, past "none". */
  ownLine: LineDto | null;
  /** What that line's texting is (textingWords). */
  texting: { sentence: string; done: boolean };
  /** The own line's number in words, or "your number". */
  lineNum: string;
}

/**
 * What this line's texting actually IS, in the owner's words.
 *
 * Every one of these sentences used to be the same sentence -- "Texting is not
 * available yet" -- said whatever the line's registration had done, because
 * nothing here read sms_state. That was honest while no line could text and a
 * lie in both directions afterwards: a line the carriers had approved still
 * read "not available", and a line filed against Twilio's MOCK registry -- free,
 * routes nothing, gone in thirty days -- read exactly like one that was real.
 *
 * The mock case is named out loud because it is the one that looks finished
 * from every angle: the console shows four green ticks, the brand says
 * Approved, and not one message would ever be delivered.
 */
/**
 * The one sentence a rehearsal filing gets, wherever an owner meets it: the
 * Setup row, the Integrations texting row, and the refusal the register route
 * answers with. Three surfaces said three different things about one state
 * before this -- and one of them ("the carriers did not answer") was not even
 * about the state it was describing.
 */
/**
 * The ceiling a working sole-proprietor line lives under, in one clause that
 * reads correctly after any sentence.
 *
 * It quotes SOLE_PROP_LIMITS rather than repeating its numbers, so what is said
 * to a working line and what was said before the owner committed to that
 * registration cannot drift apart.
 */
export const SOLE_PROP_CEILING_SENTENCE = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;

/** Setup's version: the good news, then the ceiling. */
export const SOLE_PROP_TEXTING_SENTENCE = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE}`;

export const MOCK_TEXTING_SENTENCE =
  "Texting is filed against a test registry, so nothing is delivered — a person at Chanlytics is filing it with the carriers for real.";

/**
 * Texting on a line that answers calls with nothing filed waits on the owner's
 * business record. Setup said "Texting is not available yet… this page will say
 * when" beside Connections' "waits on you" (the wiring audit's S7). Connections
 * says the sentence on the row that holds the form; Setup's clause adds where.
 */
export const TEXTING_NEEDS_RECORD_SENTENCE =
  "Texting needs your business on record for the carriers — two minutes, once.";

export const TEXTING_NEEDS_RECORD_CLAUSE =
  "Texting needs your business on record for the carriers — two minutes, once, on Connections.";

/**
 * A broken configuration, said once. Setup sent the owner to "Open Workspace to
 * repair them" while the Business pane said the form is closed and Chanlytics
 * repairs it (S8). Only Chanlytics can, and both pages now say so: the pane
 * from `title` and `body` (published by the bridge), Setup's row from `clause`.
 */
export const BROKEN_CONFIG_WORDS = {
  title: "This workspace's settings can't be read",
  body: "Something saved in this workspace's configuration no longer passes the checks the receptionist runs before it answers, so the receptionist is silent and this form is closed — saving from here would replace what is still there. Chanlytics has to repair it.",
  clause:
    "Your business settings could not be read, so the receptionist is silent until Chanlytics repairs them. Business lists what is wrong.",
  /** The owner's one move on a configuration only Chanlytics can repair (S8): it said so, with no way to ask. */
  ask: "Ask for a repair",
  /** Once asked: when, and what happens next, on Setup's row and on the pane's card alike. */
  requested: (at: string, nowMs: number) =>
    `Requested ${agoWords(Date.parse(at), nowMs)} — a person at Chanlytics will repair them and reach you by email.`,
} as const;

/**
 * What an owner can ask a person at Chanlytics for (00123): a phone line, until
 * lines provision themselves; bringing the number they have over (S14); a
 * repair of a configuration the receptionist can no longer read (S8); and a
 * change of the name the carriers hold, which no rename reaches (X4-5, 00439).
 */
export const SETUP_REQUEST_KINDS = ["line", "port", "repair", "forwarding", "name"] as const;

export type SetupRequestKind = (typeof SETUP_REQUEST_KINDS)[number];

/**
 * Takes only the fields it reads. The back office renders the same
 * sentence for another workspace's line, and it has the registration facts
 * without the rest of a LineDto -- a synthetic one filled with plausible
 * blanks would be a second answer waiting to drift from this one. The voice
 * state is optional for the same reason: the back office asks only about the
 * states an owner acts on, and a line with nothing filed is not one of them.
 */
export function textingWords(
  line:
    | (Pick<LineDto, "sms_state" | "reg_mock" | "reg_sole_prop"> & { voice_state?: LineDto["voice_state"] })
    | null
    | undefined,
): { sentence: string; done: boolean } {
  if (!line) return { sentence: "Texting is not available yet.", done: false };
  // reg_mock alone, not reg_mock && registered: the flag is only ever set by a
  // filing that WAS made against the test registry, so a mock brand still
  // waiting on its mock campaign is just as undeliverable as a finished one --
  // and `registered` is derived from the brand and campaign SIDs, which the
  // dashboard's side of the line mapper deliberately never selects.
  if (line.reg_mock) return { sentence: MOCK_TEXTING_SENTENCE, done: false };
  // A line that answers calls has everything a text needs but the carriers'
  // permission, which starts with the owner's business record: Connections'
  // texting row offers the form for exactly this state (smsStateRow).
  if (line.voice_state === "answering" && (!line.sms_state || line.sms_state === "none"))
    return { sentence: TEXTING_NEEDS_RECORD_CLAUSE, done: false };
  switch (line.sms_state) {
    // Working, and on the narrow registration: the ceiling belongs in the same
    // sentence as the good news, because the moment it bites is a broadcast
    // that trickles out over minutes with no explanation anywhere in the
    // product. `done` stays true -- it IS on, and there is nothing left to do.
    case "active":
      return { sentence: line.reg_sole_prop ? SOLE_PROP_TEXTING_SENTENCE : "Texting is on.", done: true };
    case "approved":
      return { sentence: "Your business is approved; one last check on the line is with the carriers.", done: false };
    case "registering":
      return { sentence: "Texting is with the carriers.", done: false };
    // The state the pre-flight writes, which had no case here at all -- so a
    // workspace stopped BEFORE anything was filed read the default, "Texting is
    // not available yet", which says nothing about what is in the way and nothing
    // about it being theirs to fix.
    //
    // It deliberately does NOT name the fault, for the same reason none of these
    // do: this is one clause inside a composed Setup sentence, the reason can be a
    // paragraph, and the owner's texting row on Connections renders `last_error`
    // in full. What this has to do is stop saying "not available" about something
    // that is waiting on them. It also cannot say "fill in your record" -- a
    // record that is COMPLETE but names a different business than the workspace
    // does trips the same state, and that fix is a rename, not a field.
    case "needs_record":
      return {
        sentence: "Texting needs something on your business record put right — Connections says what.",
        done: false,
      };
    case "rejected":
      return { sentence: "The carriers refused the texting registration.", done: false };
    case "failed":
      return { sentence: "The texting registration stopped; a person at Chanlytics has it.", done: false };
    // The one state where the owner must act inside a day: the carriers texted
    // their own mobile. Connections says it in full; Setup used to say "not
    // available yet", which reads as nothing to do.
    case "otp_waiting":
      return {
        sentence:
          "The carriers texted your mobile — reply to that message from the handset itself and texting switches on; the code lasts a day.",
        done: false,
      };
    case "hosting":
      return { sentence: "Texting is with the carriers.", done: false };
    default:
      return { sentence: "Texting is not available yet.", done: false };
  }
}
