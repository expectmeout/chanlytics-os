/**
 * Ask drafts a new sequence (POST sequences/draft; decision 0060, S4: New): the owner says in a line what it should do,
 * and one model call fills the flow every sequence has, from what this workspace offers and holds -- the moments it may
 * start on (contracts momentOffered, as the composer and the check read them) and the messages it can send now (their
 * versions held, contracts messageHolds). The model names each by a key of the request, never an id, and each pick is
 * judged here, in code, against the same lists: a moment not offered, a message not held, a wait past the steps' bounds or
 * a value a step's run cannot fill is never put in the draft. Typed words that name a price are left blank for the owner.
 * A message's words are data to the model (contracts ai/fence.ts). Nothing is written (decision 0017): the owner keeps it
 * as a draft or starts it (POST sequences), where the check every campaign meets judges it again.
 */
import "server-only";
import {
  AppError,
  DATA_NOT_INSTRUCTIONS,
  MOMENT_TRIGGERS,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_HOURS,
  SEQUENCE_DRAFT_JSON_SCHEMA,
  SEQUENCE_DRAFT_THEN_MAX,
  SEQUENCE_WAIT_DAYS,
  SequenceDraftAnswerSchema,
  defaultSlotKinds,
  fenced,
  messageHolds,
  momentOffered,
  triggerWords,
  violatesNoPrices,
  type CampaignMessage,
  type FollowUpCondition,
  type ParamSpec,
  type SequenceDraftAnswer,
  type SequenceDraftDto,
  type SequenceDraftStepDto,
} from "@chanlytics/contracts";
import { calendarOf } from "../calendar/calendar-settings";
import { askForJson } from "../model-json";
import { load, type ReaderContext } from "../readers";
import * as facts from "../readers/facts";
import { templates } from "../readers/templates";

/** How much of a message's words the model is handed. */
const BODY_CHARS = 280;
/** A slot's kinds the model is told, in words: what each value is filled with. */
const SLOT_WORDS: Record<string, string> = {
  first_name: "their first name",
  business_name: "the business's name",
  booking_link: "the booking link",
  review_link: "the review link",
  visit_when: "the booked time",
  visit_service: "the booked service",
  proposal_link: "a proposal's link",
  text: "typed words",
};

/** A moment this workspace may start a sequence on, as the model is handed it. */
interface Moment {
  key: string;
  label: string;
  hint: string;
  cls: string;
  /** A visit moment: its run knows each visit, so a step on it may say the booked time or service. */
  visits: boolean;
  proposal: boolean;
}

/** A message this workspace can send now, as the model is handed it and the draft shows it. */
interface Offered {
  key: string;
  templateId: string;
  title: string;
  body: string;
  purpose: string;
  channels: string[];
  slots: string[];
}

/** What a draft is written from: the business, its moments and its messages, and whose budget the call is counted in. */
interface DraftKnown {
  business: string;
  moments: Moment[];
  messages: Offered[];
  tenantId: string;
  userId: string;
}

const RULES = [
  "You set up an automatic sequence of messages for a small business, from what its owner says it should do.",
  "A sequence starts at one moment and sends its first message then; up to three more steps may follow, each a whole number of days after the one before (1 to 90). A later step may go only if the person has not booked since (no_booking), or has not written back since (no_reply), or both.",
  "Use only the moments and the messages listed, by their keys. Never invent a moment, a message or what a message says.",
  "If the owner asks for something no listed moment or message can do, build the closest part you can and say in `cannot`, in one short sentence, what is missing and where it is made (a message is written in Messages). Leave `cannot` empty when everything fit.",
  "If no listed moment fits at all, leave `moment` and `first.message` empty and say why in `cannot`.",
  "`name`: what the sequence is, in two to four words, as the owner would call it.",
  `\`hour\`: the hour of the day it sends, ${PLAYBOOK_HOURS.min} to ${PLAYBOOK_HOURS.max}; ${PLAYBOOK_DEFAULTS.runHour} unless the owner says otherwise.`,
  "`texts`: for a message with typed-words slots, the words for each of those slots in order, short and plain, in the business's voice, never a price, a discount or a date; [] when it has none.",
  "Each later step's `name` says what it does in two to four words.",
  DATA_NOT_INSTRUCTIONS,
];

/** The draft the owner had before saying it again: its name, and how many steps it had. */
type DraftBefore = { name: string; steps: number } | null;

function sequenceAsked(known: DraftKnown, words: string, previous: DraftBefore): string {
  const moments = known.moments.map((m) => `- ${m.key}: ${m.label} (${m.hint})`).join("\n");
  const messages = known.messages
    .map(
      (m) =>
        `- ${m.key}: "${m.title}", ${m.purpose}, goes by ${m.channels.join(" or ")}; its values: ${
          m.slots.length ? m.slots.map((s) => SLOT_WORDS[s] ?? s).join(", ") : "none"
        }\n${fenced("record", m.body.slice(0, BODY_CHARS))}`,
    )
    .join("\n");
  const again = previous
    ? [`The last draft was "${previous.name}", ${previous.steps} steps. Draft it again from what the owner says now.`]
    : [];
  return [
    `The business: ${known.business}.`,
    `The moments it may start on:\n${moments}`,
    known.messages.length ? `The messages it can send:\n${messages}` : "It has no message it can send yet.",
    `What the owner says it should do: ${words}`,
    ...again,
  ].join("\n\n");
}

/** A step's values from its message's slots: typed words from the model's, unless they name a price; the rest the run's. */
function paramsOf(m: Offered, texts: readonly string[]): ParamSpec[] {
  let t = 0;
  return m.slots.map((kind) => {
    if (kind !== "text") return { kind } as ParamSpec;
    const said = (texts[t++] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    return { kind: "text", value: violatesNoPrices(said) ? "" : said };
  });
}

/** Whether a step's run can fill each of its message's values: a visit's only on a visit moment's first step, a proposal's on the follow-up's. */
function fillable(m: Offered, first: boolean, moment: Moment): boolean {
  return m.slots.every((s) =>
    s === "visit_when" || s === "visit_service"
      ? first && moment.visits
      : s === "proposal_link"
        ? first && moment.proposal
        : true,
  );
}

const asStep = (
  m: Offered,
  p: { name: string; after: number | null; onlyIf: FollowUpCondition[]; texts: readonly string[] },
): SequenceDraftStepDto => ({
  name: p.name,
  after_days: p.after,
  only_if: p.onlyIf,
  template_id: m.templateId,
  message: { title: m.title, body: m.body, channels: m.channels },
  params: paramsOf(m, p.texts),
});

/** What is kept of the model's answer: only what this workspace offers and holds, within the steps' bounds. */
function draftKept(answer: SequenceDraftAnswer, known: DraftKnown, said: string): SequenceDraftDto {
  const moment = known.moments.find((m) => m.key === answer.moment);
  const byKey = new Map(known.messages.map((m) => [m.key, m]));
  const first = byKey.get(answer.first.message);
  const cannot = answer.cannot.trim() || null;
  if (!moment || !first || !fillable(first, true, moment))
    throw new AppError(
      "validation",
      cannot ?? "Ask couldn’t find a moment and a message of yours that do this. Say it another way.",
      422,
    );
  const name = answer.name.trim() || moment.label;
  const steps: SequenceDraftStepDto[] = [asStep(first, { name, after: null, onlyIf: [], texts: answer.first.texts })];
  let dropped = false;
  for (const t of answer.then.slice(0, SEQUENCE_DRAFT_THEN_MAX)) {
    const m = byKey.get(t.message);
    if (!m || !fillable(m, false, moment)) {
      dropped = true;
      continue;
    }
    steps.push(
      asStep(m, {
        name: t.name.trim() || name,
        after: Math.min(SEQUENCE_WAIT_DAYS.max, Math.max(SEQUENCE_WAIT_DAYS.min, t.after_days)),
        onlyIf: [...new Set(t.only_if)],
        texts: t.texts,
      }),
    );
  }
  return {
    said,
    business: known.business,
    name: name.slice(0, 80),
    trigger: moment.key,
    run_hour: Math.min(PLAYBOOK_HOURS.max, Math.max(PLAYBOOK_HOURS.min, answer.hour)),
    policy_class: moment.cls,
    steps,
    cannot: cannot ?? (dropped ? "A step needed a message you can’t send yet, so it is left out." : null),
  };
}

/** The draft from what is known: one model call, and what is kept of its answer. */
export async function draftFrom(known: DraftKnown, words: string, previous: DraftBefore): Promise<SequenceDraftDto> {
  const answer = await askForJson(
    {
      tenantId: known.tenantId,
      userId: known.userId,
      purpose: "sequence_draft",
      request: {
        max_tokens: 900,
        system: RULES.join("\n"),
        schema: SEQUENCE_DRAFT_JSON_SCHEMA,
        messages: [{ role: "user", content: sequenceAsked(known, words, previous) }],
      },
    },
    SequenceDraftAnswerSchema,
    "draft",
  );
  return draftKept(answer, known, words);
}

/** The messages a step may send now, each keyed for the model: offered, with a channel it can go by. */
function offeredOf(read: {
  templates: { id: string; name: string; variables: unknown; body_preview?: string | null }[];
  messages: CampaignMessage[];
}): Offered[] {
  const rows = new Map(read.templates.map((t) => [t.id, t]));
  const out: Offered[] = [];
  for (const m of read.messages) {
    if (!m.offered) continue;
    const holds = messageHolds(m);
    const channels = (["whatsapp", "email", "sms"] as const).filter((c) => holds[c]);
    const id = m.versions.whatsapp?.id ?? m.anchor.id;
    const row = rows.get(id) ?? rows.get(m.anchor.id);
    if (!row || channels.length === 0) continue;
    out.push({
      key: `m${out.length + 1}`,
      templateId: row.id,
      title: m.title,
      body: (row.body_preview ?? "").trim(),
      purpose: m.purpose === "marketing" ? "an offer" : "a message about their visit or account",
      channels,
      slots: defaultSlotKinds(row),
    });
  }
  return out;
}

/** The route's handle: the workspace's moments and messages as its pages read them, then the draft. */
export async function draftSequence(
  rc: ReaderContext,
  words: string,
  previous: DraftBefore,
): Promise<SequenceDraftDto> {
  const [library, shape, names, calendar] = await Promise.all([
    load(rc, templates, { all: false }),
    load(rc, facts.businessShape, undefined),
    load(rc, facts.facts, undefined),
    calendarOf(rc.ctx, rc.tenantId).then(
      (c) => !!c.url || c.lostCalendar,
      () => false,
    ),
  ]);
  const offered = { dealsOn: shape.data.dealsOn, calendarOn: calendar };
  const moments: Moment[] = MOMENT_TRIGGERS.filter((t) => t.kind !== "saved" && momentOffered(t, offered)).map((t) => ({
    key: t.id,
    ...triggerWords(t, shape.data.word),
    cls: t.cls,
    visits: t.kind === "visit",
    proposal: t.kind === "deal",
  }));
  return draftFrom(
    {
      business: names.data.name,
      moments,
      messages: offeredOf(library.data),
      tenantId: rc.tenantId,
      userId: rc.userId,
    },
    words,
    previous,
  );
}
