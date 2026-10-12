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
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { isIdentifierName, newSinceOf, personTabRoute, shortName } from "@chanlytics/contracts";
import type { LookedAt, PersonRowVM, PersonTab, PersonVM } from "@chanlytics/contracts";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { useRecordFold } from "../../kit/record/hooks";
import { tabMemory } from "../../kit/record/shell-verbs";
import { mayAtLeast, navigate } from "../../legacy-verbs";
import { addressReplace } from "../shell-verbs";
import { PL_PHONE_QUERY } from "../words";
import { backToPeople, hear, saidBy, usePersonToast } from "../person-verbs";
import { warmPerson } from "../people-detail";
import { walkOf, type PersonWalk } from "../walk";
import type { DelState, DoubtState, MergeState, PageCtx, RmState } from "./ctx";
import { BusinessSheet, WorksAtCard } from "./business";
import { CallSheet, usePersonCall } from "./call";
import { PhoneDock, hero, openWith } from "./hero";
import { PersonLists } from "./lists";
import { PersonProfileFrame } from "./frame";
import { aboutCard } from "./sections";
import { Figures, PersonTabs, TabBody, tabSwipe } from "./work";
import { settingsCard } from "./settings-card";
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
 * press shows its tab at once and replaces the address, so the page is not mounted again and Back leaves the person.
 */
function useTab(
  id: string,
  asked: PersonTab,
  vm: PersonVM | null,
  phone: boolean,
): [PersonTab, (t: PersonTab) => void] {
  const [tab, setTab] = useState<PersonTab>(asked);
  useEffect(() => setTab(asked), [asked]);
  const goTab = useCallback(
    (t: PersonTab) => {
      setTab(t);
      addressReplace(personTabRoute(id, t), { quiet: false });
    },
    [id],
  );
  const tabs = vm ? (phone ? vm.tabs.phone : vm.tabs.desk) : [];
  return [tabs.some((t) => t.id === tab) ? tab : "overview", goTab];
}

/** What the rail knows of them: the role once, how to reach them, where they work, what they may be sent, their lists. */
function railGroups(c: PageCtx) {
  const { p, canRecord, flash, first } = c;
  // The role, said once for the rail: every locked control used to say it again under itself.
  const roleNote = !canRecord ? "You can read this page; an owner or operator changes it." : null;
  return (
    <>
      {roleNote && (
        <div className="cl-prof-rail-note" data-testid="person-role-note">
          {roleNote}
        </div>
      )}
      {aboutCard(c)}
      <WorksAtCard c={c} />
      {settingsCard(c)}
      <div className="cl-prof-rail-section" data-testid="person-lists">
        <div className="cl-prof-rail-label">Lists</div>
        <PersonLists personId={p.id} canEdit={canRecord} first={first} flash={flash} smart={p.smartLists || []} />
      </div>
    </>
  );
}

/**
 * The page of a person who is here (canvas A): on a desk the identity rail beside the work column, on a phone one column
 * with the rail's groups under About; the business sheet over it when it is open.
 */
function personPage(c: PageCtx, toastNode: ReactNode, scroller: (el: HTMLDivElement | null) => void) {
  const { p, who } = c;
  // Their visits ahead are Coming up, above what has happened.
  const past = p.timeline.filter((t) => !t.ahead);
  // Nobody is called "+1": a person known only by number is "them" in copy, and the line under their name does not say the
  // number twice.
  const phoneOnly = isIdentifierName(p.name);
  const label = `About ${who === "This person" ? "this person" : who}`;
  const about = (
    <aside className="cl-prof-rail" aria-label={label}>
      {railGroups(c)}
    </aside>
  );
  return (
    <div className="cl-profile" ref={scroller} data-takeover data-tab={c.tab}>
      <div className="cl-prof-page">
        <div className="cl-prof-record" data-thin={p.thin || undefined}>
          <div className="cl-prof-side">
            {hero(c, phoneOnly)}
            {c.phone ? null : about}
          </div>
          <div className="cl-prof-work" {...tabSwipe(c)}>
            <Figures c={c} />
            <PersonTabs c={c} />
            <TabBody c={c} past={past} about={about} />
          </div>
        </div>
      </div>
      <PhoneDock c={c} />
      <BusinessSheet c={c} />
      <CallSheet c={c} />
      {toastNode}
    </div>
  );
}

/** One person: read, drawn whole, and read again when what they are made of moves. */
function ClientProfileReal({ id, tab: asked }: { id: string; tab: PersonTab }) {
  const [st, setSt] = useHeld(id);
  const [toastNode, flash] = usePersonToast();
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
  const [tab, goTab] = useTab(id, asked, vm, phone);
  // The business sheet (0052): one at a time, closed when the person changes.
  const [sheet, setSheet] = useState(false);
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
  const walk = useWalk(id);
  const scroller = useRailHeld();
  const call = usePersonCall(vm, phone);
  if (missing)
    return (
      <PersonProfileFrame onBack={backToPeople}>
        <EmptyState
          kind="page"
          glyph="user"
          title="This person is not in your workspace"
          body="They may have been deleted."
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
  const dealP = peopleRow && peopleRow.followUp ? { ...vm, followUp: peopleRow.followUp } : vm;
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
    walk,
    step: (to) => navigate(personTabRoute(to, tab), { replace: true }),
    compose: () => undefined,
    call,
  };
  // Every send the page offers opens their thread through one path (the More menu's, the deal card's, Up next's).
  c.compose = openWith(c);
  return personPage(c, toastNode, scroller);
}

/**
 * The identity rail holds still beside the work column on a desk (canvas A's sticky rail): it is held to the height of the
 * page's scroller (`--record-h` on it, clients.css), which a rail taller than the screen scrolls inside, so its foot is
 * never out of reach while the work column is read. Measured as the scroller is, and again as it changes.
 */
function useRailHeld(): (scroller: HTMLDivElement | null) => void {
  const watch = useRef<ResizeObserver | null>(null);
  // The page's own scroller, by its ref: a page on its way out is still drawn beside it (the view deck's still copy).
  return useCallback((scroller: HTMLDivElement | null) => {
    watch.current?.disconnect();
    watch.current = null;
    if (!scroller || typeof ResizeObserver === "undefined") return;
    const hold = () => scroller.style.setProperty("--record-h", `${scroller.clientHeight}px`);
    hold();
    watch.current = new ResizeObserver(hold);
    watch.current.observe(scroller);
  }, []);
}

/**
 * Where they stand in the People view they were opened from (walk.ts, 0052's "‹ 4 of 24 ›"), read as their page opens, and
 * the people either side read ahead, so a step lands on a page the tab already holds, whole.
 */
function useWalk(id: string): PersonWalk | null {
  const walk = useMemo(() => walkOf(id), [id]);
  const prev = walk?.prev ?? null;
  const next = walk?.next ?? null;
  useEffect(() => {
    // Read ahead and let go: a read that fails here is read again when the step asks for it.
    for (const to of [prev, next]) if (to) void warmPerson(to);
  }, [prev, next]);
  return walk;
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
