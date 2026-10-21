/**
 * New's draft as the page holds it (decision 0065): what a door asked for, a draft built by hand, every change a picker
 * makes to it, and the body Keep and Start send (POST sequences/new). Pure, so every change is one function the page
 * calls and a test can read. The draft is Ask's answer (contracts NewDraftDto) until the owner changes a part of it;
 * a change Ask need not make again (who, when, a wait, a message) is made here, one that changes what it is (the kind,
 * the audience) is Ask's to draft again from the same line.
 */
import {
  FOLLOW_UP_CONDITIONS,
  MIN_MS,
  NEW_WORDS,
  PLAYBOOK_DEFAULTS,
  clockTime,
  defaultSlotKinds,
  messageHolds,
  newConditionsOf,
  newSequenceLine,
  newWaitOf,
  nextOpenMoment,
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
} from "@chanlytics/contracts";

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
export function sendsAt(tz: string, nowMs: number): { time: string; moved: boolean } {
  const { at, moved } = nextOpenMoment(tz, new Date(nowMs + 10 * MIN_MS));
  return { time: clockTime(at.getTime(), tz), moved };
}

/** The line New starts on: the moment's own where a door named one, else none. */
export const doorLineOf = (asked: NewAsked, word: AppointmentWord): string =>
  asked.moment ? (newSequenceLine(asked.moment, word) ?? "") : "";

/** The choices a door made, which Ask keeps: a one-off, leads, or the audience it opened on. */
export function fixedOf(asked: NewAsked, label: string | null): Omit<NewDraftAsk, "words"> {
  if (asked.who === "leads") return { audience: "leads" };
  if (asked.who === "once")
    return {
      kind: "once",
      audience: "people",
      ...(asked.to ? { who: { kind: "list", token: asked.to, label: label ?? asked.to } } : {}),
    };
  return {};
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
    name: NEW_WORDS.act,
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

/** A send kept for Send it again (broadcasts/page/runs.tsx bcAgainOf): its audience's key, its message and its values. */
export interface KeptSend {
  aud: string;
  tplId?: string;
  params?: Record<string, string[]>;
  sources?: Record<string, string[]>;
  name?: string;
  channels?: ConsentChannel[];
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
    channels: [...o.channels],
    steps: [{ ...o.step, message }],
  };
}

/**
 * Send it again: a one-off by hand, filled with what the run sent -- its message, its audience and its values -- where all
 * three can still go; null otherwise, and New opens on its line.
 */
export function againOf(
  kept: KeptSend,
  library: Library,
  lists: readonly { id: string; name: string }[],
  business: string,
): NewDraftDto | null {
  const id = kept.tplId;
  const held = id ? libraryMessageOf(library, id) : null;
  if (!held || !id) return null;
  const who = keptWho(kept.aud, lists, held.offer);
  if (!who) return null;
  const kinds = kept.sources?.[id] ?? [];
  const typed = kept.params?.[id] ?? [];
  const params: ParamSpec[] = held.params.map((p, i) => {
    const kind = kinds[i] ?? p.kind;
    return kind === "text" ? { kind: "text", value: typed[i] ?? "" } : ({ kind } as ParamSpec);
  });
  const base = draftByHand("once", "people", business);
  const message = { ...held, params };
  return {
    ...base,
    name: kept.name?.trim() || held.title,
    who,
    channels: kept.channels?.length ? kept.channels.filter((c) => held.channels.includes(c)) : held.channels,
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
  };
}

/** A step's message changed: one of the workspace's, or the one Ask wrote, kept. */
export const setMessage = (d: NewDraftDto, i: number, message: NewMessage): NewDraftDto => {
  const next = withStep(d, i, (s) => ({ ...s, does: "message", message, hand: "" }));
  if (i !== 0 || d.audience !== "people") return next;
  return { ...next, channels: message.channels, who: d.who?.kind === "everyone" ? everyoneOf(message.offer) : d.who };
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
 * A one-off sent now whose WhatsApp version Ask wrote new (D5): Meta reviews that version first, so it goes now by its
 * other channels, and who hears it only by WhatsApp is left out. Null where nothing waits on Meta.
 */
export function reviewOf(d: NewDraftDto): { others: string; only: number; can: number } | null {
  const first = d.steps[0]?.message;
  if (d.kind !== "once" || d.audience !== "people" || d.at !== null) return null;
  if (!first?.written?.versions.whatsapp || !d.channels.includes("whatsapp")) return null;
  const others = d.channels.filter((c) => c !== "whatsapp");
  // Counted for the channels Ask drafted it with; with WhatsApp the only one left on, everyone hears only WhatsApp.
  const only = others.length ? (d.reach?.only_whatsapp ?? 0) : (d.reach?.can ?? 0);
  return { others: channelsSaidOf(others, " and "), only, can: Math.max(0, (d.reach?.can ?? 0) - only) };
}

/** What still stops the draft being made, in the foot's words; null when it can be. */
export function notReady(d: NewDraftDto): { lead: string; sub: string } | null {
  const steps = d.steps.every((s) =>
    s.does !== "message" ? !!s.hand.trim() : d.audience === "leads" ? true : !!s.message,
  );
  if (!d.who || !steps) return { lead: NEW_WORDS.draft.pickWhenAndMessage, sub: NEW_WORDS.draft.thenItCanStart };
  // A one-off goes now to whoever can hear it: with nobody, there is nothing to send (D4). A sequence runs on, so a
  // moment with nobody today still starts.
  if (d.kind === "once" && d.reach?.can === 0) return { lead: NEW_WORDS.reach.nobody, sub: NEW_WORDS.reach.pickAWay };
  // Sent now, a WhatsApp version still with Meta leaves out who hears only WhatsApp: where that is everyone, none (D5).
  if (d.reach && reviewOf(d)?.can === 0) return { lead: NEW_WORDS.reach.nobody, sub: NEW_WORDS.review.title };
  return null;
}

/** The body Keep (start false) and Start or Send (true) send: the draft as it stands. */
export function makeBodyOf(d: NewDraftDto, start: boolean, draftId: string | null) {
  if (!d.who) throw new Error("a draft is made with who it is for");
  return {
    kind: d.kind,
    audience: d.audience,
    name: d.name.trim() || NEW_WORDS.act,
    who: d.who,
    run_hour: d.run_hour,
    at: d.at,
    channels: d.channels,
    mode: d.mode,
    adds_new: d.adds_new,
    ...(d.mailbox ? { owner_sends: d.mailbox.owner_sends } : {}),
    ...(draftId ? { draft_id: draftId } : {}),
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
