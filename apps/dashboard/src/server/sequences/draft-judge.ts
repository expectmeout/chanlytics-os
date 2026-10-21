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
  type NewCheck,
  type NewReach,
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
import { readingFor, type PoolRead } from "@/lib/campaign-channels";
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

/** A sequence the workspace keeps, for its twin. */
export interface KnownRunning {
  id: string;
  name: string;
  starts: string;
  trigger: string | null;
  list: string | null;
  search: string | null;
}

/** What a draft is judged against: the business, what it offers and holds, and what already runs. */
export interface DraftKnown {
  business: string;
  /** What the business is working toward, in its own words (config `ask.goal`): what a sequence to leads offers. */
  goal?: string | null;
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

/** Whether a step's run can fill each value: a visit's only on a visit moment's first step, a proposal's on the follow-up's. */
function fillable(slots: readonly ParamSourceKind[], first: boolean, moment: KnownMoment | null): boolean {
  return slots.every((s) =>
    s === "visit_when" || s === "visit_service"
      ? first && !!moment?.visits
      : s === "proposal_link"
        ? first && !!moment?.proposal
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

/** A sequence already on the same moment, list or search: a second would double it. */
function twinOf(who: DraftWho | null, known: DraftKnown): { id: string; name: string } | null {
  if (!who) return null;
  const r = known.running.find((x) =>
    who.kind === "moment"
      ? x.starts === "moment" && x.trigger === who.trigger
      : who.kind === "list"
        ? x.starts === "list" && x.list === who.token
        : who.kind === "search" && x.starts === "leads" && x.search === who.id,
  );
  return r ? { id: r.id, name: r.name } : null;
}

/** Who of those a pool names it leaves out, the most said once: a stop, no yes, no number. */
function leftOf(r: ReturnType<typeof readingFor>): string | null {
  if (!r) return null;
  const R = NEW_WORDS.reach;
  const why = [
    { n: r.stopped, say: R.saidStop },
    { n: r.noYes, say: R.neverYes },
    { n: r.noNumber, say: R.noNumber },
  ].sort((x, y) => y.n - x.n)[0];
  return why && why.n > 0 ? why.say(why.n) : null;
}

/**
 * Who it reaches now, where the workspace counted it, on the channels it goes by (Campaigns' pools, as a run counts them):
 * how many can hear it of how many it names, who it leaves out, who the week's breath holds back, and each channel's
 * share. Everyone is counted for what a yes to offers hears (the month's offer's pool), an offer or news: a message the
 * workspace holds as one about their visit, sent to everyone, is not counted here, so no number is said. Where its
 * WhatsApp version is new, who hears it only by WhatsApp, whom a send before Meta approves it leaves out. A search counts
 * its ready leads, and the addresses still being checked.
 */
function reachOf(
  who: DraftWho | null,
  known: DraftKnown,
  how: { channels: readonly ConsentChannel[]; offer: boolean; review: boolean },
): NewReach | null {
  if (!who) return null;
  if (who.kind === "search") {
    const s = known.searches.find((x) => x.id === who.id);
    return s ? { can: s.ready, of: null, left: s.checking > 0 ? NEW_WORDS.reach.checking(s.checking) : null } : null;
  }
  if (who.kind === "leads") return { can: who.ids.length, of: null, left: null };
  const pool =
    who.kind === "moment"
      ? known.moments.find((m) => m.trigger === who.trigger)?.pool
      : who.kind === "list"
        ? known.lists.find((l) => l.token === who.token)?.pool
        : how.offer
          ? known.everyonePool
          : null;
  // The channels it goes by: none is none (no channel can carry it here), never a playbook's WhatsApp alone.
  const r = readingFor(pool, how.channels);
  if (!r) return null;
  const others = how.channels.filter((c) => c !== "whatsapp");
  const without = others.length ? (readingFor(pool, others)?.candidates ?? r.candidates) : 0;
  const only = how.review && how.channels.includes("whatsapp") ? Math.max(0, r.candidates - without) : 0;
  return {
    can: r.candidates,
    of: r.pool > r.candidates ? r.pool : null,
    left: leftOf(r),
    ...(r.held > 0 ? { held: r.held } : {}),
    ...(r.by_channel ? { by: r.by_channel } : {}),
    ...(only > 0 ? { only_whatsapp: only } : {}),
  };
}

const CHANNEL_SAID: Record<ConsentChannel, string> = { whatsapp: "WhatsApp", email: "email", sms: "text" };

/** What Ask checked of a step's message: one Ask wrote waits on Meta's review; one the workspace holds goes today. */
function stepChecks(d: Pick<NewDraftDto, "audience" | "steps">, ready: readonly ConsentChannel[]): NewCheck[] {
  const C = NEW_WORDS.checks;
  return d.steps.flatMap((s, i): NewCheck[] => {
    const n = i + 1;
    if (s.does !== "message") return [{ tone: "ok", words: C.hand(n), detail: null }];
    const m = s.message;
    if (m?.written)
      return [
        { tone: "warn", words: C.newMessage(n), detail: m.written.versions.whatsapp ? C.newMessageDetail : null },
      ];
    const goes = (m?.channels ?? []).filter((c) => ready.includes(c));
    return d.audience === "people" && i === 0 && goes.length
      ? [{ tone: "ok", words: C.canGo(n, goes.map((c) => CHANNEL_SAID[c]).join(" or ")), detail: null }]
      : [];
  });
}

/** What Ask checked, said as the draft shows it: before Start, what would double, wait, or go another way. */
function draftChecksOf(
  d: Pick<NewDraftDto, "audience" | "kind" | "steps" | "who" | "twin" | "reach">,
  ready: readonly ConsentChannel[],
): NewCheck[] {
  const C = NEW_WORDS.checks;
  const out: NewCheck[] = [];
  const ok = (words: string, detail: string | null = null) => out.push({ tone: "ok", words, detail });
  const warn = (words: string, detail: string | null = null) => out.push({ tone: "warn", words, detail });
  if (d.who && d.kind === "sequence") {
    if (d.twin) warn(C.twin(d.twin.name), C.twinDetail);
    else ok(C.noTwin(`starts on “${d.who.label}”`));
  }
  out.push(...stepChecks(d, ready));
  const offer = !!d.steps[0]?.message?.offer;
  if (d.audience === "leads") {
    ok(C.notCustomers);
    ok(C.noFirstLink);
    ok(C.pace(12));
    if (d.kind === "once") ok(C.oneEmail, C.oneEmailDetail);
    return out;
  }
  if (d.kind === "once") {
    if (offer) ok(C.offersOnly);
    if (d.reach?.held) ok(C.breath(d.reach.held), C.breathDetail);
    const byEmail = d.reach?.by?.email ?? 0;
    if (offer && byEmail > 0) ok(C.byEmail(byEmail), C.byEmailDetail);
  } else ok(C.stops, C.stopsDetail);
  return out;
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
    channels: leads ? ["email"] : (p.first?.channels ?? []).filter((c) => known.ready.includes(c)),
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
    reach: reachOf(who, known, {
      channels: how.channels,
      offer: !!first?.offer,
      review: !!first?.written?.versions.whatsapp,
    }),
    checks: [],
    twin: kind === "sequence" ? twinOf(who, known) : null,
    cannot: said || (cannot.length ? [...new Set(cannot)].join(" ") : null),
  };
  return { ...draft, checks: draftChecksOf(draft, known.ready) };
}
