/**
 * One person, in full (moved from legacy/pages/client-profile.jsx `ClientProfileReal`, decision 0015, step 5): fetched on
 * open through the profile's courier (people-detail.ts: every message, call, escalation and operator decision for this
 * contact, mapped in contracts where the rule is tested). It is one quiet record: one scroll, never two panes. The head is
 * who they are, where they stand and the page's acts (hero.tsx); their deal comes first in the column, then Coming up, then
 * History, and the card of what is known beside them (sections.tsx, settings-card.tsx, notes.tsx, lists.tsx).
 *
 * Opening a person is as quick as the tab can make it, and a person's page is never drawn in parts: the tab keeps the
 * people it read, and a person the tab does not hold yet is nothing of theirs until their whole page is in, `Reading…` after
 * the standard's beat, never their name first and the rest after (Ruben, 24 Sep).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { NOTE_WORDS, isIdentifierName, shortName } from "@chanlytics/contracts";
import type { PersonRowVM, PersonVM } from "@chanlytics/contracts";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { useRecordFold } from "../../kit/record/hooks";
import { mayAtLeast } from "../../legacy-verbs";
import { PersonDealCard } from "../deal/person-deal";
import { backToPeople, hear, saidBy, usePersonToast } from "../person-verbs";
import type { DelState, DoubtState, MergeState, PageCtx, RmState } from "./ctx";
import { hero, openWith } from "./hero";
import { PersonLists } from "./lists";
import { PersonNotes } from "./notes";
import { PersonProfileFrame } from "./frame";
import { aboutCard, campaignsCard, comingUpSection, historySection } from "./sections";
import { settingsCard } from "./settings-card";
import { heldPerson, readPerson } from "./read";
import { hearTheirThread } from "./their-thread";
import { usePeopleSeam } from "./use-people";
import { useSeeOpen } from "../../seen";
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

/** The rail: the role once, About, what the page changes, the notes, the lists and the campaigns. */
function rail(c: PageCtx) {
  const { p, canRecord, isOwner, flash, load, first, who } = c;
  // The role, said once for the rail: every locked control used to say it again under itself.
  const roleNote = !canRecord ? "You can read this page; an owner or operator changes it." : null;
  return (
    <aside className="cl-prof-rail" aria-label={`About ${who === "This person" ? "this person" : who}`}>
      {roleNote && (
        <div className="cl-prof-rail-note" data-testid="person-role-note">
          {roleNote}
        </div>
      )}
      {aboutCard(c)}
      {settingsCard(c)}
      <div className="cl-prof-rail-section">
        <div className="cl-prof-rail-label">{NOTE_WORDS.title}</div>
        <PersonNotes p={p} canEdit={canRecord} isOwner={isOwner} flash={flash} onChanged={load} />
      </div>
      <div className="cl-prof-rail-section" data-testid="person-lists">
        <div className="cl-prof-rail-label">Lists</div>
        <PersonLists personId={p.id} canEdit={canRecord} first={first} flash={flash} smart={p.smartLists || []} />
      </div>
      {/* What a playbook or a broadcast sent them, and what came of it: each row opens the run's own report. */}
      {campaignsCard(p)}
    </aside>
  );
}

/** The page of a person who is here: the hero, then the column (their deal, Coming up, History) beside the rail. */
function personPage(c: PageCtx, toastNode: ReactNode) {
  const { p } = c;
  const comingUp = p.comingUp || [];
  // Their visits ahead are Coming up, above what has happened.
  const past = p.timeline.filter((t) => !t.ahead);
  // Nobody is called "+1": a person known only by number is "them" in copy, and the line under their name does not say the
  // number twice.
  const phoneOnly = isIdentifierName(p.name);
  const compose = openWith(c);
  return (
    <div className="cl-profile" data-takeover>
      <div className="cl-prof-page">
        {hero(c, compose, phoneOnly)}

        <div className="cl-prof-body">
          {/* Their deal (0008), first, where the work with them is: a card per open deal and its one next act, or one quiet
              line. Nothing where deals are off. Its sends are the More menu's own path (openWith). */}
          <PersonDealCard p={c.dealP} canRecord={c.canRecord} onCompose={compose} flash={c.flash} />
          {comingUpSection(comingUp)}
          {historySection(c, past)}
          {rail(c)}
        </div>
      </div>
      {toastNode}
    </div>
  );
}

/** One person: read, drawn whole, and read again when what they are made of moves. */
function ClientProfileReal({ id }: { id: string }) {
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
  const first = phoneOnly ? "them" : shortName(vm.name);
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
  };
  return personPage(c, toastNode);
}

/**
 * The door refuses a pair with two different numbers or two different addresses as two people (0028): the page does not
 * offer one it would refuse. Everyone else People holds is offered; the door judges the rest (deals, deleted, merged).
 */
function mayMergeWith(p: PersonVM, r: PersonRowVM): boolean {
  if (p.phone && r.phone && p.phone !== r.phone) return false;
  if (p.email && r.email && p.email !== r.email) return false;
  return true;
}

/** The page a route draws for `clients/<id>`: a real workspace's person, in full. */
export function ClientProfile({ id }: { id: string }) {
  return <ClientProfileReal id={id} />;
}
