/**
 * What New opens on (the canvas "New: start from what's ready", 11 Nov 2026): the starts a workspace can begin now, most
 * people waiting first, a moment offered before anyone waits in it (N1, N3); the journey's moments, each covered by a
 * sequence or open (N10); and what changed while the owner was away (N11). Pure: what the page counted is an argument,
 * and nothing here asks Ask, so New opens at once. The dashboard's own: no other tree says these words or reads these
 * rules, so they stand with the page they are for.
 */
import {
  NEW_WORDS,
  isWinBack,
  momentOffered,
  newSequenceLine,
  plural,
  type AppointmentWord,
  type DraftWho,
  type NewAudience,
  type NewKind,
} from "@chanlytics/contracts";

/** How many starts New draws: the open one and three rows. The rest are a press away, on the map. */
export const NEW_READY_MAX = 4;

/** The journey's moments in the order a customer passes them; the win-back, by either reading, comes last. */
const NEW_JOURNEY_ORDER: readonly string[] = [
  "asked_no_booking",
  "visit_tomorrow",
  "visit_soon",
  "visit_missed",
  "visited",
  "slot_opened",
  "proposal_waiting",
  "lapsed",
  "quiet_30",
];

/**
 * The moments in the order a business sets them up, which is how the starts stand where as many wait in two, or nobody
 * waits in either: the reminder, the thank-you, the booking follow-up, then the rest.
 */
const NEW_BASICS_ORDER: readonly string[] = [
  "visit_tomorrow",
  "visited",
  "asked_no_booking",
  "visit_soon",
  "visit_missed",
  "slot_opened",
  "proposal_waiting",
  "lapsed",
  "quiet_30",
];

export const NEW_READY_WORDS = {
  cap: "Ready to start",
  order: "most people waiting first",
  open: "Open the draft",
  askWrites: "Ask writes it",
  yours: (title: string) => `Your message: ${title}`,
  firstWaits: "Its first batch waits for your OK.",
  reach: (n: number) => `${plural(n, "person", "people")} it would reach today`,
  list: (name: string) => `Write to everyone on ${name}`,
  listSaid: (n: number) => `${n} on it, nothing sends to it`,
  listLine: (name: string) => `Message everyone on ${name}, and anyone who joins it later`,
  oneStep: "One step away",
  journey: "Your customers’ journey",
  covered: (n: number, of: number) => `${n} of ${of} covered`,
  map: "Map",
  mapSub: (n: number, of: number) => `${n} of ${of} moments covered`,
  draft: "Draft",
  needsCalendar: "Needs your calendar",
  anyTime: "Any time: an offer or news to everyone, a sequence on one of your lists, or cold email to businesses.",
  line: { placeholder: "Say what it should do", letGo: "Listening. Let go to draft it" },
  since: {
    cap: "New since you left",
    yes: (n: number) => `${plural(n, "person", "people")} said yes to messages`,
    leads: (n: number) => `${plural(n, "lead is", "leads are")} ready`,
    calendar: "Your calendar is connected",
    kept: (line: string) => `You wrote “${line}”`,
  },
} as const;

const READY = NEW_READY_WORDS;
const STARTS = NEW_WORDS.starts;
const VIEWER = NEW_WORDS.viewer;

/**
 * A moment as Campaigns' read counts it: whether a new sequence may start on it here (contracts momentOffered, which
 * knows the calendar), and who a run would reach today, null where that was not counted.
 */
interface ReadyMoment {
  id: string;
  label: string;
  hint: string;
  kind: string;
  offered: boolean;
  candidates: number | null;
}

/** A sequence that runs, as far as a twin is told by: what it starts on. */
interface ReadyRunning {
  id: string;
  name: string;
  state: string;
  starts: string;
  first: {
    trigger: string | null;
    list_id: string | null;
    list_key: string | null;
    source_search_id?: string | null;
  } | null;
}

/** What New counted: Campaigns' moments and lists, who said yes, the lead searches, what runs, and how the business works. */
export interface ReadyReads {
  moments: readonly ReadyMoment[];
  lists: readonly { id: string; name: string; candidates: number | null; builtin: boolean }[];
  everyone: number | null;
  sources: readonly { id: string; name: string; ready: number }[] | null;
  running: readonly ReadyRunning[];
  hasDeals: boolean;
  word: AppointmentWord;
}

/** A start: what it is called, who waits in it, the line Ask drafts it from and the choices it makes. */
export interface ReadyStart {
  id: string;
  glyph: "clock" | "send" | "search" | "users";
  title: string;
  said: string;
  /** What is happening, as a viewer reads it: the fact the start is drawn from, with nothing to press. */
  fact: { title: string; said: string | null };
  /** Who it would reach today: 0 where nobody waits yet, null where that was not counted. */
  people: number | null;
  kind: NewKind;
  /** The moment it starts on, where it is one: what its message is looked up by. */
  trigger: string | null;
  line: string;
  fixed: { kind: NewKind; audience: NewAudience; who: DraftWho };
}

/**
 * Whether a moment waits on a calendar here: not offered now, and it would be with one connected (the house's one rule,
 * momentOffered). Never a win-back: where no calendar is, the one read by silence stands for both.
 */
const waitsOnCalendar = (target: ReadyMoment): boolean =>
  !target.offered && !isWinBack(target.id) && momentOffered(target, { calendarOn: true });

/** The sequence that stands on a moment: one not ended that starts on it, or, for a win-back, on either reading. */
function standsOn(running: readonly ReadyRunning[], id: string): ReadyRunning | null {
  const same = (trigger: string | null | undefined) => trigger === id || (isWinBack(id) && isWinBack(trigger ?? ""));
  return running.find((r) => r.state !== "ended" && r.starts === "moment" && same(r.first?.trigger)) ?? null;
}

/** A moment as a viewer reads it: who came in, who went quiet, or its name and who it would reach. */
function momentFact(readyMoment: ReadyMoment, waiting: number): ReadyStart["fact"] {
  if (waiting > 0 && readyMoment.id === "visited") return { title: VIEWER.thank(waiting), said: VIEWER.thankSaid };
  if (waiting > 0 && isWinBack(readyMoment.id)) return { title: VIEWER.winBack(waiting), said: readyMoment.hint };
  return { title: readyMoment.label, said: waiting > 0 ? READY.reach(waiting) : readyMoment.hint };
}

/** A moment as a start, in the words New already says where it has them. */
function momentStart(readyMoment: ReadyMoment, word: AppointmentWord): ReadyStart {
  const waiting = readyMoment.candidates ?? 0;
  const line = newSequenceLine(readyMoment.id, word) ?? readyMoment.label;
  const thank = readyMoment.id === "visited";
  const winBack = isWinBack(readyMoment.id);
  const counted = waiting > 0 && !winBack ? READY.reach(waiting) : readyMoment.hint;
  return {
    id: readyMoment.id,
    glyph: "clock",
    // A moment's own name where New has no words of its own for it: short, so a row never cuts it.
    title: thank ? STARTS.thank : winBack && waiting > 0 ? STARTS.winBack(waiting) : readyMoment.label,
    said: thank && waiting > 0 ? STARTS.thankSaid(waiting) : counted,
    fact: momentFact(readyMoment, waiting),
    people: readyMoment.candidates,
    kind: "sequence",
    trigger: readyMoment.id,
    line,
    fixed: {
      kind: "sequence",
      audience: "people",
      who: { kind: "moment", trigger: readyMoment.id, label: readyMoment.label },
    },
  };
}

/** The moments a sequence may start on here, in the order they are set up: offered, not doubled, and readable. */
function momentStarts(reads: ReadyReads): ReadyStart[] {
  return NEW_BASICS_ORDER.flatMap((id) => {
    const found = reads.moments.find((t) => t.id === id);
    if (!found || !found.offered || standsOn(reads.running, id)) return [];
    if (id === "proposal_waiting" && !reads.hasDeals) return [];
    // A win-back nobody is in, where nobody can hear an offer yet, reaches no one: what it needs is One step away's.
    if (isWinBack(id) && !found.candidates && !reads.everyone) return [];
    return [momentStart(found, reads.word)];
  });
}

/** One offer to everyone who said yes to offers: who it reaches are waiting for nothing. */
function everyoneStart(reads: ReadyReads): ReadyStart | null {
  if (!reads.everyone) return null;
  return {
    id: "everyone",
    glyph: "send",
    title: STARTS.offer,
    said: STARTS.offerSaid(reads.everyone),
    fact: { title: VIEWER.offer(reads.everyone), said: null },
    people: reads.everyone,
    kind: "once",
    trigger: null,
    line: newSequenceLine("everyone_monthly", reads.word) ?? STARTS.offer,
    fixed: { kind: "once", audience: "people", who: { kind: "everyone", label: NEW_WORDS.draft.everyoneOffers } },
  };
}

/** The first search with leads ready that no sequence adds from, and the largest of the workspace's own lists nothing sends to. */
function foundStarts(reads: ReadyReads): ReadyStart[] {
  const out: ReadyStart[] = [];
  const live = reads.running.filter((r) => r.state !== "ended");
  const source = (reads.sources ?? []).find(
    (s) => s.ready > 0 && !live.some((r) => r.starts === "leads" && r.first?.source_search_id === s.id),
  );
  if (source)
    out.push({
      id: `search-${source.id}`,
      glyph: "search",
      title: STARTS.leads(source.ready),
      said: source.name,
      fact: { title: VIEWER.leads(source.ready), said: source.name },
      people: source.ready,
      kind: "sequence",
      trigger: null,
      line: STARTS.leadsLine(source.name),
      fixed: { kind: "sequence", audience: "leads", who: { kind: "search", id: source.id, label: source.name } },
    });
  const taken = (id: string) =>
    live.some((r) => r.starts === "list" && (`list:${r.first?.list_id}` === id || `seg:${r.first?.list_key}` === id));
  const [list] = reads.lists
    .filter((l) => !l.builtin && !!l.candidates && !taken(l.id))
    .sort((a, b) => (b.candidates ?? 0) - (a.candidates ?? 0));
  if (list)
    out.push({
      id: list.id,
      glyph: "users",
      title: READY.list(list.name),
      said: READY.listSaid(list.candidates ?? 0),
      fact: { title: list.name, said: READY.listSaid(list.candidates ?? 0) },
      people: list.candidates,
      kind: "sequence",
      trigger: null,
      line: READY.listLine(list.name),
      fixed: { kind: "sequence", audience: "people", who: { kind: "list", token: list.id, label: list.name } },
    });
  return out;
}

/**
 * Everything a workspace can start now. Who is waiting leads, most people first: a moment someone is in, a search's ready
 * leads, a list nothing sends to. Then one offer to everyone who said yes, who are waiting for nothing, so it never
 * stands over someone who is. Then the moments nobody is in yet, in the order a business sets them up. New draws the
 * first NEW_READY_MAX.
 */
export function readyStartsOf(reads: ReadyReads): ReadyStart[] {
  const moments = momentStarts(reads);
  const waiting = [...moments, ...foundStarts(reads)]
    .filter((s) => (s.people ?? 0) > 0)
    .sort((a, b) => (b.people ?? 0) - (a.people ?? 0));
  const everyone = everyoneStart(reads);
  return [...waiting, ...(everyone ? [everyone] : []), ...moments.filter((s) => !s.people)];
}

/** A moment of the journey: the sequence that stands on it, or the start that would, or what it needs first. */
export interface JourneyMoment {
  id: string;
  label: string;
  hint: string;
  people: number | null;
  on: { id: string; name: string } | null;
  needs: "calendar" | null;
  /** The start a press drafts; null where a sequence stands on it, or it cannot run here yet. */
  start: ReadyStart | null;
}

/**
 * The journey's moments in order. One a calendar would offer is drawn as waiting on it; any other not offered (the
 * win-back this workspace cannot read) only while a sequence stands on it; and a proposal's only where a deal was recorded
 * or a sequence stands on it.
 */
export function newJourneyOf(reads: ReadyReads): JourneyMoment[] {
  return NEW_JOURNEY_ORDER.flatMap((id) => {
    const found = reads.moments.find((t) => t.id === id);
    if (!found) return [];
    const twin = standsOn(reads.running, id);
    const stands = twin && twin.first?.trigger === id ? twin : null;
    const needs = waitsOnCalendar(found) ? ("calendar" as const) : null;
    if (!found.offered && !stands && !needs) return [];
    if (id === "proposal_waiting" && !reads.hasDeals && !stands) return [];
    return [
      {
        id,
        label: found.label,
        hint: found.hint,
        people: found.candidates,
        on: twin ? { id: twin.id, name: twin.name } : null,
        needs,
        start: twin || needs ? null : momentStart(found, reads.word),
      },
    ];
  });
}

/** How many of the journey's moments a sequence stands on. */
export const journeyCovered = (journey: readonly JourneyMoment[]): number => journey.filter((m) => m.on).length;

/** What New saw of the workspace when it was last open: who said yes, the leads ready, the calendar. */
export interface NewSeen {
  everyone: number;
  leads: number;
  calendar: boolean;
}

/** What changed since New was last open, said only where nothing became something; nothing where it was never open. */
export function newSinceWords(before: NewSeen | null, now: NewSeen): string[] {
  if (!before) return [];
  return [
    before.everyone === 0 && now.everyone > 0 ? READY.since.yes(now.everyone) : "",
    before.leads === 0 && now.leads > 0 ? READY.since.leads(now.leads) : "",
    !before.calendar && now.calendar ? READY.since.calendar : "",
  ].filter(Boolean);
}
