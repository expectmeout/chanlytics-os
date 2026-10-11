/**
 * The playbook composer's reading of what it holds: the moment, the message, each slot, who it reaches and the words
 * that say so (moved from legacy/pages/playbook-composer.jsx, decision 0015). Pure: nothing here draws or holds state,
 * so the composer's hooks stay in the order they were and its sections read one model.
 *
 * A slot takes only what keeps its message true (contracts slotChoices): a first name is each person's own and a visit's
 * time each visit's, so neither is a choice; the business name and the booking link may be typed over; a slot on a
 * message written elsewhere may be anything, its guess first. A message one of whose slots nothing can fill here -- a
 * visit's reminder, on a list -- is not offered at all.
 */
import {
  CAMPAIGNS_PAUSED_WORDS,
  PREVIEW_CHANNEL_WORDS,
  PREVIEW_WORDS,
  campaignChannelsOf,
  heldBackOfOneRun,
  playbookChannelsRead,
  playbookName,
  poolWords,
  reachLines,
} from "@chanlytics/contracts";
import type { ConsentChannel, PlaybookTrigger, ReachSplit, SendPurpose, TemplateGroup } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { pageClock } from "@/legacy-bridge/zone";
import { policyStore } from "../../legacy-verbs";
import { CM_NO_MESSAGE_YET, cmOfferedBy, cmReachBy, cmReadyOf, cmViaTicks } from "../parts/channels";
import { starters } from "../templates/verbs";
import { namedOf, readingFor } from "./surface";
import type { PlaybookCardVM, PlaybookNamed, PlaybookTriggerOption, PlaybooksSurface } from "./surface";
import { PB_NONE, PB_TEXT, pbExample, pbFirstFree, pbIcon, pbLabel, pbLangWords, pbOrder } from "./words";

/** What the sheet holds: the moment, the message, the numbers, and the words typed into each slot. */
export interface Fields {
  trigger: string;
  tplId: string;
  picked: boolean;
  name: string | null;
  hour: number;
  cap: number;
  gap: number;
  cadence: number;
  listId: string | null;
  cls: string;
  fills: Record<string, string[]>;
  typed: Record<string, string[]>;
  /**
   * The channels ticked in the Send by row. Null follows: nobody has pressed a switch yet, and the playbook goes by the
   * ones a new playbook opens on for the message in view (contracts playbookChannelsRead, "new"), so picking another
   * message, or moving to another moment, ticks what that one can go by. A press makes them the owner's, and they stay.
   */
  channels: ConsentChannel[] | null;
}

/** The templates a composer may offer, and one sentence for the ones it may not (contracts sendableTemplates). */
interface Offered {
  sendable: TemplateDto[];
  blocked: TemplateDto[];
  why: string | null;
}

/**
 * The templates a composer may offer: as sendableTemplates takes them, by a shape that names `components`, which the
 * rows this page holds do not carry.
 */
export function composerOffered(templates: readonly TemplateDto[] | null): Offered {
  const list: (TemplateDto & { components?: unknown })[] = (templates || PB_NONE).slice().sort(pbOrder);
  return starters.sendable(list);
}

/** One message, with the rows it has in each language. */
type Group = TemplateGroup<TemplateDto>;

/** A slot of a message, as its row carries it. */
interface Variable {
  label?: string;
  position?: number;
  example?: string | number;
}

/** What the model reads, each render. */
interface ModelIn {
  data: PlaybooksSurface;
  editing: PlaybookCardVM | null;
  offered: Offered;
  templatesAll: readonly TemplateDto[] | null | undefined;
  f: Fields;
  busy: boolean;
  error: string | null;
}

/** The row of a message in a language, else in English (US), else its first. */
export function rowIn(g: Group, lang: string | null): TemplateDto;
export function rowIn(g: Group | null, lang: string | null): TemplateDto | null;
export function rowIn(g: Group | null, lang: string | null): TemplateDto | null {
  return g ? g.rows.find((r) => r.language === lang) || g.rows.find((r) => r.language === "en_US") || g.rows[0] : null;
}

/** The list a playbook on a list runs on, by its token (decision 0009): its own, or the first of the workspace's lists, else the first of People's. */
function openedList(editing: PlaybookCardVM | null, data: PlaybooksSurface): string | null {
  if (editing) return editing.list_key ? `seg:${editing.list_key}` : editing.list_id ? `list:${editing.list_id}` : null;
  const l = (data.lists || PB_NONE).find((x) => !x.builtin) || (data.lists || PB_NONE)[0];
  return (l && l.id) || null;
}

/**
 * What it opens as: the playbook being changed, or a new one on the moment pressed. Words typed here before and not
 * saved come back over that (the tab's draft, useUnsavedWork), except the moment a slot was pressed for.
 *
 * A playbook being changed is on the offered message of its name and language, whichever version its stored `template_id`
 * names (a WhatsApp version added since moves the message's anchor: composerOffered's `id`), and keeps its stored ticks. A
 * new one names no channels yet (`channels` null): its ticks follow the message in view until a switch is pressed
 * (channelsModelOf), so it opens on every channel its moment's own message can go by, and on WhatsApp alone where the
 * moment has no message of its own until one is picked.
 */
export function composerOpened(
  editing: PlaybookCardVM | null,
  initialTrigger: string | null,
  data: PlaybooksSurface,
): Fields {
  const triggers = data.triggers || PB_NONE;
  const params = editing && Array.isArray(editing.params) ? editing.params : null;
  const message = editing
    ? cmOfferedBy(data.templates || PB_NONE, editing.template_name, editing.template_language)
    : null;
  const tplId = editing ? (message ? message.id : editing.template_id) : "";
  return {
    trigger: editing ? editing.trigger : initialTrigger || pbFirstFree(triggers, data.rows),
    tplId,
    picked: !!editing,
    name: editing ? editing.name : null,
    hour: editing ? editing.run_hour : 10,
    cap: editing ? editing.cap_per_run : 25,
    gap: editing ? editing.gap_days : 90,
    cadence: editing ? editing.cadence_days : 30,
    listId: openedList(editing, data),
    // What a playbook on a list sends, under which row of Autonomy: an offer, or a win-back.
    cls: editing && editing.trigger === "saved_list" && editing.policy_class === "reengage" ? "reengage" : "campaign",
    fills: editing && params ? { [tplId]: params.map((p) => (p && p.kind ? p.kind : "text")) } : {},
    typed: editing && params ? { [tplId]: params.map((p) => (p && p.kind === "text" ? p.value : "")) } : {},
    // What the playbook has (one made before channels goes by WhatsApp alone); a new one's follow its message.
    channels: editing ? campaignChannelsOf(editing.channels) : null,
  };
}

/** The moment the sheet is on, and the list a playbook on a list runs on. */
function momentOf({ data, f }: ModelIn) {
  const triggers = data.triggers || PB_NONE;
  const trig = triggers.find((t) => t.id === f.trigger) || null;
  const visits = !!(trig && trig.kind === "visit");
  // A playbook on one of the workspace's lists: which one, with the list's own count (the route's "list:<id>" pool).
  const onList = !!(trig && trig.kind === "saved");
  const lists = data.lists || PB_NONE;
  const list = onList ? lists.find((l) => l.id === f.listId) || null : null;
  const link = !!data.bookingLink;
  // Whether the Google listing keeps a review link: the one fact a review-link slot is filled from (00394).
  const review = !!data.reviewLink;
  return { triggers, trig, visits, onList, lists, list, link, review };
}

type Moment = ReturnType<typeof momentOf>;

/** The message: which of the offered ones it sends, the moment's own, and the languages it has. */
function composerMessage({ editing, offered, templatesAll, f }: ModelIn, { trig, link, review }: Moment) {
  // What each slot of a message may take on a moment -- a visit's time and service on a visit, a proposal's link on
  // the follow-up (0006), the review link where the Google listing keeps one -- or null when one of them can take
  // nothing there.
  const slotsOf = (t: TemplateDto, m: PlaybookTriggerOption | null = trig) =>
    starters.slots(t, {
      visits: !!(m && m.kind === "visit"),
      bookingLink: link,
      reviewLink: review,
      proposal: !!(m && m.kind === "deal"),
    });
  const usable = offered.sendable.filter((t) => slotsOf(t) !== null);
  // One entry per message, whatever languages it has: the language is its own control.
  const groups = starters.group(usable);
  // The moment's own message: approved and picked for you, in review at
  // WhatsApp, or not added yet -- one press adds it. A starter the set replaced
  // that the workspace still sends is its own while the set's is not approved.
  const starter =
    starters.allForTrigger(f.trigger).find((s) => groups.some((g) => g.name === s.name)) ??
    starters.forTrigger(f.trigger);
  const starterGroup = starter ? groups.find((g) => g.name === starter.name) || null : null;
  const starterAny = starter ? (templatesAll || PB_NONE).find((t) => t.name === starter.name) || null : null;
  const tpl = f.picked ? usable.find((t) => t.id === f.tplId) || null : rowIn(starterGroup, null);
  // A playbook being changed whose message is no longer one it can send: said, never swapped for another behind its back.
  // Its message is the one of its name and language, whichever version its stored id names (composerOpened).
  const stored = editing
    ? cmOfferedBy([...offered.sendable, ...offered.blocked], editing.template_name, editing.template_language)
    : null;
  const lost = !!(editing && f.picked && !tpl && (f.tplId === editing.template_id || f.tplId === stored?.id));
  const group = tpl ? groups.find((g) => g.name === tpl.name) || null : null;
  return { slotsOf, usable, groups, starter, starterGroup, starterAny, tpl, lost, group };
}

type Message = ReturnType<typeof composerMessage>;

/** What fills each slot of the message in view, and what a run would say to a person: checked as the route checks it. */
function slotsModelOf({ data, f }: ModelIn, { tpl, slotsOf }: Message) {
  const vars: Variable[] = tpl && Array.isArray(tpl.variables) ? (tpl.variables as Variable[]) : PB_NONE;
  const choices: string[][] = tpl ? slotsOf(tpl) || PB_NONE : PB_NONE;
  const labels = tpl ? starters.slotLabels(tpl) : vars.map((v, n) => v.label || `Value ${v.position || n + 1}`);
  const SRC: Record<string, string> = starters.sources;
  const HINTS: Record<string, string | undefined> = starters.sourceHints;
  // A slot's source: the one chosen when this slot may take it, else its first (a stored one a slot may not take is not kept).
  const srcOf = (n: number): string => {
    const c: string[] = choices[n] || PB_TEXT;
    const s = ((tpl && f.fills[tpl.id]) || PB_NONE)[n];
    return c.includes(s) ? s : c[0];
  };
  const textOf = (n: number): string => ((tpl && f.typed[tpl.id]) || PB_NONE)[n] || "";
  const shown = vars.map((v, n) =>
    srcOf(n) === "text" ? textOf(n).trim() || `[${labels[n]}]` : pbExample(srcOf(n), data.businessName),
  );
  const specs = vars.map((v, n) => (srcOf(n) === "text" ? textOf(n).trim() : { kind: srcOf(n) }));
  const missing = vars.findIndex((v, n) => srcOf(n) === "text" && !textOf(n).trim());
  return { vars, choices, labels, SRC, HINTS, srcOf, textOf, shown, specs, missing };
}

type Slots = ReturnType<typeof slotsModelOf>;

/** The count a run starts from: this list's, this playbook's while it keeps its moment, or the moment's own. */
function reachBase({ editing, f }: ModelIn, { trig, onList, list }: Moment) {
  return onList
    ? { candidates: list ? list.candidates || 0 : 0, held: list ? list.held || 0 : 0 }
    : editing && editing.trigger === f.trigger
      ? { candidates: editing.candidates || 0, held: editing.held || 0 }
      : { candidates: trig ? trig.candidates || 0 : 0, held: trig ? trig.held || 0 : 0 };
}

/** Everyone the moment names, and who of them no run reaches whatever the week. */
function reachNamed({ editing, f }: ModelIn, { trig, onList, list }: Moment) {
  return onList
    ? (list && list.named) || null
    : (editing && editing.trigger === f.trigger && editing.named) || (trig && trig.named) || null;
}

/** Who the moment reaches could not be counted (the server's read failed): no count is drawn, as on the cards. */
function reachCounted({ editing, f }: ModelIn, { trig, onList, list }: Moment, named: unknown) {
  return (
    named !== null &&
    (onList
      ? !!list && list.candidates !== null
      : editing && editing.trigger === f.trigger
        ? editing.candidates !== null
        : !!trig && trig.candidates !== null)
  );
}

/** The key of the count the composer reads: this list's, this playbook's while it keeps its moment, or the moment's own. */
function reachKey({ editing, f }: ModelIn, { trig, onList, list }: Moment): string | null {
  if (onList) return list ? list.id : null;
  if (editing && editing.trigger === f.trigger) return editing.poolKey;
  return trig ? trig.id : null;
}

/** What the composer counts from: who a run reaches now and who waits, and who the moment names, for these channels. */
interface ReachReading {
  base: { candidates: number; held: number };
  named: PlaybookNamed | null;
  counted: boolean;
}

/**
 * The count for the channels it goes by, where the surface holds the moment's counts by channel (surface.ts `pools`: a
 * moment, a list, or a playbook whose message is stricter than its moment); where it holds none -- a surface cached
 * before it did, or a moment it did not count -- the figures the cards carry, which are for WhatsApp alone.
 */
function reachReading(input: ModelIn, mo: Moment, on: readonly ConsentChannel[]): ReachReading {
  const key = reachKey(input, mo);
  const pools = input.data.pools;
  if (key && pools && key in pools) {
    const read = readingFor(pools[key], on);
    return read
      ? { base: { candidates: read.candidates, held: read.held }, named: namedOf(read), counted: true }
      : { base: { candidates: 0, held: 0 }, named: null, counted: false };
  }
  const named = reachNamed(input, mo);
  return { base: reachBase(input, mo), named, counted: reachCounted(input, mo, named) };
}

/**
 * What the Send by row says and which channels it leaves on: the one reading of a playbook's channels (contracts
 * playbookChannelsRead, which its drawer and the home's marks read too), over the sheet's fields as the playbook they
 * will be. The kind of message is its moment's class, or its message's category where that is stricter, as its run reads
 * it. Until a switch is pressed the ticks are a new playbook's (`f.channels` null): every channel the message in view can
 * go by, WhatsApp alone before one is picked.
 */
function channelsModelOf({ data, f }: ModelIn, { trig, onList }: Moment, { tpl }: Message) {
  const mine = tpl && data.templates ? data.templates.find((t) => t.id === tpl.id) : undefined;
  // Before a message is picked there is no version to ask after: only what the workspace cannot send on closes a switch.
  const read = playbookChannelsRead(
    { trigger: trig ? trig.id : null, policy_class: onList ? f.cls : null },
    f.channels ?? "new",
    tpl ? { category: tpl.category, versions: (mine?.message ?? CM_NO_MESSAGE_YET).versions } : null,
    cmReadyOf(data.ready),
  );
  const { purpose, about } = read;
  return {
    // What the run is for (enrolPurpose): the one reading the sections ask, so the month's allowance is said by it too.
    purpose,
    // The message's email and text versions as words, for the preview (parts/preview-by.ts).
    versions: mine ? mine.versions : undefined,
    channelReady: read.ready,
    on: read.on,
    // A playbook keeps a ticked channel that cannot send yet: its run holds those people until it can. What a save sends,
    // and what a press on one switch starts from.
    kept: read.kept,
    ticks: cmViaTicks(read.ticked, read.ready, { purpose, about }, true),
  };
}

/**
 * Who it reaches today: the moment's own count, or this playbook's while it keeps its moment, for the channels it goes by,
 * with the cap as it is set here -- the cards' bar and the approval sheet's reasons (contracts reachLines), before anything
 * is saved. Where it goes by more than WhatsApp alone, the split by channel; who has no address, an address that stopped
 * or no channel to go by is among the reasons, as contracts' reachLines says them. And what the month's emails and texts
 * hold back of one run at that cap, as Ask's campaign card says it (contracts heldBackOfOneRun): a message about their
 * visit is never held (heldByAllowance), which the run's purpose says.
 */
function reachOf(input: ModelIn, mo: Moment, { on, purpose }: { on: readonly ConsentChannel[]; purpose: SendPurpose }) {
  const { f } = input;
  const { visits } = mo;
  const monthly = f.trigger === "everyone_monthly";
  const { base, named, counted } = reachReading(input, mo, on);
  const capN = Math.max(1, Number(f.cap) || 1);
  const overCap = visits ? 0 : Math.max(0, base.candidates - capN);
  const will = base.candidates - overCap;
  const pool = Math.max(will + base.held, named ? named.pool : base.candidates + base.held);
  const reasons = named
    ? (
        reachLines(
          {
            pool: named.pool,
            will,
            noNumber: named.noNumber,
            stopped: named.stopped,
            noYes: named.noYes,
            heardThis: 0,
            heardAny: base.held,
            overCap,
            overLimit: 0,
            // Who has no address, an address mail no longer goes to, or no channel to go by: the reasons' too.
            no_address: named.noAddress ?? 0,
            address_stopped: named.addressStopped ?? 0,
            no_channel: named.noChannel ?? 0,
          },
          {
            trigger: f.trigger as PlaybookTrigger,
            cap_per_run: capN,
            gap_days: Number(f.gap),
            cadence_days: Number(f.cadence),
          },
        )?.lines ?? []
      )
        .sort((a, b) => b.n - a.n)
        .slice(0, 3)
        .map((l) => ({ t: l.words, tone: l.tone, door: l.door }))
    : [];
  const of = poolWords(f.trigger, input.data.shape.word);
  // Who a run reaches on which channel, said where it goes by more than WhatsApp alone, as the clause after the count and
  // as the bar: the figures are of everyone it can reach now, before the cap (the reasons say who waits for the next run).
  const split: ReachSplit | null =
    named && named.byChannel ? { reached: base.candidates, byChannel: named.byChannel, held: 0, heldBy: {} } : null;
  const splitBy = cmReachBy(split, on);
  const allowance =
    named && named.byChannel
      ? heldBackOfOneRun(
          { candidates: base.candidates, by_channel: named.byChannel, run_split: named.runSplit },
          { trigger: f.trigger, cap_per_run: capN },
          input.data.month_sent,
          purpose,
        )
      : null;
  return { monthly, base, named, counted, capN, overCap, will, pool, reasons, of, split, splitBy, allowance };
}

/**
 * What the preview steps through. A playbook names no one -- who a run reaches changes with every run -- so the walk is the
 * channels it goes by, each with how many of the people it reaches now it carries ("‹ By email · 12 people ›"), and each
 * is the message as a person on that channel reads it (parts/preview-by.ts): the email version's subject, words and foot,
 * the text version's words and STOP line, WhatsApp's template. A moment that writes the reason an email gives -- a visit's
 * time, a proposal's link -- is said in its foot, as the run says it (contracts emailFoot).
 */
function walkOf(
  { data }: ModelIn,
  { trig }: Moment,
  { on }: { on: readonly ConsentChannel[] },
  { named, counted }: { named: PlaybookNamed | null; counted: boolean },
) {
  const byChannel = counted && named ? named.byChannel : undefined;
  const steps = on.map((channel) => ({
    channel,
    label: PREVIEW_CHANNEL_WORDS[channel],
    position: byChannel ? PREVIEW_WORDS.people(byChannel[channel]) : "",
  }));
  const facts: Record<string, unknown> =
    trig && trig.kind === "visit"
      ? { visit_when: pbExample("visit_when", data.businessName) }
      : trig && trig.kind === "deal"
        ? { proposal_link: pbExample("proposal_link", data.businessName) }
        : {};
  return { steps, facts, labelled: on.some((c) => c !== "whatsapp") };
}

/**
 * What the three pickers offer: every moment a new playbook may start from, and the one a playbook being changed is on
 * (a retired moment's too, so it still reads as its own), every message that fits it, and every language of the one in view.
 */
function choicesOf(
  { data, editing }: ModelIn,
  { triggers, link, review }: Moment,
  { groups, starter, tpl, group }: Message,
) {
  const momentChoices = triggers
    .filter((t) => t.offered || (!!editing && editing.trigger === t.id))
    .map((t) => ({
      id: t.id,
      label: t.label,
      sub: t.hint,
      icon: pbIcon(t.id),
      hint: t.candidates === null ? null : t.candidates > 0 ? `${t.candidates} today` : "nobody today",
    }));
  const messageChoices = groups
    .slice()
    .sort((a, b) => (starter ? Number(b.name === starter.name) - Number(a.name === starter.name) : 0))
    .map((g) => {
      const r = rowIn(g, tpl ? tpl.language : null);
      return {
        id: g.name,
        label: g.title,
        // Its first words as a customer reads them, so a message is chosen by what it says.
        sub: starters.rowPreview(r, {
          business_name: data.businessName,
          booking_link: link ? "your booking link" : null,
          review_link: review ? "your review link" : null,
        }),
        group: starter && g.name === starter.name ? "own" : "all",
        hint: g.rows.length > 1 ? `${g.rows.length} languages` : null,
      };
    });
  const langChoices = group
    ? group.rows.map((r) => ({
        id: r.language,
        label: pbLabel(r.language),
        name: pbLangWords(r.language),
        status: r.meta_status || "approved",
      }))
    : PB_NONE;
  return { momentChoices, messageChoices, langChoices };
}

/**
 * The words the sheet says of itself: the name the route would give, the foot's one sentence, and the clock's city. A paused
 * workspace is said where nothing else stops the playbook (it can still be saved, and runs once billing resumes): a note,
 * never a refusal, since `ready` (what Save waits on) does not read it.
 */
function composerWords(
  { editing, f, error }: ModelIn,
  { trig }: Moment,
  { tpl }: Message,
  { missing, labels, paused }: Slots & { paused: boolean },
) {
  // The name the route gives it when it is given none, said before it is saved.
  const auto = trig && tpl ? playbookName(trig, tpl) : trig ? trig.label : "New campaign";
  const title = f.name === null ? auto : f.name;
  const city = pageClock().city();
  // The Autonomy row its runs keep to, said by the one chip (PolicyChip) -- and not said at all where there is no row to name.
  const runsUnder = trig && policyStore()?.row(trig.cls) ? trig.cls : null;
  const say = error
    ? { tone: "danger", t: error }
    : !trig
      ? { tone: "plain", t: "Pick the moment it runs on." }
      : !tpl
        ? { tone: "plain", t: "Pick the message it sends." }
        : missing >= 0
          ? { tone: "plain", t: `Fill in “${labels[missing]}” to ${editing ? "save it" : "start it"}.` }
          : paused
            ? { tone: "plain", t: CAMPAIGNS_PAUSED_WORDS }
            : null;
  return { auto, title, city, runsUnder, say };
}

/** Everything the composer's sections and verbs read, worked out from what the sheet holds. */
export function composerModel(input: ModelIn) {
  const mo = momentOf(input);
  const msg = composerMessage(input, mo);
  const sl = slotsModelOf(input, msg);
  const via = channelsModelOf(input, mo, msg);
  const reach = reachOf(input, mo, via);
  const walk = walkOf(input, mo, via, reach);
  const ch = choicesOf(input, mo, msg);
  const words = composerWords(input, mo, msg, { ...sl, paused: via.channelReady.paused === true });
  const ready = !!mo.trig && !!msg.tpl && sl.missing < 0 && !input.busy && (!mo.onList || !!mo.list);
  return {
    ...mo,
    ...msg,
    ...sl,
    ...via,
    ...reach,
    ...walk,
    ...ch,
    ...words,
    ready,
    offered: input.offered,
    templatesRead: input.data.templates !== null,
  };
}

export type Model = ReturnType<typeof composerModel>;
