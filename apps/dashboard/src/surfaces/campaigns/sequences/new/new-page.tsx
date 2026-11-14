/**
 * New (decision 0065, the one New for every sequence; the New canvas, artifact 3eGjrhpQABiRHEgmiy27Kb): one line to Ask,
 * or a start from what is happening, and one draft for every kind -- a sequence or a message sent once, to people or to
 * leads -- every part of it a choice the owner can change before anything is made. Ask drafts it (POST sequences/draft,
 * the `sequence_draft` verb), writing a message where none of the workspace's fits; Keep, Start, Schedule or Send make it
 * through the one door (POST sequences/new, `sequence_new`), and its record opens, or Sequences with the one-off's Stop.
 *
 * A door's address fills what it chose (`new:moment:<trigger>`, `new:once[:to:<audience>]`, `new:leads`): Ask keeps it.
 * A draft is kept in the tab as it changes and comes back when New opens again on the same address (the loading standard's
 * G, kit/record/work.ts), and closing it asks first: Discard, or Keep as a draft under Drafts. What New counts is what
 * Campaigns counts: the playbooks read's moments, lists and pools,
 * the sequences that run, and the searches whose leads are ready (reach_out_sources).
 *
 * A draft keeps a line under it (decision 0129 step 2, change.ts): what the owner types or says there changes the draft
 * that stands, Ask's answer taken as that draft changed, what changed said on top with Undo.
 */
import { useEffect, useRef, useState } from "react";
import {
  CONSENT_CHANNELS,
  NEW_WORDS as W,
  SEQUENCES_ROUTE,
  UNKNOWN_AUDIENCE_WORDS,
  clockWhen,
  localHour,
  sequenceRoute,
  whoSuits,
  zoneDayKey,
  type ConsentChannel,
  type NewAudience,
  type NewDraftAsk,
  type NewDraftDto,
  type NewKind,
  type NewWho,
  type ReachOutSourceDto,
  refusalNeedsMailbox,
} from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import { commitVerb } from "@/bridge/verbs/commit";
import { runningOf } from "@/lib/new-checks";
import { Button } from "../../../kit/button/button";
import { keepTabDraft, tabDraft, useUnsavedWork } from "../../../kit/record/work";
import { canDo, navigate, refusalToast, useFrameToast } from "../../../frame-verbs";
import { useReadsHere, useSurface } from "../../../use-surface";
import { mailboxConnectOutcome } from "../../../settings/connections/mailbox-connect";
import { broadcasts } from "../../broadcasts/verbs";
import { useCampaignsToast } from "../../home/route-toast";
import { reachOuts } from "../../reach-out/surface";
import { CHANGE_WORDS, changedFrom, changesOf, draftedAfter, leftNothing, placesByAsk, standsOf } from "./change";
import { DraftView, type DraftReads } from "./new-draft";
import type { KeptSend } from "./kept-send";
import * as M from "./new-model";
import { StartView, type StartReads } from "./new-start";
import "./new.css";

/** The reads New opens on: Campaigns' moments, lists and counts, the Library (settings), and what runs. */
const READS = ["playbooks", "settings", "sequences"] as const;

/**
 * The searches whose leads are ready: what the tab last read of them, painted at once, and read again as New opens;
 * undefined while the first read is out, null where it failed. Still being read is never no search: New's starts drew a
 * panel of what to set up first, then swapped it for the search's row as the answer came (the Campaigns load review).
 */
function useSources(): ReachOutSourceDto[] | null | undefined {
  const [sources, setSources] = useState<ReachOutSourceDto[] | null | undefined>(
    () => reachOuts.peekSources() ?? undefined,
  );
  useEffect(() => {
    let live = true;
    void reachOuts.sources().then((s) => {
      if (live) setSources(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return sources;
}

/** An audience a door named, as a list's token: People's (`seg:`) or the workspace's own (`list:`). */
const tokenOf = (to: string | null): string | null =>
  !to ? null : to.startsWith("seg:") || to.startsWith("list:") ? to : `seg:${to}`;

/** What New reads, in the shapes its parts take; null until Campaigns' read and the searches are in. */
function useNewReads(sources: ReachOutSourceDto[] | null | undefined): {
  start: StartReads;
  draft: DraftReads;
  business: string;
  links: { bookingLink: boolean; reviewLink: boolean };
} | null {
  useReadsHere(READS);
  const pb = useSurface("playbooks");
  const seq = useSurface("sequences");
  if (!pb || sources === undefined) return null;
  const who = {
    moments: pb.triggers,
    lists: pb.lists.map((l) => ({
      id: l.id,
      name: l.name,
      candidates: l.candidates,
      said: l.builtin ? null : l.smart ? W.sheets.listSaid.rule : W.sheets.listSaid.hand,
      builtin: l.builtin,
    })),
    everyone: pb.pools.everyone_monthly?.candidates ?? null,
    everyoneHeld: pb.pools.everyone_monthly?.held ?? null,
    sources,
    running: seq?.sequences ?? [],
  };
  const offered = pb.templates ?? [];
  const library = { messages: offered.flatMap((t) => (t.message ? [t.message] : [])), rows: offered };
  // What it can send on now; where that could not be read, WhatsApp, as every send went before a channel was read.
  const ready: ConsentChannel[] = pb.ready ? CONSENT_CHANNELS.filter((c) => pb.ready?.[c]?.ready) : ["whatsapp"];
  return {
    business: pb.businessName,
    // Which links a value may be filled with: Send it again puts right a slot it filled with a link no longer on file.
    links: { bookingLink: !!pb.bookingLink, reviewLink: !!pb.reviewLink },
    start: {
      ...who,
      calendarOn: pb.calendar === "ok",
      word: pb.shape.word,
      messages: pb.messages ? pb.messages.length : null,
      library,
      business: pb.businessName,
      hasDeals: pb.shape.hasDeals,
    },
    draft: {
      who,
      library,
      ready,
      paused: pb.ready?.paused === true,
      today: zoneDayKey(Date.now(), pb.timezone),
      timezone: pb.timezone,
      // What a draft is counted again against as it changes: the same pools, searches and sequences Ask's draft read.
      recount: {
        counts: {
          pools: pb.pools,
          searches: (sources ?? []).map((s) => ({
            id: s.id,
            ready: s.ready,
            checking: Math.max(0, s.with_unconfirmed - s.ready),
          })),
        },
        running: runningOf(seq?.sequences ?? []),
        ready,
      },
    },
  };
}

type Reads = NonNullable<ReturnType<typeof useNewReads>>;
type Flash = ReturnType<typeof useFrameToast>[1];
type Fixed = Omit<NewDraftAsk, "words">;

/** The choices a door's address made, which every draft from this New keeps, and the line it opens on. */
function useDoor(moment: string | null, who: NewWho | null, to: string | null, reads: Reads | null) {
  const token = tokenOf(to);
  const listLabel = reads?.start.lists.find((l) => l.id === token)?.name ?? null;
  const trigger = moment ? reads?.start.moments.find((t) => t.id === moment) : null;
  const asked = { moment, who, to: token };
  const door: Fixed = moment
    ? {
        kind: "sequence",
        audience: "people",
        who: { kind: "moment", trigger: moment, label: trigger?.label ?? moment },
      }
    : M.fixedOf(asked, listLabel);
  return {
    door,
    seed: M.doorLineOf(asked, reads?.start.word ?? "appointment"),
    // A list the door named that New cannot send to now, said as the send screen said it.
    notice: M.doorListGone(asked, listLabel, !!reads) ? UNKNOWN_AUDIENCE_WORDS : null,
  };
}

/**
 * The draft New opens on where its address names one: a one-off kept as a draft (`new:once:draft:<id>`, 00465), or a sent
 * run's Send it again (the send it kept for the tab), each a one-off by hand until it is changed or let go.
 */
function useOpenedOn(who: NewWho | null, keptId: string | null, reads: Reads | null) {
  const [again] = useState(() => (who === "once" && !keptId ? (tabDraft("broadcast") as KeptSend | null) : null));
  const [gone, setGone] = useState(false);
  const seq = useSurface("sequences");
  const library = reads?.draft.library ?? null;
  const row = keptId ? (seq?.sequences.find((r) => r.id === keptId) ?? null) : null;
  const opened =
    gone || !reads || !library
      ? null
      : row
        ? M.onceKeptOf(row, library, reads.business)
        : again
          ? M.againOf(again, library, { lists: reads.start.lists, links: reads.links }, reads.business)
          : null;
  const letGo = () => {
    setGone(true);
    if (again) keepTabDraft("broadcast", null);
  };
  return { opened, letGo };
}

/**
 * Ask at work: a draft asked for from a line, Stop, and what came of it: the draft, which each asker takes its own way (a
 * first draft, one drafted again, one changed), or none, with a refusal or Ask that failed said here.
 */
function useAsk(door: Fixed, flash: Flash) {
  const [drafting, setDrafting] = useState<"fresh" | "again" | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  // Each ask counted, so an answer that arrives after Stop, or after a later ask, is let go.
  const asked = useRef(0);
  const ask = async (words: string, fixed: Fixed, again: boolean): Promise<NewDraftDto | null> => {
    const id = ++asked.current;
    setDrafting(again ? "again" : "fresh");
    setFailed(null);
    setRefused(null);
    // A change is asked of the draft as it stands: the door's choices opened New, and the owner may have changed them since.
    const r = await commitVerb("sequence_draft", { words, ...(fixed.stands ? {} : door), ...fixed });
    if (id !== asked.current) return null;
    setDrafting(null);
    if (r.ok) return r.data as Output<"POST sequences/draft">;
    // Drafting it again, or changing it, the draft stays as it was and what Ask said is a toast over it, whatever it was.
    if (again) flash(refusalToast(r));
    // A draft nothing here can hold is said in Ask's words; anything else is Ask that could not answer, in the server's
    // words where it said why (a day's budget spent, a paused workspace, an answer that ran long), as a change's toast is.
    else if (r.code === "validation") setRefused(r.message);
    else setFailed(r.message || W.failed.words);
    return null;
  };
  const stop = () => {
    asked.current++;
    setDrafting(null);
  };
  const clear = () => {
    setFailed(null);
    setRefused(null);
  };
  return { drafting, failed, refused, ask, stop, clear };
}

type Asking = ReturnType<typeof useAsk>;

/**
 * A change of kind or audience (F1): Ask drafts it again from the same line, the draft standing in its new shape with
 * Undo while it does; one built by hand is built again here.
 */
function useRedraft(on: {
  draft: NewDraftDto | null;
  asking: Asking;
  took: (drafted: NewDraftDto) => void;
  byHand: (built: NewDraftDto) => void;
}) {
  const [pending, setPending] = useState<{ kind: NewKind; audience: NewAudience } | null>(null);
  const redraft = (fixed: { kind?: NewKind; audience?: NewAudience }) => {
    const { draft } = on;
    if (!draft) return;
    const kind = fixed.kind ?? draft.kind;
    const audience = fixed.audience ?? draft.audience;
    const keep = draft.who && whoSuits(draft.who, audience, kind) ? { who: draft.who } : {};
    // By hand, the draft is built again here; Ask's is drafted again from the same line.
    if (!draft.said) {
      on.byHand({ ...M.draftByHand(kind, audience, draft.business), ...keep });
      return;
    }
    const mine = { kind, audience };
    setPending(mine);
    void on.asking
      .ask(draft.said, { kind, audience, ...keep, previous: { name: draft.name, steps: draft.steps.length } }, true)
      .then((drafted) => (drafted ? on.took(drafted) : undefined))
      .finally(() => setPending((now) => (now === mine ? null : now)));
  };
  // What Ask is drafting it again as, while it does: the draft stands in that shape, with Undo (F1).
  const as = pending && on.asking.drafting === "again" ? pending : null;
  return { redraft, as, letGo: () => setPending(null) };
}

/** How many changes back Undo goes: more than a draft is changed before it is started or let go. */
const CHANGES_KEPT = 20;

/** What one change by the line left: the draft and what Ask drafted before it, the line, and what it changed. */
interface Changed {
  before: NewDraftDto;
  drafted: NewDraftDto | null;
  line: string;
  said: string;
  steps: number[];
}

/**
 * The line under a draft (decision 0129 step 2; change.ts): what is typed in it, the line Ask is changing the draft by
 * while it does, and what each change left, newest last, with the draft before it: Undo steps back through them one at
 * a time. Ask's answer is taken as the draft that stood, changed, and counted again. A line that changed nothing and
 * says why (the draft's card) stands on top over that card as any change does, and Undo puts the card away: left on the
 * change before it, the card read as that change's. One that changed nothing and says nothing new is said in passing
 * and leaves nothing to undo. A change by hand, or a new draft, lets them all go; a draft discarded lets the line's
 * words go too, which a change still out when it went had left for the next draft's line.
 */
function useChange(on: {
  draft: NewDraftDto | null;
  drafted: NewDraftDto | null;
  asking: Asking;
  recount: (prev: NewDraftDto | null, next: NewDraftDto) => NewDraftDto;
  put: (draft: NewDraftDto, drafted: NewDraftDto | null) => void;
  flash: Flash;
}) {
  const [words, setWords] = useState("");
  const [by, setBy] = useState<string | null>(null);
  const [left, setLeft] = useState<Changed[]>([]);
  const say = (line: string) => {
    const before = on.draft;
    if (!before || by !== null) return;
    setBy(line);
    void on.asking
      .ask(line, { stands: standsOf(before) }, true)
      .then((answered) => {
        if (!answered) return;
        const next = on.recount(answered, changedFrom(before, answered));
        const changed = changesOf(before, next);
        on.put(next, draftedAfter(on.drafted, before, next));
        setWords("");
        if (leftNothing(before, next, changed.said)) on.flash({ msg: CHANGE_WORDS.same });
        else setLeft((all) => [...all, { before, drafted: on.drafted, line, ...changed }].slice(-CHANGES_KEPT));
      })
      .finally(() => setBy(null));
  };
  const last = left.at(-1) ?? null;
  const back = () => {
    if (last) on.put(last.before, last.drafted);
    setLeft((all) => all.slice(0, -1));
  };
  const changing = by !== null && on.asking.drafting === "again";
  // What stands on top of the draft: the line Ask is changing it by, or the newest change with what it changed and
  // its Undo, which puts back the draft before it and shows the change before that.
  const note = changing
    ? { said: by, by: null, steps: [], undo: false }
    : last
      ? { said: last.line, by: last.said, steps: last.steps, undo: true }
      : null;
  return { words, setWords, changing, note, say, back, forget: () => setLeft([]) };
}

/** When a one-off sent goes, as its toast says it: when the send door set it for, by the business's clock. */
const goesWhen = (at: string | null | undefined, tz: string): string => {
  const ms = at ? Date.parse(at) : M.sendsAt(tz, Date.now()).ms;
  return clockWhen(ms, tz, Date.now()).replace(/^today /, "at ");
};

/** What the record says as a sequence is made (Started, LeadsStarted): when its first batch is, and that it waits. */
function startedWords(d: NewDraftDto, start: boolean, tz: string): string {
  if (!start) return W.started.kept(d.name);
  if (d.audience === "leads") return W.started.leads;
  return W.started.people(M.firstBatchWords(d.run_hour, localHour(tz, new Date())));
}

/** What a make works with: the kept one-off it is, how it says so, what it lets go, and the workspace's clock. */
interface MakeOn {
  keptId: string | null;
  flash: Flash;
  letGo: () => void;
  tz: string;
  /** The door found no mailbox, which a draft written here by hand had no way to know: its foot becomes the way to one. */
  onNoMailbox: () => void;
}

/** A draft whose mailbox the door found gone: its foot becomes the way to one. */
const withoutMailbox = (d: NewDraftDto | null) => (d ? { ...d, mailbox: { ids: [], label: "" } } : d);

/**
 * Keep, Start, Schedule and Send: the draft made through the one door, then its record (with what it now is), Drafts for
 * a one-off kept, or Sequences with a one-off's Stop.
 */
function useMake({ keptId, flash, letGo, tz, onNoMailbox }: MakeOn) {
  const hosted = useCampaignsToast();
  const [busy, setBusy] = useState(false);
  const make = async (draft: NewDraftDto, start: boolean, drafted: NewDraftDto | null) => {
    if (!draft.who) return false;
    setBusy(true);
    const r = await commitVerb("sequence_new", M.makeBodyOf(draft, start, keptId, drafted));
    setBusy(false);
    if (!r.ok) {
      flash(refusalToast(r));
      if (refusalNeedsMailbox(r)) onNoMailbox();
      return false;
    }
    const done = r.data as Output<"POST sequences/new">;
    letGo();
    // What a make says outlives New, which closes as it makes: the route's toast (route-toast.ts).
    const say = hosted ?? flash;
    const once = draft.kind === "once" && draft.audience === "people";
    // A one-off sent to people is a send: back on Sequences, its toast with its Stop until it goes (E2).
    if (once && done.state !== "draft") {
      const n = M.reviewOf(draft)?.can ?? draft.reach?.can ?? null;
      say({
        tone: "ok",
        msg: (
          <>
            {W.sent.goes(draft.name, goesWhen(done.scheduled_for, tz))}
            {n !== null ? ` · ${W.draft.people(n)}` : ""}
          </>
        ),
        action: { label: W.sent.stop, onClick: () => void broadcasts.cancel(done.made) },
      });
      navigate(SEQUENCES_ROUTE);
      return true;
    }
    say({ tone: "ok", msg: <>{startedWords(draft, start, tz)}</> });
    // A one-off kept waits under Drafts, where Sequences lists it; a sequence opens on its record.
    navigate(once ? SEQUENCES_ROUTE : sequenceRoute(done.made));
    return true;
  };
  return { busy, make };
}

/** Leaving a draft asks first (E4): it waits under Drafts and sends nothing, or it goes. The house's pair on a phone. */
function LeavingAsk(p: { busy: boolean; onDiscard: () => void; onKeep: () => void }) {
  return (
    <div className="sq-nw-foot" data-foot-pair="">
      <p className="sq-nw-foot-line">
        <b>{W.leaving.title}</b>
        <small>{W.leaving.words}</small>
      </p>
      <Button onClick={p.onDiscard} data-testid="sq-nw-leave-discard">
        {W.leaving.discard}
      </Button>
      <Button variant="primary" onClick={p.onKeep} disabled={p.busy} data-testid="sq-nw-leave-keep">
        {W.leaving.keep}
      </Button>
    </div>
  );
}

/**
 * The draft New shows, counted against the workspace as it is now, on the channels it sends on now: one the tab kept,
 * counted again as it comes back (who said yes, or a channel connected or closed, since it was left); one in hand as it is
 * (each change counts it again); else the one its address opened (Send it again, a kept one-off), counted.
 */
function shownDraftOf(
  held: NewDraftDto | null,
  kept: NewDraftDto | null,
  opened: NewDraftDto | null,
  reads: Reads | null,
): NewDraftDto | null {
  if (!reads) return held ?? opened;
  const k = reads.draft.recount;
  if (held && held === kept)
    return M.recounted(null, M.onReadyChannels({ ...held, reach: null }, reads.draft.ready), k);
  return held ?? (opened ? M.recounted(null, M.onReadyChannels(opened, reads.draft.ready), k) : null);
}

/**
 * What New keeps in the tab while it holds a draft: the draft, the line, and the draft as Ask answered it (decision 0078
 * step 2: what a make keeps beside the owner's words), under the address it was opened on.
 */
interface KeptHere {
  draft: NewDraftDto | null;
  line: string | null;
  drafted?: NewDraftDto | null;
}

interface NewSequenceProps {
  /** The moment its address names (`new:moment:<trigger>`) where a door asked for one. */
  moment?: string | null;
  /** Who its address names (`new:once`, `new:leads`) where a door asked for them. */
  who?: NewWho | null;
  /** The audience a door asked to message (`new:once:to:<audience>`). */
  to?: string | null;
  /** A one-off kept as a draft, opened again (`new:once:draft:<id>`). */
  kept?: string | null;
}

/** What the browser came back from Google with, said once as New opens: its word leaves the address as it is read. */
function useCameFromGoogle(flash: Flash) {
  const [came] = useState(() => mailboxConnectOutcome());
  useEffect(() => {
    if (came) flash(came.ok ? { msg: came.words } : { tone: "danger", msg: came.words });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as New opens: its word leaves the address as it is read
  }, []);
  return came;
}

/** Back from Google with a mailbox, the draft kept in the tab said none, and can start now. */
function draftBackFromGoogle(draft: NewDraftDto | null, came: { ok: boolean } | null): NewDraftDto | null {
  if (!draft || !came?.ok || draft.audience !== "leads" || !draft.mailbox) return draft;
  return { ...draft, mailbox: { ...draft.mailbox, label: draft.mailbox.label || W.draft.yourMailbox } };
}

/** What the draft's foot and line say Ask is doing: changing it by the line, or drafting it again, and for whom. */
function doingOf(changing: boolean, as: { audience: NewAudience } | null, draft: NewDraftDto): string | null {
  if (changing) return CHANGE_WORDS.changing;
  if (!as) return null;
  return as.audience !== draft.audience ? W.say.againFor[as.audience] : W.say.again;
}

/** New, on the moment, for whom, or on the kept one-off its address names. */
export function NewSequence({ moment = null, who = null, to = null, kept = null }: NewSequenceProps) {
  const reads = useNewReads(useSources());
  const [toast, flash] = useFrameToast();
  const { door, seed, notice } = useDoor(moment, who, to, reads);
  // What this address held when New last closed over it, kept in the tab: the draft, and the line.
  const here = [moment, who, to, kept].map((x) => x ?? "").join("|");
  const [back] = useState(() => tabDraft("new", here) as KeptHere | null);
  const [typed, setTyped] = useState<string | null>(back?.line ?? null);
  const line = typed ?? seed;
  const came = useCameFromGoogle(flash);
  const [held, setDraft] = useState<NewDraftDto | null>(() => draftBackFromGoogle(back?.draft ?? null, came));
  // The draft as Ask last answered it, never as it is being edited: what a make keeps beside the owner's words.
  const [drafted, setDrafted] = useState<NewDraftDto | null>(() => back?.drafted ?? null);
  const { opened, letGo } = useOpenedOn(who, kept, reads);
  // Who it reaches, its twin and its checks, said again as it changes (decision 0065 step 7); what Ask answered stands.
  const recount = (prev: NewDraftDto | null, next: NewDraftDto) =>
    reads ? M.recounted(prev, next, reads.draft.recount) : next;
  const draft = shownDraftOf(held, back?.draft ?? null, opened, reads);
  const work = useUnsavedWork("new", here, {
    value: { draft: held, line: typed, drafted } satisfies KeptHere,
    dirty: !!held?.who,
    onLeave: () => navigate(SEQUENCES_ROUTE),
  });
  const leaving = work.asking;
  const show = (shown: NewDraftDto, answer: NewDraftDto | null) => {
    setDrafted(answer);
    setDraft(shown);
    work.stay();
  };
  const asking = useAsk(door, flash);
  const change = useChange({ draft, drafted, asking, recount, put: show, flash });
  // A draft Ask answered whole, or one built by hand: what the line last changed is let go with the draft it changed.
  const took = (answered: NewDraftDto) => {
    show(answered, answered);
    change.forget();
  };
  const built = (byHand: NewDraftDto) => {
    show(recount(null, byHand), null);
    change.forget();
  };
  const redo = useRedraft({ draft, asking, took, byHand: built });
  const tz = reads?.draft.timezone ?? "UTC";
  const made = useMake({ keptId: kept, flash, letGo, tz, onNoMailbox: () => setDraft(withoutMailbox) });
  const busy = made.busy;
  const make = async (d: NewDraftDto, start: boolean) => {
    if (await made.make(d, start, drafted)) work.done();
  };
  const may = canDo("approve");
  const undo = () => {
    asking.stop();
    redo.letGo();
  };
  const byHand = (kind?: NewKind) => {
    const d = M.draftByHand(kind ?? door.kind ?? "sequence", door.audience ?? "people", reads?.business ?? "");
    built(door.who && whoSuits(door.who, d.audience, d.kind) ? M.setWho(d, door.who) : d);
    asking.clear();
  };
  // A kept one-off let go goes from Drafts too; any other draft was never made, so it is only let go here. Ask at work
  // on it is stopped first: its answer, landing after, drew the draft again.
  const discard = () => {
    undo();
    letGo();
    setDraft(null);
    setDrafted(null);
    change.forget();
    change.setWords("");
    work.done();
    work.stay();
    if (!kept) return;
    void commitVerb("sequence_discard", { sequence_id: kept }).then((r) =>
      r.ok ? navigate(SEQUENCES_ROUTE) : flash(refusalToast(r)),
    );
  };
  // Closing asks over a draft that says who it is for (the tab's rule); a second press while it asks leaves it in the tab.
  const close = () => {
    if (busy) return;
    if (leaving) navigate(SEQUENCES_ROUTE);
    else work.leave();
  };

  const view =
    draft && reads ? (
      <DraftView
        draft={redo.as ? M.redraftShapeOf(draft, redo.as) : draft}
        reads={reads.draft}
        busy={busy}
        doing={doingOf(change.changing, redo.as, draft)}
        redraftingFor={redo.as && redo.as.audience !== draft.audience ? redo.as.audience : null}
        leaving={
          leaving ? <LeavingAsk busy={busy} onDiscard={work.discard} onKeep={() => void make(draft, false)} /> : null
        }
        line={{ words: change.words, onWords: change.setWords }}
        note={change.note}
        byAsk={placesByAsk(draft, drafted)}
        acts={{
          // A change by hand is the owner's: what the line last changed stays changed, and its Undo goes.
          change: (d) => {
            setDraft(recount(draft, d));
            change.forget();
            work.stay();
          },
          redraft: redo.redraft,
          undo,
          say: change.say,
          back: change.back,
          discard,
          make: (start) => void make(draft, start),
          close,
          refused: (r) => flash(refusalToast(r)),
        }}
      />
    ) : (
      <StartView
        line={line}
        onLine={setTyped}
        onDraft={(words, fixed) => void asking.ask(words, fixed ?? {}, false).then((d) => (d ? took(d) : undefined))}
        drafting={asking.drafting !== null}
        onStop={asking.stop}
        failed={asking.failed}
        refused={asking.refused}
        onByHand={byHand}
        notice={notice}
        reads={reads?.start ?? null}
        may={may}
        onClose={close}
      />
    );
  return (
    <>
      {view}
      {toast}
    </>
  );
}
