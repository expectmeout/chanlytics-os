/**
 * One person, in full (moved from legacy/pages/client-profile.jsx `ClientProfileReal`, decision 0015, step 5): fetched on
 * open through the profile's courier (people-detail.ts: every message, call, escalation and operator decision for this
 * contact, mapped in contracts where the rule is tested). It is one quiet record, canvas A "The Person Record" (decision
 * 0052): one scroll, never two panes. On a desk the identity rail (who they are, where they stand, the page's acts, then
 * how to reach them, where they work, what they may be sent and their lists: hero.tsx, sections.tsx, business.tsx,
 * settings-card.tsx, lists.tsx) stands beside the work column (the figures, the tabs as addresses and what the tab holds:
 * work.tsx, overview.tsx). On a phone it is one column, and what the rail knows is the About tab.
 *
 * Opening a person is as quick as the tab can make it, and a person's page is never drawn in parts: the tab keeps the
 * people it read, and a person the tab does not hold yet is nothing of theirs until their whole page is in, `Reading…` after
 * the standard's beat, never their name first and the rest after (Ruben, 24 Sep).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import {
  NOTE_WORDS,
  PERSON_PEEK_WORDS,
  isIdentifierName,
  newSinceOf,
  personTabRoute,
  shortName,
  stateOf,
} from "@chanlytics/contracts";
import type { LookedAt, PersonRowVM, PersonTab, PersonVM } from "@chanlytics/contracts";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { useRecordFold } from "../../kit/record/hooks";
import { tabMemory } from "../../kit/record/shell-verbs";
import { viewDeck } from "../../kit/motion/view-deck";
import { mayAtLeast, navigate, touchSwipe } from "../../legacy-verbs";
import { addressReplace } from "../shell-verbs";
import { PL_PHONE_QUERY } from "../words";
import { backToPeople, hear, saidBy, usePersonToast } from "../person-verbs";
import { warmPerson } from "../people-detail";
import { armWalk, noteStep, takeStep, walkOf, type PersonWalk } from "../walk";
import { dealPersonOf } from "./ctx";
import type { CombineState, DelState, DoubtState, MergeState, PageCtx, RmState } from "./ctx";
import { BusinessSheet, WorksAtCard } from "./business";
import { ListsSheet } from "./sheets/lists-sheet";
import { CombineSheet, useArrivalToast } from "./sheets/combine-sheet";
import { CallSheet, usePersonCall } from "./call";
import { PersonWalkNav, PhoneDock, hero, openWith, useNameAway } from "./hero";
import { NotesSection } from "./overview";
import { useStanding } from "../../kit/head/standing";
import { ListsGroup } from "./lists";
import { PersonProfileFrame } from "./frame";
import { aboutGroups } from "./sections";
import { Figures, PersonTabs, TabBody, TabView, tabPages } from "./work";
import { holdTabRoom, useTabScroll } from "./tabs/tab-scroll";
import { messagesGroup, phoneFolds } from "./settings-card";
import { heldPerson, readPerson } from "./read";
import { hearTheirThread } from "./their-thread";
import { usePeopleSeam } from "./use-people";
import { seePerson, useSeeOpen } from "../../seen";
import { usePartShown } from "../../use-surface";
import { plReading } from "../cells/columns";

/** What the page holds of the person: the read under way, the copy it has, that they are not here, or that reading failed. */
interface PageRead {
  loading: boolean;
  vm: PersonVM | null;
  missing: boolean;
  error: string | null;
}

/**
 * The person this tab already holds is the FIRST draw, not the second: seeded in the effect below, a reload painted one frame
 * of the head alone before the page it already had (people-detail.ts keeps them in the tab).
 */
function useHeld(id: string): [PageRead, Dispatch<SetStateAction<PageRead>>] {
  return useState<PageRead>(() => ({ loading: true, vm: heldPerson(id), missing: false, error: null }));
}

/**
 * The read of the person, and what reads it again: People landing or changing (`surface:clients`: their row's follow-up, their
 * lists, and every write that names People in the refresh map or that the live feed tells of: a deal recorded or moved, a step set,
 * changed or done -- the sheets say nothing of their own, 0047), and this person writing or phoning: the Inbox or Conversations
 * holding something of theirs newer than the page does (their-thread.ts;
 * People's own list does not hear a message while another page is open, and this page is another).
 */
function useLoad(id: string, vm: PersonVM | null, setSt: Dispatch<SetStateAction<PageRead>>): () => void {
  const load = useCallback(() => {
    // Held from the last time this tab opened them, so going back to the list and in again does not put "Loading..."
    // over a page that is already known.
    const held = heldPerson(id);
    setSt((s) =>
      held && !s.vm ? { loading: true, vm: held, missing: false, error: null } : { ...s, loading: !s.vm, error: null },
    );
    readPerson(id).then(
      (vm) => setSt({ loading: false, vm, missing: vm === null, error: null }),
      (e: unknown) => setSt((s) => ({ ...s, loading: false, error: saidBy(e) || "could not load this person" })),
    );
  }, [id, setSt]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => hear("surface:clients", () => load()), [load]);
  // The latest moment of theirs the page has read for: their last contact when the page was read, or what told it of a later one
  // (so a thread whose clock runs ahead of their row's is read once for it, never on every message after).
  const held = useRef(vm);
  held.current = vm;
  const readTo = useRef(0);
  useEffect(() => {
    readTo.current = 0;
    return hearTheirThread(
      id,
      () => Math.max(readTo.current, held.current?.lastContact.ts ?? 0),
      (newest) => {
        readTo.current = newest;
        load();
      },
    );
  }, [id, load]);
  return load;
}

/** The phone's width (People's 900px), kept current as the window changes: the page is one column under it. */
function usePhone(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(PL_PHONE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia ? window.matchMedia(PL_PHONE_QUERY) : null;
    if (!mq) return undefined;
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

/**
 * The tab the address names, as this width draws it (0052): a desk's Deals and Campaigns are inside a phone's Overview,
 * a phone's About is a desk's rail, and a tab this person does not have (a History with nothing in it) is Overview. A
 * press shows its tab at once and replaces the address, so the page is not mounted again and Back leaves the person; the
 * page's scroll is held across it (tabs/tab-scroll.ts), noted as the press leaves the tab on screen.
 */
function useTab(
  id: string,
  asked: PersonTab,
  tabs: PersonVM["tabs"]["desk"],
  scroller: RefObject<HTMLDivElement | null>,
): [PersonTab, (t: PersonTab) => void] {
  const [picked, setPicked] = useState<PersonTab>(asked);
  useEffect(() => setPicked(asked), [asked]);
  const tab = tabs.some((t) => t.id === picked) ? picked : "overview";
  const leaveTab = useTabScroll(scroller, tab);
  const goTab = useCallback(
    (t: PersonTab) => {
      if (t !== tab) leaveTab(tab);
      setPicked(t);
      addressReplace(personTabRoute(id, t), { quiet: false });
    },
    [id, tab, leaveTab],
  );
  return [tab, goTab];
}

/**
 * What the rail knows of them, its groups in canvas A's order: the role once, how to reach them, where they came from,
 * where they work, what they may be sent and who answers them, their lists.
 */
function railGroups(c: PageCtx) {
  const { canRecord } = c;
  // The role, said once for the rail: every locked control used to say it again under itself.
  const roleNote = !canRecord ? "You can read this page; an owner or operator changes it." : null;
  return (
    <>
      {roleNote && (
        <div className="cl-prof-rail-note" data-testid="person-role-note">
          {roleNote}
        </div>
      )}
      {aboutGroups(c)}
      <WorksAtCard c={c} />
      {messagesGroup(c)}
      {/* At a wide window their lists stand under their notes, in the third column. */}
      {c.wide ? null : listsGroup(c)}
    </>
  );
}

/** Their lists, as a group of the rail: chips on a desk, one row on a phone (canvas A). */
function listsGroup(c: PageCtx) {
  const { p, canRecord, flash, first } = c;
  return (
    <ListsGroup
      personId={p.id}
      canEdit={canRecord}
      first={first}
      flash={flash}
      smart={p.smartLists || []}
      row={c.phone}
    />
  );
}

/**
 * The page of a person who is here (canvas A): on a desk the identity rail beside the work column, on a phone one column
 * with the rail's groups under About; the business sheet over it when it is open.
 */
function personPage(
  c: PageCtx,
  toastNode: ReactNode,
  refs: { scroller: (el: HTMLDivElement | null) => void; record: (el: HTMLDivElement | null) => void },
  arrive: "next" | "prev" | undefined,
) {
  const { p, who } = c;
  // Their visits ahead are Coming up, above what has happened.
  const past = p.timeline.filter((t) => !t.ahead);
  const label = `About ${who === "This person" ? "this person" : who}`;
  const about = (
    <aside className="cl-prof-rail" aria-label={label}>
      {railGroups(c)}
    </aside>
  );
  return (
    <div
      className="cl-profile"
      ref={refs.scroller}
      data-takeover
      data-tab={c.tab}
      data-slide={arrive}
      data-testid="person-page"
      {...pageSwipe(c)}
    >
      <div className="cl-prof-page">
        <div className="cl-prof-record" ref={refs.record} data-thin={p.thin || undefined}>
          <div className="cl-prof-side">
            {hero(c)}
            {c.phone ? null : about}
          </div>
          <div className="cl-prof-work">
            {/* The figures stand over every tab, About too: a phone's About once took them away, and the strip under them
                jumped 200px up the screen as it was pressed (Ruben, 13 Oct 2026). The head and the figures hold still. */}
            <Figures c={c} />
            <PersonTabs c={c} />
            <TabView c={c}>
              <TabBody c={c} past={past} about={about} />
            </TabView>
          </div>
          {/* A wide window (canvas A, D7): their notes and lists in a third column that holds still. */}
          {c.wide && !c.phone ? (
            <aside className="cl-prof-notes-rail" aria-label={NOTE_WORDS.title}>
              <NotesSection c={c} />
              {listsGroup(c)}
            </aside>
          ) : null}
        </div>
      </div>
      <PhoneDock c={c} />
      <BusinessSheet c={c} />
      <CallSheet c={c} />
      <ListsSheet c={c} />
      <CombineSheet c={c} />
      {phoneFolds(c)}
      {toastNode}
    </div>
  );
}

/** One person: read, drawn whole, and read again when what they are made of moves. */
function ClientProfileReal({ id, tab: asked }: { id: string; tab: PersonTab }) {
  const [st, setSt] = useHeld(id);
  const arrive = useArrive(id, !!st.vm);
  const [toastNode, flash] = usePersonToast();
  useArrivalToast(id, flash);
  // "Delete this person" is a typed-name confirmation, not a click: it erases messages, media and recordings and cannot be
  // undone. The one Confirm draws it; the typed text and the match stay here, with the record.
  const [del, setDel] = useState<DelState>({ open: false, typed: "", busy: false, error: null });
  // "Merge with another record" is the same kind of act (0028): the other record chosen, then the kept name typed.
  const [merge, setMerge] = useState<MergeState>({ open: false, pick: null, typed: "", busy: false, error: null });
  // "Not the same" on a doubt the door raised (0034 step 4): which row's press is out, and what went wrong.
  const [doubt, setDoubt] = useState<DoubtState>({ busy: null, error: null });
  const [rm, setRm] = useState<RmState>({ busy: false, error: null });
  // What the timeline shows, and whether the fold is open; the timeline itself stays a plain function of its props.
  const [tlFilter, setTlFilter] = useState("all");
  const [tlAll, setTlAll] = useState(false);
  // The card's editors (the record kit's folds): one open at a time, anywhere in the app, and a sheet on a phone.
  const folds = {
    rm: useRecordFold("person-receptionist"),
    visit: useRecordFold("person-visit"),
    offers: useRecordFold("person-offers"),
  };
  const load = useLoad(id, st.vm, setSt);
  const people = usePeopleSeam();
  const { vm, loading, missing, error } = st;
  const phone = usePhone();
  const scrollerEl = useRef<HTMLDivElement | null>(null);
  const [tab, goTab] = useTab(id, asked, vm ? (phone ? vm.tabs.phone : vm.tabs.desk) : [], scrollerEl);
  // The business sheet (0052): one at a time, closed when the person changes.
  const [sheet, setSheet] = useState(false);
  // Note was pressed: the Notes pane is drawn for someone with none yet (canvas A). Let go when the person changes.
  const [composing, setComposing] = useState(false);
  // Add to a list (More): its sheet, closed when the person changes.
  const [listsOpen, setListsOpen] = useState(false);
  const [combine, setCombine] = useState<CombineState>({ act: null, busy: false, error: null });
  useEffect(() => {
    setComposing(false);
    setListsOpen(false);
  }, [id]);
  // The page's first part (client/page-speed.ts): the person drawn whole, or said missing or unread. A person opened
  // from another is a move inside the page, timed from its press.
  usePartShown("person", "hero", !!vm || missing || (!!error && !loading), id);
  // Their People row, once People has it. Their page open is them read (surfaces/seen.ts), here as in People, the Inbox
  // and Conversations: the row says what was new, and the page on screen is the reader seeing it.
  const peopleRow = people && people.rows ? people.rows.find((r) => r.id === id) : null;
  const reading = vm && peopleRow ? peopleRow : null;
  useSeeOpen(
    reading ? { personId: id, conversationId: reading.conversationId } : null,
    reading ? plReading(reading) : undefined,
  );
  const looked = useLookedAt(id, reading);
  const [walk, step] = useWalk(id, tab, phone);
  const scroller = useRailHeld(scrollerEl);
  const [record, wide] = useWide();
  const call = usePersonCall(vm, phone);
  // The page draws its own head (canvas A), so it says a null title to the frame: its way back to People stands where the
  // date does, and where they stand in the list they were opened from stands with it ("‹ 4 of 24 ›": beside it on a desk,
  // in the bell's place on a phone, components.css). On a phone, once the head has scrolled away, the top bar's centre says
  // their name and the dot of their state.
  const away = useNameAway(phone, !!vm);
  const said = vm ? stateOf("person", vm.state) : null;
  useStanding({
    title: null,
    back: {
      label: "People",
      go: backToPeople,
      after: walk ? <PersonWalkNav walk={walk} step={step} /> : null,
    },
    bar: away && vm && said ? { name: vm.name, tone: said.tone, word: vm.stateLabel } : null,
  });
  if (missing)
    return (
      <PersonProfileFrame onBack={backToPeople}>
        <EmptyState
          kind="page"
          glyph="user"
          title={PERSON_PEEK_WORDS.missing.title}
          body={PERSON_PEEK_WORDS.missing.body}
        />
      </PersonProfileFrame>
    );
  if (!vm) {
    // A person the tab does not hold yet is nothing of theirs until their whole page is in: the pane the shell draws for
    // any page on its way, `Reading…` after the standard's beat, and then the page, all of it at once.
    if (loading)
      return (
        <div className="route-reading" aria-busy="true" role="status" data-testid="person-reading">
          Reading…
        </div>
      );
    return (
      <PersonProfileFrame onBack={backToPeople}>
        <FailedRead kind="card" what="this person" why={error} onRetry={load} testid="person-failed" />
      </PersonProfileFrame>
    );
  }
  // Where the proposal follow-up has them in hand (0006), their People row says so: the deal card then says when its run goes,
  // and leads with no nudge of its own. People unread, the card says what it said.
  const dealP = dealPersonOf(vm, peopleRow);
  const phoneOnly = isIdentifierName(vm.name);
  // A stand-in named for their business is said whole (0052): "More for Zilker Strength Lab", never "More for Zilker".
  const first = phoneOnly ? "them" : vm.standIn ? vm.name : shortName(vm.name);
  const c: PageCtx = {
    p: vm,
    dealP,
    first,
    who: first === "them" ? "This person" : first,
    isOwner: mayAtLeast("owner"),
    canRecord: mayAtLeast("operator"),
    flash,
    load,
    error,
    onBack: backToPeople,
    del,
    setDel,
    merge,
    setMerge,
    others: people && people.rows ? people.rows.filter((r) => r.id !== id && mayMergeWith(vm, r)) : null,
    doubt,
    setDoubt,
    rm,
    setRm,
    tlFilter,
    setTlFilter,
    tlAll,
    setTlAll,
    folds,
    tab,
    goTab,
    phone,
    sheet,
    setSheet,
    fresh: newSinceOf(vm.timeline, looked),
    compose: () => undefined,
    call,
    composing,
    setComposing,
    wide,
    listsOpen,
    setListsOpen,
    combine,
    setCombine,
  };
  // Every send the page offers opens their thread through one path (the More menu's, the deal card's, Up next's).
  c.compose = openWith(c);
  return personPage(c, toastNode, { scroller, record }, arrive);
}

/** The width from which the record takes a third column (clients.css's container query on the record; canvas A, D7). */
const WIDE_PX = 1240;

/**
 * Whether the record holds three columns: its own width, measured as it changes (the stylesheet's container query says
 * the same, at the same width).
 */
function useWide(): [(el: HTMLDivElement | null) => void, boolean] {
  const [wide, setWide] = useState(false);
  const watch = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    watch.current?.disconnect();
    watch.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const judge = () => setWide(el.clientWidth >= WIDE_PX);
    judge();
    watch.current = new ResizeObserver(judge);
    watch.current.observe(el);
  }, []);
  return [ref, wide];
}

/**
 * The identity rail holds still beside the work column on a desk (canvas A's sticky rail): it is held to the height of the
 * page's scroller (`--record-h` on it, clients.css), which a rail taller than the screen scrolls inside, so its foot is
 * never out of reach while the work column is read. Measured as the scroller is, and again as it changes, with the room
 * under the stuck strip (`--tab-room`, tabs/tab-scroll.ts). The scroller is a view of the deck too ("person"): a step to
 * the person before or after turns the page (`data-slide`, kit/motion/view-deck.ts).
 */
function useRailHeld(held: RefObject<HTMLDivElement | null>): (scroller: HTMLDivElement | null) => void {
  const watch = useRef<ResizeObserver | null>(null);
  // The page's own scroller, by its ref: a page on its way out is still drawn beside it (the view deck's still copy).
  return useCallback(
    (scroller: HTMLDivElement | null) => {
      held.current = scroller;
      viewDeck.view("person")(scroller);
      watch.current?.disconnect();
      watch.current = null;
      if (!scroller || typeof ResizeObserver === "undefined") return;
      const hold = () => {
        scroller.style.setProperty("--record-h", `${scroller.clientHeight}px`);
        holdTabRoom(scroller);
      };
      hold();
      watch.current = new ResizeObserver(hold);
      watch.current.observe(scroller);
    },
    [held],
  );
}

/**
 * A phone's thumb on the page (data-bits touchSwipe): across the tab's panes it walks the strip (work.tsx tabPages), and
 * right of the first tab, or from the head at any tab, it carries the page back to People, the page following the finger
 * and People drawn as it lets go; the foot's dock steps aside while it moves. Never from 24px of either edge, the phone's
 * own back, nor from a field or a row that scrolls across. None on a desk.
 */
function pageSwipe(c: PageCtx) {
  if (!c.phone) return {};
  return touchSwipe({
    onBack: c.onBack,
    pages: tabPages,
    when: () => c.phone,
    onGrab: (el, on) => {
      if (on) el.setAttribute("data-going", "");
      else el.removeAttribute("data-going");
    },
  });
}

/**
 * J and K step to the next and the person before in the list they were opened from (the keys People's rows answer to,
 * contracts SHORTCUTS), on a desk: never while a field, a menu or a sheet has the key, nor one an earlier listener took.
 */
function useWalkKeys(walk: PersonWalk | null, step: (to: string) => void, phone: boolean): void {
  const go = useRef(step);
  go.current = step;
  useEffect(() => {
    if (!walk || phone) return undefined;
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const to = key === "j" ? walk.next : key === "k" ? walk.prev : null;
      if (!to) return;
      const at = e.target instanceof Element ? e.target : null;
      if (at && at.closest("input, textarea, select, [contenteditable='true'], [role='menu'], [role='dialog']")) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      go.current(to);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [walk, phone]);
}

/**
 * A step from the person before or after turns the page toward its side (walk.ts noteStep), where the page is drawn at once
 * from what the tab holds: one that reads first is a page arriving, not a page turned. Read once, as the page mounts.
 */
function useArrive(id: string, held: boolean): "next" | "prev" | undefined {
  const [arrive] = useState(() => {
    const side = takeStep(id);
    return held ? side : undefined;
  });
  return arrive;
}

/**
 * Where they stand in the People view they were opened from (walk.ts, 0052's "‹ 4 of 24 ›"), read as their page opens, and
 * the people either side read ahead, so a step lands on a page the tab already holds, whole. Answers the walk and the step
 * to another of them, on the tab this one is on: the address replaced, so Back still leaves the list; J and K step too.
 */
function useWalk(id: string, tab: PersonTab, phone: boolean): [PersonWalk | null, (to: string) => void] {
  const walk = useMemo(() => walkOf(id), [id]);
  const step = useCallback(
    (to: string) => {
      noteStep(to, walk && to === walk.next ? "next" : "prev");
      navigate(personTabRoute(to, tab), { replace: true });
    },
    [walk, tab],
  );
  useWalkKeys(walk, step, phone);
  const prev = walk?.prev ?? null;
  const next = walk?.next ?? null;
  const walks = walk !== null;
  useEffect(() => {
    if (walks) armWalk(id);
  }, [id, walks]);
  useEffect(() => {
    // Read ahead and let go: a read that fails here is read again when the step asks for it.
    for (const to of [prev, next]) if (to) void warmPerson(to);
  }, [prev, next]);
  return [walk, step];
}

/** Where a visit's "what you had seen" waits in the tab (a place, by person): a refresh keeps it, leaving lets it go. */
const LOOKED = "person-looked";

/** What the tab kept of this visit's looking, as numbers; nothing where it kept none. */
function lookedKept(id: string): LookedAt | null {
  const kept = tabMemory()?.place(LOOKED, id);
  if (!kept) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return { seenAtMs: n(kept.seenAtMs), markedAtMs: n(kept.markedAtMs), visitAtMs: n(kept.visitAtMs) };
}

/**
 * New since you last looked (0052): what the reader had seen of this person as this visit began, from their People row
 * before the page writes its own mark, kept in the tab for the visit (a refresh keeps the dots; leaving the person lets
 * them go). Then the mark, on every open (decision 0052's call 9), so the next visit is new against this one, team rows
 * too: the Inbox and People mark a person only while something of theirs is unread.
 */
function useLookedAt(id: string, row: PersonRowVM | null): LookedAt | null {
  const held = useRef<{ id: string; looked: LookedAt | null } | null>(null);
  if (!held.current || held.current.id !== id) held.current = { id, looked: lookedKept(id) };
  if (!held.current.looked && row)
    held.current.looked = { seenAtMs: row.seenAtMs, markedAtMs: row.markAtMs, visitAtMs: Date.now() };
  const looked = held.current.looked;
  useEffect(() => {
    if (looked) tabMemory()?.keepPlace(LOOKED, id, { ...looked });
  }, [id, looked]);
  useEffect(() => () => tabMemory()?.keepPlace(LOOKED, id, {}), [id]);
  const ready = !!looked && !!row;
  const conversationId = row ? row.conversationId : null;
  const heardAtMs = row ? (row.askedMs ?? 0) : 0;
  const markAtMs = row ? row.markAtMs : 0;
  const unseen = row ? row.unseen : false;
  useEffect(() => {
    if (!ready) return undefined;
    // After a dwell: stepping through a list past someone (‹ 4 of 24 ›) does not mark them looked at.
    const t = setTimeout(
      () => seePerson({ personId: id, conversationId }, { unseen, heardAtMs, markAtMs }),
      SEEN_DWELL_MS,
    );
    return () => clearTimeout(t);
  }, [id, ready, conversationId, unseen, heardAtMs, markAtMs]);
  return looked;
}

/** How long a person's page is on screen before the visit counts as looking at them (0052, canvas A). */
const SEEN_DWELL_MS = 1500;

/**
 * The door refuses a pair with two different numbers or two different addresses as two people (0028): the page does not
 * offer one it would refuse. Everyone else People holds is offered; the door judges the rest (deals, deleted, merged).
 */
function mayMergeWith(p: PersonVM, r: PersonRowVM): boolean {
  if (p.phone && r.phone && p.phone !== r.phone) return false;
  if (p.email && r.email && p.email !== r.email) return false;
  return true;
}

/** The page a route draws for `clients/<id>[/<tab>]`: a real workspace's person, in full, on the tab the address names. */
export function ClientProfile({ id, tab = "overview" }: { id: string; tab?: PersonTab }) {
  return <ClientProfileReal id={id} tab={tab} />;
}
