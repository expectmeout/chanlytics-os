import "server-only";
import {
  AppError,
  DAY_MS,
  HAND_WORDS_MAX,
  NEW_ONCE_AHEAD_DAYS,
  NEW_STEPS_MAX,
  NEW_WORDS,
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
  newListOf,
  whoSuits,
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
import { checkMessage } from "../campaigns/write-message";

/**
 * Ask's answer to New, judged (decision 0065): only what this workspace offers and holds is kept, within each audience's
 * bounds, as the database holds them. Who is one the request named; a person's message is one the workspace can send now
 * (with values its run can fill) or one Ask wrote that the message door would file (write-message.ts checkMessage); a
 * lead's email holds as every email must (contracts validateReachOutWords); a wait is the audience's; a call or a note is
 * the last step, never the first. What could not be kept is said once (`cannot`). Pure over what was read
 * (sequences/draft.ts), so it is tested without a model.
 */

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

/** What a draft is judged against: the business, what it offers and holds, and what already runs. */
export interface DraftKnown {
  business: string;
  /** What the business is working toward, in its own words (config `ask.goal`): what a sequence to leads offers. */
  goal?: string | null;
  /** What the business does, in its own words (business_records.about), as the check's writer reads it (0078). */
  about?: string | null;
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

/** A step kept, or why it was not. */
type Judged = { step: NewStep } | { dropped: string };

/** A step's values from its message's slots: typed words from the model's, unless they name a price; the rest the run's. */
function paramsOf(slots: readonly ParamSourceKind[], texts: readonly string[]): ParamSpec[] {
  let t = 0;
  return slots.map((kind) => {
    if (kind !== "text") return { kind };
    const said = (texts[t++] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    return { kind: "text", value: violatesNoPrices(said) ? "" : said };
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

/** A message Ask wrote for a person's step, as the message door would file it; null where it would refuse it. */
function askWrittenOf(w: NewDraftAnswerStep["write"], first: boolean, moment: KnownMoment | null): NewMessage | null {
  const wa = cleanWords(w.whatsapp);
  // A message about the person's own visit is utility where WhatsApp reviews it; anything else is marketing, an offer or
  // news, which only a yes to offers hears and a text never carries (consent purposeOfTemplate; write-message.ts).
  const utility = !w.offer && !!moment?.visits && !!wa;
  const sms = utility ? cleanWords(w.text) : "";
  const subject = cleanWords(w.email_subject);
  const email = cleanWords(w.email_body);
  const numbered = numberedValues([wa, sms, subject, email]);
  const title = w.title.trim();
  if (!numbered || !title || (!wa && !sms && !(subject && email))) return null;
  const { rewrite, slots } = numbered;
  if (
    !fillable(
      slots.map((s) => s.kind),
      first,
      moment,
    )
  )
    return null;
  const versions: NewWrittenMessage["versions"] = {
    ...(wa ? { whatsapp: { body: rewrite(wa) } } : {}),
    ...(subject && email ? { email: { subject: rewrite(subject), body: rewrite(email) } } : {}),
    ...(sms ? { sms: { body: rewrite(sms) } } : {}),
  };
  const category = utility ? "utility" : "marketing";
  const written: NewWrittenMessage = { name: slugTemplateName(title), category, versions, slots };
  try {
    checkMessage({ name: written.name, language: "en", category, versions, slots });
  } catch (e) {
    if (e instanceof AppError) return null;
    throw e;
  }
  const channels = (["whatsapp", "email", "sms"] as const).filter((c) => !!versions[c]);
  return {
    template_id: null,
    title,
    body: versions.whatsapp?.body ?? versions.sms?.body ?? versions.email?.body ?? "",
    channels,
    params: slots.map((s) => ({ kind: s.kind }) as ParamSpec),
    // As a held message is: an offer is what a yes to offers hears (draft.ts offeredOf, purpose marketing).
    offer: !utility,
    written,
  };
}

/** A person's message step: a held message by its key, or one Ask wrote. */
function peopleMessage(a: NewDraftAnswerStep, first: boolean, known: DraftKnown, moment: KnownMoment | null) {
  const held = a.message ? known.messages.find((m) => m.key === a.message) : undefined;
  if (held) {
    if (!fillable(held.slots, first, moment)) return null;
    return {
      template_id: held.templateId,
      title: held.title,
      body: held.body,
      channels: held.channels,
      params: paramsOf(held.slots, a.texts),
      offer: held.offer,
      written: null,
      ...(held.labels ? { labels: held.labels } : {}),
    } satisfies NewMessage;
  }
  return a.write.title ? askWrittenOf(a.write, first, moment) : null;
}

/**
 * A lead's email: kept where it holds as every email must, and a first one with no link (the check says so), else left for
 * the owner to write.
 */
function leadEmail(a: NewDraftAnswerStep, first: boolean): NewEmail {
  const w = { subject: first ? cleanWords(a.subject) || null : null, body: cleanWords(a.body) };
  const holds =
    validateReachOutWords(w, first).length === 0 &&
    !violatesNoPrices(`${w.subject ?? ""} ${w.body}`) &&
    !(first && linkCount(w.body) > 0);
  return holds ? w : { subject: first ? w.subject : null, body: "" };
}

/** A call's or a note's words, kept where they say something to do. */
const handWords = (a: NewDraftAnswerStep): string => a.words.replace(/\s+/g, " ").trim().slice(0, HAND_WORDS_MAX);

function judgeStep(
  a: NewDraftAnswerStep,
  i: number,
  p: { audience: NewAudience; known: DraftKnown; moment: KnownMoment | null; name: string },
): Judged {
  const first = i === 0;
  const base = {
    name: first ? p.name : "",
    after_days: first ? null : newWaitOf(p.audience, a.after_days),
    only_if: first ? [] : a.only_if.filter((c) => newConditionsOf(p.audience).includes(c)),
  };
  if (a.does !== "message") {
    const hand = handWords(a);
    if (first || !hand) return { dropped: NEW_WORDS.cannot.stepDropped };
    return { step: { ...base, does: a.does, message: null, email: null, hand } };
  }
  if (p.audience === "leads")
    return { step: { ...base, does: "message", message: null, email: leadEmail(a, first), hand: "" } };
  const message = peopleMessage(a, first, p.known, p.moment);
  if (!message) return { dropped: first ? NEW_WORDS.cannot.noMessage : NEW_WORDS.cannot.stepDropped };
  return { step: { ...base, does: "message", message, email: null, hand: "" } };
}

/** The steps kept, at most the audience's, a once's one; a call or a note only as the last. */
function judgeSteps(
  answer: NewDraftAnswer,
  p: { audience: NewAudience; kind: NewKind; known: DraftKnown; moment: KnownMoment | null; name: string },
): { steps: NewStep[]; cannot: string[] } {
  const max = p.kind === "once" ? 1 : NEW_STEPS_MAX[p.audience];
  const steps: NewStep[] = [];
  const cannot: string[] = [];
  for (const a of answer.steps) {
    if (steps.length >= max) break;
    const j = judgeStep(a, steps.length, p);
    if ("dropped" in j) {
      cannot.push(j.dropped);
      if (steps.length === 0) break;
      continue;
    }
    steps.push(j.step);
  }
  // A call or a note stands last: one before a message ends the steps there.
  const lastHand = steps.findIndex((s) => s.does !== "message");
  if (lastHand >= 0 && lastHand < steps.length - 1) {
    steps.splice(lastHand + 1);
    cannot.push(NEW_WORDS.cannot.handNotLast);
  }
  if (!handStepsHold(steps)) return { steps: [], cannot: [NEW_WORDS.cannot.nothingFits] };
  return { steps, cannot };
}

/** Who the answer named, by its key, else the one the owner or a door chose. */
function answerWhoOf(answer: NewDraftAnswer, known: DraftKnown, ask: NewDraftAsk): DraftWho | null {
  if (ask.who) return ask.who;
  const k = answer.who;
  const moment = known.moments.find((m) => m.key === k);
  if (moment) return { kind: "moment", trigger: moment.trigger, label: moment.label };
  const list = known.lists.find((l) => l.key === k);
  if (list) return { kind: "list", token: list.token, label: list.label };
  const search = known.searches.find((s) => s.key === k);
  if (search) return { kind: "search", id: search.id, label: search.label };
  return k === "everyone" ? { kind: "everyone", label: NEW_WORDS.draft.everyoneNews } : null;
}

/** Who New names, as its list rule reads it (contracts newListOf): never who said stop; a one-off's list of yeses, everyone. */
function asNewWho(who: DraftWho | null, kind: NewKind): DraftWho | null {
  if (who?.kind !== "list") return who;
  const is = newListOf(who.token, kind);
  return is === "never" ? null : is === "everyone" ? { kind: "everyone", label: NEW_WORDS.draft.everyoneNews } : who;
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
  p: {
    kind: NewKind;
    audience: NewAudience;
    who: DraftWho | null;
    moment: KnownMoment | null;
    first: NewMessage | null;
  },
  answer: NewDraftAnswer,
  known: DraftKnown,
): Pick<NewDraftDto, "run_hour" | "at" | "channels" | "mailbox" | "adds_new" | "policy_class" | "mode"> {
  const leads = p.audience === "leads";
  const policy = classOf(p.audience, p.moment);
  const box = known.mailbox;
  return {
    run_hour: Math.min(PLAYBOOK_HOURS.max, Math.max(PLAYBOOK_HOURS.min, answer.hour || PLAYBOOK_DEFAULTS.runHour)),
    at: p.kind === "once" ? onceAt(answer.when, known.localNow) : null,
    channels: leads ? ["email"] : (p.first ? carriersOf(p.first) : []).filter((c) => known.ready.includes(c)),
    mailbox: leads ? { ids: box?.ids ?? [], owner_sends: !box, label: box?.label ?? "" } : null,
    adds_new: leads && p.who?.kind === "search",
    policy_class: policy,
    mode: p.kind === "once" ? null : newSequenceMode(known.classModes[policy] ?? null, leads ? "leads" : null),
  };
}

/** Everyone is who said yes to what it is: an offer's yes, or a message's. */
const everyoneSaid = (who: DraftWho | null, first: NewMessage | null): DraftWho | null =>
  who?.kind === "everyone"
    ? { ...who, label: first?.offer ? NEW_WORDS.draft.everyoneOffers : NEW_WORDS.draft.everyoneNews }
    : who;

/**
 * The draft from Ask's answer: the kind and audience the owner chose, else Ask's; who, when and the steps, each as this
 * workspace offers and holds them. A draft with no step is no draft: the route says why (422) in Ask's words, or in New's.
 */
export function draftKept(answer: NewDraftAnswer, known: DraftKnown, ask: NewDraftAsk): NewDraftDto {
  const kind = ask.kind ?? answer.kind;
  const audience = ask.audience ?? answer.audience;
  const named = asNewWho(answerWhoOf(answer, known, ask), kind);
  const who = named && whoSuits(named, audience, kind) ? named : null;
  const moment = who?.kind === "moment" ? (known.moments.find((m) => m.trigger === who.trigger) ?? null) : null;
  const name = (answer.name.trim() || who?.label || NEW_WORDS.title).slice(0, 80);
  const { steps, cannot } = judgeSteps(answer, { audience, kind, known, moment, name });
  const said = answer.cannot.trim();
  if (steps.length === 0) throw new AppError("validation", said || cannot[0] || NEW_WORDS.cannot.nothingFits, 422);
  const first = steps[0]?.message ?? null;
  const how = howOf({ kind, audience, who, moment, first }, answer, known);
  const draft: NewDraftDto = {
    said: ask.words.trim(),
    business: known.business,
    kind,
    audience,
    name,
    who: everyoneSaid(who, first),
    ...how,
    steps,
    reach: newReachOf(who, knownCountsOf(known), {
      kind,
      channels: how.channels,
      offer: !!first?.offer,
      review: !!first?.written?.versions.whatsapp,
    }),
    checks: [],
    twin: kind === "sequence" ? twinOf(who, known.running) : null,
    cannot: said || (cannot.length ? [...new Set(cannot)].join(" ") : null),
  };
  return { ...draft, checks: newChecksOf(draft, known.ready) };
}
