/**
 * What New opens on (the canvas "New: start from what's ready", 11 Nov 2026): the starts a workspace can begin now, most
 * people waiting first, a moment offered before anyone waits in it (N1, N3); the journey's moments, each covered by a
 * sequence or open (N10); and what changed while the owner was away (N11). Pure: what the page counted is an argument,
 * and nothing here asks Ask, so New opens at once. No zod: the browser reads it.
 */
import type { AppointmentWord } from "../../journey/appointment-word";
import { plural } from "../../shared/words";
import { isWinBack } from "../playbooks/triggers/notices";
import { momentNamesVisit } from "../playbooks/triggers/occasions";
import { newSequenceLine } from "./draft";
import type { DraftWho, NewAudience, NewKind } from "./new-draft/steps";
import { NEW_WORDS } from "./new-words";

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

export const NEW_READY_WORDS = {
  cap: "Ready to start",
  order: "most people waiting first",
  open: "Open the draft",
  askWrites: "Ask writes it",
  yours: (title: string) => `Your message: ${title}`,
  firstWaits: "Its first batch waits for your OK.",
  reach: (n: number) => `${plural(n, "person", "people")} it would reach today`,
  list: (name: string) => `Write to people who join ${name}`,
  listSaid: (n: number) => `${n} on it, nothing sends to it`,
  listLine: (name: string) => `Message everyone who joins ${name}`,
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
    go: (line: string) => `Draft “${line}”`,
  },
} as const;

const R = NEW_READY_WORDS;
const S = NEW_WORDS.starts;
const V = NEW_WORDS.viewer;

/** A moment as Campaigns' read counts it: who a run would reach today, null where it was not counted. */
export interface ReadyMoment {
  id: string;
  label: string;
  hint: string;
  kind: string;
  offered: boolean;
  candidates: number | null;
}

/** A sequence that runs, as far as a twin is told by: what it starts on. */
export interface ReadyRunning {
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
  calendarOn: boolean;
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

/** Whether a moment is read off the calendar: a visit's, an occasion about a visit, a freed time. */
export const momentNeedsCalendar = (target: Pick<ReadyMoment, "id" | "kind">): boolean =>
  target.kind === "visit" || target.kind === "freed" || momentNamesVisit(target.id);

/** The sequence that stands on a moment: one not ended that starts on it, or, for a win-back, on either reading. */
function standsOn(running: readonly ReadyRunning[], id: string): ReadyRunning | null {
  const same = (trigger: string | null | undefined) => trigger === id || (isWinBack(id) && isWinBack(trigger ?? ""));
  return running.find((r) => r.state !== "ended" && r.starts === "moment" && same(r.first?.trigger)) ?? null;
}

/** A moment as a viewer reads it: who came in, who went quiet, or its name and who it would reach. */
function momentFact(readyMoment: ReadyMoment, n: number): ReadyStart["fact"] {
  if (n > 0 && readyMoment.id === "visited") return { title: V.thank(n), said: V.thankSaid };
  if (n > 0 && isWinBack(readyMoment.id)) return { title: V.winBack(n), said: readyMoment.hint };
  return { title: readyMoment.label, said: n > 0 ? R.reach(n) : readyMoment.hint };
}

/** A moment as a start, in the words New already says where it has them. */
function momentStart(readyMoment: ReadyMoment, word: AppointmentWord): ReadyStart {
  const n = readyMoment.candidates ?? 0;
  const line = newSequenceLine(readyMoment.id, word) ?? readyMoment.label;
  const thank = readyMoment.id === "visited";
  const winBack = isWinBack(readyMoment.id);
  return {
    id: readyMoment.id,
    glyph: "clock",
    title: thank ? S.thank : winBack && n > 0 ? S.winBack(n) : line,
    said: thank && n > 0 ? S.thankSaid(n) : n > 0 && !winBack ? R.reach(n) : readyMoment.hint,
    fact: momentFact(readyMoment, n),
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

/** The moments a sequence may start on here, in the journey's order: offered, not doubled, and readable. */
function momentStarts(reads: ReadyReads): ReadyStart[] {
  return NEW_JOURNEY_ORDER.flatMap((id) => {
    const found = reads.moments.find((t) => t.id === id);
    if (!found || !found.offered || standsOn(reads.running, id)) return [];
    if (momentNeedsCalendar(found) && !reads.calendarOn) return [];
    if (id === "proposal_waiting" && !reads.hasDeals) return [];
    return [momentStart(found, reads.word)];
  });
}

/** One offer to everyone who said yes, the first search with leads ready, and the workspace's own lists nothing sends to. */
function otherStarts(reads: ReadyReads): ReadyStart[] {
  const out: ReadyStart[] = [];
  const live = reads.running.filter((r) => r.state !== "ended");
  if (reads.everyone)
    out.push({
      id: "everyone",
      glyph: "send",
      title: S.offer,
      said: S.offerSaid(reads.everyone),
      fact: { title: V.offer(reads.everyone), said: null },
      people: reads.everyone,
      kind: "once",
      trigger: null,
      line: newSequenceLine("everyone_monthly", reads.word) ?? S.offer,
      fixed: { kind: "once", audience: "people", who: { kind: "everyone", label: NEW_WORDS.draft.everyoneOffers } },
    });
  const source = (reads.sources ?? []).find(
    (s) => s.ready > 0 && !live.some((r) => r.starts === "leads" && r.first?.source_search_id === s.id),
  );
  if (source)
    out.push({
      id: `search-${source.id}`,
      glyph: "search",
      title: S.leads(source.ready),
      said: source.name,
      fact: { title: V.leads(source.ready), said: source.name },
      people: source.ready,
      kind: "sequence",
      trigger: null,
      line: S.leadsLine(source.name),
      fixed: { kind: "sequence", audience: "leads", who: { kind: "search", id: source.id, label: source.name } },
    });
  for (const list of reads.lists) {
    const taken = live.some(
      (r) => r.starts === "list" && (`list:${r.first?.list_id}` === list.id || `seg:${r.first?.list_key}` === list.id),
    );
    if (list.builtin || !list.candidates || taken) continue;
    out.push({
      id: list.id,
      glyph: "users",
      title: R.list(list.name),
      said: R.listSaid(list.candidates),
      fact: { title: list.name, said: R.listSaid(list.candidates) },
      people: list.candidates,
      kind: "sequence",
      trigger: null,
      line: R.listLine(list.name),
      fixed: { kind: "sequence", audience: "people", who: { kind: "list", token: list.id, label: list.name } },
    });
  }
  return out;
}

/**
 * Everything a workspace can start now, most people waiting first: where two reach as many, or nobody waits in either,
 * the journey's order stands, then an offer, a search, a list. New draws the first NEW_READY_MAX.
 */
export function readyStartsOf(reads: ReadyReads): ReadyStart[] {
  return [...momentStarts(reads), ...otherStarts(reads)].sort((a, b) => (b.people ?? 0) - (a.people ?? 0));
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
 * The journey's moments in order. One no longer offered (the win-back this workspace cannot read) is drawn only while a
 * sequence stands on it, and a proposal's only where a deal was recorded or a sequence stands on it.
 */
export function newJourneyOf(reads: ReadyReads): JourneyMoment[] {
  return NEW_JOURNEY_ORDER.flatMap((id) => {
    const found = reads.moments.find((t) => t.id === id);
    if (!found) return [];
    const twin = standsOn(reads.running, id);
    const stands = twin && twin.first?.trigger === id ? twin : null;
    if (!found.offered && !stands) return [];
    if (id === "proposal_waiting" && !reads.hasDeals && !stands) return [];
    const needs = momentNeedsCalendar(found) && !reads.calendarOn ? ("calendar" as const) : null;
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
    before.everyone === 0 && now.everyone > 0 ? R.since.yes(now.everyone) : "",
    before.leads === 0 && now.leads > 0 ? R.since.leads(now.leads) : "",
    !before.calendar && now.calendar ? R.since.calendar : "",
  ].filter(Boolean);
}
