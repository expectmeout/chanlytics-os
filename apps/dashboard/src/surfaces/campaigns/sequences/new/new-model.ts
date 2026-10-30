/**
 * New's draft as the page holds it (decision 0065): what a door asked for, a draft built by hand, every change a picker
 * makes to it, and the body Keep and Start send (POST sequences/new). Pure, so every change is one function the page
 * calls and a test can read. The draft is Ask's answer (contracts NewDraftDto) until the owner changes a part of it;
 * a change Ask need not make again (who, when, a wait, a message) is made here, one that changes what it is (the kind,
 * the audience) is Ask's to draft again from the same line.
 */
import {
  asDraftedOf,
  CONSENT_CHANNELS,
  DAY_MS,
  EVERYONE_LABEL,
  FOLLOW_UP_CONDITIONS,
  MIN_MS,
  NEW_ONCE_AHEAD_DAYS,
  NEW_WORDS,
  NO_CHANNEL_REACH,
  PLAYBOOK_DEFAULTS,
  allLeftOutWords,
  clockHour,
  clockTime,
  defaultSlotKinds,
  emptyAudienceRefusal,
  messageHolds,
  noChannelWords,
  noYesWords,
  saidYesWords,
  newConditionsOf,
  newListOf,
  newSequenceLine,
  newWaitOf,
  nextOpenMoment,
  slotLabels,
  whoSuits,
  type AppointmentWord,
  type CampaignMessage,
  type ConsentChannel,
  type DraftWho,
  type FollowUpCondition,
  type NewAudience,
  type NewDraftAsk,
  type NewDraftDto,
  type NewKind,
  type NewMessage,
  type NewStep,
  type NewStepDoes,
  type NewWrittenMessage,
  type ParamSpec,
  type SequenceMode,
  type SequenceRowDto,
  templateSlots,
} from "@chanlytics/contracts";
import type { KeptSend } from "./kept-send";
import {
  carriersOf,
  messagePurposeOf,
  newChecksOf,
  newReachOf,
  reachHowOf,
  twinOf,
  type NewCounts,
  type NewRunning,
} from "@/lib/new-checks";

/** What a door's address asked New for: a moment's line, a one-off, leads, or an audience to message. */
interface NewAsked {
  moment: string | null;
  who: "once" | "leads" | null;
  to: string | null;
}

/** A one-off's day and time as the sentence says it ("Fri 9:00 AM"), by the business's clock; its whole weekday where asked. */
export function atWords(at: string, weekday: "short" | "long" = "short"): string {
  const [day = "", time = "00:00"] = at.split("T");
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const ms = Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0);
  const named = new Intl.DateTimeFormat("en-US", { weekday, timeZone: "UTC" }).format(new Date(ms));
  return `${named} ${clockTime(ms, "UTC")}`;
}

/**
 * When a one-off sent now goes, by the business's clock: ten minutes on, or, late at night, when its sending hours open
 * (nextOpenMoment, as every send keeps them).
 */
export function sendsAt(tz: string, nowMs: number): { time: string; moved: boolean; ms: number } {
  const { at, moved } = nextOpenMoment(tz, new Date(nowMs + 10 * MIN_MS));
  return { time: clockTime(at.getTime(), tz), moved, ms: at.getTime() };
}

/** When a one-off sent now goes, as a line says it: ten minutes after it is sent, or when the sending hours open. */
export const goesSoonWords = (tz: string, nowMs: number): string => {
  const goes = sendsAt(tz, nowMs);
  return goes.moved ? NEW_WORDS.draft.goesOpen(goes.time) : NEW_WORDS.draft.goesSoon;
};

/** When a sequence's first batch is, by the business's clock: today at its hour while that is still ahead, else tomorrow. */
export function firstBatchWords(hour: number, nowHour: number): string {
  const at = clockHour(hour);
  return nowHour < hour ? NEW_WORDS.draft.todayAt(at) : NEW_WORDS.draft.tomorrowAt(at);
}

/** What Ask could not do, as its card says it: its first sentence over the rest ("Left out: “if they loved it”"). */
export function cannotParts(said: string): { title: string; words: string | null } {
  const m = /^(.+?[.!?])\s+(\S[\s\S]*)$/.exec(said.trim());
  if (!m?.[1] || !m[2]) return { title: said.trim(), words: null };
  return { title: m[1].replace(/\.$/, ""), words: m[2] };
}

/** The line New starts on: the moment's own where a door named one, else none. */
export const doorLineOf = (asked: NewAsked, word: AppointmentWord): string =>
  asked.moment ? (newSequenceLine(asked.moment, word) ?? "") : "";

/**
 * The choices a door made, which Ask keeps: a one-off, leads, or the audience it opened on, as New's list rule reads it
 * (contracts newListOf): a list of who said yes is everyone, who said stop no one, and a list New does not know (archived
 * or gone since the link was made, `label` null) is left for the owner to pick.
 */
export function fixedOf(asked: NewAsked, label: string | null): Omit<NewDraftAsk, "words"> {
  if (asked.who === "leads") return { audience: "leads" };
  if (asked.who !== "once") return {};
  const is = asked.to ? newListOf(asked.to, "once") : null;
  const who: DraftWho | null =
    is === "everyone"
      ? everyoneOf(true)
      : is === "list" && asked.to && label
        ? { kind: "list", token: asked.to, label }
        : null;
  return { kind: "once", audience: "people", ...(who ? { who } : {}) };
}

/**
 * Whether a door named a list New cannot send to now (the send screen's words): one unknown here once the lists are read,
 * or who said stop, whom nothing is ever sent to.
 */
export function doorListGone(asked: NewAsked, label: string | null, read: boolean): boolean {
  if (!read || asked.who !== "once" || !asked.to) return false;
  const is = newListOf(asked.to, "once");
  return is === "never" || (is === "list" && label === null);
}

/** A step with nothing in it yet: a message to pick, after the step before. */
function blankStep(audience: NewAudience, first: boolean): NewStep {
  return {
    name: "",
    // A week for a person, a lead's own first nudge's four days (REACH_OUT_AFTER_DAYS.first), within its bounds.
    after_days: first ? null : newWaitOf(audience, audience === "leads" ? 4 : 7),
    only_if: [],
    does: "message",
    message: null,
    email: audience === "leads" ? { subject: first ? "" : null, body: "" } : null,
    hand: "",
  };
}

/** A draft built by hand (Ask could not draft it, or the owner would rather): every part a choice still to make. */
export function draftByHand(kind: NewKind, audience: NewAudience, business: string): NewDraftDto {
  return {
    said: "",
    business,
    kind,
    audience,
    name: kind === "once" ? NEW_WORDS.actOnce : NEW_WORDS.act,
    who: null,
    run_hour: PLAYBOOK_DEFAULTS.runHour,
    at: null,
    channels: audience === "leads" ? ["email"] : [],
    mailbox: null,
    adds_new: audience === "leads",
    steps: [blankStep(audience, true)],
    policy_class: audience === "leads" ? "outreach" : "campaign",
    mode: kind === "once" ? null : "ask",
    reach: null,
    checks: [],
    twin: null,
    cannot: null,
  };
}

/**
 * The draft as it stands while Ask drafts it again as the other kind or for the other audience (F1): its line, its name,
 * and who where that suits the new shape, every other part still to come; to leads, from the owner's mailbox.
 */
export function redraftShapeOf(d: NewDraftDto, to: { kind: NewKind; audience: NewAudience }): NewDraftDto {
  const mailbox = d.mailbox ?? { ids: [], owner_sends: false, label: NEW_WORDS.draft.yourMailbox };
  return {
    ...draftByHand(to.kind, to.audience, d.business),
    said: d.said,
    name: d.name,
    who: d.who && whoSuits(d.who, to.audience, to.kind) ? d.who : null,
    mailbox: to.audience === "leads" ? mailbox : null,
  };
}

/** Everyone, as the first message says who hears it: what a yes to offers hears (an offer or news), or a yes to messages. */
export const everyoneOf = (offer: boolean): DraftWho => ({
  kind: "everyone",
  label: offer ? NEW_WORDS.draft.everyoneOffers : NEW_WORDS.draft.everyoneNews,
});

/** Who a kept send went to, as New says it: everyone, one of People's lists, or one the workspace keeps. */
function keptWho(aud: string, lists: readonly { id: string; name: string }[], offer: boolean): DraftWho | null {
  const [kind = "", id = ""] = aud.split(":");
  if (kind === "everyone") return everyoneOf(offer);
  const token = kind === "list" ? `seg:${id}` : kind === "saved" ? `list:${id}` : null;
  const list = token ? lists.find((l) => l.id === token) : null;
  return list ? { kind: "list", token: list.id, label: list.name } : null;
}

/** The Library as New reads it: its messages, and the rows their values are read from. */
interface Library {
  messages: readonly CampaignMessage[];
  rows: readonly { id: string; name: string; variables: unknown; body_preview?: string | null }[];
}

/** One of the workspace's messages by the id of any of its versions, as New holds it; null where it is gone. */
function libraryMessageOf(library: Library, id: string): NewMessage | null {
  const m = library.messages.find((x) => x.anchor.id === id || Object.values(x.versions).some((v) => v?.id === id));
  return m ? heldMessageOf(m, library.rows) : null;
}

/** A message Ask (or the owner) wrote and a kept one-off holds, not filed yet: as New holds it, titled by its one-off. */
function keptWrittenOf(title: string, written: NewWrittenMessage, params: readonly ParamSpec[]): NewMessage {
  const v = written.versions;
  return {
    template_id: null,
    title,
    body: v.whatsapp?.body ?? v.sms?.body ?? v.email?.body ?? "",
    channels: (["whatsapp", "email", "sms"] as const).filter((c) => !!v[c]),
    params: [...params],
    offer: written.category === "marketing",
    written,
  };
}

/** The channels a send kept from before goes by now: those it ticked that its message can still carry. */
function stillCarried(ticked: readonly ConsentChannel[], message: NewMessage | null): ConsentChannel[] {
  const carriers = message ? carriersOf(message) : CONSENT_CHANNELS;
  return ticked.filter((c) => carriers.includes(c));
}

/**
 * A draft from before (one the tab kept, Send it again, a kept one-off) on the channels the workspace sends on now: one
 * closed since is never left ticked where How cannot untick it.
 */
export const onReadyChannels = (d: NewDraftDto, ready: readonly ConsentChannel[]): NewDraftDto =>
  d.audience === "people" ? { ...d, channels: d.channels.filter((c) => ready.includes(c)) } : d;

/** A one-off kept as a draft (00465 `sequences.once`), opened again as New's draft; null where its message is gone. */
export function onceKeptOf(
  row: Pick<SequenceRowDto, "name" | "once">,
  library: Library,
  business: string,
): NewDraftDto | null {
  const o = row.once;
  if (!o) return null;
  const m = o.step.message;
  const held = m?.template_id ? libraryMessageOf(library, m.template_id) : null;
  const message =
    held && m ? { ...held, params: m.params } : m?.written ? keptWrittenOf(row.name, m.written, m.params) : null;
  const audience: NewAudience = o.who.kind === "search" || o.who.kind === "leads" ? "leads" : "people";
  return {
    ...draftByHand("once", audience, business),
    name: row.name,
    who: o.who,
    at: o.at,
    channels: audience === "leads" ? [...o.channels] : stillCarried(o.channels, message),
    steps: [{ ...o.step, message }],
  };
}

/** What Send it again opens against: the lists a send may go to, and which links the workspace keeps now. */
interface AgainAt {
  lists: readonly { id: string; name: string }[];
  links: { bookingLink: boolean; reviewLink: boolean };
}

/**
 * Each value as a one-off may fill it now: what the send filled it with where its slot still takes that, else the slot's
 * first choice (contracts templateSlots: a one-off has no visit and no proposal, and a link only where one is on file); the
 * words it typed kept where words still go. A send made with the old free choice (the first name filled by the booking link)
 * is put right, as Sent's Send it again put it right.
 */
function againKinds(kept: KeptSend, id: string, row: Library["rows"][number] | null, links: AgainAt["links"]) {
  const may = row ? templateSlots(row, { visits: false, proposal: false, ...links }) : null;
  const kinds = kept.sources?.[id] ?? [];
  const typed = kept.params?.[id] ?? [];
  return (p: ParamSpec, i: number): ParamSpec => {
    const choices: readonly string[] = may?.[i] ?? ["text"];
    const was = kinds[i] ?? p.kind;
    const kind = choices.includes(was) ? was : (choices[0] ?? "text");
    return kind === "text" ? { kind: "text", value: was === "text" ? (typed[i] ?? "") : "" } : ({ kind } as ParamSpec);
  };
}

/**
 * Send it again: a one-off by hand, filled with what the run sent -- its message, its audience and its values (each as a
 * one-off may fill it now: againKinds) -- where its message and its audience can still go; null otherwise, and New opens on
 * its line.
 */
export function againOf(kept: KeptSend, library: Library, at: AgainAt, business: string): NewDraftDto | null {
  const id = kept.tplId;
  const held = id ? libraryMessageOf(library, id) : null;
  if (!held || !id) return null;
  const who = keptWho(kept.aud, at.lists, held.offer);
  if (!who) return null;
  const row = library.rows.find((r) => r.id === id) ?? library.rows.find((r) => r.id === held.template_id) ?? null;
  const params: ParamSpec[] = held.params.map(againKinds(kept, id, row, at.links));
  const base = draftByHand("once", "people", business);
  const message = { ...held, params };
  return {
    ...base,
    name: kept.name?.trim() || held.title,
    who,
    channels: stillCarried(kept.channels?.length ? kept.channels : held.channels, held),
    steps: [{ ...blankStep("people", true), message }],
  };
}

/** The channels a step goes by, as a sentence says them ("WhatsApp or email"), joined as the place asks. */
const CHANNEL_SAID: Record<ConsentChannel, string> = { whatsapp: "WhatsApp", email: "email", sms: "text" };
export const channelsSaidOf = (channels: readonly ConsentChannel[], joiner: string): string =>
  channels.map((c) => CHANNEL_SAID[c]).join(joiner);

/** One step changed in place. */
const withStep = (d: NewDraftDto, i: number, change: (s: NewStep) => NewStep): NewDraftDto => ({
  ...d,
  steps: d.steps.map((s, j) => (j === i ? change(s) : s)),
});

/** A step's wait, held to its audience's bounds. */
export const setWait = (d: NewDraftDto, i: number, days: number): NewDraftDto =>
  withStep(d, i, (s) => (s.after_days === null ? s : { ...s, after_days: newWaitOf(d.audience, days) }));

/** Whether a word is one of the conditions a step waits on. */
export const isCondition = (c: string): c is FollowUpCondition => FOLLOW_UP_CONDITIONS.some((x) => x === c);

/** What a later step waits on, as its audience offers it. */
export const setOnlyIf = (d: NewDraftDto, i: number, only: readonly FollowUpCondition[]): NewDraftDto =>
  withStep(d, i, (s) =>
    s.after_days === null ? s : { ...s, only_if: only.filter((c) => newConditionsOf(d.audience).includes(c)) },
  );

/** A person's step's message: one the workspace holds, as the Library holds it. */
export function heldMessageOf(
  m: CampaignMessage,
  rows: readonly { id: string; name: string; variables: unknown; body_preview?: string | null }[],
): NewMessage | null {
  const holds = messageHolds(m);
  const channels = (["whatsapp", "email", "sms"] as const).filter((c) => holds[c]);
  const id = m.versions.whatsapp?.id ?? m.anchor.id;
  const row = rows.find((r) => r.id === id) ?? rows.find((r) => r.id === m.anchor.id);
  if (!row || channels.length === 0) return null;
  const params: ParamSpec[] = defaultSlotKinds(row).map((kind) =>
    kind === "text" ? { kind: "text", value: "" } : { kind },
  );
  return {
    template_id: row.id,
    title: m.title,
    body: (row.body_preview ?? "").trim(),
    channels,
    params,
    offer: m.purpose === "marketing",
    written: null,
    labels: slotLabels(row),
  };
}

/** What a typed value is asked as: its slot's own name, where the message gives one ("Value 2" is no name). */
export function valueLabelOf(m: NewMessage, at: number): string | null {
  const named = m.written?.slots[at]?.label ?? m.labels?.[at] ?? "";
  return named.trim() && !/^Value \d+$/.test(named.trim()) ? named.trim() : null;
}

/**
 * A step's message changed: one of the workspace's, or the one Ask wrote, kept. A person's first message ticks the
 * channels it holds that the workspace can send on now (`ready`), as Ask's draft does: never one nothing can carry.
 */
export const setMessage = (
  d: NewDraftDto,
  i: number,
  message: NewMessage,
  ready: readonly ConsentChannel[] | null = null,
): NewDraftDto => {
  const next = withStep(d, i, (s) => ({ ...s, does: "message", message, hand: "" }));
  if (i !== 0 || d.audience !== "people") return next;
  const channels = carriersOf(message).filter((c) => !ready || ready.includes(c));
  return { ...next, channels, who: d.who?.kind === "everyone" ? everyoneOf(message.offer) : d.who };
};

/** A typed value of a step's message, as the owner types it. */
export const setTyped = (d: NewDraftDto, i: number, at: number, value: string): NewDraftDto =>
  withStep(d, i, (s) =>
    s.message
      ? {
          ...s,
          message: {
            ...s.message,
            params: s.message.params.map((p, j) => (j === at && p.kind === "text" ? { kind: "text", value } : p)),
          },
        }
      : s,
  );

/** A lead's step's email, as the owner writes it. */
export const setEmail = (d: NewDraftDto, i: number, email: { subject: string | null; body: string }): NewDraftDto =>
  withStep(d, i, (s) => ({ ...s, email: { subject: i === 0 ? email.subject : null, body: email.body } }));

/** A call's or a note's words. */
export const setHand = (d: NewDraftDto, i: number, words: string): NewDraftDto =>
  withStep(d, i, (s) => (s.does === "message" ? s : { ...s, hand: words }));

/** A call turned a note, or a note a call: a step that hands them over stays one. */
export const setDoes = (d: NewDraftDto, i: number, does: "call" | "note"): NewDraftDto =>
  withStep(d, i, (s) => (s.does === "message" ? s : { ...s, does }));

/**
 * A step added after the last: a message, or a call or a note (always the last). A call or a note already last keeps
 * its place: the new message goes before it.
 */
export function addStep(d: NewDraftDto, does: NewStepDoes): NewDraftDto {
  const step: NewStep =
    does === "message"
      ? blankStep(d.audience, false)
      : { ...blankStep(d.audience, false), does, message: null, email: null, hand: "" };
  const last = d.steps[d.steps.length - 1];
  if (does === "message" && last && last.does !== "message")
    return { ...d, steps: [...d.steps.slice(0, -1), step, last] };
  if (does !== "message" && last && last.does !== "message") return { ...d, steps: [...d.steps.slice(0, -1), step] };
  return { ...d, steps: [...d.steps, step] };
}

/** A step after the first taken away; the first is the sequence's. */
export const removeStep = (d: NewDraftDto, i: number): NewDraftDto =>
  i === 0 ? d : { ...d, steps: d.steps.filter((_, j) => j !== i) };

/** Who and when, changed in place. */
export const setWho = (d: NewDraftDto, who: DraftWho): NewDraftDto => ({ ...d, who, twin: null });
export const setHour = (d: NewDraftDto, hour: number): NewDraftDto => ({ ...d, run_hour: hour });
export const setAt = (d: NewDraftDto, at: string | null): NewDraftDto => ({ ...d, at });
export const setChannels = (d: NewDraftDto, channels: readonly ConsentChannel[]): NewDraftDto => ({
  ...d,
  channels: [...channels],
});
export const setMode = (d: NewDraftDto, mode: SequenceMode): NewDraftDto => ({ ...d, mode });
export const setAddsNew = (d: NewDraftDto, on: boolean): NewDraftDto => ({ ...d, adds_new: on });
export const setOwnerSends = (d: NewDraftDto, on: boolean): NewDraftDto =>
  d.mailbox ? { ...d, mailbox: { ...d.mailbox, owner_sends: on } } : d;
export const setName = (d: NewDraftDto, name: string): NewDraftDto => ({ ...d, name: name.slice(0, 80) });

/**
 * A one-off whose WhatsApp version Ask wrote new (D5): Meta reviews that version first, and the send is made as it is sent
 * or scheduled, so it goes by its other channels (new-make.ts onceChannelsOf), and who hears it only by WhatsApp is left
 * out. Kept instead, it is filed and waits while Meta reviews it. Null where nothing waits on Meta.
 */
export function reviewOf(d: NewDraftDto): { others: string; only: number; can: number } | null {
  const first = d.steps[0]?.message;
  if (d.kind !== "once" || d.audience !== "people") return null;
  if (!first?.written?.versions.whatsapp || !d.channels.includes("whatsapp")) return null;
  const others = d.channels.filter((c) => c !== "whatsapp");
  // Counted for the channels Ask drafted it with; with WhatsApp the only one left on, everyone hears only WhatsApp.
  const only = others.length ? (d.reach?.only_whatsapp ?? 0) : (d.reach?.can ?? 0);
  return { others: channelsSaidOf(others, " and "), only, can: Math.max(0, (d.reach?.can ?? 0) - only) };
}

/** What the foot reads beside the draft: whether the workspace is paused, and the business's day and time now. */
export interface FootReads {
  paused: boolean;
  /** "YYYY-MM-DDTHH:MM" by the business's clock, which a one-off's time is set and read in. */
  localNow: string;
  /** The channels the workspace can send on now. */
  ready: readonly ConsentChannel[];
}

/**
 * The channel to connect where a person's draft goes by nothing because none of the ways its first message can go is
 * connected (so How has nothing to tick): the first of them; null where one is, or nothing is picked yet.
 */
function unconnectedOnly(d: NewDraftDto, ready: readonly ConsentChannel[]): ConsentChannel | null {
  const first = d.steps[0]?.message;
  if (d.audience !== "people" || d.channels.length > 0 || !first) return null;
  const carriers = carriersOf(first);
  return carriers.length > 0 && carriers.every((c) => !ready.includes(c)) ? (carriers[0] ?? null) : null;
}

/** The last moment a one-off may be set for, by the business's clock: NEW_ONCE_AHEAD_DAYS after now. */
const lastAtOf = (localNow: string): string =>
  new Date(Date.parse(`${localNow}:00Z`) + NEW_ONCE_AHEAD_DAYS * DAY_MS).toISOString().slice(0, 16);

/** The first value a person's message leaves to be typed that is still blank, by its name where it has one. */
function blankValueOf(d: NewDraftDto): { label: string | null } | null {
  if (d.audience !== "people") return null;
  for (const s of d.steps) {
    const m = s.does === "message" ? s.message : null;
    const at = m ? m.params.findIndex((p) => p.kind === "text" && !p.value.trim()) : -1;
    if (m && at >= 0) return { label: valueLabelOf(m, at) };
  }
  return null;
}

/**
 * What still stops the draft being made, in the foot's words; null when it can be. A paused workspace first, whatever is
 * filled in (nothing sends until billing resumes); then the parts still to pick, a channel to connect where none it can
 * go by is, a blank value, a time gone by or too far ahead, and who can hear a one-off to people (the send screen's
 * foot, decision 0065 step 7).
 */
export function notReady(d: NewDraftDto, at: FootReads): { lead: string; sub: string } | null {
  if (at.paused) return { lead: NEW_WORDS.paused.lead, sub: NEW_WORDS.paused.sub };
  const steps = d.steps.every((s) =>
    s.does !== "message" ? !!s.hand.trim() : d.audience === "leads" ? true : !!s.message,
  );
  // The parts still to pick, by what the empty part says on the page: a sequence's when, a one-off's who, a search. How
  // is asked only where something can be picked: with none of its ways connected, the foot says what to connect.
  const W = NEW_WORDS.draft;
  const then = d.kind === "once" ? W.thenItCanGo : W.thenItCanStart;
  const unconnected = unconnectedOnly(d, at.ready);
  const parts = [
    ...(d.who ? [] : [d.audience === "leads" ? W.parts.search : d.kind === "once" ? W.parts.who : W.parts.when]),
    ...(d.audience === "people" && d.channels.length === 0 && !unconnected ? [W.parts.how] : []),
    ...(steps ? [] : [W.parts.message]),
  ];
  if (parts.length) return { lead: W.pick(parts), sub: then };
  if (unconnected) return { lead: NEW_WORDS.reach.why.no_channel, sub: NEW_WORDS.reach.connect(unconnected) };
  const blank = blankValueOf(d);
  if (blank) return { lead: W.fill(blank.label), sub: then };
  if (d.kind === "once" && d.at !== null && d.at <= at.localNow) return { lead: W.passed, sub: W.passedSub };
  if (d.kind === "once" && d.at !== null && d.at > lastAtOf(at.localNow))
    return { lead: W.tooFar(NEW_ONCE_AHEAD_DAYS), sub: then };
  // A one-off to people goes now to whoever can hear it: with nobody, there is nothing to send (D4), said by why. A
  // sequence runs on, so a moment with nobody today still starts, and a one-off to leads takes the leads found from now.
  if (d.kind === "once" && d.audience === "people" && d.reach?.can === 0)
    return {
      lead: NEW_WORDS.reach.nobody,
      sub: d.reach.nobody ? NEW_WORDS.reach.why[d.reach.nobody] : NEW_WORDS.reach.pickAWay,
    };
  // Sent now, a WhatsApp version still with Meta leaves out who hears only WhatsApp: where that is everyone, none (D5).
  if (d.reach && reviewOf(d)?.can === 0) return { lead: NEW_WORDS.reach.nobody, sub: NEW_WORDS.review.title };
  return null;
}

/** The door a one-off with no one to hear it offers, by why: their yes, a channel to connect, or how it goes. */
export type NobodyDoor = { kind: "yes" } | { kind: "connect"; channel: ConsentChannel } | { kind: "how" } | null;

/**
 * No one to send a one-off to (D4), said by why (decision 0065 step 7, what the send screen said): nobody said the yes it
 * needs (the door to getting it); those who said it can't be reached (what they lack, never their yes again, which would
 * ask for an answer they gave); no channel it goes by can carry it (Connect, or how it goes); everyone heard from you
 * this week. One door at most, with who it goes to beside it. Null where someone can hear it, or how is still to pick
 * (no channel ticked, with one it could be ticked to connected).
 */
export function nobodyOf(d: NewDraftDto, ready: readonly ConsentChannel[]): { words: string; door: NobodyDoor } | null {
  const r = d.reach;
  if (d.kind !== "once" || d.audience !== "people" || !d.who || r?.can !== 0) return null;
  if (d.channels.length === 0 && !unconnectedOnly(d, ready)) return null;
  const label = d.who.kind === "everyone" ? EVERYONE_LABEL : d.who.label;
  const said = `“${label}”`;
  const first = d.steps[0]?.message ?? null;
  const purpose = messagePurposeOf(first);
  // Only what can carry it: connecting texting, or ticking it, never helps an offer.
  const holds = first ? carriersOf(first) : [];
  // A channel its message holds that the workspace can send on and the draft doesn't tick: how it goes is the cure.
  const untried = holds.some((c) => ready.includes(c) && !d.channels.includes(c));
  if (r.nobody === "breath") return { words: allLeftOutWords(label, r.held ?? 0), door: null };
  if (r.nobody === "no_channel") {
    const unconnected = holds.find((c) => !ready.includes(c)) ?? null;
    return {
      words: r.said_yes ? saidYesWords(said, purpose, 0, r.said_yes, NO_CHANNEL_REACH) : noChannelWords(said, purpose),
      door: unconnected ? { kind: "connect", channel: unconnected } : untried ? { kind: "how" } : null,
    };
  }
  if (r.nobody === "no_reach")
    return {
      words: d.channels.includes("email")
        ? emptyAudienceRefusal(purpose, label, [], { channels: d.channels, about: "ours" })
        : saidYesWords(said, purpose, 0, r.said_yes ?? 0),
      door: untried ? { kind: "how" } : null,
    };
  return { words: noYesWords(said, purpose), door: { kind: "yes" } };
}

/** What New recounts a draft against: Campaigns' counts, the sequences that run, and the channels it can send on. */
export interface RecountReads {
  counts: NewCounts;
  running: readonly NewRunning[];
  ready: readonly ConsentChannel[];
}

/** Whether two drafts would be counted alike: the same who, how, kind and steps. */
const countedAlike = (a: NewDraftDto, b: NewDraftDto): boolean =>
  JSON.stringify([a.who, a.channels, a.kind, a.audience, a.steps]) ===
  JSON.stringify([b.who, b.channels, b.kind, b.audience, b.steps]);

/**
 * The draft as it now stands, its count, its twin and its checks said again where the owner changed who, how, the kind or
 * a step (decision 0065 step 7: the send screen recounted on every draw), or where nothing was counted yet (a draft built
 * by hand, Send it again, a kept one-off). What Ask answered stands until something it was counted for changes.
 */
export function recounted(prev: NewDraftDto | null, next: NewDraftDto, k: RecountReads): NewDraftDto {
  if (prev ? countedAlike(prev, next) : next.reach !== null) return next;
  const reach = newReachOf(next.who, k.counts, reachHowOf(next));
  // A twin is a sequence's; one Ask found stands until who changes.
  const twin =
    next.kind !== "sequence" ? null : prev && prev.who === next.who ? next.twin : twinOf(next.who, k.running);
  const counted = { ...next, reach, twin };
  return { ...counted, checks: newChecksOf(counted, k.ready) };
}

/**
 * The body Keep (start false) and Start or Send (true) send: the draft as it stands, and, for a draft to leads Ask wrote,
 * what Ask drafted (`drafted`, its answer as it came), which the make keeps beside it (decision 0078 step 2).
 */
export function makeBodyOf(d: NewDraftDto, start: boolean, draftId: string | null, drafted: NewDraftDto | null = null) {
  if (!d.who) throw new Error("a draft is made with who it is for");
  return {
    kind: d.kind,
    audience: d.audience,
    name: d.name.trim() || (d.kind === "once" ? NEW_WORDS.actOnce : NEW_WORDS.act),
    who: d.who,
    run_hour: d.run_hour,
    at: d.at,
    channels: d.channels,
    mode: d.mode,
    adds_new: d.adds_new,
    ...(d.mailbox ? { owner_sends: d.mailbox.owner_sends } : {}),
    ...(draftId ? { draft_id: draftId } : {}),
    ...(d.audience === "leads" && drafted?.audience === "leads" && drafted.said
      ? {
          as_drafted: asDraftedOf(
            drafted.said,
            drafted.steps.map((s) => s.email),
          ),
        }
      : {}),
    steps: d.steps.map((s) => ({
      name: s.name,
      after_days: s.after_days,
      only_if: s.only_if,
      does: s.does,
      message: s.message
        ? { template_id: s.message.template_id, params: s.message.params, written: s.message.written }
        : null,
      email: s.email,
      hand: s.hand,
    })),
    start,
  };
}
