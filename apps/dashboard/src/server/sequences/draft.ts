/**
 * Ask drafts what New makes (POST sequences/draft; decision 0065, One New for every sequence): the owner says in a line
 * what it should do, and one model call picks what it is (a sequence or a message sent once), who it is for (people or
 * leads) and drafts the whole of it, from what this workspace offers and holds: the moments it may start on and the lists
 * it keeps, each with who can hear it now (the Playbooks page's pools, counted as a run counts them), the messages it can
 * send now, the searches whose leads are ready, and what already runs. Where none of its messages fits a person's step,
 * Ask writes one, filed only when the draft is kept or started; a lead's emails are always its own words. The model names
 * each choice by a key of the request, never an id, and every answer is judged in code against the same lists
 * (draft-judge.ts). A message's words are data to the model (contracts ai/fence.ts). Nothing is written (decision 0017).
 */
import "server-only";
import {
  DATA_NOT_INSTRUCTIONS,
  MOMENT_TRIGGERS,
  NEW_DRAFT_JSON_SCHEMA,
  NEW_ONCE_AHEAD_DAYS,
  NEW_STEPS_MAX,
  NEW_WAIT_DAYS,
  NewDraftAnswerSchema,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_HOURS,
  defaultSlotKinds,
  fenced,
  messageHolds,
  momentOffered,
  triggerWords,
  zonedInputValue,
  type CampaignMessage,
  type ConsentChannel,
  type NewDraftAsk,
  type NewDraftDto,
} from "@chanlytics/contracts";
import { listPolicies, mailboxConnectionsOf } from "@chanlytics/db";
import type { PoolRead } from "@/lib/campaign-channels";
import { calendarOf } from "../calendar/calendar-settings";
import { reachOutSourcesOf } from "../leads/lead-workbench";
import { log } from "../log";
import { askForJson } from "../model-json";
import { load, type ReaderContext } from "../readers";
import * as facts from "../readers/facts";
import { playbooks } from "../readers/playbooks";
import { sequences } from "../readers/sequences";
import { templates } from "../readers/templates";
import { draftKept, type DraftKnown, type KnownMessage } from "./draft-judge";

/** How much of a message's words the model is handed. */
const BODY_CHARS = 280;

const RULES = [
  "You set up what a small business sends on its own, from what its owner says in a line.",
  "Choose `kind`: sequence (steps over days, each a wait after the one before) or once (one message, now or on a day).",
  "Choose `audience`: people (the business's own customers, in People) or leads (other businesses a search found, which never said yes to it: you only email them).",
  "Choose `who` by its key from the lists below: a moment or a list for a sequence to people; everyone or a list for a message sent once to people; a search for leads. Leave it empty when none fits, and say why in `cannot`.",
  "A step to people sends one of the business's messages by its key, with `texts` for its typed-words values in order; or, only where none of them fits, a new one in `write`: a short `title`, `offer` true for an offer, and its words for each channel it should go by: `whatsapp` and `text` short and plain, `email_subject` and `email_body`. Name only these values, in double braces: {{first name}}, {{business name}}, {{booking link}}, {{review link}}, and on a first step after a booking {{booked time}} and {{booked service}}. A text never carries an offer: leave `text` empty for one. Leave `message` empty when you write one, and every `write` field empty when you don't.",
  "A step to leads is an email in the business's own words: `subject` on the first only; `body` at most 80 words on the first, starting with {{opening}} on a line of its own (one line about them, written for each business later), and at most 50 on a later one, which answers in the same thread. Use only {{opening}}, {{business}}, {{first name}}, {{city}}, {{your name}}, {{your business}}, and {{booking link}} after the first only. No link, price or exclamation mark in the first.",
  "Never a price, a discount or a date in any words you write.",
  `A step after the first waits \`after_days\` after the one before: ${NEW_WAIT_DAYS.people.min} to ${NEW_WAIT_DAYS.people.max} for people, ${NEW_WAIT_DAYS.leads.min} to ${NEW_WAIT_DAYS.leads.max} for leads. To people it may go only if they have not booked since (no_booking) or not written back (no_reply); a lead stops on a reply on its own, so leave \`only_if\` empty for leads and on a first step.`,
  "A step may instead hand each person to the team: `does` call or note, with `words` saying what to do when they come up. Only when the owner asks for it, and only as the last step, never the first. A message step leaves `words` empty.",
  `Up to ${NEW_STEPS_MAX.people} steps to people and ${NEW_STEPS_MAX.leads} to leads, the first included. A message sent once is one step.`,
  "`name`: what it is, in two to four words, as the owner would call it.",
  `\`hour\`: the hour a sequence sends, ${PLAYBOOK_HOURS.min} to ${PLAYBOOK_HOURS.max}; ${PLAYBOOK_DEFAULTS.runHour} unless the owner says otherwise. \`when\`: for a message sent once, "now", or "YYYY-MM-DD HH:MM" in the business's time, within ${NEW_ONCE_AHEAD_DAYS} days; empty for a sequence.`,
  "If the owner asks for something nothing here can do, build the closest part you can and say in `cannot` what is left out, in two short sentences: “Left out: “<their words>”.”, then why, and what the draft does instead. Leave `cannot` empty when everything fit.",
  DATA_NOT_INSTRUCTIONS,
];

/** The messages a step may send now, each keyed for the model: offered, with a channel it can go by. */
function offeredOf(read: {
  templates: { id: string; name: string; variables: unknown; body_preview?: string | null }[];
  messages: CampaignMessage[];
}): KnownMessage[] {
  const rows = new Map(read.templates.map((t) => [t.id, t]));
  const out: KnownMessage[] = [];
  for (const m of read.messages) {
    if (!m.offered) continue;
    const holds = messageHolds(m);
    const channels = (["whatsapp", "email", "sms"] as const).filter((c) => holds[c]);
    const id = m.versions.whatsapp?.id ?? m.anchor.id;
    const row = rows.get(id) ?? rows.get(m.anchor.id);
    if (!row || channels.length === 0) continue;
    out.push({
      key: `k${out.length + 1}`,
      templateId: row.id,
      title: m.title,
      body: (row.body_preview ?? "").trim(),
      offer: m.purpose === "marketing",
      channels,
      slots: defaultSlotKinds(row),
    });
  }
  return out;
}

/** What the model is told: the business, its moments, lists, searches and messages, the choices made, and the line. */
function draftAsked(known: DraftKnown, ask: NewDraftAsk): string {
  const count = (n: number | null) => (n === null ? "" : `, ${n} now`);
  const lines = (title: string, rows: string[]) => (rows.length ? `${title}:\n${rows.join("\n")}` : `${title}: none.`);
  const chosen = [
    ask.kind ? `kind ${ask.kind}` : null,
    ask.audience ? `audience ${ask.audience}` : null,
    ask.who ? `who: ${ask.who.label}` : null,
  ].filter(Boolean);
  return [
    `The business: ${known.business}. Its day and time now: ${known.localNow.replace("T", " ")}.`,
    lines(
      "Moments a sequence to people may start on",
      known.moments.map((m) => `- ${m.key}: ${m.label} (${m.hint}${count(m.count)})`),
    ),
    lines(
      "Lists of people",
      known.lists.map((l) => `- ${l.key}: ${l.label}${count(l.count)}`),
    ),
    `- everyone: everyone who can hear a message sent once${count(known.everyone)}`,
    lines(
      "Searches whose leads are ready",
      known.searches.map((s) => `- ${s.key}: ${s.label}, ${s.ready} ready`),
    ),
    known.messages.length
      ? lines(
          "The business's messages",
          known.messages.map(
            (m) =>
              `- ${m.key}: "${m.title}", ${m.offer ? "an offer" : "news or about their booking"}, goes by ${m.channels.join(" or ")}; its values: ${m.slots.join(", ") || "none"}\n${fenced("record", m.body.slice(0, BODY_CHARS))}`,
          ),
        )
      : "The business has no message it can send yet: write the ones its steps need.",
    chosen.length ? `The owner already chose: ${chosen.join("; ")}. Keep these.` : null,
    `What the owner says it should do: ${ask.words.trim()}`,
    ask.previous
      ? `The last draft was "${ask.previous.name}", ${ask.previous.steps} steps. Draft it again from what the owner says now.`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The draft from what is known: one model call, and what is kept of its answer. */
export async function draftFrom(
  known: DraftKnown,
  ask: NewDraftAsk,
  who: { tenantId: string; userId: string },
): Promise<NewDraftDto> {
  const answer = await askForJson(
    {
      tenantId: who.tenantId,
      userId: who.userId,
      purpose: "sequence_draft",
      request: {
        max_tokens: 2400,
        system: RULES.join("\n"),
        schema: NEW_DRAFT_JSON_SCHEMA,
        messages: [{ role: "user", content: draftAsked(known, ask) }],
      },
    },
    NewDraftAnswerSchema,
    "draft",
  );
  return draftKept(answer, known, ask);
}

/** A read the draft can do without: logged once, and the draft drafted from what was read. */
async function orNull<T>(read: Promise<T>, what: string, tenantId: string): Promise<T | null> {
  try {
    return await read;
  } catch (e) {
    log.error("sequence_draft_read_failed", { tenant_id: tenantId, read: what, error: e });
    return null;
  }
}

/** The moments this workspace may start a sequence on, keyed, each with who can hear it now. */
function momentsOf(
  word: Parameters<typeof triggerWords>[1],
  calendarOn: boolean,
  pools: Record<string, PoolRead | null> | null,
): DraftKnown["moments"] {
  return MOMENT_TRIGGERS.filter((t) => t.kind !== "saved" && momentOffered(t, { calendarOn })).map((t, i) => ({
    key: `m${i + 1}`,
    trigger: t.id,
    ...triggerWords(t, word),
    cls: t.cls,
    visits: t.kind === "visit",
    proposal: t.kind === "deal",
    count: pools?.[t.id]?.candidates ?? null,
    pool: pools?.[t.id] ?? null,
  }));
}

/** The route's handle: everything a draft is judged against, read at once, then the draft. */
export async function draftSequence(rc: ReaderContext, ask: NewDraftAsk): Promise<NewDraftDto> {
  const { ctx, tenantId } = rc;
  const [library, shape, named, calendarOn, pb, seqs, sources, policies, mailboxes] = await Promise.all([
    load(rc, templates, { all: false }),
    load(rc, facts.businessShape, undefined),
    load(rc, facts.facts, undefined),
    calendarOf(ctx, tenantId).then(
      (c) => !!c.url || c.lostCalendar,
      () => false,
    ),
    orNull(load(rc, playbooks, undefined), "playbooks", tenantId),
    orNull(load(rc, sequences, undefined), "sequences", tenantId),
    orNull(reachOutSourcesOf(ctx, tenantId), "sources", tenantId),
    orNull(listPolicies(ctx.supabase, tenantId), "policies", tenantId),
    orNull(mailboxConnectionsOf(ctx.supabase, tenantId), "mailboxes", tenantId),
  ]);
  const pools = pb?.data.pools ?? null;
  const ready = pb?.data.ready ?? null;
  const live = (mailboxes ?? []).filter((m) => m.state !== "removed");
  const known: DraftKnown = {
    business: named.data.name,
    localNow: zonedInputValue(rc.now.getTime(), named.data.timezone),
    moments: momentsOf(shape.data.word, calendarOn, pools),
    lists: [
      ...(pb?.data.people_lists ?? []).map((l) => ({ token: `seg:${l.key}`, label: l.label })),
      ...(pb?.data.lists ?? []).filter((l) => !l.archived).map((l) => ({ token: `list:${l.id}`, label: l.name })),
    ].map((l, i) => ({
      ...l,
      key: `l${i + 1}`,
      count: pools?.[l.token]?.candidates ?? null,
      pool: pools?.[l.token] ?? null,
    })),
    everyone: pools?.everyone_monthly?.candidates ?? null,
    everyonePool: pools?.everyone_monthly ?? null,
    searches: (sources?.sources ?? [])
      .filter((s) => s.ready > 0)
      .map((s, i) => ({
        key: `s${i + 1}`,
        id: s.id,
        label: s.name,
        ready: s.ready,
        checking: Math.max(0, s.with_unconfirmed - s.ready),
      })),
    messages: offeredOf(library.data),
    running: (seqs?.data.sequences ?? [])
      .filter((r) => r.state !== "ended")
      .map((r) => ({
        id: r.id,
        name: r.name,
        starts: r.starts,
        trigger: r.first?.trigger ?? null,
        list: r.first?.list_key ? `seg:${r.first.list_key}` : r.first?.list_id ? `list:${r.first.list_id}` : null,
        search: r.first?.source_search_id ?? r.first?.search_id ?? null,
      })),
    ready: ready
      ? (["whatsapp", "sms", "email"] as const).filter((c): c is ConsentChannel => ready[c]?.ready === true)
      : [],
    classModes: Object.fromEntries((policies ?? []).map((p) => [p.class, p.mode])),
    // None named is every connected mailbox (00424): the draft names none, and says the first.
    mailbox: live.length ? { ids: [], label: live[0]?.address ?? "" } : null,
  };
  return draftFrom(known, ask, { tenantId, userId: rc.userId });
}
