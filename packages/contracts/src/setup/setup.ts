/**
 * Setup — what the page is read from (SetupDto), what it draws (SetupVM), the
 * words every state has, and the line's predicates. The rows themselves are a
 * table: setup-rows.ts (setupSteps, the fold over it) and setup-rows-phone.ts.
 *
 * Four words for every state, so the page reads the same way People and
 * Today do: Not started · Waiting on you · Waiting on carriers (or Meta, or
 * us) · Ready. "Waiting on us" is real: a line is set up by a person at
 * Chanlytics until lines provision themselves (plan, step 3).
 */
import type { SchemaSet } from "../shared/schema-sets";
import { lineCredentialFailure } from "../lines/line-failure";
import { formatPhoneDisplay } from "../shared/phone";
import type { FactConflict } from "../config/facts";
import { agoWords, MIN_MS } from "../shared/time";
import type { SetupGoogleFacts } from "../google/google";
import { maySpend, type SetupBillingFacts } from "../workspace/billing";
import { SOLE_PROP_LIMITS } from "../lines/registration-path";
import type { ActivationRecord, CapabilityStatus } from "./capabilities";
import type { EmailSetupDto } from "../email/mailbox";
import type { ReceptionistState } from "../config/workspace-config/config-schema";

export interface SetupDto {
  business: {
    name: string | null;
    hours: boolean;
    services: number;
    bookingLink: boolean;
    address: boolean;
    /** The number the phone receptionist warm-transfers to, E.164. */
    handoff: string | null;
    /** The config row exists but the parser refused it. */
    broken: boolean;
    /** Whether the receptionist is set up, by the one test (config.ts receptionistOf): none, set, or broken. */
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
  calendar: { state: "ok" | "unavailable" | "none"; problem?: string | null };
  team: {
    members: number;
    invitesOpen: number;
    alertEmails: number;
    /** The partner who brought the workspace and sits on its team (0012), by name; the member's read alone carries it. */
    partner?: string | null;
  };
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
   */
  consent: { yes: number; offers: number; offersSaidYes: number };
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
    test_from: string | null;
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
  l: Pick<LineDto, "voice_state" | "state_since"> | null | undefined,
  nowMs: number,
): boolean {
  if (!l || l.voice_state !== "provisioning") return false;
  const since = Date.parse(l.state_since);
  // An unparseable stamp is not evidence of being stuck. Reading it as stuck would
  // let a bad clock or a null restart a saga that is running right now.
  return Number.isFinite(since) && nowMs - since > PROVISIONING_DEADLINE_MS;
}

/**
 * May this line be retried, and if not, what does the person hear?
 *
 * `null` means go ahead. A string is the refusal, already in words.
 *
 * EXTRACTED, and this is the pattern rather than a one-off. The decision lived
 * inline in a 400-line route handler, which meant the only way to test it was to
 * read the handler's text and assert the text was still there — three
 * `readCode` assertions pinning an `if` statement. That is the trade the refactor
 * program calls a debt: a rule with no seam gets pinned by its source, the pin
 * passes whether or not the rule is right, and the count of such pins only ever
 * grows.
 *
 * A rule that returns a value has a seam by construction. The route maps a
 * request to a command and a result to a response; the decision is here, and the
 * test below calls it with rows instead of reading a file.
 *
 * WHY THE TWO REFUSALS DIFFER. "Not failed" is true of an answering line and of
 * one still setting up, and it is useless to both. A line mid-saga is not a
 * mistake anyone made — it needs a few minutes, and after those minutes the
 * sweep takes it whether or not anybody comes back. Saying so is the difference
 * between a person waiting usefully and a person pressing the button again.
 */
/**
 * A failure at the vault that keeps the line's credentials, by the saga's own
 * words (edge/lib/lines.ts: "reading the line's credentials", "keeping the
 * line's credentials"; lines-saga.ts: "missing from the vault"). It looks like
 * a carrier failure on the row and is nothing like one: a retry runs into the
 * same wall until a person restores the credentials, so the row, the bell and
 * the refusal say that instead of offering a button that cannot help.
 */
export { lineCredentialFailure, LINE_CREDENTIALS_SENTENCE } from "../lines/line-failure";

export function lineRetryRefusal(
  l: (Pick<LineDto, "voice_state" | "state_since"> & Partial<Pick<LineDto, "last_error">>) | null | undefined,
  nowMs: number,
): string | null {
  if (!l) return "no such line";
  if (l.voice_state === "failed" && lineCredentialFailure(l.last_error))
    return "the line's credentials could not be kept — a retry cannot help until a person at Chanlytics restores them, and we have been told";
  if (l.voice_state === "failed") return null;
  if (lineStuckProvisioning(l, nowMs)) return null;
  return l.voice_state === "provisioning"
    ? "the line is still setting up — give it a few minutes, and it is retried automatically after that"
    : `the line is ${l.voice_state}, not failed`;
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

export interface SetupInputs extends SetupDto {
  /** Row ids this member put off: their saved Setup view (setupLaterOf), the same on every device. */
  later: string[];
}

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
  later: boolean;
}

export interface SetupVM {
  rows: SetupRowVM[];
  readiness: { answering: boolean; sentence: string };
  /** The first open row's verb, in dependency order. */
  next: { label: string; to: string; row: string; title: string } | null;
  done: number;
  total: number;
  /** The numbers to try, once the receptionist answers somewhere. */
  tryIt: {
    voice: string | null;
    voiceLabel: string | null;
    whatsapp: string | null;
    whatsappLabel: string | null;
  } | null;
  /** Google can be searched on this deployment and nothing is linked yet: the first run's Find has something to find. */
  findable: boolean;
  /**
   * The member skipped the first run's test call (TRY_SKIPPED in their put-off rows): the first run goes on to Live,
   * and Today's "Try it" row stays until a call comes in.
   */
  trySkipped: boolean;
  /**
   * What the first run's Check reads (first-run.ts): whether the receptionist is set up (none yet, set up, or a
   * config the parser refused, whose repair only Chanlytics can make), whether a Google listing is on record, and the
   * days whose hours it asks about (the setup read's google.unsure).
   */
  check: {
    receptionist: ReceptionistState;
    listed: boolean;
    unsure: NonNullable<SetupGoogleFacts["unsure"]>;
    /** Google's kind of place, which Check's service chips suggest by (check-chips.ts); null without one. */
    type: string | null;
    /** The booking page the listing's website names, while the record holds no booking link; null without one. */
    bookingPage: string | null;
  };
}

/** A row as its builder states it: everything but what the fold adds — the state's words, and whether this member put it off. */
export type SetupRowDraft = Omit<SetupRowVM, "later" | "stateWords"> & { stateWords?: string };

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

/** One row of the table setupSteps folds: its row, or null when this deployment or workspace does not draw it. */
export type SetupRowBuilder = (i: SetupInputs, ctx: SetupRowContext) => SetupRowDraft | null;

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
 * lines provision themselves; bringing the number they have over (S14); and a
 * repair of a configuration the receptionist can no longer read (S8).
 */
export const SETUP_REQUEST_KINDS = ["line", "port", "repair", "forwarding"] as const;
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
  l:
    | (Pick<LineDto, "sms_state" | "reg_mock" | "reg_sole_prop"> & { voice_state?: LineDto["voice_state"] })
    | null
    | undefined,
): { sentence: string; done: boolean } {
  if (!l) return { sentence: "Texting is not available yet.", done: false };
  // reg_mock alone, not reg_mock && registered: the flag is only ever set by a
  // filing that WAS made against the test registry, so a mock brand still
  // waiting on its mock campaign is just as undeliverable as a finished one --
  // and `registered` is derived from the brand and campaign SIDs, which the
  // dashboard's side of the line mapper deliberately never selects.
  if (l.reg_mock) return { sentence: MOCK_TEXTING_SENTENCE, done: false };
  // A line that answers calls has everything a text needs but the carriers'
  // permission, which starts with the owner's business record: Connections'
  // texting row offers the form for exactly this state (smsStateRow).
  if (l.voice_state === "answering" && (!l.sms_state || l.sms_state === "none"))
    return { sentence: TEXTING_NEEDS_RECORD_CLAUSE, done: false };
  switch (l.sms_state) {
    // Working, and on the narrow registration: the ceiling belongs in the same
    // sentence as the good news, because the moment it bites is a broadcast
    // that trickles out over minutes with no explanation anywhere in the
    // product. `done` stays true -- it IS on, and there is nothing left to do.
    case "active":
      return { sentence: l.reg_sole_prop ? SOLE_PROP_TEXTING_SENTENCE : "Texting is on.", done: true };
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

/**
 * The third claim a capability row makes, beside readiness and evidence: the
 * owner's own act, in words. A row says "Answering" (ready), "Tested" (a real
 * interaction happened) and "Activated" (the owner said so) as three things,
 * because they are three things (PRD ON-02).
 */
export function activationWords(cap: CapabilityStatus, nowMs: number): string {
  if (cap.live && cap.activated) return `Activated ${agoWords(Date.parse(cap.activated.at), nowMs)}`;
  if (cap.tested) return "Tested — activate it to say it is yours";
  return "Not tested yet — try it from your own phone";
}

/** The facts the rows share, read once (SetupRowContext). */
export function rowContextOf(i: SetupInputs, nowMs: number): SetupRowContext {
  const wa = i.channels.whatsapp;
  const voice = i.channels.voice;
  const waReady = wa.present && wa.active;
  const voiceReady = voice.present && voice.active;
  const answering = waReady || voiceReady;
  // A channel row without a number is still a channel: never read "null" aloud.
  const waNum = formatPhoneDisplay(wa.number) ?? "your number";
  const voiceNum = formatPhoneDisplay(voice.number) ?? "your line";
  const handoffNum = formatPhoneDisplay(i.business.handoff);
  const lines = i.lines ?? { rows: [], ready: false, provider: null, costs: { local_number_month_usd: 1.15 } };
  // Whether this workspace may put a charge on Chanlytics' account. The same
  // rule the routes enforce (maySpend), read here so the page never offers a
  // button the server will refuse.
  const canSpend = !i.billing || maySpend(i.billing.mode, i.billing.status);
  const ownLine = lines.rows.find((l) => l.voice_state !== "none") ?? null;
  const texting = textingWords(ownLine);
  const lineNum = ownLine?.e164 ? (formatPhoneDisplay(ownLine.e164) ?? ownLine.e164) : "your number";
  return {
    nowMs,
    wa,
    voice,
    waReady,
    voiceReady,
    answering,
    waNum,
    voiceNum,
    handoffNum,
    lines,
    canSpend,
    ownLine,
    texting,
    lineNum,
  };
}

/** The hash route without "#/": "#/admin/setup" → "admin/setup"; nothing → "today". */
export function setupRoute(hash: string): string {
  return (hash || "#/today").replace(/^#\/?/, "");
}

/**
 * The rows a member put off, as their saved Setup view keeps them (`memberships.views.setup`, the door People's own
 * view goes through): short ids, each once, nothing else. A view somebody hand-edited is no rows, never a throw.
 */
export function setupLaterOf(view: unknown): string[] {
  const later = view && typeof view === "object" ? (view as { later?: unknown }).later : null;
  if (!Array.isArray(later)) return [];
  return [...new Set(later.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 40))];
}

/**
 * The number the business keeps and forwards, while its forwarding is saved (instructed or proven): the line customers
 * call, which Try it asks the owner to call. The one test, for Setup's row and the first run's step.
 */
export function forwardedLineOf(lines: SetupDto["lines"] | null | undefined): LineDto | null {
  return lines?.rows.find((l) => l.kind === "forwarded" && l.forwarding_state !== "none") ?? null;
}

/**
 * What skipping the first run's test call puts off (the member's own, as a row put off is): not the `try` row itself,
 * which Today keeps showing until a call comes in, but the first run's wait for it.
 */
export const TRY_SKIPPED = "try-skipped";

/** Why putting a row off, or back, did not start: nothing was saved, and the rows stay as they were. */
export const SETUP_LATER_REFUSED = {
  reading: "Setting up is still being read. Try again in a moment.",
  unread: "What you put off could not be read just now, so nothing changed. Try again in a moment.",
} as const;
