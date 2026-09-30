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
import { playbookName, poolWords, reachLines } from "@chanlytics/contracts";
import type { PlaybookTrigger, TemplateGroup } from "@chanlytics/contracts";
import type { TemplateDto } from "@/legacy-bridge/surfaces/inbox";
import { pageClock } from "@/legacy-bridge/zone";
import { policyRow } from "../../legacy-parts";
import { starters } from "../templates/verbs";
import type { PlaybookCardVM, PlaybookTriggerOption, PlaybooksSurface } from "./surface";
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
 */
export function composerOpened(
  editing: PlaybookCardVM | null,
  initialTrigger: string | null,
  data: PlaybooksSurface,
): Fields {
  const triggers = data.triggers || PB_NONE;
  const params = editing && Array.isArray(editing.params) ? editing.params : null;
  return {
    trigger: editing ? editing.trigger : initialTrigger || pbFirstFree(triggers, data.rows),
    tplId: editing ? editing.template_id : "",
    picked: !!editing,
    name: editing ? editing.name : null,
    hour: editing ? editing.run_hour : 10,
    cap: editing ? editing.cap_per_run : 25,
    gap: editing ? editing.gap_days : 90,
    cadence: editing ? editing.cadence_days : 30,
    listId: openedList(editing, data),
    // What a playbook on a list sends, under which row of Autonomy: an offer, or a win-back.
    cls: editing && editing.trigger === "saved_list" && editing.policy_class === "reengage" ? "reengage" : "campaign",
    fills: editing && params ? { [editing.template_id]: params.map((p) => (p && p.kind ? p.kind : "text")) } : {},
    typed:
      editing && params ? { [editing.template_id]: params.map((p) => (p && p.kind === "text" ? p.value : "")) } : {},
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
  return { triggers, trig, visits, onList, lists, list, link };
}

type Moment = ReturnType<typeof momentOf>;

/** The message: which of the offered ones it sends, the moment's own, and the languages it has. */
function messageOf({ editing, offered, templatesAll, f }: ModelIn, { trig, link }: Moment) {
  // What each slot of a message may take on a moment -- a visit's time and service on a visit, a proposal's link on
  // the follow-up (0006) -- or null when one of them can take nothing there.
  const slotsOf = (t: TemplateDto, m: PlaybookTriggerOption | null = trig) =>
    starters.slots(t, { visits: !!(m && m.kind === "visit"), bookingLink: link, proposal: !!(m && m.kind === "deal") });
  const usable = offered.sendable.filter((t) => slotsOf(t) !== null);
  // One entry per message, whatever languages it has: the language is its own control.
  const groups = starters.group(usable);
  // The moment's own message: approved and picked for you, in review at
  // WhatsApp, or not added yet -- one press adds it.
  const starter = starters.forTrigger(f.trigger);
  const starterGroup = starter ? groups.find((g) => g.name === starter.name) || null : null;
  const starterAny = starter ? (templatesAll || PB_NONE).find((t) => t.name === starter.name) || null : null;
  const tpl = f.picked ? usable.find((t) => t.id === f.tplId) || null : rowIn(starterGroup, null);
  // A playbook being changed whose message is no longer one it can send: said, never swapped for another behind its back.
  const lost = !!(editing && f.picked && f.tplId === editing.template_id && !tpl);
  const group = tpl ? groups.find((g) => g.name === tpl.name) || null : null;
  return { slotsOf, usable, groups, starter, starterGroup, starterAny, tpl, lost, group };
}

type Message = ReturnType<typeof messageOf>;

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

/**
 * Who it reaches today: the moment's own count, or this playbook's while it keeps its moment, with the cap as it is set
 * here -- the cards' bar and the approval sheet's reasons (contracts reachLines), before anything is saved.
 */
function reachOf(input: ModelIn, mo: Moment) {
  const { f } = input;
  const { visits } = mo;
  const monthly = f.trigger === "everyone_monthly";
  const base = reachBase(input, mo);
  const named = reachNamed(input, mo);
  const counted = reachCounted(input, mo, named);
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
          },
          {
            trigger: f.trigger as PlaybookTrigger,
            cap_per_run: capN,
            gap_days: Number(f.gap),
            cadence_days: Number(f.cadence),
          },
        )?.lines ?? []
      )
        .slice(0, 3)
        .map((l) => ({ t: l.words, tone: l.tone, door: l.door }))
    : [];
  const of = poolWords(f.trigger);
  return { monthly, base, named, counted, capN, overCap, will, pool, reasons, of };
}

/** What the three pickers offer: every moment, every message that fits it, and every language of the one in view. */
function choicesOf({ data }: ModelIn, { triggers, link }: Moment, { groups, starter, tpl, group }: Message) {
  const momentChoices = triggers.map((t) => ({
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

/** The words the sheet says of itself: the name the route would give, the foot's one sentence, and the clock's city. */
function wordsOf({ editing, f, error }: ModelIn, { trig }: Moment, { tpl }: Message, { missing, labels }: Slots) {
  // The name the route gives it when it is given none, said before it is saved.
  const auto = trig && tpl ? playbookName(trig, tpl) : trig ? trig.label : "New playbook";
  const title = f.name === null ? auto : f.name;
  const city = pageClock().city();
  // The Autonomy row its runs keep to, said by the one chip (PolicyChip) -- and not said at all where there is no row to name.
  const runsUnder = trig && policyRow(trig.cls) ? trig.cls : null;
  const say = error
    ? { tone: "danger", t: error }
    : !trig
      ? { tone: "plain", t: "Pick the moment it runs on." }
      : !tpl
        ? { tone: "plain", t: "Pick the message it sends." }
        : missing >= 0
          ? { tone: "plain", t: `Fill in “${labels[missing]}” to ${editing ? "save it" : "start it"}.` }
          : null;
  return { auto, title, city, runsUnder, say };
}

/** Everything the composer's sections and verbs read, worked out from what the sheet holds. */
export function composerModel(input: ModelIn) {
  const mo = momentOf(input);
  const msg = messageOf(input, mo);
  const sl = slotsModelOf(input, msg);
  const reach = reachOf(input, mo);
  const ch = choicesOf(input, mo, msg);
  const words = wordsOf(input, mo, msg, sl);
  const ready = !!mo.trig && !!msg.tpl && sl.missing < 0 && !input.busy && (!mo.onList || !!mo.list);
  return {
    ...mo,
    ...msg,
    ...sl,
    ...reach,
    ...ch,
    ...words,
    ready,
    offered: input.offered,
    templatesRead: input.data.templates !== null,
  };
}

export type Model = ReturnType<typeof composerModel>;
