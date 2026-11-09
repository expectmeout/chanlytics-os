/** Setup: setup. */

import { formatPhoneDisplay, normalizePhone } from "../shared/phone";
import {
  CARRIERS,
  PHONE_RINGS,
  PHONE_WAYS,
  type PhoneCompany,
  type PhoneRings,
  type PhoneWay,
} from "../voice/forwarding";
import { agoWords } from "../shared/time";
import type { SetupGoogleFacts } from "../google/listing";
import { maySpend } from "../workspace/billing/dtos";
import type { CapabilityStatus } from "./capabilities";
import type { ReceptionistState } from "../config/workspace-config/config-schema";
import { WORKSPACE_MARKS, type SetupRests } from "./put-off";
import {
  textingWords,
  type LineDto,
  type SetupDto,
  type SetupRowContext,
  type SetupRowDraft,
  type SetupRowVM,
} from "./lines";
import { isOneOf } from "../shared/unknown";

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
 * line's credentials"; lines/saga.ts: "missing from the vault"). It looks like
 * a carrier failure on the row and is nothing like one: a retry runs into the
 * same wall until a person restores the credentials, so the row, the bell and
 * the refusal say that instead of offering a button that cannot help.
 */
export { lineCredentialFailure, LINE_CREDENTIALS_SENTENCE } from "../lines/failure";

export interface SetupInputs extends SetupDto {
  /** The workspace's zone, which every day its rows say is in (contracts zone-math; one Intl cannot use reads as UTC). */
  tz: string;
  /** Row ids this member put off for good: their saved Setup view (setupLaterOf), the same on every device. */
  later: string[];
  /** The rows this member put off for a week, each with when it comes back (setupRestsOf), from the same view. */
  rests: SetupRests;
  /** The number this member said they keep, move or get (setupPhoneWantOf), from the same view; absent reads as none. */
  want?: SetupPhoneWant | null;
  /** The rest of what the first run's Where it answers chose (setupChoicesOf), from the same view; absent reads as none. */
  choices?: SetupChoices | null;
  /** The business chose Not by phone (callsNotByPhone, decision 0091): no number is owed to go live. */
  noCalls?: boolean;
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
  /** The member skipped Today's offer of the day-before reminder (REMIND_SKIPPED in their put-off rows), just now. */
  remindSkipped: boolean;
  /** The reminder's offer was put off for a week and is back: its next Skip is for good, as a row's is. */
  remindBack: boolean;
  /** A day-before reminder already runs (SetupDto.reminders), so there is none to offer. */
  dayBeforeOn: boolean;
  /**
   * The member chose to keep or move a number (their saved view's `phone`), and no forwarding is saved for one yet,
   * nor has "The number you already have" ever been put off (a week that ended still said it can wait): the first
   * run's Go live is not done, whatever answers.
   */
  forwardingOwed: boolean;
  /** The member went on from the first run's Your receptionist (RECEPTIONIST_MET in their put-off rows, decision 0073). */
  receptionistMet: boolean;
  /** The member skipped the first run's Rehearse after its one nudge (REHEARSE_SKIPPED, decision 0073). */
  rehearseSkipped: boolean;
  /**
   * The first run's Connect it to Google (decision 0073, R17): offered where profiles connect here, a listing is linked
   * and none is connected, until the member says Not now (GOOGLE_CONNECT_LATER); `connected` once a location is bound.
   */
  googleConnect: { offered: boolean; connected: boolean; email: string | null };
  /** The rehearsals reviewed and the changes kept from them (SetupDto.rehearsal), none where it was not read. */
  rehearsal: { reviewed: number; kept: number };
  /** What Where it answers chose beyond the number (the member's saved view), none before a choice. */
  choices: SetupChoices;
  /** The number the member chose at Where it answers (their saved view's `phone`): kept, moved or new; null before one. */
  /** The business chose Not by phone (decision 0091): Where it answers is done, and Go live owes no number. */
  noCalls: boolean;
  want: SetupPhoneWant | null;
  /** A line of the workspace's own is on its way or answering, or a person was asked for one: nothing left to choose. */
  lineUnderway: boolean;
  /** Numbers can be bought here (SetupDto.lines.ready); without, Where it answers is the member's going on (CHANNELS_SEEN). */
  numbersHere: boolean;
  /** The member went on from the first run's Where it answers with no number to choose (CHANNELS_SEEN, decision 0073). */
  channelsSeen: boolean;
  /**
   * A calendar link is connected (the setup read's `calendar.state` is not "none"), whether or not it reads just now:
   * the fact Campaigns' moments read as a calendar (playbooks/triggers/notices.ts momentOffered's `calendarOn`, core's refusal).
   * The calendar row's Ready is wider (booked by hand, bookings by email alone), so a door to a reminder asks this.
   */
  calendarLinked: boolean;
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

/** One row of the table setupSteps folds: its row, or null when this deployment or workspace does not draw it. */
export type SetupRowBuilder = (i: SetupInputs, ctx: SetupRowContext) => SetupRowDraft | null;

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
export function rowContextOf(setupInputs: SetupInputs, nowMs: number): SetupRowContext {
  const wa = setupInputs.channels.whatsapp;
  const voice = setupInputs.channels.voice;
  const waReady = wa.present && wa.active;
  const voiceReady = voice.present && voice.active;
  const answering = waReady || voiceReady;
  // A channel row without a number is still a channel: never read "null" aloud.
  const waNum = formatPhoneDisplay(wa.number) ?? "your number";
  const voiceNum = formatPhoneDisplay(voice.number) ?? "your line";
  const handoffNum = formatPhoneDisplay(setupInputs.business.handoff);
  const lines = setupInputs.lines ?? {
    rows: [],
    ready: false,
    provider: null,
    costs: { local_number_month_usd: 1.15 },
  };
  // Whether this workspace may put a charge on Chanlytics' account. The same
  // rule the routes enforce (maySpend), read here so the page never offers a
  // button the server will refuse.
  const canSpend = !setupInputs.billing || maySpend(setupInputs.billing.mode, setupInputs.billing.status);
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

/**
 * The number the owner said they keep, or are moving here, on the first run's phone step: the way and the number,
 * E.164. Kept in their saved Setup view beside the rows they put off (`memberships.views.setup.phone`), because the
 * choice was the tab's alone: a reload, another tab or a return from checkout lost it, the step read as done the
 * moment the receptionist's own number answered, and the forwarding the owner chose was never asked for.
 */
export interface SetupPhoneWant {
  /**
   * Keep the number customers call, or move it here (both forwarded until then), or a new one: since decision 0073 the
   * first run chooses at Where it answers and buys at Go live, so a new number's pick is kept too.
   */
  way: PhoneWay;
  /** The number kept or moved, or the new number picked, E.164. */
  number: string;
  /** Which calls a number kept or moved sends on: the ones nobody picks up (absent), or every one. */
  mode?: "always";
  /**
   * What rings at a number kept or moved, and a mobile's company: from the carrier's own records where it was looked up
   * (decision 0073, R11), else as the owner answered. Go live's code is chosen by them, with no question asked.
   */
  rings?: PhoneRings;
  company?: PhoneCompany;
}

/** The ways, what a number kept rings, and its carrier, each read off its one list (forwarding.ts). */
const isPhoneWay = (v: unknown): v is PhoneWay => isOneOf(PHONE_WAYS, v);

const isRings = (v: unknown): v is PhoneRings => isOneOf(PHONE_RINGS, v);

const isCompany = (v: unknown): v is PhoneCompany => v !== "office" && isOneOf(CARRIERS, v);

/** The owner's number as their saved Setup view holds it; null for none, and for anything hand-edited. */
export function setupPhoneWantOf(view: unknown): SetupPhoneWant | null {
  const phone = view && typeof view === "object" ? (view as { phone?: unknown }).phone : null;
  if (!phone || typeof phone !== "object") return null;
  const { way, number, mode, rings, company } = phone as Record<string, unknown>;
  if (!isPhoneWay(way) || typeof number !== "string") return null;
  const e164 = normalizePhone(number);
  if (!e164) return null;
  if (way === "new") return { way, number: e164 };
  return {
    way,
    number: e164,
    ...(mode === "always" ? { mode } : {}),
    ...(isRings(rings) ? { rings } : {}),
    ...(isCompany(company) ? { company } : {}),
  };
}

/**
 * "Not by phone" (decision 0091): the business takes no calls through the receptionist, chosen at Where it answers in
 * place of a number. Kept where the number's choice is (`phone: {way: "none"}`), so one key says how calls reach it; the
 * number's own reading (setupPhoneWantOf) is null for it.
 */
export function callsNotByPhone(view: unknown): boolean {
  const phone = view && typeof view === "object" ? (view as { phone?: unknown }).phone : null;
  return !!phone && typeof phone === "object" && (phone as { way?: unknown }).way === "none";
}

/**
 * Where WhatsApp answers, as Where it answers chose it (decision 0073): on the number customers call, the business
 * keeping its WhatsApp Business app (coexistence, R12); on the receptionist's own number; or later.
 */
const WHATSAPP_CHOICES = ["same", "own", "later"] as const;

export type WhatsappChoice = (typeof WHATSAPP_CHOICES)[number];

/** What Where it answers chose beyond the number, kept in the member's saved Setup view beside it. */
export interface SetupChoices {
  whatsapp: WhatsappChoice | null;
}

/** The member's choices as their saved Setup view holds them; none for anything hand-edited. */
export function setupChoicesOf(view: unknown): SetupChoices {
  const wa = view && typeof view === "object" ? (view as { whatsapp?: unknown }).whatsapp : null;
  return { whatsapp: isOneOf(WHATSAPP_CHOICES, wa) ? wa : null };
}

/**
 * The inputs with the workspace's own choices standing where the member's view stood (decision 0091): once the
 * workspace has a row (setup_choices), the number and WhatsApp chosen are its alone, and its marks join the member's
 * put-offs, so every member and the back office stand at the same step. A read from before the row carries none, and
 * the member's view stands as it did.
 */
export function withWorkspaceChoices(setupInputs: SetupInputs): SetupInputs {
  const workspaceChoices = setupInputs.workspace_choices;
  if (!workspaceChoices) return setupInputs;
  const marks = workspaceChoices.marks.filter((m) => isOneOf(WORKSPACE_MARKS, m));
  return {
    ...setupInputs,
    want: setupPhoneWantOf({ phone: workspaceChoices.phone }),
    noCalls: callsNotByPhone({ phone: workspaceChoices.phone }),
    choices: setupChoicesOf({ whatsapp: workspaceChoices.whatsapp }),
    later: [...new Set([...(setupInputs.later ?? []), ...marks])],
  };
}

/**
 * The number the business keeps and forwards, while its forwarding is saved (instructed or proven): the line customers
 * call, which Try it asks the owner to call. The one test, for Setup's row and the first run's step.
 */
export function forwardedLineOf(lines: SetupDto["lines"] | null | undefined): LineDto | null {
  return lines?.rows.find((l) => l.kind === "forwarded" && l.forwarding_state !== "none") ?? null;
}

/** The carriers whose forwarding codes are a mobile's (forwarding.ts): a number kept with one rings a mobile. */
const MOBILE_CARRIERS: readonly string[] = ["verizon", "att", "tmobile"];

/**
 * Which phone rings at a number kept, as far as its saved forwarding says, for the test call's words: `mobile` where
 * the codes saved are a mobile company's; `office` for an office phone system, which is never the owner's cell;
 * `unknown` otherwise (a landline, or a mobile with another company); null without a kept number. A phone cannot call
 * itself: only an office system's owner is told to call "from your cell", and a mobile's is given nothing to press
 * that would dial itself. The one test, for Setup's Try it row and the first run's step.
 */
export function keptPhoneKind(line: LineDto | null | undefined): "mobile" | "office" | "unknown" | null {
  if (!line) return null;
  const carrier = line.forwarding?.carrier ?? null;
  if (carrier === "office") return "office";
  return carrier && MOBILE_CARRIERS.includes(carrier) ? "mobile" : "unknown";
}
