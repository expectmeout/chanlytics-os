/**
 * Setup — one page a new owner lands on until the receptionist is answering.
 *
 * Every row here is read from the workspace: the config, the channels, the
 * templates, the calendar feed, the team, the consent rows. Nothing stores a
 * "done" flag; a row is ready because the thing it names exists. "Later" is
 * a preference on one device that hides an optional row from Today's line,
 * and nothing else.
 *
 * Four words for every state, so the page reads the same way People and
 * Today do: Not started · Waiting on you · Waiting on carriers (or Meta, or
 * us) · Ready. "Waiting on us" is real: a line is set up by a person at
 * Chanlytics until lines provision themselves (plan, step 3).
 */
import type { SchemaSet } from "./schema-sets";
import { lineCredentialFailure, LINE_CREDENTIALS_SENTENCE } from "./line-failure";
import { formatPhoneDisplay } from "./phone";
import type { FactConflict } from "./facts";
import { agoWords, spanLabel } from "./time";
import { CARRIER_WORDS, MODE_WORDS, forwardingTestOpen, type Carrier, type ForwardingMode } from "./forwarding";
import { listingLine, type SetupGoogleFacts } from "./google";
import { dayWords, trialWords, maySpend, billingDoorOpen, type SetupBillingFacts } from "./billing";
import { SOLE_PROP_LIMITS } from "./registration-path";
import { capabilityStatus, type ActivationRecord, type CapabilityStatus } from "./capabilities";

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
  };
  channels: {
    whatsapp: { present: boolean; active: boolean; number: string | null; quality: string | null; lastInboundAt: string | null };
    voice: { present: boolean; active: boolean; number: string | null; lastInboundAt: string | null };
  };
  templates: { approved: number; pending: number; startersApproved: number };
  calendar: { state: "ok" | "unavailable" | "none"; problem?: string | null };
  team: { members: number; invitesOpen: number; alertEmails: number };
  /**
   * The two answers, counted separately.
   *
   * `yes` is the conversational one -- they answer and they hear about their own
   * visit. `offers` is the promotional one, and it is the ONLY one that puts a
   * person on a marketing broadcast. This row used to read `yes` and say "said
   * yes to offers", so a workspace with seven people who had texted START was
   * told it had seven people it could send an offer to, and the composer then
   * refused all seven.
   */
  consent: { yes: number; offers: number };
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
  /** What the owner has asked a person at Chanlytics for, and when. */
  requests: { line: string | null };
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
  forwarding?: { carrier: string; mode: string; destination_e164: string | null; test_from: string | null; test_until: string | null; verified_at: string | null } | null;
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
export const PROVISIONING_DEADLINE_MS = 5 * 60_000;

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
export { lineCredentialFailure, LINE_CREDENTIALS_SENTENCE } from "./line-failure";

export function lineRetryRefusal(
  l: Pick<LineDto, "voice_state" | "state_since"> & Partial<Pick<LineDto, "last_error">> | null | undefined,
  nowMs: number,
): string | null {
  if (!l) return "no such line";
  if (l.voice_state === "failed" && lineCredentialFailure(l.last_error)) return "the line's credentials could not be kept — a retry cannot help until a person at Chanlytics restores them, and we have been told";
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
  /** Row ids marked Later on this device. */
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
  /** Today's one line while something is open: "Setup · 3 of 8 · Calendar: paste the feed". */
  line: string | null;
  /** The numbers to try, once the receptionist answers somewhere. */
  tryIt: { voice: string | null; voiceLabel: string | null; whatsapp: string | null; whatsappLabel: string | null } | null;
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
export const SOLE_PROP_CEILING_SENTENCE =
  `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;

/** Setup's version: the good news, then the ceiling. */
export const SOLE_PROP_TEXTING_SENTENCE = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE}`;

export const MOCK_TEXTING_SENTENCE =
  "Texting is filed against a test registry, so nothing is delivered — a person at Chanlytics is filing it with the carriers for real.";

/**
 * Takes only the three fields it reads. The back office renders the same
 * sentence for another workspace's line, and it has the registration facts
 * without the rest of a LineDto -- a synthetic one filled with plausible
 * blanks would be a second answer waiting to drift from this one.
 */
export function textingWords(l: Pick<LineDto, "sms_state" | "reg_mock" | "reg_sole_prop"> | null | undefined): { sentence: string; done: boolean } {
  if (!l) return { sentence: "Texting is not available yet.", done: false };
  // reg_mock alone, not reg_mock && registered: the flag is only ever set by a
  // filing that WAS made against the test registry, so a mock brand still
  // waiting on its mock campaign is just as undeliverable as a finished one --
  // and `registered` is derived from the brand and campaign SIDs, which the
  // dashboard's side of the line mapper deliberately never selects.
  if (l.reg_mock) return { sentence: MOCK_TEXTING_SENTENCE, done: false };
  switch (l.sms_state) {
    // Working, and on the narrow registration: the ceiling belongs in the same
    // sentence as the good news, because the moment it bites is a broadcast
    // that trickles out over minutes with no explanation anywhere in the
    // product. `done` stays true -- it IS on, and there is nothing left to do.
    case "active": return { sentence: l.reg_sole_prop ? SOLE_PROP_TEXTING_SENTENCE : "Texting is on.", done: true };
    case "approved": return { sentence: "Your business is approved; one last check on the line is with the carriers.", done: false };
    case "registering": return { sentence: "Texting is with the carriers.", done: false };
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
    case "needs_record": return { sentence: "Texting needs something on your business record put right — Connections says what.", done: false };
    case "rejected": return { sentence: "The carriers refused the texting registration.", done: false };
    case "failed": return { sentence: "The texting registration stopped; a person at Chanlytics has it.", done: false };
    // The one state where the owner must act inside a day: the carriers texted
    // their own mobile. Connections says it in full; Setup used to say "not
    // available yet", which reads as nothing to do.
    case "otp_waiting": return { sentence: "The carriers texted your mobile — reply to that message from the handset itself and texting switches on; the code lasts a day.", done: false };
    case "hosting": return { sentence: "Texting is with the carriers.", done: false };
    default: return { sentence: "Texting is not available yet.", done: false };
  }
}

const display = (e164: string | null | undefined): string | null => (e164 ? formatPhoneDisplay(e164) : null);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/**
 * The third claim a capability row makes, beside readiness and evidence: the
 * owner's own act, in words. A row says "Answering" (ready), "Tested" (a real
 * interaction happened) and "Activated" (the owner said so) as three things,
 * because they are three things (PRD ON-02).
 */
function activationWords(cap: CapabilityStatus, nowMs: number): string {
  if (cap.live && cap.activated) return `Activated ${agoWords(Date.parse(cap.activated.at), nowMs)}`;
  if (cap.tested) return "Tested — activate it to say it is yours";
  return "Not tested yet — try it from your own phone";
}

export function setupSteps(i: SetupInputs, nowMs = Date.now()): SetupVM {
  const later = new Set(i.later ?? []);
  const wa = i.channels.whatsapp;
  const voice = i.channels.voice;
  const waReady = wa.present && wa.active;
  const voiceReady = voice.present && voice.active;
  const answering = waReady || voiceReady;
  // A channel row without a number is still a channel: never read "null" aloud.
  const waNum = display(wa.number) ?? "your number";
  const voiceNum = display(voice.number) ?? "your line";
  const handoffNum = display(i.business.handoff);

  const rows: SetupRowVM[] = [];
  const row = (r: Omit<SetupRowVM, "later" | "stateWords"> & { stateWords?: string }) =>
    rows.push({ ...r, stateWords: r.stateWords ?? SETUP_STATE_WORDS[r.state], later: !r.required && later.has(r.id) });

  // 0. Billing — first, for a workspace that pays by card: the door before
  // the desk. A direct arrangement has no row; a closed door draws nothing.
  if (billingDoorOpen(i.billing)) {
    const b = i.billing;
    if (b.status === "trialing" && (b.cancel_at || b.cancel_at_period_end)) {
      row({ id: "billing", icon: "money", title: "Billing", state: "ready", required: true, sentence: `On trial, cancelled: the receptionist answers until ${dayWords(b.cancel_at ?? b.trial_end) || "the trial ends"}, then stops.`, details: ["Nothing is charged; undo the cancellation from Billing before then to keep it"], verb: { label: "Open Billing", to: "admin/billing" } });
    } else if (b.status === "trialing") {
      row({ id: "billing", icon: "money", title: "Billing", state: "ready", required: true, sentence: `On trial: ${trialWords(b.trial_end, nowMs) || "the card is on file"}.`, details: ["The card on file is charged when the trial ends; cancel from Billing before then if you'd rather not"], verb: { label: "Open Billing", to: "admin/billing" } });
    } else if (b.status === "active" || b.status === "incomplete") {
      row({ id: "billing", icon: "money", title: "Billing", state: "ready", required: true, sentence: b.status === "active" ? `Subscribed · next invoice ${dayWords(b.current_period_end) || "on the renewal date"}.` : "Finishing checkout — this page updates by itself.", details: [], verb: { label: "Open Billing", to: "admin/billing" } });
    } else if (b.status === "past_due") {
      row({ id: "billing", icon: "money", title: "Billing", state: "waiting_you", required: true, sentence: "The last payment failed. Update the card to keep the receptionist answering.", details: ["Stripe retries for a few days, then pauses the subscription"], verb: { label: "Update the card", to: "verb:billing-portal" } });
    } else if (b.status === "paused" || b.status === "unpaid") {
      row({ id: "billing", icon: "money", title: "Billing", state: "waiting_you", required: true, sentence: "Your receptionist is paused: messages land in the Inbox, nothing is answered.", details: [b.status === "paused" ? "The trial ended without a card on file" : "Payment could not be collected"], verb: { label: "Resume in Billing", to: "admin/billing" } });
    } else {
      row({ id: "billing", icon: "money", title: "Billing", state: "not_started", required: true, sentence: b.trial_days > 0 ? `Start the ${b.trial_days}-day trial with a card — nothing is charged until it ends.` : "Subscribe with a card — the first charge is today.", details: b.trial_days > 0 ? ["Cancel any time from Billing", "The receptionist answers through the trial"] : ["Cancel any time from Billing"], verb: { label: b.trial_days > 0 ? "Start the trial" : "Subscribe", to: "verb:billing-checkout" } });
    }
  }

  // 1. Business facts — what the receptionist answers with.
  {
    const b = i.business;
    const missing = [!b.name ? "a name" : "", !b.hours ? "hours" : "", b.services === 0 ? "services" : ""].filter(Boolean);
    const serious = (i.conflicts ?? []).find((k) => k.severity === "serious") ?? null;
    if (b.broken) {
      row({ id: "facts", icon: "home", title: "Business facts", state: "waiting_you", required: true, sentence: "Your settings could not be read. Open Workspace to repair them before anything else.", details: [], verb: { label: "Open Workspace", to: "admin/workspace" } });
    } else if (serious) {
      // Filled in, and wrong in a way a customer feels. The sentence is the
      // resolver's, because it is the one that knows WHY the two disagree.
      row({ id: "facts", icon: "home", title: "Business facts", state: "waiting_you", required: true, sentence: serious.sentence, details: [`${b.name} · hours set · ${plural(b.services, "service")} on record`], verb: { label: "Fix it in Business", to: serious.to } });
    } else if (missing.length === 0) {
      row({ id: "facts", icon: "home", title: "Business facts", state: "ready", required: true, sentence: `${b.name} · hours set · ${plural(b.services, "service")} on record`, details: [b.bookingLink ? "Booking link on record" : "No booking link — the receptionist answers, but cannot send one", b.address ? "Address on record" : "No address yet"], verb: { label: "Edit in Workspace", to: "admin/workspace" } });
    } else {
      const none = missing.length === 3;
      row({ id: "facts", icon: "home", title: "Business facts", state: none ? "not_started" : "waiting_you", required: true, sentence: none ? "Name, hours and services are what the receptionist answers with." : `Still missing: ${missing.join(" and ")}.`, details: [], verb: { label: none ? "Start in Workspace" : "Finish in Workspace", to: "admin/workspace" } });
    }
  }

  // 2. A person to hand off to — the warm transfer the voice shell already makes.
  row(handoffNum
    ? { id: "handoff", icon: "phone", title: "A person to hand off to", state: "ready", required: false, sentence: `Callers who insist on a person are transferred to ${handoffNum}.`, details: [], verb: { label: "Change it", to: "admin/workspace" } }
    : { id: "handoff", icon: "phone", title: "A person to hand off to", state: "waiting_you", required: false, sentence: "Give the receptionist a number to hand callers to when they insist on a person.", details: [], verb: { label: "Add a number", to: "admin/workspace" } });

  // 3. A line for calls and texts — the product's own line when this deployment can get one; a person at Chanlytics otherwise.
  const lines = i.lines ?? { rows: [], ready: false, provider: null, costs: { local_number_month_usd: 1.15 } };
  // Whether this workspace may put a charge on Chanlytics' account. The same
  // rule the routes enforce (maySpend), read here so the page never offers a
  // button the server will refuse.
  const canSpend = !i.billing || maySpend(i.billing.mode, i.billing.status);
  const ownLine = lines.rows.find((l) => l.voice_state !== "none") ?? null;
  const texting = textingWords(ownLine);
  const lineNum = ownLine?.e164 ? display(ownLine.e164) ?? ownLine.e164 : "your number";
  if (voiceReady) {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "ready", required: !answering, sentence: `Calls are answered on ${voiceNum}. ${texting.sentence}`, details: [ownLine?.voice_state === "answering" ? "Your own number through Chanlytics" : "", texting.done ? "" : "Texting arrives with lines that register with the carriers; this page will say when"].filter(Boolean), verb: { label: "Open Connections", to: "admin/integrations" } });
  } else if (voice.present) {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: `Your line ${voice.number ? `${voiceNum} ` : ""}is switched off — the receptionist is not answering it.`, details: [], verb: { label: "Open Connections", to: "admin/integrations" } });
  } else if (ownLine && lineStuckProvisioning(ownLine, nowMs)) {
    // IT SAYS WHAT WILL HAPPEN, NOT WHAT HAS. This row used to read "A person at
    // Chanlytics has it" and "We have been told" -- and nothing had been: a saga
    // cut off by its lambda returns nothing, and the failure email only fires on a
    // returned failure. Now the lines sweep tells the platform the first time it
    // picks a stuck line up (edge/lib/line-resume.ts), which is usually within a
    // quarter of an hour of the deadline and not before it. So until then the true
    // sentence is the one about the future.
    // PAST THE DEADLINE. The same words and the same button the `failed` branch
    // below gives, because it is the same situation: the setup stopped and a
    // person can restart it. It used to read "usually a minute or two; this page
    // updates by itself" with no verb, which after an hour is untrue twice over —
    // and the retry it withheld is the only thing that would have finished the job.
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Setting up ${lineNum} stopped while ${LINE_STEP_WORDS[ownLine.step ?? ""] ?? "working on it"}, ${agoWords(Date.parse(ownLine.state_since), nowMs)}.`, details: ["It is retried automatically, usually within a quarter of an hour, and Chanlytics is told when it is", "Retry from here — it picks up where it stopped and buys nothing twice"], verb: { label: "Retry", to: `verb:retry-line:${ownLine.id}` } });
  } else if (ownLine && ownLine.voice_state === "provisioning") {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Setting up ${lineNum} — ${LINE_STEP_WORDS[ownLine.step ?? ""] ?? "working on it"}, since ${agoWords(Date.parse(ownLine.state_since), nowMs)}.`, details: ["Usually a minute or two; this page updates by itself"], verb: null });
  } else if (ownLine && ownLine.voice_state === "failed" && lineCredentialFailure(ownLine.last_error)) {
    // Not a carrier failure and not the owner's to retry: the wall is ours.
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Setting up ${lineNum} stopped at ${LINE_CREDENTIALS_SENTENCE}. A person at Chanlytics has it.`, details: ["A retry cannot help until the credentials are restored; we have been told and will finish it with you"], verb: null });
  } else if (ownLine && ownLine.voice_state === "failed") {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Setting up ${lineNum} stopped while ${LINE_STEP_WORDS[ownLine.step ?? ""] ?? "working on it"}. A person at Chanlytics has it.`, details: ["Retry from here; we have been told"], verb: { label: "Retry", to: `verb:retry-line:${ownLine.id}` } });
  } else if (ownLine && ownLine.voice_state === "answering") {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `${lineNum} is set up — connecting it to the receptionist.`, details: [], verb: null });
  } else if (i.requests.line) {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Requested ${agoWords(Date.parse(i.requests.line), nowMs)} — a person at Chanlytics will set up your line with you and reach you by email.`, details: [], verb: null });
  } else if (lines.ready) {
    // A workspace that cannot spend is not shown a button that will refuse it.
    // Buying a number costs Chanlytics money whatever the workspace does next
    // (requireSpend), so the honest next step here is the card, not the number
    // -- and saying so on THIS row is what stops an owner pressing Get a line
    // and reading a 402 they did not expect.
    canSpend
      ? row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: "Get a number for calls, or keep the one you have.", details: [`A local number is about $${lines.costs.local_number_month_usd.toFixed(2)} a month · your receptionist answers it · texting arrives when the carriers register it`], verb: { label: "Get a line", to: "verb:choose-line" } })
      : billingDoorOpen(i.billing)
        ? row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: "Add a card, then get a number for calls.", details: [`A local number is about $${lines.costs.local_number_month_usd.toFixed(2)} a month, billed with your subscription`, "Nothing is charged until your trial ends"], verb: { label: "Open Billing", to: "admin/billing" } })
        // CANNOT SPEND, AND THERE IS NO CARD TO ADD. Three states, not two: this
        // row used to collapse the last into the middle one and send a brand-new
        // self-serve workspace to a Billing page with every action false. The
        // billing row above already drew nothing for exactly this case, so the two
        // rows disagreed about one fact — which is why they now read one predicate.
        //
        // The honest offer is the one the branch below already makes for a
        // deployment that cannot provision at all: a person sets the line up with
        // them. It is true, it is actionable, and it does not require the owner to
        // discover on a dead page that the product cannot take their money yet.
        : row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: "We set up your phone line with you.", details: ["A number, the receptionist answering it, and forwarding from the number you have", "Billing is not open on this deployment yet, so there is nothing to add a card to"], verb: { label: "Ask for a line", to: "verb:request-line" } });
  } else {
    // Until lines provision themselves, the ask is the owner's move; from then on it is ours.
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: "We set up your phone line with you.", details: ["A number, the receptionist answering it, and forwarding from the number you have"], verb: { label: "Ask for a line", to: "verb:request-line" } });
  }

  // 4. The phone receptionist — answering on the line, transferring to a person.
  if (voiceReady) {
    const last = voice.lastInboundAt ? `Last call ${agoWords(Date.parse(voice.lastInboundAt), nowMs)}` : "No calls yet";
    const cap = capabilityStatus("voice", i, nowMs);
    // A line can be bought in a minute and the facts take longer, so a
    // receptionist can be answering with nothing to answer WITH. It does not
    // invent — it says someone will confirm and takes a message — but the
    // page said "Answering", which reads as ready, and the one thing that
    // would fix it was three rows up with no mention of the phone.
    if (!i.business.name || !i.business.hours) {
      row({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "waiting_you", required: !answering, sentence: `Picking up on ${voiceNum}, but it has no facts to answer with yet.`, details: ["Callers are told someone will confirm and are offered to leave a message", "Fill in your name, hours and services and it answers properly from the next call"], verb: { label: "Add your facts", to: "admin/workspace" } });
    } else {
      row({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "ready", required: !answering, sentence: `Answering on ${voiceNum}.`, details: [handoffNum ? `Transfers to ${handoffNum} when a caller insists on a person` : "No hand-off number yet — callers who insist on a person are told someone will call back", last, activationWords(cap, nowMs)], verb: cap.tested && !cap.live ? { label: "Activate", to: "verb:activate:voice" } : voice.number ? { label: "Call it", to: `tel:${voice.number}` } : null, undo: cap.live ? { label: "Withdraw activation", to: "verb:deactivate:voice" } : null });
    }
  } else if (voice.present) {
    row({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "waiting_you", required: !answering, sentence: "Switched off with the line.", details: [], verb: null });
  } else if (ownLine && (ownLine.voice_state === "provisioning" || ownLine.voice_state === "answering")) {
    row({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "waiting_them", required: !answering, sentence: "Being created with your line — it answers the moment the line does.", details: [], verb: null });
  } else {
    row({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "waiting_them", required: !answering, sentence: "The phone receptionist arrives with your line.", details: [], verb: null });
  }

  // 4b. The number you already have — forwarded to the receptionist's line, proven by a test call.
  {
    const fw = lines.rows.find((l) => l.kind === "forwarded") ?? null;
    const f = fw?.forwarding ?? null;
    const kept = fw?.e164 ? display(fw.e164) ?? fw.e164 : "your number";
    const dest = voiceReady && voice.number ? voiceNum : null;
    const how = f ? `${MODE_WORDS[f.mode as ForwardingMode] ?? "Forwarded"} · ${CARRIER_WORDS[f.carrier as Carrier] ?? "your carrier"}` : "";
    const title = "The number you already have";
    if (fw && f && fw.forwarding_state === "verified") {
      row({ id: "keep", icon: "refresh", title, state: "ready", required: false, sentence: `Calls to ${kept} reach your receptionist.`, details: [f.verified_at ? `Verified ${agoWords(Date.parse(f.verified_at), nowMs)}` : "Verified", how], verb: { label: "Change it", to: "verb:forwarding" } });
    } else if (fw && f && forwardingTestOpen(f, nowMs)) {
      row({ id: "keep", icon: "refresh", title, state: "waiting_you", required: false, sentence: `Testing — call ${kept} from another phone. This page updates by itself.`, details: [`Window open for ${spanLabel(Date.parse(f.test_until ?? "") - nowMs)}`], verb: { label: "Show the code", to: "verb:forwarding" } });
    } else if (fw && f) {
      row({ id: "keep", icon: "refresh", title, state: "waiting_you", required: false, sentence: `Dial the code on the phone with ${kept}, then test it.`, details: [how], verb: { label: "Test it", to: `verb:forwarding-test:${fw.id}` } });
    } else if (!dest) {
      row({ id: "keep", icon: "refresh", title, state: "not_started", required: false, sentence: "Once your receptionist has a line, keep the number customers know by forwarding its calls to it.", details: [], verb: null });
    } else {
      row({ id: "keep", icon: "refresh", title, state: "not_started", required: false, sentence: `Keep the number your customers know: forward its calls to ${dest}.`, details: ["You keep your phone, your carrier and your texts"], verb: { label: "Set up forwarding", to: "verb:forwarding" } });
    }
  }

  // 5. WhatsApp — the number customers write to, and the messages Meta approved.
  if (waReady) {
    const t = i.templates;
    const metaWaits = t.approved === 0 && t.pending > 0;
    const cap = capabilityStatus("whatsapp", i, nowMs);
    const details = [
      wa.quality ? `Quality ${wa.quality.toLowerCase()}` : "",
      t.approved ? `${plural(t.approved, "approved message")}` : t.pending ? `${plural(t.pending, "message")} with Meta for approval` : "No approved messages yet",
      t.startersApproved < 5 ? "Add the starter messages: welcome, win-back, the month's offer" : "",
      wa.lastInboundAt ? `Last message ${agoWords(Date.parse(wa.lastInboundAt), nowMs)}` : "",
    ].filter(Boolean);
    if (!metaWaits) details.push(activationWords(cap, nowMs));
    row({ id: "whatsapp", icon: "chat", title: "WhatsApp", state: metaWaits ? "waiting_them" : "ready", stateWords: metaWaits ? "Waiting on Meta" : undefined, required: !answering, sentence: metaWaits ? `Connected on ${waNum} — your first messages are with Meta for approval.` : `Connected on ${waNum}.`, details, verb: cap.tested && !cap.live && !metaWaits ? { label: "Activate", to: "verb:activate:whatsapp" } : t.startersApproved < 5 && !metaWaits ? { label: "Add the starters", to: "outbound" } : { label: "Open the Inbox", to: "inbox" }, undo: cap.live && !metaWaits ? { label: "Withdraw activation", to: "verb:deactivate:whatsapp" } : null });
  } else if (wa.present) {
    row({ id: "whatsapp", icon: "chat", title: "WhatsApp", state: "waiting_you", required: !answering, sentence: `${waNum ?? "Your number"} is connected but switched off.`, details: [], verb: { label: "Open Connections", to: "admin/integrations" } });
  } else {
    row({ id: "whatsapp", icon: "chat", title: "WhatsApp", state: "waiting_you", required: !answering, sentence: "Connect the WhatsApp number customers write to.", details: ["A new number, or the WhatsApp Business app you already use"], verb: { label: "Connect", to: "admin/integrations" } });
  }

  // 6. Calendar — what is taken, so the receptionist offers real times.
  row(i.calendar.state === "ok"
    ? { id: "calendar", icon: "calendar", title: "Calendar", state: "ready", required: false, sentence: "Readable — the receptionist offers times from it.", details: [], verb: { label: "Open Calendar", to: "calendar" } }
    : i.calendar.state === "unavailable"
      ? { id: "calendar", icon: "calendar", title: "Calendar", state: "waiting_you", required: false, sentence: `Your calendar could not be read. ${i.calendar.problem ? `${i.calendar.problem} ` : ""}Check the address in Workspace.`, details: [], verb: { label: "Check the feed", to: "admin/workspace" } }
      : { id: "calendar", icon: "calendar", title: "Calendar", state: "not_started", required: false, sentence: "Paste your calendar's iCal address so the receptionist knows what is taken.", details: [], verb: { label: "Paste the feed", to: "admin/workspace" } });

  // 7. Team and alerts — someone else who answers, and where alerts go.
  {
    const t = i.team;
    const people = t.members > 1 || t.invitesOpen > 0;
    const who = `${plural(t.members, "person", "people")}${t.invitesOpen ? ` · ${plural(t.invitesOpen, "invite")} open` : ""}`;
    const alerts = t.alertEmails ? `alerts go to ${plural(t.alertEmails, "address", "addresses")}` : "no alert address yet";
    row({
      id: "team", icon: "users", title: "Team and alerts",
      state: people && t.alertEmails ? "ready" : !people && !t.alertEmails ? "not_started" : "waiting_you",
      required: false,
      sentence: people ? `${who} · ${alerts}.` : `Only you so far · ${alerts}.`,
      details: people ? [] : ["Invite someone who answers when you can't"],
      verb: !t.alertEmails ? { label: "Set alerts", to: "admin/notifications" } : !people ? { label: "Invite", to: "admin/team" } : { label: "Open Team", to: "admin/team" },
    });
  }

  // 8. The first yes to OFFERS — the only answer a promotional broadcast may be
  //    sent on. (A utility template reaches the conversational yes instead; this
  //    row is about the one that gates a promotion.)
  //
  // The OFFERS answer decides this row, because a marketing broadcast is what it
  // sends people to. The conversational count rides along as a detail when the
  // two differ, which is the common case and the useful one: "seven answer you,
  // none has said yes to offers" tells the owner exactly what to go and ask for.
  {
    const offers = i.consent.offers;
    const talk = i.consent.yes;
    const alsoTalk = talk > offers ? [`${plural(talk, "person", "people")} said yes to messages about their own visit`] : [];
    row(offers > 0
      ? { id: "yes", icon: "tag", title: "The first yes", state: "ready", required: false, sentence: `${plural(offers, "person", "people")} said yes to offers.`, details: alsoTalk, verb: { label: "Open Broadcasts", to: "broadcasts" } }
      : { id: "yes", icon: "tag", title: "The first yes", state: "not_started", required: false, sentence: "Nobody has said yes to offers yet. The keyword and the QR are on Broadcasts.", details: alsoTalk, verb: { label: "Get their yes", to: "broadcasts" } });
  }

  // 9. Your Google listing — public, found from the facts above; new reviews reach the bell and Reports.
  // Absent until this deployment can look listings up: a row must never draw a verb that cannot work.
  if (i.google?.ready) {
    const g = i.google.listing;
    const title = "Your Google listing";
    const connected = i.google.connected === true;
    const reach = connected ? "Business Profile connected — every review, replies from Reports" : "New reviews reach your bell and Reports";
    if (g && g.check_error) {
      row({ id: "google", icon: "star", title, state: "waiting_them", stateWords: "Waiting on Google", required: false, sentence: `${g.name} is on record, but Google could not be read${g.checked_at ? ` since ${agoWords(Date.parse(g.checked_at), nowMs)}` : " yet"} — it is read again once a day.`, details: [], verb: { label: "Open Reports", to: "reports" } });
    } else if (g) {
      row({ id: "google", icon: "star", title, state: "ready", required: false, sentence: `${listingLine(g)}.`, details: [g.checked_at ? `Checked ${agoWords(Date.parse(g.checked_at), nowMs)}` : "Not read yet", reach], verb: { label: "Open Reports", to: "reports" } });
    } else if (i.google.places !== false) {
      row({ id: "google", icon: "star", title, state: "not_started", required: false, sentence: "Find your business on Google so new reviews reach you here.", details: [i.business.address ? "Uses the name and address on record" : "Add your address in Workspace for a surer match"], verb: { label: "Find it", to: "verb:google-find" } });
    } else {
      // Only the profile door is open here: the listing arrives with the connection.
      row({ id: "google", icon: "star", title, state: "not_started", required: false, sentence: "Connect your Google Business Profile so every review reaches you here.", details: ["Sign in to Google once, on Connections"], verb: { label: "Connect", to: "admin/integrations" } });
    }
  }

  const open = rows.filter((r) => r.state !== "ready" && !r.later);
  const nextRow = open.find((r) => r.verb) ?? null;
  const next = nextRow && nextRow.verb ? { label: nextRow.verb.label, to: nextRow.verb.to, row: nextRow.id, title: nextRow.title } : null;
  const done = rows.filter((r) => r.state === "ready").length;
  const seriousConflict = (i.conflicts ?? []).find((k) => k.severity === "serious") ?? null;
  const sentence = seriousConflict
    // "Answering" and "answering correctly" are different claims, and the top
    // line of Setup is where an owner reads the second one.
    ? seriousConflict.sentence
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
    line: next ? `Setup · ${done} of ${rows.length} · ${next.title}: ${next.label.toLowerCase()}` : null,
    tryIt: answering
      ? { voice: voiceReady ? voice.number : null, voiceLabel: voiceReady ? voiceNum : null, whatsapp: waReady ? wa.number : null, whatsappLabel: waReady ? waNum : null }
      : null,
  };
}

/** The hash route without "#/": "#/admin/setup" → "admin/setup"; nothing → "today". */
export function setupRoute(hash: string): string {
  return (hash || "#/today").replace(/^#\/?/, "");
}

/**
 * Whether this arrival lands on Setup: an owner, a receptionist that answers
 * nowhere yet, a plain arrival (Today or nothing), and not already sent
 * there this session. Everyone else gets Today.
 */
export function shouldLandOnSetup(role: string | null | undefined, answering: boolean, route: string, landed: boolean): boolean {
  if (landed || role !== "owner" || answering) return false;
  return route === "" || route === "today";
}
