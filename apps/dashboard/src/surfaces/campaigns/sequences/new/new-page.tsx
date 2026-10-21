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
} from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
import { runningOf } from "@/lib/new-checks";
import { Button } from "../../../kit/button/button";
import { keepTabDraft, tabDraft, useUnsavedWork } from "../../../kit/record/work";
import { canDo, navigate, refusalToast, useLegacyToast } from "../../../legacy-verbs";
import { useReadsHere, useSurface } from "../../../use-surface";
import { broadcasts } from "../../broadcasts/verbs";
import { useCampaignsToast } from "../../home/route-toast";
import { reachOuts } from "../../reach-out/surface";
import { DraftView, type DraftReads } from "./new-draft";
import * as M from "./new-model";
import { StartView, type StartReads } from "./new-start";
import "./new.css";

/** The reads New opens on: Campaigns' moments, lists and counts, the Library (settings), and what runs. */
const READS = ["playbooks", "settings", "sequences"] as const;

/** The searches whose leads are ready, read once as New opens; null where that read failed. */
function useSources(): ReachOutSourceDto[] | null {
  const [sources, setSources] = useState<ReachOutSourceDto[] | null>(null);
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

/** What New reads, in the shapes its parts take; null until Campaigns' read is in. */
function useNewReads(
  sources: ReachOutSourceDto[] | null,
): { start: StartReads; draft: DraftReads; business: string } | null {
  useReadsHere(READS);
  const pb = useSurface("playbooks");
  const seq = useSurface("sequences");
  if (!pb) return null;
  const who = {
    moments: pb.triggers,
    lists: pb.lists.map((l) => ({
      id: l.id,
      name: l.name,
      candidates: l.candidates,
      said: l.builtin ? null : l.smart ? W.sheets.listSaid.rule : W.sheets.listSaid.hand,
    })),
    everyone: pb.pools.everyone_monthly?.candidates ?? null,
    everyoneHeld: pb.pools.everyone_monthly?.held ?? null,
    sources,
    running: seq?.sequences ?? [],
  };
  const offered = pb.templates ?? [];
  // What it can send on now; where that could not be read, WhatsApp, as every send went before a channel was read.
  const ready: ConsentChannel[] = pb.ready ? CONSENT_CHANNELS.filter((c) => pb.ready?.[c]?.ready) : ["whatsapp"];
  return {
    business: pb.businessName,
    start: {
      ...who,
      calendarOn: pb.calendar === "ok",
      word: pb.shape.word,
      messages: pb.messages ? pb.messages.length : null,
    },
    draft: {
      who,
      library: { messages: offered.flatMap((t) => (t.message ? [t.message] : [])), rows: offered },
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
type Flash = ReturnType<typeof useLegacyToast>[1];
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
  const [again] = useState(() => (who === "once" && !keptId ? (tabDraft("broadcast") as M.KeptSend | null) : null));
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
          ? M.againOf(again, library, reads.start.lists, reads.business)
          : null;
  const letGo = () => {
    setGone(true);
    if (again) keepTabDraft("broadcast", null);
  };
  return { opened, letGo };
}

/** Ask at work: a draft asked for from a line, Stop, and what came of it (a draft, a refusal, or Ask that failed). */
function useAsk(door: Fixed, flash: Flash, onDraft: (d: NewDraftDto) => void) {
  const [drafting, setDrafting] = useState<"fresh" | "again" | null>(null);
  const [failed, setFailed] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  // Each ask counted, so an answer that arrives after Stop, or after a later ask, is let go.
  const asked = useRef(0);
  const ask = async (words: string, fixed: Fixed, again: boolean) => {
    const id = ++asked.current;
    setDrafting(again ? "again" : "fresh");
    setFailed(false);
    setRefused(null);
    const r = await commitVerb("sequence_draft", { words, ...door, ...fixed });
    if (id !== asked.current) return;
    setDrafting(null);
    if (r.ok) onDraft(r.data as Output<"POST sequences/draft">);
    // Drafting it again, the draft stays as it was and what Ask said is a toast over it, whatever it was.
    else if (again) flash(refusalToast(r));
    // A draft nothing here can hold is said in Ask's words; anything else is Ask that could not answer just now.
    else if (r.status === 422) setRefused(r.message);
    else setFailed(true);
  };
  const stop = () => {
    asked.current++;
    setDrafting(null);
  };
  const clear = () => {
    setFailed(false);
    setRefused(null);
  };
  return { drafting, failed, refused, ask, stop, clear };
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

/**
 * Keep, Start, Schedule and Send: the draft made through the one door, then its record (with what it now is), Drafts for
 * a one-off kept, or Sequences with a one-off's Stop.
 */
function useMake(keptId: string | null, flash: Flash, letGo: () => void, tz: string) {
  const hosted = useCampaignsToast();
  const [busy, setBusy] = useState(false);
  const make = async (draft: NewDraftDto, start: boolean) => {
    if (!draft.who) return false;
    setBusy(true);
    const r = await commitVerb("sequence_new", M.makeBodyOf(draft, start, keptId));
    setBusy(false);
    if (!r.ok) {
      flash(refusalToast(r));
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

/** What New keeps in the tab while it holds a draft: the draft and the line, under the address it was opened on. */
interface KeptHere {
  draft: NewDraftDto | null;
  line: string | null;
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

/** New, on the moment, for whom, or on the kept one-off its address names. */
export function NewSequence({ moment = null, who = null, to = null, kept = null }: NewSequenceProps) {
  const reads = useNewReads(useSources());
  const [toast, flash] = useLegacyToast();
  const { door, seed, notice } = useDoor(moment, who, to, reads);
  // What this address held when New last closed over it, kept in the tab: the draft, and the line.
  const here = [moment, who, to, kept].map((x) => x ?? "").join("|");
  const [back] = useState(() => tabDraft("new", here) as KeptHere | null);
  const [typed, setTyped] = useState<string | null>(back?.line ?? null);
  const line = typed ?? seed;
  const [held, setDraft] = useState<NewDraftDto | null>(back?.draft ?? null);
  const { opened, letGo } = useOpenedOn(who, kept, reads);
  // Who it reaches, its twin and its checks, said again as it changes (decision 0065 step 7); what Ask answered stands.
  const recount = (prev: NewDraftDto | null, next: NewDraftDto) =>
    reads ? M.recounted(prev, next, reads.draft.recount) : next;
  const draft = shownDraftOf(held, back?.draft ?? null, opened, reads);
  const [saying, setSaying] = useState(false);
  const work = useUnsavedWork("new", here, {
    value: { draft: held, line: typed } satisfies KeptHere,
    dirty: !!held?.who,
    onLeave: () => navigate(SEQUENCES_ROUTE),
  });
  const leaving = work.asking;
  const show = (d: NewDraftDto) => {
    setDraft(d);
    setSaying(false);
    work.stay();
  };
  const asking = useAsk(door, flash, show);
  const made = useMake(kept, flash, letGo, reads?.draft.timezone ?? "UTC");
  const busy = made.busy;
  const make = async (d: NewDraftDto, start: boolean) => {
    if (await made.make(d, start)) work.done();
  };
  const may = canDo("approve");
  // What Ask is drafting it again as, while it does: the draft stands in that shape, with Undo (F1).
  const [pending, setPending] = useState<{ kind: NewKind; audience: NewAudience } | null>(null);

  const redraft = (f: { kind?: NewKind; audience?: NewAudience }) => {
    if (!draft) return;
    const kind = f.kind ?? draft.kind;
    const audience = f.audience ?? draft.audience;
    const keep = draft.who && whoSuits(draft.who, audience, kind) ? { who: draft.who } : {};
    const previous = { name: draft.name, steps: draft.steps.length };
    // By hand, the draft is built again here; Ask's is drafted again from the same line.
    if (!draft.said) {
      setDraft(recount(null, { ...M.draftByHand(kind, audience, draft.business), ...keep }));
      return;
    }
    const mine = { kind, audience };
    setPending(mine);
    void asking
      .ask(draft.said, { kind, audience, ...keep, previous }, true)
      .finally(() => setPending((p) => (p === mine ? null : p)));
  };
  const undo = () => {
    asking.stop();
    setPending(null);
  };
  const byHand = (kind?: NewKind) => {
    const d = M.draftByHand(kind ?? door.kind ?? "sequence", door.audience ?? "people", reads?.business ?? "");
    show(recount(null, door.who && whoSuits(door.who, d.audience, d.kind) ? M.setWho(d, door.who) : d));
    asking.clear();
  };
  // A kept one-off let go goes from Drafts too; any other draft was never made, so it is only let go here.
  const discard = () => {
    letGo();
    setDraft(null);
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
  const previous = draft ? { previous: { name: draft.name, steps: draft.steps.length } } : {};

  const redrafting = pending && asking.drafting === "again" ? pending : null;
  const view =
    draft && reads && !saying ? (
      <DraftView
        draft={redrafting ? M.redraftShapeOf(draft, redrafting) : draft}
        reads={reads.draft}
        busy={busy}
        doing={
          redrafting
            ? redrafting.audience !== draft.audience
              ? W.say.againFor[redrafting.audience]
              : W.say.again
            : null
        }
        redraftingFor={redrafting && redrafting.audience !== draft.audience ? redrafting.audience : null}
        leaving={
          leaving ? <LeavingAsk busy={busy} onDiscard={work.discard} onKeep={() => void make(draft, false)} /> : null
        }
        acts={{
          change: (d) => {
            setDraft(recount(draft, d));
            work.stay();
          },
          redraft,
          undo,
          // Said again from the line it was drafted from; a draft built by hand keeps the line typed before it.
          again: () => {
            if (draft.said) setTyped(draft.said);
            setSaying(true);
          },
          discard,
          make: (start) => void make(draft, start),
          close,
        }}
      />
    ) : (
      <StartView
        line={line}
        onLine={setTyped}
        onDraft={(words, fixed) => void asking.ask(words, { ...fixed, ...previous }, false)}
        drafting={asking.drafting !== null}
        onStop={asking.stop}
        failed={asking.failed}
        refused={asking.refused}
        onByHand={byHand}
        notice={notice}
        reads={reads?.start ?? null}
        may={may}
        onClose={draft ? () => setSaying(false) : close}
      />
    );
  return (
    <>
      {view}
      {toast}
    </>
  );
}
