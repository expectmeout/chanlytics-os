import "server-only";
import {
  AppError,
  DAY_MS,
  HAND_WORDS_MAX,
  NEW_ONCE_AHEAD_DAYS,
  NEW_STEPS_MAX,
  NEW_WORDS,
  NUMBERED_SLOT,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_HOURS,
  handStepsHold,
  linkCount,
  newConditionsOf,
  newSequenceMode,
  newWaitOf,
  numberedValues,
  slugTemplateName,
  validateReachOutWords,
  violatesNoPrices,
  wordsIssueWords,
  newListOf,
  whoSuits,
  clipAtWord,
  type ConsentChannel,
  type NewAudience,
  type NewDraftAnswer,
  type NewDraftAnswerStep,
  type NewDraftAsk,
  type NewDraftDto,
  type NewEmail,
  type NewKind,
  type NewMessage,
  type NewStep,
  type DraftWho,
  type NewWrittenMessage,
  type ParamSourceKind,
  type ParamSpec,
} from "@chanlytics/contracts";
import type { PoolRead } from "@/lib/campaign-channels";
import { carriersOf, newChecksOf, newReachOf, twinOf, type NewCounts, type NewRunning } from "@/lib/new-checks";
import { checkMessage } from "../write-message";
import { NOTHING_STOOD, standingAt, stoodStepsOf, type Standing } from "./draft-stands";
import { leftOutKept } from "./left-out";
import { numberBacking, ownerPriceWords, unbackedNumbers, unsaidPrice } from "./numbers";

/**
 * Ask's answer to New, judged (decision 0065): only what this workspace offers and holds is kept, within each audience's
 * bounds, as the database holds them. Who is one the request named; a person's message is one the workspace can send now
 * (with values its run can fill) or one Ask wrote that the message door would file (write-message.ts checkMessage); a
 * lead's email holds as every email must (contracts validateReachOutWords); a wait is the audience's; a call or a note is
 * the last step, never the first. What could not be kept is said once (`cannot`). Pure over what was read
 * (campaigns/sequences/draft.ts), so it is tested without a model.
 */

/** How long a name Ask gives may run, a draft's or a written message's: a longer one is cut after a whole word. */
const ASKED_NAME_MAX = 80;
const nameKept = (name: string): string =>
  name.trim().length <= ASKED_NAME_MAX ? name.trim() : clipAtWord(name, ASKED_NAME_MAX - 1);

/** A moment this workspace may start a sequence on, as the model is handed it. */
export interface KnownMoment {
  key: string;
  trigger: string;
  label: string;
  hint: string;
  cls: string;
  /** A visit moment: its run knows each visit, so a first step on it may say the booked time or service. */
  visits: boolean;
  proposal: boolean;
  /** Filling a cancellation (0082): its batch knows the freed time, so a first step on it may say it. */
  freed: boolean;
  count: number | null;
  /** Who it names and who of them can hear it, as Campaigns' pools count it; null where it was not counted. */
  pool: PoolRead | null;
}

export interface KnownList {
  key: string;
  token: string;
  label: string;
  count: number | null;
  pool: PoolRead | null;
}

export interface KnownSearch {
  key: string;
  id: string;
  label: string;
  ready: number;
  /** Addresses still being checked: they join once the check says ok. */
  checking: number;
}

/** A message this workspace can send now, as the model is handed it and the draft shows it. */
export interface KnownMessage {
  key: string;
  templateId: string;
  title: string;
  body: string;
  offer: boolean;
  channels: ConsentChannel[];
  slots: ParamSourceKind[];
  /** Its values' names (contracts slotLabels), which the draft asks a typed value as. */
  labels?: string[];
}

/** A sequence the workspace keeps, for its twin (lib/new-checks.ts, which New's page reads it by too). */
export type KnownRunning = NewRunning;

/**
 * One first email of a started sequence to leads, as the drafter is handed it (decision 0078 and its step 2): the words as
 * the owner left them, what Ask drafted for them where the make kept it (null where the sequence was written by hand or
 * made before it was kept), what it was for (its search's name), and how it did, as its record counts it.
 */
export interface DraftExample {
  subject: string | null;
  body: string;
  drafted?: { subject: string | null; body: string } | null;
  for?: string | null;
  numbers?: { written: number; wrote_back: number; said_no: number } | null;
}

/** What the model is told of what a business offers and how its owner writes: a draft's, and a rewrite's (rewrite.ts). */
export type OwnerKnown = Pick<
  DraftKnown,
  "goal" | "about" | "services" | "tone" | "memory" | "examples" | "offer" | "whoFor" | "fixes" | "proof"
>;

/** What a draft is judged against: the business, what it offers and holds, and what already runs. */
export interface DraftKnown {
  business: string;
  /** What the business is working toward, in its own words (config `ask.goal`): what a sequence to leads offers. */
  goal?: string | null;
  /** What the business does, in its own words (business_records.about), as the check's writer reads it (0078). */
  about?: string | null;
  /** What a cold email offers, who it is for and what it fixes: Cold email's own words, where set (0113). */
  offer?: string | null;
  whoFor?: string | null;
  fixes?: string | null;
  /** The claims the owner stands behind, the only place Ask may take a number about the business from (0113). */
  proof?: string[];
  /** Its services' names, as Business lists them. */
  services?: string[];
  /** How it sounds, in its own words (profile.tone), as the receptionist is composed with it. */
  tone?: string | null;
  /** Ask's live memory (0070): what a member told it, and what it learned from how the owner writes (0078). */
  memory?: Array<{ text: string; source: string }>;
  /** The first emails of the workspace's last started sequences to leads, as the owner left them (0078). */
  examples?: DraftExample[];
  /** The business's day and time now ("YYYY-MM-DDTHH:MM"), which a one-off's moment is set from. */
  localNow: string;
  moments: KnownMoment[];
  lists: KnownList[];
  everyone: number | null;
  /** Everyone who said yes to offers, as the month's offer counts them: an offer to everyone's reach. */
  everyonePool: PoolRead | null;
  searches: KnownSearch[];
  messages: KnownMessage[];
  running: KnownRunning[];
  /** The channels the workspace can send on now. */
  ready: ConsentChannel[];
  /** Each class's Autonomy row's mode, which a new sequence of it starts as. */
  classModes: Record<string, string | null>;
  mailbox: { ids: string[]; label: string } | null;
  /** Whether the workspace makes previews for its leads (decision 0079): a later step to leads may name {{their preview}}. */
  previews?: boolean;
}

/**
 * A step kept, or what the draft says of one that was not; and why its words could not be kept, where that is known: a
 * step left out, or a lead's email kept with its words left to write.
 */
type Judged = { step: NewStep; reason?: string } | { dropped: string; reason?: string };

/** A reason as a clause: the message door's own sentences lose their closing stop. */
const clause = (reason: string): string => reason.trim().replace(/[.!]+$/, "");

/** A step Ask's answer wrote that cannot be kept: its place in the answer, and why. */
export interface RefusedStep {
  place: number;
  reason: string;
}

const typedWords = (text: string | undefined): string => (text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);

/**
 * A step's values from its message's slots: typed words from the model's, unless they name a price or a discount the owner
 * never gave (`owner`, numbers.ts unsaidPrice: Ruben, 13 Nov 2026, a customer offer carries the owner's own discount);
 * the rest the run's. Words the owner typed into the message that stands here (`typed`) are theirs whatever they say: the
 * price rule emptied an owner's "20% off" on any change (the review of 12 Nov 2026).
 */
function paramsOf(
  slots: readonly ParamSourceKind[],
  texts: readonly string[],
  their: { typed: readonly string[]; owner: readonly string[] },
): ParamSpec[] {
  let typed = 0;
  return slots.map((kind) => {
    if (kind !== "text") return { kind };
    const at = typed++;
    const sentence = typedWords(texts[at]);
    const kept = sentence !== "" && sentence === typedWords(their.typed[at]);
    return { kind: "text", value: !kept && unsaidPrice(sentence, their.owner) ? "" : sentence };
  });
}

/**
 * Whether a step's run can fill each value: a visit's only on a visit moment's first step, a proposal's on the
 * follow-up's, the freed time on filling a cancellation's (0082).
 */
function fillable(slots: readonly ParamSourceKind[], first: boolean, moment: KnownMoment | null): boolean {
  return slots.every((s) =>
    s === "visit_when" || s === "visit_service"
      ? first && !!moment?.visits
      : s === "proposal_link"
        ? first && !!moment?.proposal
        : s === "freed_when"
          ? first && !!moment?.freed
          : true,
  );
}

const cleanWords = (s: string) => s.replace(/\r\n?/g, "\n").trim();

/**
 * A message Ask wrote for a person's step, as the message door would file it; or why it would not, in a clause
 * (NEW_WORDS.cannot.why, or the door's own words). One that stands in the draft and came back untouched (`asStands`) is
 * taken as it stands: what its owner wrote is theirs until the make judges it, and its text version stays.
 */
function askWrittenOf(
  write: NewDraftAnswerStep["write"],
  first: boolean,
  on: { moment: KnownMoment | null; asStands: boolean; owner: readonly string[] },
): NewMessage | string {
  const { moment, asStands } = on;
  // A message about the person's own visit is utility where WhatsApp reviews it: the first step of a visit's moment,
  // the one the visit sends. A later step (an invitation back, a nudge to book) is an offer, as is anything else:
  // marketing, which only a yes to offers hears and a text never carries (consent purposeOfTemplate; write-message.ts).
  // Ruben's call, 12 Nov 2026: a "come back and book" weeks after a visit went as about their booking, by text, to people
  // who never said yes to offers.
  const utility = first && !write.offer && !!moment?.visits && !!cleanWords(write.whatsapp);
  const parts = writtenParts(write, utility || asStands);
  if (typeof parts === "string") return parts;
  const { title, versions, slots } = parts;
  const category = utility ? "utility" : "marketing";
  const written: NewWrittenMessage = { name: slugTemplateName(title), category, versions, slots };
  // A price or a discount the owner never gave is none of theirs to send (Ruben, 13 Nov 2026); one they gave is the offer.
  const words = [write.whatsapp, write.text, write.email_subject, write.email_body].join("\n");
  const refusal = asStands
    ? null
    : unsaidPrice(words, on.owner)
      ? NEW_WORDS.cannot.why.unsaidPrice
      : writtenRefusal(written, first, moment);
  if (refusal !== null) return refusal;
  const channels = (["whatsapp", "email", "sms"] as const).filter((c) => !!versions[c]);
  return {
    template_id: null,
    title,
    body: versions.whatsapp?.body ?? versions.sms?.body ?? versions.email?.body ?? "",
    channels,
    // A slot the draft fills by hand has no words yet; the rest are filled from the person when it sends.
    params: slots.map((s): ParamSpec => (s.kind === "text" ? { kind: "text", value: "" } : { kind: s.kind })),
    // As a held message is: an offer is what a yes to offers hears (draft.ts offeredOf, purpose marketing).
    offer: !utility,
    written,
  };
}

/** What Ask wrote as a message holds it: its name, a version a channel, its values numbered; or why it is none, in a clause. */
function writtenParts(
  write: NewDraftAnswerStep["write"],
  withText: boolean,
): { title: string; versions: NewWrittenMessage["versions"]; slots: NewWrittenMessage["slots"] } | string {
  const wa = cleanWords(write.whatsapp);
  const sms = withText ? cleanWords(write.text) : "";
  const subject = cleanWords(write.email_subject);
  const email = cleanWords(write.email_body);
  const title = nameKept(write.title);
  if (!title || (!wa && !sms && !(subject && email))) return NEW_WORDS.cannot.why.noWords;
  const numbered = numberedValues([wa, sms, subject, email]);
  if (!numbered) return NEW_WORDS.cannot.why.unknownValue;
  const { rewrite, slots } = numbered;
  const versions: NewWrittenMessage["versions"] = {
    ...(wa ? { whatsapp: { body: rewrite(wa) } } : {}),
    ...(subject && email ? { email: { subject: rewrite(subject), body: rewrite(email) } } : {}),
    ...(sms ? { sms: { body: rewrite(sms) } } : {}),
  };
  return { title, versions, slots };
}

/** Why a message Ask wrote cannot be kept, in a clause (the judge's own reasons, then the message door's); null where it can. */
function writtenRefusal(written: NewWrittenMessage, first: boolean, moment: KnownMoment | null): string | null {
  const { versions, slots } = written;
  const kinds = slots.map((s) => s.kind);
  if (!fillable(kinds, first, moment)) return NEW_WORDS.cannot.why.onlyFirst;
  // A message's values are every version's: WhatsApp's words, which Meta reviews with an example for each, name them all.
  const wa = versions.whatsapp?.body ?? "";
  if (wa && new Set(wa.match(NUMBERED_SLOT) ?? []).size < slots.length) return NEW_WORDS.cannot.why.valuesDiffer;
  try {
    checkMessage({ name: written.name, language: "en", category: written.category, versions, slots });
  } catch (e) {
    if (e instanceof AppError) return clause(e.message);
    throw e;
  }
  return null;
}

/** A person's message step: a held message by its key, or one Ask wrote; or why neither can be kept, in a clause. */
function peopleMessage(
  newDraftAnswerStep: NewDraftAnswerStep,
  first: boolean,
  on: { known: DraftKnown; moment: KnownMoment | null; standing: Standing; owner: readonly string[] },
): NewMessage | string {
  const { known, moment, standing, owner } = on;
  const held = newDraftAnswerStep.message
    ? known.messages.find((m) => m.key === newDraftAnswerStep.message)
    : undefined;
  if (held) {
    if (!standing.untouched && !fillable(held.slots, first, moment)) return NEW_WORDS.cannot.why.onlyFirst;
    return {
      template_id: held.templateId,
      title: held.title,
      body: held.body,
      channels: held.channels,
      params: paramsOf(held.slots, newDraftAnswerStep.texts, {
        typed: standing.untouched ? newDraftAnswerStep.texts : standing.texts,
        owner,
      }),
      offer: held.offer,
      written: null,
      ...(held.labels ? { labels: held.labels } : {}),
    } satisfies NewMessage;
  }
  if (!newDraftAnswerStep.write.title) return NEW_WORDS.cannot.why.noMessage;
  return askWrittenOf(newDraftAnswerStep.write, first, { moment, asStands: standing.untouched, owner });
}

/**
 * A lead's email: kept where it holds as every email must, a first one with no link (the check says so), and no number
 * about the business that the owner's claims or its name do not back (decision 0113), else left for the owner to write.
 */
export function leadEmail(
  newDraftAnswerStep: Pick<NewDraftAnswerStep, "subject" | "body">,
  first: boolean,
  backing: readonly string[],
): NewEmail {
  const item = emailWritten(newDraftAnswerStep, first);
  return leadEmailRefusal(item, first, backing) === null ? item : { subject: first ? item.subject : null, body: "" };
}

/** A lead's email as it was written: a later one answers in the first's thread, so it has no subject. */
const emailWritten = (written: Pick<NewDraftAnswerStep, "subject" | "body">, first: boolean): NewEmail => ({
  subject: first ? cleanWords(written.subject) || null : null,
  body: cleanWords(written.body),
});

/** Why a lead's email does not hold, in a clause (the rule it breaks, in the words its sheet says it in); null where it holds. */
function leadEmailRefusal(item: NewEmail, first: boolean, backing: readonly string[]): string | null {
  const reasons = NEW_WORDS.cannot.why;
  const issue = validateReachOutWords(item, first)[0];
  if (issue) return clause(wordsIssueWords(issue));
  if (violatesNoPrices(`${item.subject ?? ""} ${item.body}`)) return reasons.price;
  if (first && linkCount(item.body) > 0) return reasons.firstLink;
  if (unbackedNumbers(`${item.subject ?? ""}\n${item.body}`, backing).length > 0) return reasons.unbackedNumber;
  return null;
}

/**
 * What may back a number in a lead's step (decision 0113): each claim the owner stands behind, the business's name, and
 * what the owner typed into New, which Ask is told (drafts/sequence.ts) and may repeat as the owner's own words. Where
 * the line changes a draft that stands, what it was first drafted from and its emails as they stand back one too: a
 * number the owner already kept is theirs to keep, as a rewrite's is (drafts/sequence-rewrite.ts).
 */
export function draftBackingOf(
  known: Pick<DraftKnown, "business" | "proof">,
  ask: Pick<NewDraftAsk, "words" | "stands">,
): string[] {
  const stood = ask.stands ? [ask.stands.said, ...ask.stands.steps.flatMap((step) => [step.subject, step.body])] : [];
  return numberBacking(known.proof, known.business, [ask.words, ...stood]);
}

/** A call's or a note's words, kept where they say something to do. */
const handWords = (a: NewDraftAnswerStep): string => a.words.replace(/\s+/g, " ").trim().slice(0, HAND_WORDS_MAX);

function judgeStep(
  newDraftAnswerStep: NewDraftAnswerStep,
  index: number,
  params: {
    audience: NewAudience;
    known: DraftKnown;
    moment: KnownMoment | null;
    name: string;
    backing: string[];
    owner: string[];
  },
  standing: Standing,
): Judged {
  const first = index === 0;
  const base = {
    name: first ? params.name : "",
    after_days: first ? null : newWaitOf(params.audience, newDraftAnswerStep.after_days),
    only_if: first ? [] : newDraftAnswerStep.only_if.filter((c) => newConditionsOf(params.audience).includes(c)),
  };
  if (newDraftAnswerStep.does !== "message") {
    const hand = handWords(newDraftAnswerStep);
    if (first || !hand) return { dropped: NEW_WORDS.cannot.stepDropped };
    return { step: { ...base, does: newDraftAnswerStep.does, message: null, email: null, hand } };
  }
  if (params.audience === "leads") {
    // An email that stands and came back untouched is its owner's as it stands; any other holds, or is left to write.
    const written = emailWritten(newDraftAnswerStep, first);
    const reason = standing.untouched ? null : leadEmailRefusal(written, first, params.backing);
    const email = reason === null ? written : { subject: written.subject, body: "" };
    const step: NewStep = { ...base, does: "message", message: null, email, hand: "" };
    return reason !== null && written.body ? { step, reason } : { step };
  }
  const message = peopleMessage(newDraftAnswerStep, first, {
    known: params.known,
    moment: params.moment,
    standing,
    owner: params.owner,
  });
  if (typeof message === "string")
    return { dropped: first ? NEW_WORDS.cannot.noMessage : NEW_WORDS.cannot.stepDropped, reason: message };
  return { step: { ...base, does: "message", message, email: null, hand: "" } };
}

/**
 * The steps kept, at most the audience's, a once's one; a call or a note only as the last. Where the line changes a draft
 * that stands (draft-stands.ts), a step the answer left word for word as it stood is taken as it stands, and one it
 * rewrote in words that cannot be kept stays as it stood (`always` says so): a change never loses, or empties, what its
 * owner did not ask to lose (the live run of 11 Nov 2026: "make the second message shorter" came back with no second
 * message; the review of 12 Nov: a lead's email came back empty). Each step whose words could not be kept is named with
 * why (`refused`): the draft's card says it, and Ask is asked once more with it (drafts/sequence.ts).
 */
function judgeSteps(
  answer: NewDraftAnswer,
  params: {
    audience: NewAudience;
    kind: NewKind;
    known: DraftKnown;
    moment: KnownMoment | null;
    name: string;
    backing: string[];
    owner: string[];
    stood: readonly NewDraftAnswerStep[] | null;
  },
): { steps: NewStep[]; cannot: string[]; always: string[]; refused: RefusedStep[] } {
  const max = params.kind === "once" ? 1 : NEW_STEPS_MAX[params.audience];
  const steps: NewStep[] = [];
  const cannot: string[] = [];
  const always: string[] = [];
  const refused: RefusedStep[] = [];
  for (const [at, answered] of answer.steps.entries()) {
    if (steps.length >= max) break;
    const standing = standingAt(params.stood, answered, { at, of: answer.steps.length });
    const placed = placeStep(answered, { at, index: steps.length }, params, standing);
    if (placed.reason) refused.push({ place: at + 1, reason: placed.reason });
    if (placed.step) steps.push(placed.step);
    // What stays as it stood, or is left to write, is always said; a step left out, where Ask says nothing of its own.
    if (placed.note) (placed.step ? always : cannot).push(placed.note);
    if (!placed.step && steps.length === 0) break;
  }
  // A call or a note stands last: one before a message ends the steps there.
  const lastHand = steps.findIndex((s) => s.does !== "message");
  if (lastHand >= 0 && lastHand < steps.length - 1) {
    steps.splice(lastHand + 1);
    cannot.push(NEW_WORDS.cannot.handNotLast);
  }
  if (!handStepsHold(steps)) return { steps: [], cannot: [NEW_WORDS.cannot.nothingFits], always: [], refused };
  return { steps, cannot, always, refused };
}

/**
 * What becomes of one answered step: kept; kept as it stood, where its new words cannot be; kept with its email left to
 * write, on a first draft; or left out. With what the draft says of it, and why its words could not be kept.
 */
function placeStep(
  answered: NewDraftAnswerStep,
  place: { at: number; index: number },
  params: Parameters<typeof judgeStep>[2],
  standing: Standing,
): { step: NewStep | null; note: string | null; reason: string | null } {
  const says = NEW_WORDS.cannot;
  const judged = judgeStep(answered, place.index, params, standing);
  const reason = judged.reason ?? null;
  if ("step" in judged && reason === null) return { step: judged.step, note: null, reason };
  // The step that stood here, taken as it stands: a change never loses, or empties, what its owner had.
  const was = standing.was ? judgeStep(standing.was, place.index, params, { ...NOTHING_STOOD, untouched: true }) : null;
  if (was && "step" in was)
    return { step: was.step, note: says.stepStays(place.index + 1, reason ?? says.why.noWords), reason };
  if ("step" in judged) return { step: judged.step, note: says.emailLeftBlank(place.at + 1, reason ?? ""), reason };
  // A later step left out says which and why; the first is the draft's own refusal (noMessage), as it was.
  const note = reason !== null && place.index > 0 ? says.stepLeftOut(place.at + 1, reason) : judged.dropped;
  return { step: null, note, reason };
}

/**
 * Who the answer named, by its key, else the one the owner or a door chose. A draft being changed keeps who it was for
 * where the answer names no one the request lists.
 */
function answerWhoOf(answer: NewDraftAnswer, known: DraftKnown, ask: NewDraftAsk): DraftWho | null {
  if (ask.who) return ask.who;
  const key = answer.who;
  const moment = known.moments.find((m) => m.key === key);
  if (moment) return { kind: "moment", trigger: moment.trigger, label: moment.label };
  const list = known.lists.find((l) => l.key === key);
  if (list) return { kind: "list", token: list.token, label: list.label };
  const search = known.searches.find((s) => s.key === key);
  if (search) return { kind: "search", id: search.id, label: search.label };
  if (key === "everyone") return { kind: "everyone", label: NEW_WORDS.draft.everyoneNews };
  return ask.stands?.who ?? null;
}

/** Who New names, as its list rule reads it (contracts newListOf): never who said stop; a one-off's list of yeses, everyone. */
function asNewWho(draftWho: DraftWho | null, kind: NewKind): DraftWho | null {
  if (draftWho?.kind !== "list") return draftWho;
  const is = newListOf(draftWho.token, kind);
  return is === "never"
    ? null
    : is === "everyone"
      ? { kind: "everyone", label: NEW_WORDS.draft.everyoneNews }
      : draftWho;
}

/** A one-off's moment: now, or a time ahead the send may be set for (within NEW_ONCE_AHEAD_DAYS), as the model said it. */
function onceAt(when: string, localNow: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/.exec(when.trim());
  if (!m) return null;
  const at = `${m[1]}T${m[2]}:${m[3]}`;
  const ahead = (Date.parse(`${at}:00Z`) - Date.parse(`${localNow}:00Z`)) / DAY_MS;
  return ahead > 0 && ahead <= NEW_ONCE_AHEAD_DAYS ? at : null;
}

/** Campaigns' counts as the draft is read against them: each moment's, list's and everyone's pool by its key. */
function knownCountsOf(known: DraftKnown): NewCounts {
  const pools: Record<string, PoolRead | null> = { everyone_monthly: known.everyonePool };
  for (const m of known.moments) pools[m.trigger] = m.pool;
  for (const l of known.lists) pools[l.token] = l.pool;
  return { pools, searches: known.searches };
}

/** The class its steps run under: its moment's, a list's campaign, a lead's outreach. */
function classOf(audience: NewAudience, moment: KnownMoment | null): string {
  if (audience === "leads") return "outreach";
  return moment?.cls ?? "campaign";
}

/** How a draft goes, by what it is: its hour, a one-off's moment, its channels and mailbox, its class and its mode. */
function howOf(
  params: {
    kind: NewKind;
    audience: NewAudience;
    who: DraftWho | null;
    moment: KnownMoment | null;
    first: NewMessage | null;
  },
  answer: NewDraftAnswer,
  known: DraftKnown,
): Pick<NewDraftDto, "run_hour" | "at" | "channels" | "mailbox" | "adds_new" | "policy_class" | "mode"> {
  const leads = params.audience === "leads";
  const policy = classOf(params.audience, params.moment);
  const box = known.mailbox;
  return {
    run_hour: Math.min(PLAYBOOK_HOURS.max, Math.max(PLAYBOOK_HOURS.min, answer.hour || PLAYBOOK_DEFAULTS.runHour)),
    at: params.kind === "once" ? onceAt(answer.when, known.localNow) : null,
    channels: leads ? ["email"] : (params.first ? carriersOf(params.first) : []).filter((c) => known.ready.includes(c)),
    mailbox: leads ? { ids: box?.ids ?? [], label: box?.label ?? "" } : null,
    adds_new: leads && params.who?.kind === "search",
    policy_class: policy,
    mode:
      params.kind === "once"
        ? null
        : newSequenceMode(
            known.classModes[policy] ?? null,
            leads ? "leads" : null,
            params.who?.kind === "moment" ? params.who.trigger : null,
          ),
  };
}

/** Everyone is who said yes to what it is: an offer's yes, or a message's. */
const everyoneSaid = (draftWho: DraftWho | null, first: NewMessage | null): DraftWho | null =>
  draftWho?.kind === "everyone"
    ? { ...draftWho, label: first?.offer ? NEW_WORDS.draft.everyoneOffers : NEW_WORDS.draft.everyoneNews }
    : draftWho;

/** What an answer is judged as: what it is, who it is for, and its steps as the workspace can keep them. */
function judgedOf(answer: NewDraftAnswer, known: DraftKnown, ask: NewDraftAsk) {
  const kind = ask.kind ?? answer.kind;
  const audience = ask.audience ?? answer.audience;
  const named = asNewWho(answerWhoOf(answer, known, ask), kind);
  const draftWho = named && whoSuits(named, audience, kind) ? named : null;
  const moment =
    draftWho?.kind === "moment" ? (known.moments.find((m) => m.trigger === draftWho.trigger) ?? null) : null;
  const name = nameKept(answer.name.trim() || draftWho?.label || NEW_WORDS.title);
  const backing = draftBackingOf(known, ask);
  const owner = ownerPriceWords(ask, known.messages);
  const stood = ask.stands ? stoodStepsOf(ask.stands, known) : null;
  const judged = judgeSteps(answer, { audience, kind, known, moment, name, backing, owner, stood });
  return { kind, audience, draftWho, moment, name, ...judged };
}

/**
 * How an answer was judged, for the drafter to weigh one answer against another (drafts/sequence.ts): the steps whose
 * words cannot be kept, each with why (what Ask is told where it is asked once more), how many steps the draft keeps,
 * and how many the answer held.
 */
export function stepsJudged(
  answer: NewDraftAnswer,
  known: DraftKnown,
  ask: NewDraftAsk,
): { refused: RefusedStep[]; kept: number; answered: number } {
  const judged = judgedOf(answer, known, ask);
  return { refused: judged.refused, kept: judged.steps.length, answered: answer.steps.length };
}

/**
 * The draft from Ask's answer: the kind and audience the owner chose, else Ask's; who, when and the steps, each as this
 * workspace offers and holds them. A draft with no step is no draft: the route says why (422) in Ask's words, or in New's.
 */
export function draftKept(answer: NewDraftAnswer, known: DraftKnown, ask: NewDraftAsk): NewDraftDto {
  const { kind, audience, draftWho, moment, name, steps, cannot, always } = judgedOf(answer, known, ask);
  const sentence = leftOutKept(answer.cannot);
  // What Ask says it left out, else what the judge left out; and a step that stays as it stood is always said.
  const leftOut = sentence || [...new Set(cannot)].join(" ");
  const notes = [leftOut, ...always].filter(Boolean).join(" ");
  if (steps.length === 0) throw new AppError("validation", sentence || cannot[0] || NEW_WORDS.cannot.nothingFits);
  const first = steps[0]?.message ?? null;
  const how = howOf({ kind, audience, who: draftWho, moment, first }, answer, known);
  const draft: NewDraftDto = {
    // The line it was drafted from stays on top: a change says what to change, never what the draft is.
    said: (ask.stands ? ask.stands.said : ask.words).trim(),
    business: known.business,
    kind,
    audience,
    name,
    who: everyoneSaid(draftWho, first),
    ...how,
    steps,
    reach: newReachOf(draftWho, knownCountsOf(known), {
      kind,
      channels: how.channels,
      offer: !!first?.offer,
      review: !!first?.written?.versions.whatsapp,
    }),
    checks: [],
    twin: kind === "sequence" ? twinOf(draftWho, known.running) : null,
    cannot: notes || null,
  };
  return { ...draft, checks: newChecksOf(draft, known.ready) };
}
