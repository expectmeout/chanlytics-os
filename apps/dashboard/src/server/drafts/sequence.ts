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
  ASK_FIRST_WORDS_MAX,
  ASK_LATER_WORDS_MAX,
  ASK_MEMORY_LIMITS,
  DATA_NOT_INSTRUCTIONS,
  sentAsDrafted,
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
  fencedInline,
  parseTenantConfig,
  reachOutToneOf,
  toldPart,
  type ToldPart,
  mailboxIsLive,
  messageHolds,
  momentOffered,
  newListOf,
  slotLabels,
  triggerWords,
  zonedInputValue,
  type CampaignMessage,
  type ConsentChannel,
  type NewDraftAsk,
  type NewDraftDto,
  type TenantConfig,
} from "@chanlytics/contracts";
import { askMemoryLines } from "@chanlytics/db/ask";
import { listPolicies } from "@chanlytics/db/workspace";
import { listMailboxConnectionsOf } from "@chanlytics/db/email";
import { doesMakePreviews, listSequenceMakes, findWorkspaceWords } from "@chanlytics/db/campaigns";
import type { PoolRead } from "@/lib/campaign-channels";
import { runningOf } from "@/lib/new-checks";
import { findCalendar } from "../calendar/settings";
import { getChainReport } from "../campaigns/reach-outs/chain-acts";
import { listChains } from "../campaigns/reach-outs/reach-outs";
import { getReachOutSources } from "../leads/workbench";
import { log } from "../shared/log";
import { askForJson } from "../shared/model-json";
import { load, type ReaderContext } from "../shared/reader";
import * as facts from "../readers/facts";
import { playbooks } from "../readers/playbooks";
import { sequences } from "../readers/sequences";
import { templates } from "../readers/templates";
import { getStoredConfig } from "../workspace/config-row";
import {
  draftKept,
  type DraftExample,
  type DraftKnown,
  type KnownMessage,
  type OwnerKnown,
} from "../campaigns/sequences/draft-judge";
import type { TenantId } from "@chanlytics/contracts";

/** How much of a message's words the model is handed. */
const BODY_CHARS = 280;
/** How much of a started first email the model is handed: a first email is 80 words at most (contracts). */
const EXAMPLE_CHARS = 900;
/** The started sequences to leads whose first emails the drafter reads, newest first. */
const EXAMPLES_MAX = 3;
/** The services the drafter is told by name: enough to say what the business offers, never its whole list. */
const SERVICES_SAID = 12;

/** What a step to leads keeps to, said once: a draft is written under it, and an email written again (rewrite.ts). */
export const LEAD_RULES = [
  `A step to leads is an email in the business's own words, the same words for every business it goes to: \`subject\` on the first only; \`body\` at most ${ASK_FIRST_WORDS_MAX} words on the first, starting with {{opening}} on a line of its own (one line about them, written for each business later from its record), and at most ${ASK_LATER_WORDS_MAX} on a later one, which answers in the same thread. The words themselves claim and suppose nothing about the business they go to, not how busy it is, its calls, what it has or what it wants: only the opening says anything about them. Use only {{opening}}, {{business}}, {{first name}}, {{city}}, {{your name}}, {{your business}}, and {{booking link}} after the first only. No link, price or exclamation mark in the first.`,
  "Write a step to leads in the owner's own voice: the first emails they started before (their length, greeting, how they open, ask and sign off) and the lines Ask remembers about how they write come first: where one shows what Ask drafted beside what they sent, what they changed is how they want it, and what wrote back is what worked, where it went to enough businesses to tell (a few sends say nothing either way); you never copy a sentence of them; where there is neither, plain and short. Say what the business offers as it says it itself, from what it does and its services, never more. You may say who the email goes to as the owner's own act (\"I'm writing to a few auto shops in {{city}}\"), never as a fact about the business.",
  "Never a price, a discount or a date in any words you write.",
  "A number about the owner's own business (how many customers, how long, a result) stands in the words only inside one of the claims it can prove, word for word, or as the owner said it in what they asked for; where there is neither, write no such number.",
];

const RULES = [
  "You set up what a small business sends on its own, from what its owner says in a line.",
  "Choose `kind`: sequence (steps over days, each a wait after the one before) or once (one message, now or on a day).",
  "Choose `audience`: people (the business's own customers, in People) or leads (other businesses a search found, which never said yes to it: you only email them).",
  "Choose `who` by its key from the lists below: a moment or a list for a sequence to people; everyone or a list for a message sent once to people; a search for leads. Leave it empty when none fits, and say why in `cannot`.",
  "A step to people sends one of the business's messages by its key, with `texts` for its typed-words values in order; or, only where none of them fits, a new one in `write`: a short `title`, `offer` true for an offer, and its words for each channel it should go by: `whatsapp` and `text` short and plain, `email_subject` and `email_body`. Name only these values, in double braces: {{first name}}, {{business name}}, {{booking link}}, {{review link}}, and on a first step after a booking {{booked time}} and {{booked service}}. A text never carries an offer: leave `text` empty for one. Leave `message` empty when you write one, and every `write` field empty when you don't.",
  ...LEAD_RULES,
  `A step after the first waits \`after_days\` after the one before: ${NEW_WAIT_DAYS.people.min} to ${NEW_WAIT_DAYS.people.max} for people, ${NEW_WAIT_DAYS.leads.min} to ${NEW_WAIT_DAYS.leads.max} for leads. To people it may go only if they have not booked since (no_booking) or not written back (no_reply); a lead stops on a reply on its own, so leave \`only_if\` empty for leads and on a first step.`,
  "A step may instead hand each person to the team: `does` call or note, with `words` saying what to do when they come up. Only when the owner asks for it, and only as the last step, never the first. A message step leaves `words` empty.",
  `Up to ${NEW_STEPS_MAX.people} steps to people and ${NEW_STEPS_MAX.leads} to leads, the first included. A message sent once is one step.`,
  "`name`: what it is, in two to four words, as the owner would call it.",
  `\`hour\`: the hour a sequence sends, ${PLAYBOOK_HOURS.min} to ${PLAYBOOK_HOURS.max}; ${PLAYBOOK_DEFAULTS.runHour} unless the owner says otherwise. \`when\`: for a message sent once, "now", or "YYYY-MM-DD HH:MM" in the business's time, within ${NEW_ONCE_AHEAD_DAYS} days; empty for a sequence.`,
  "If the owner asks for something nothing here can do, build the closest part you can and say in `cannot` what is left out, in two short sentences: “Left out: “<their words>”.”, then why, and what the draft does instead. Leave `cannot` empty when everything fit.",
  DATA_NOT_INSTRUCTIONS,
];

/**
 * The one rule a workspace that makes previews adds (decision 0079): {{their preview}} in a later step to leads, as that
 * email's only link. Nothing is said of it to any other workspace, whose sends would have none to fill it.
 */
export const PREVIEW_RULE =
  'This business sets up each business it writes to a receptionist of their own to try: a step to leads after the first may name {{their preview}}, its link, once, as that email\'s only link (never with {{booking link}}), said as theirs to try ("I set one up for {{business}}. Try it: {{their preview}}"). Only for a search of businesses that take bookings, never an agency.';

/** The messages a step may send now, each keyed for the model: offered, with a channel it can go by. */
function offeredOf(read: {
  templates: { id: string; name: string; variables: unknown; body_preview?: string | null }[];
  messages: CampaignMessage[];
}): KnownMessage[] {
  const rows = new Map(read.templates.map((t) => [t.id, t]));
  const out: KnownMessage[] = [];
  for (const message of read.messages) {
    if (!message.offered) continue;
    const holds = messageHolds(message);
    const channels = (["whatsapp", "email", "sms"] as const).filter((c) => holds[c]);
    const id = message.versions.whatsapp?.id ?? message.anchor.id;
    const row = rows.get(id) ?? rows.get(message.anchor.id);
    if (!row || channels.length === 0) continue;
    out.push({
      key: `k${out.length + 1}`,
      templateId: row.id,
      title: message.title,
      body: (row.body_preview ?? "").trim(),
      offer: message.purpose === "marketing",
      channels,
      slots: defaultSlotKinds(row),
      labels: slotLabels(row),
    });
  }
  return out;
}

/** An email as the model reads one: its subject, then its words, cut where a first email ends. */
const emailSaid = (e: { subject: string | null; body: string }): string =>
  `${e.subject ? `Subject: ${e.subject}\n` : ""}${e.body}`.slice(0, EXAMPLE_CHARS);

/**
 * One started first email as the drafter is told it (decision 0078 step 2): what it was for and how it did, then the pair:
 * what Ask drafted and what the owner sent, or that they sent it as drafted, or what they sent where no draft was kept.
 */
function exampleSaid(draftExample: DraftExample): string {
  const numbers = draftExample.numbers;
  const head = [
    draftExample.for ? `For: ${draftExample.for}` : null,
    numbers ? `To ${numbers.written}, ${numbers.wrote_back} wrote back, ${numbers.said_no} said no` : null,
  ].filter(Boolean);
  const sent = { subject: draftExample.subject, body: draftExample.body };
  const pair = !draftExample.drafted
    ? [`They sent:\n${emailSaid(sent)}`]
    : sentAsDrafted(draftExample.drafted, sent)
      ? [`They sent it as Ask drafted it:\n${emailSaid(sent)}`]
      : [`Ask drafted:\n${emailSaid(draftExample.drafted)}`, `They sent:\n${emailSaid(sent)}`];
  return fenced("record", [...(head.length ? [head.join(" · ")] : []), ...pair].join("\n\n"));
}

/** A list the model is told, under its title. */
const lines = (title: string, rows: string[]) => (rows.length ? `${title}:\n${rows.join("\n")}` : `${title}: none.`);

/**
 * What the model is told of what the business offers and how its owner writes, all as data, by the part of How it
 * reaches out's What it's told each is (decision 0113): a draft's and a rewrite's. In this order, so a workspace that
 * never wrote the page's rows is told what it was told before it: the goal, what it does, its services, its tone.
 */
function ownerParts(known: OwnerKnown): Record<"offer" | "proof" | "writes" | "examples", Array<string | null>> {
  return {
    offer: [
      // What an email to leads offers: How it reaches out's own words where the owner wrote them (0113), else the goal.
      known.offer
        ? `What it offers the businesses it writes to, in its owner's words: ${fencedInline("record", known.offer)}`
        : known.goal
          ? `What it is working toward, which an email to leads offers: ${fencedInline("record", known.goal)}`
          : null,
      known.whoFor ? `Who it writes to, in its owner's words: ${fencedInline("record", known.whoFor)}` : null,
      known.fixes ? `What it fixes for them, in its owner's words: ${fencedInline("record", known.fixes)}` : null,
      known.about ? `What the business does, in its own words: ${fencedInline("record", known.about)}` : null,
      known.services?.length ? `Its services: ${fencedInline("record", known.services.join(", "))}` : null,
    ],
    proof: [
      known.proof?.length
        ? lines(
            "What it can prove, in its owner's words: use one at most in an email, word for word, and no other claim or number about the business",
            known.proof.map((c) => `- ${fencedInline("record", c)}`),
          )
        : null,
    ],
    writes: [
      known.tone ? `How the business sounds, in its own words: ${fencedInline("record", known.tone)}` : null,
      known.memory?.length
        ? lines(
            "What Ask remembers about the business and how its owner writes",
            known.memory.map((m) => `- ${fencedInline("record", m.text)}`),
          )
        : null,
    ],
    examples: [
      known.examples?.length
        ? lines(
            "First emails to leads the owner started before, newest first: what each was for, how it did, what Ask drafted and what they sent",
            known.examples.map(exampleSaid),
          )
        : null,
    ],
  };
}

/** The same, as the lines the model is told, in their order. */
export function ownerSaid(known: OwnerKnown): Array<string | null> {
  const o = ownerParts(known);
  return [...o.offer, ...o.proof, ...o.writes, ...o.examples];
}

/** A part's lines as the model is told them: those that say something, one after another. */
const partText = (rows: Array<string | null>): string => rows.filter(Boolean).join("\n\n");

/**
 * What the model is told, by part (What it's told, decision 0113): the business and what it offers, its proof, how it
 * writes, its started first emails, its moments, lists, searches and messages, and what the owner asked. Joined, they are
 * the prompt itself (draftAsked): the sheet is cut from the text the model reads, never written beside it.
 */
export function draftAskedParts(known: DraftKnown, ask: NewDraftAsk): ToldPart[] {
  const count = (n: number | null) => (n === null ? "" : `, ${n} now`);
  const chosen = [
    ask.kind ? `kind ${ask.kind}` : null,
    ask.audience ? `audience ${ask.audience}` : null,
    ask.who ? `who: ${ask.who.label}` : null,
  ].filter(Boolean);
  const owner = ownerParts(known);
  const business = `The business: ${known.business}. Its day and time now: ${known.localNow.replace("T", " ")}.`;
  const sources = [
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
  ];
  const askLines = [
    chosen.length ? `The owner already chose: ${chosen.join("; ")}. Keep these.` : null,
    `What the owner says it should do: ${ask.words.trim()}`,
    ask.previous
      ? `The last draft was "${ask.previous.name}", ${ask.previous.steps} steps. Draft it again from what the owner says now.`
      : null,
  ];
  return [
    toldPart("offer", partText([business, ...owner.offer])),
    toldPart("proof", partText(owner.proof)),
    toldPart("writes", partText(owner.writes)),
    toldPart("examples", partText(owner.examples)),
    toldPart("sources", partText(sources)),
    toldPart("asked", partText(askLines)),
  ];
}

/** What the model is told: the parts, joined. */
function draftAsked(known: DraftKnown, ask: NewDraftAsk): string {
  return draftAskedParts(known, ask)
    .map((p) => p.text)
    .filter(Boolean)
    .join("\n\n");
}

/** The drafter's own rules, as its system prompt says them: every workspace's, and a previewing one's one more. */
export const draftRules = (previews: boolean): string => [...RULES, ...(previews ? [PREVIEW_RULE] : [])].join("\n");

/** The draft from what is known: one model call, and what is kept of its answer. */
export async function draftSequenceFrom(
  known: DraftKnown,
  ask: NewDraftAsk,
  personName: { tenantId: TenantId; userId: string },
): Promise<NewDraftDto> {
  const answer = await askForJson(
    {
      tenantId: personName.tenantId,
      userId: personName.userId,
      purpose: "sequence_draft",
      request: {
        max_tokens: 2400,
        system: draftRules(known.previews === true),
        schema: NEW_DRAFT_JSON_SCHEMA,
        messages: [{ role: "user", content: draftAsked(known, ask) }],
      },
    },
    NewDraftAnswerSchema,
    "draft",
  );
  // The lines learned from how the owner writes, which the page says it wrote with (decision 0078).
  const voice = (known.memory ?? []).filter((m) => m.source === "learned").map((m) => m.text);
  return { ...draftKept(answer, known, ask), voice };
}

/**
 * What the business says about itself and how its owner writes (decision 0078): its description, its services and tone
 * from Business, Ask's live memory, and its started first emails. Each read can fail alone, and the draft is drafted
 * without it.
 */
export async function getOwner(
  rc: ReaderContext,
  rows: ReadonlyArray<{ id: string; starts: string; state: string }>,
  config: Pick<TenantConfig, "brain" | "reach_out"> | null,
): Promise<OwnerRead> {
  const { ctx, tenantId } = rc;
  const profile = config?.brain?.profile;
  const reachOut = config?.reach_out;
  const [ownWords, memory, examples] = await Promise.all([
    readOrNull(findWorkspaceWords(ctx.supabase, tenantId), "about", tenantId),
    readOrNull(askMemoryLines(ctx.supabase, tenantId, ASK_MEMORY_LIMITS.liveMax), "memory", tenantId),
    readOrNull(startedExamples(rc, rows), "examples", tenantId),
  ]);
  return {
    about: ownWords?.text ?? null,
    services: (profile?.services ?? []).slice(0, SERVICES_SAID).map((s) => s.name),
    // A cold email's own tone where the owner set one on How it reaches out (0113), else the receptionist's.
    tone: reachOutToneOf(config),
    offer: reachOut?.offer?.trim() || null,
    whoFor: reachOut?.who_for?.trim() || null,
    fixes: reachOut?.fixes?.trim() || null,
    proof: (reachOut?.proof ?? []).map((c) => c.trim()).filter(Boolean),
    memory: (memory ?? []).map((m) => ({ text: m.text, source: m.source })),
    examples: examples ?? [],
  };
}

/** What getOwner answers: the business's own words, How it reaches out's (0113), Ask's memory and the started first emails. */
type OwnerRead = Pick<
  DraftKnown,
  "about" | "services" | "tone" | "memory" | "examples" | "offer" | "whoFor" | "fixes" | "proof"
>;

/** A chain's first email, as the drafter reads one: an email with words, never a call's or a note's. */
type FirstOf = { steps: ReadonlyArray<{ subject: string | null; body: string; hand: unknown }> };
const firstEmailOf = (c: FirstOf) => {
  const first = c.steps[0];
  return first && !first.hand && first.body.trim() ? first : null;
};

/**
 * The first emails of the workspace's newest started sequences to leads (decision 0078 and its step 2), as their owner
 * left them, each with what Ask drafted for it (its make's `as_drafted`), what it was for and how it did. Pure: the
 * chains, the makes and the first steps' counts are read by startedExamples.
 */
export function examplesOf(
  chains: ReadonlyArray<FirstOf & { root_id: string; search: { name: string } | null }>,
  drafted: ReadonlyMap<string, { subject: string | null; body: string } | null>,
  counts: ReadonlyMap<string, { written: number; wrote_back: number; said_no: number } | null>,
): DraftExample[] {
  return chains.flatMap((chain) => {
    const first = firstEmailOf(chain);
    if (!first) return [];
    return [
      {
        subject: first.subject,
        body: first.body,
        drafted: drafted.get(chain.root_id) ?? null,
        for: chain.search?.name ?? null,
        numbers: counts.get(chain.root_id) ?? null,
      },
    ];
  });
}

/**
 * The newest started sequences to leads, read for the drafter: their chains, their makes and each first step's counts. A
 * draft never started is not read (decision 0078); a count or a make that cannot be read leaves that part unsaid.
 */
async function startedExamples(
  rc: ReaderContext,
  rows: ReadonlyArray<{ id: string; starts: string; state: string }>,
): Promise<DraftExample[]> {
  const started = new Set(rows.filter((r) => r.starts === "leads" && r.state !== "draft").map((r) => r.id));
  if (started.size === 0) return [];
  const chains = (await listChains(rc.ctx, rc.tenantId))
    .filter((c) => started.has(c.root_id) && firstEmailOf(c))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, EXAMPLES_MAX);
  if (chains.length === 0) return [];
  const ids = chains.map((c) => c.root_id);
  const [makes, reports] = await Promise.all([
    readOrNull(
      listSequenceMakes(rc.ctx.supabase, { tenantId: rc.tenantId, ids, limit: EXAMPLES_MAX * 4 }),
      "makes",
      rc.tenantId,
    ),
    Promise.all(ids.map((id) => readOrNull(getChainReport(rc.ctx, rc.tenantId, id), "counts", rc.tenantId))),
  ]);
  const drafted = new Map((makes ?? []).map((m) => [m.sequence_id, m.as_drafted?.steps[0] ?? null]));
  const counts = new Map(
    ids.map((id, i) => {
      const step = reports[i]?.steps.find((s) => s.n === 1);
      return [id, step ? { written: step.written, wrote_back: step.wrote_back, said_no: step.said_no } : null];
    }),
  );
  return examplesOf(chains, drafted, counts);
}

/** A read the draft can do without: logged once, and the draft drafted from what was read. */
export async function readOrNull<T>(read: Promise<T>, text: string, tenantId: TenantId): Promise<T | null> {
  try {
    return await read;
  } catch (e) {
    log.error("sequence_draft_read_failed", { tenant_id: tenantId, read: text, error: e });
    return null;
  }
}

/** The moments this workspace may start a sequence on, keyed, each with who can hear it now. */
function momentsOf(
  word: Parameters<typeof triggerWords>[1],
  calendarOn: boolean,
  pools: Record<string, PoolRead | null> | null,
): DraftKnown["moments"] {
  return MOMENT_TRIGGERS.filter((t) => t.kind !== "saved" && momentOffered(t, { calendarOn })).map((item, index) => ({
    key: `m${index + 1}`,
    trigger: item.id,
    ...triggerWords(item, word),
    cls: item.cls,
    visits: item.kind === "visit",
    proposal: item.kind === "deal",
    freed: item.kind === "freed",
    count: pools?.[item.id]?.candidates ?? null,
    pool: pools?.[item.id] ?? null,
  }));
}

/** The route's handle: everything a draft is judged against, read at once, then the draft. */
export async function draftSequence(rc: ReaderContext, ask: NewDraftAsk): Promise<NewDraftDto> {
  return draftSequenceFrom(await readDraftKnown(rc), ask, { tenantId: rc.tenantId, userId: rc.userId });
}

/**
 * Everything a draft is judged against and told, read at once: the drafter's own read, and What it's told's (decision
 * 0113), which composes the prompt from it without asking the model.
 */
export async function readDraftKnown(rc: ReaderContext): Promise<DraftKnown> {
  const { ctx, tenantId } = rc;
  const [library, shape, named, calendarOn, pb, seqs, sources, policies, mailboxes, config, previews] =
    await Promise.all([
      load(rc, templates, { all: false }),
      load(rc, facts.businessShape, undefined),
      load(rc, facts.facts, undefined),
      findCalendar(ctx, tenantId).then(
        (c) => !!c.url || c.lostCalendar,
        () => false,
      ),
      readOrNull(load(rc, playbooks, undefined), "playbooks", tenantId),
      readOrNull(load(rc, sequences, undefined), "sequences", tenantId),
      readOrNull(getReachOutSources(ctx, tenantId), "sources", tenantId),
      readOrNull(listPolicies(ctx.supabase, tenantId), "policies", tenantId),
      readOrNull(listMailboxConnectionsOf(ctx.supabase, tenantId), "mailboxes", tenantId),
      readOrNull(getStoredConfig(ctx.supabase, tenantId).then(parseTenantConfig), "config", tenantId),
      readOrNull(doesMakePreviews(ctx.supabase, tenantId), "previews", tenantId),
    ]);
  const rows = seqs?.data.sequences ?? [];
  const owner = await getOwner(rc, rows, config);
  const pools = pb?.data.pools ?? null;
  const ready = pb?.data.ready ?? null;
  const live = (mailboxes ?? []).filter(mailboxIsLive);
  const known: DraftKnown = {
    business: named.data.name,
    goal: config?.ask?.goal ?? null,
    ...owner,
    localNow: zonedInputValue(rc.now.getTime(), named.data.timezone),
    moments: momentsOf(shape.data.word, calendarOn, pools),
    lists: [
      ...(pb?.data.people_lists ?? []).map((l) => ({ token: `seg:${l.key}`, label: l.label })),
      ...(pb?.data.lists ?? []).filter((l) => !l.archived).map((l) => ({ token: `list:${l.id}`, label: l.name })),
    ]
      // Never who said stop (contracts newListOf): no draft is offered it to start on or send to.
      .filter((l) => newListOf(l.token, "sequence") !== "never")
      .map((l, i) => ({
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
    running: runningOf(rows),
    ready: ready
      ? (["whatsapp", "sms", "email"] as const).filter((c): c is ConsentChannel => ready[c]?.ready === true)
      : [],
    classModes: Object.fromEntries((policies ?? []).map((p) => [p.class, p.mode])),
    // None named is every connected mailbox (00424): the draft names none, and says the first.
    mailbox: live.length ? { ids: [], label: live[0]?.address ?? "" } : null,
    previews: previews === true,
  };
  return known;
}
