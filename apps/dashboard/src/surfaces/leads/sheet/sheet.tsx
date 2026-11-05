/**
 * The lead sheet (the canvas "Lead sheet, redesigned", 1 Nov 2026): one question, what does this lead need from you. Who
 * they are, with the doors out to what they are and More; one card that changes with where they stand (the fit, the email
 * to OK, why one was held, what they said); and five folded lines that answer before they open, the same five on every
 * lead (Fit, Contact, Company or About, Sequence, History), nothing behind a tab. On a desk a panel beside the rows; on a
 * phone the kit's sheet with two rests, the lines under the card at half, so half is never empty, and opening one raises
 * it. The dock at its foot holds only what to press: what needs you, else the quiet ways on (Take out, asked first; your
 * call; Write to them, a step of the card sent from a mailbox or your own mail app), and no foot where nothing is left. It draws once:
 * who they are at the press, and all the rest together when the reads that decide it are in (facts.ts
 * sheetStillReading).
 *
 * Add is the one verb, the picker the one place a sequence is chosen or made (a step of this same sheet, as New is), and
 * the pick is kept on the search. Where the lead stands is the sequence's own reading (one reader, 00459 sequence_place);
 * an email is answered with the record's own answers; the sequence's name opens its record at Leads, their row lit, with
 * the way back to this lead. In a pile its line rides over the card (how far through, a meter, Undo) and its end says what
 * went where; out of one, J and K walk the rows, the line left open staying open. Over another page (a record's Leads
 * row, `?lead=`) it is the same sheet with no pile and no rows to walk (over.tsx).
 */
import { useEffect, useState } from "react";
import {
  LEAD_SHEET_WORDS as W,
  SECOND_MS,
  dockSlotsOf,
  leadPickerRowsOf,
  placeStands,
  type LeadLineId,
  type LeadPeekVM,
  type LeadPickerRowVM,
  type LeadPileEndVM,
  type LeadRowVM,
  type LeadSheetSlotVM,
} from "@chanlytics/contracts";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { useLeadEmails, useLeadPlace, useLeadWords } from "../../campaigns/sequences/place/parts";
import { useSequenceRead } from "../../campaigns/sequences/use-record";
import { pressed, sequenceVerbs as verbs } from "../../campaigns/sequences/verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { refusalToast, touchSwipe } from "../../legacy-verbs";
import { useWaitFor } from "../../use-surface";
import { LeadCallAsk, LeadPeekAsk, LeadSentAsk } from "../peek/asks";
import type { Armed, Deck, DraftState, Flash, PeekActs, PeekMode } from "../peek/types";
import { PileBulk, type PileBulkFacts } from "../pile/bulk";
import { keepPileForTheWayBack, type LeadPile } from "../pile/use-pile";
import { stopWritingTo } from "../reach-out/lines";
import { useSheetUi } from "./sheet-ui";
import { SheetDock } from "./dock";
import { emailActsOf, SheetBoxDock, useEmailBox, useSaidWords, type EmailBox } from "./email-box";
import { SheetApproveAsk, SheetLeaveAsk, SheetRewrite, SheetSaidAsk, SheetToSend, wroteActsOf } from "./dock-asks";
import { railSequenceOf, sheetFactsOf, waitingOf, type SheetFacts, type SheetPileFacts } from "./facts";
import { holdSheetKeys } from "./keys";
import { closeLeadOver } from "./lead-over";
import { SheetLines } from "./panes";
import { SheetDoors, SheetEnd, SheetMore, SheetNow, SheetProgress, SheetWho } from "./parts";
import { SheetNew, SheetPicker, type NewStart } from "./picker";
import { openRecordFor, runSheetAct, takeOut, type SheetRun } from "./run";
import type { LeadAim } from "./use-aim";
import { SheetWrite, SheetWriteDock } from "./write";

/** The pile, as the sheet draws it: its acts, its own facts, its line, its name, Add them all, and its end. */
export interface SheetPileView {
  pile: LeadPile;
  facts: SheetPileFacts;
  progress: { words: string; share: number };
  searchName: string;
  bulk: PileBulkFacts | null;
  /** Who is up now, for the line a screen reader hears after a press. */
  next: string | null;
  end: LeadPileEndVM;
}

interface LeadSheetProps {
  row: LeadRowVM | null;
  /** The lead on screen; null at a pile's end. */
  vm: LeadPeekVM | null;
  phone: boolean;
  tz: string;
  mode: PeekMode | null;
  armed: Armed | null;
  draft: DraftState | null;
  busy: boolean;
  deck: Deck | null;
  on: PeekActs | null;
  aim: LeadAim;
  pile: SheetPileView | null;
  /** The search the lead was opened in, where one is: Ask's draft for New writes from it. */
  searchId: string | null;
  flash: Flash;
  onClose: () => void;
  /** Over another page (a record's row): no pile, no rows to walk, and its record is the page under it. */
  over?: boolean;
}

/** Everything a part of the sheet draws from. */
interface SheetDraw {
  p: LeadSheetProps;
  vm: LeadPeekVM | null;
  facts: SheetFacts | null;
  sheet: ReturnType<typeof useSheetUi>;
  /** The line left open, which stays open as the rows are walked. */
  line: { open: LeadLineId | null; turn: (id: LeadLineId) => void };
  run: SheetRun | null;
  busy: { on: boolean; set: (on: boolean) => void };
  /** The sequences the picker offers, the pick first. */
  pickRows: LeadPickerRowVM[] | null;
  moved: () => void;
  box: EmailBox;
}

/* ---------------------------------------------------------------------------------------------------- the head -- */

/** The place that stands for them, where one does: Take out asks there, and Never write to them again under it. */
const standing = (facts: SheetFacts | null) =>
  facts && facts.place && placeStands(facts.place.place.group) ? facts.place : null;

/** The dock asks Take out itself (a sequence that runs and needs nothing of you), with Never write to them again under it. */
const dockLeaves = (facts: SheetFacts | null) =>
  !!facts && !!facts.dock && dockSlotsOf(facts.dock).some((s) => s.act === "leave");

/**
 * The lead's More (parts.tsx): Never write to them again where a sequence has them and the dock's Take out does not
 * already ask it (an email waiting for your OK, held, or yours to send, whose Take out leaves that email alone).
 */
function sheetMoreOf(d: SheetDraw) {
  const { vm, p, facts, sheet } = d;
  if (!vm || !p.on) return null;
  const place = facts ? facts.place : null;
  return (
    <SheetMore
      vm={vm}
      on={p.on}
      told={!!place && !place.reads_replies && place.sends.some((s) => s.sent_at)}
      never={!!place && !dockLeaves(facts)}
      flash={p.flash}
      onSaid={() => sheet.put({ ask: "said" })}
      onNever={() => sheet.put({ ask: "stop" })}
    />
  );
}

/** Who they are, with Close at the row's end on a desk. */
function sheetWhoOf(d: SheetDraw, desk: boolean) {
  const { vm, facts, p } = d;
  if (!vm || !facts) return null;
  return (
    <SheetWho
      vm={vm}
      row={p.row}
      sub={facts.sub}
      onExpand={() => p.on && p.on.onExpand()}
      onOpenPerson={(id) => p.on && p.on.onOpenPerson(id)}
      end={
        desk ? (
          <Button
            variant="quiet"
            iconOnly
            className="lw-close"
            id="lead-peek-close"
            aria-label={W.close}
            onClick={() => void d.box.leave(p.onClose)}
            data-testid="peek-close"
          >
            <Icon name="x" size={13} />
          </Button>
        ) : null
      }
    />
  );
}

/* ------------------------------------------------------------------------------------------- the card and the lines -- */

/** All of the sheet stands on its reads: until they land it says who they are and this, after a beat, or what failed. */
const sheetHeldBy = (f: SheetFacts, retry: () => void) =>
  f.reading ? (
    <div className="route-reading lw-reading" role="status" aria-busy="true" data-testid="lead-sheet-reading">
      {W.reading}
    </div>
  ) : f.unread !== null ? (
    <FailedRead
      kind="line"
      what={W.unread}
      why={f.unread || null}
      onRetry={retry}
      className="lw-reading"
      testid="lead-sheet-unread"
    />
  ) : null;

/** The top of the sheet: who, the doors, the one card. */
function topOf(d: SheetDraw, desk: boolean) {
  const { facts, vm, p, sheet } = d;
  if (!facts || !vm) return null;
  const dockCalls = !!facts.dock && dockSlotsOf(facts.dock).some((s) => s.act === "call");
  return (
    <article key={vm.id} className="lw-card-w lw-turn" aria-label={vm.name} data-testid="lead-pile-lead">
      {sheetWhoOf(d, desk)}
      {sheetHeldBy(facts, d.moved) ?? (
        <div className="lw-read">
          <SheetDoors vm={vm} callDoor={!dockCalls} onCall={() => p.on && p.on.onCall(vm.id)} more={sheetMoreOf(d)} />
          <SheetNow
            now={facts.now}
            whole={sheet.ui.whole}
            onWhole={() => sheet.put({ whole: !sheet.ui.whole })}
            {...emailActsOf({ run: d.run, facts, sheet, flash: p.flash, moved: d.moved, box: d.box })}
          />
        </div>
      )}
    </article>
  );
}

/** The five lines. */
function sheetLines(d: SheetDraw) {
  const { facts, vm, p, sheet } = d;
  if (!facts || !vm || !p.on || facts.reading || facts.unread !== null) return null;
  const run = d.run;
  return (
    <SheetLines
      vm={vm}
      facts={facts}
      on={p.on}
      open={d.line.open}
      onOpen={d.line.turn}
      seq={{
        onOpenRecord: (id) => openSequence(d, id),
        onTakeOut: facts.place && run ? run.askLeave : null,
        onOpenStep: (place) => sheet.put({ openStep: sheet.ui.openStep === place ? null : place }),
        openStep: sheet.ui.openStep,
        box: d.box,
        busy: d.busy.on,
      }}
    />
  );
}

/** The sequence's record, at Leads with their row lit: over a record, the record under it; else a trip with the way back. */
function openSequence(d: SheetDraw, id: string) {
  const { vm, p } = d;
  if (!vm) return;
  if (p.over) {
    closeLeadOver();
    return;
  }
  openRecordFor({ leadId: vm.id, name: vm.name, row: p.row }, id);
}

/** Take out of the sequence their place stands in: its leave verb, then their place read again. */
function takeOutNow(d: SheetDraw) {
  const { facts, vm, p } = d;
  if (!facts || !vm || !facts.place) return;
  d.busy.set(true);
  void takeOut({ leadId: vm.id, name: vm.name, place: facts.place, flash: p.flash, moved: d.moved }).finally(() =>
    d.busy.set(false),
  );
}

/* ----------------------------------------------------------------------------------------- the picker and New -- */

/** The picker: Add goes there, and it becomes the pick; in a pile, the pile's add, which moves to the next. */
async function pickAndAdd(d: SheetDraw, row: LeadPickerRowVM) {
  const { vm, p } = d;
  if (!vm) return;
  d.busy.set(true);
  try {
    p.aim.choose(row.id);
    const pile = p.pile ? p.pile.pile : null;
    if (pile && pile.on && p.row) await pile.act(p.row, "add", undefined, { rootId: row.id, name: row.name });
    else
      await pressed(
        "sequence_add",
        { sequence_id: row.id, lead_ids: [vm.id], name: row.name, lead_name: vm.name, draft: row.state === "draft" },
        p.flash,
        d.moved,
      );
    d.sheet.put({ step: "card" });
  } finally {
    d.busy.set(false);
  }
}

/**
 * Ask's draft of the emails, from New's one engine (the workspace's goal, the lead's search): its steps and what Ask
 * drafted, which the make keeps beside them (decision 0078 step 2), or a refusal said.
 */
async function askDraft(d: SheetDraw, name: string) {
  if (!d.vm) return null;
  const r = await reachOuts.draftLeads({ name, lead_ids: [d.vm.id], search_name: d.p.row?.searchName ?? null });
  if (!r.ok) {
    d.p.flash(refusalToast(r, "Ask could not write a draft"));
    return null;
  }
  return r.data;
}

/** New: a draft by name, made with the lead in it, the pick from now; in a pile, on to the next. */
async function makeAndAdd(d: SheetDraw, name: string, start: NewStart) {
  const { vm, p } = d;
  if (!vm) return;
  d.busy.set(true);
  try {
    const asked = start.kind === "ask" ? await askDraft(d, name) : null;
    if (start.kind === "ask" && !asked) return;
    const first = {
      starts: "leads",
      name,
      lead_ids: [vm.id],
      ...(start.kind === "copy" ? { from: start.from } : {}),
      ...(asked ? { steps: asked.steps, as_drafted: asked.as_drafted } : {}),
      ...(p.searchId ? { aim_search_id: p.searchId } : {}),
    };
    const r = await commitVerb("sequence_make", { first, start: false, lead_name: vm.name });
    if (!r.ok) return p.flash(refusalToast(r));
    const made = r.made;
    p.flash({ tone: "ok", msg: r.receipt });
    if (made) p.aim.choose(made);
    const pile = p.pile ? p.pile.pile : null;
    if (pile && pile.on && p.row) pile.skip(p.row);
    d.sheet.put({ step: "card" });
    d.moved();
  } finally {
    d.busy.set(false);
  }
}

/** The dry answer for this lead, said once in the picker: it can join any of them, or why it cannot. */
const canJoinOf = (d: SheetDraw): string | null => {
  const { facts, vm } = d;
  if (!facts || !vm) return null;
  if (facts.card.email && facts.card.email.blocked) return facts.card.email.blocked;
  return facts.state === "ready" || facts.state === "gap" || facts.state === "finding"
    ? W.picker.canJoin(vm.short)
    : null;
};

/** The name New opens with: the search's, unless a sequence to leads has it already. */
const suggestOf = (search: string | null, rows: readonly LeadPickerRowVM[] | null): string | null => {
  const name = search?.trim() ?? "";
  if (!name) return null;
  return (rows ?? []).some((r) => r.name.trim().toLowerCase() === name.toLowerCase()) ? null : name;
};

/** One email instead of a sequence: the picker gives way to the draft, a step of the card. */
function writeFromPicker(d: SheetDraw, run: SheetRun) {
  d.sheet.put({ step: "card" });
  void runSheetAct({ act: "write" }, run);
}

/** The step open: the picker, New, or the card. */
function sheetStepOf(d: SheetDraw) {
  const { vm, sheet, pickRows, run } = d;
  if (!vm) return null;
  if (sheet.ui.step === "picker")
    return (
      <SheetPicker
        who={{ name: vm.short }}
        rows={pickRows}
        canJoin={canJoinOf(d)}
        busy={d.busy.on}
        onPick={(row) => void pickAndAdd(d, row)}
        onNew={() => sheet.put({ step: "new" })}
        onWrite={d.facts && d.facts.canWrite && run ? () => writeFromPicker(d, run) : null}
        onBack={() => sheet.put({ step: "card" })}
      />
    );
  if (sheet.ui.step === "new")
    return (
      <SheetNew
        who={{ name: vm.short }}
        copies={pickRows ?? []}
        canAsk={!!d.p.searchId}
        suggest={suggestOf(d.p.row?.searchName ?? null, pickRows)}
        busy={d.busy.on}
        drafting={false}
        onCreate={(name, start) => void makeAndAdd(d, name, start)}
        onBack={() => sheet.put({ step: "picker" })}
      />
    );
  return null;
}

/* --------------------------------------------------------------------------------------------- the asks and dock -- */

/** What an email of your own sets off: Take out asked while their sequence stands, its Undo taking that back. */
const wroteOf = (d: SheetDraw) => ({
  stands: !!standing(d.facts),
  ask: () => d.sheet.put({ ask: "leave", wrote: true }),
  unask: () => d.sheet.put({ ask: null, wrote: false }),
  moved: d.moved,
});

/**
 * What the sheet asks over the card: whether to erase, how the call went, whether the draft was sent. An email sent then
 * asks Take out where a sequence would write on (wroteActsOf).
 */
function asksOf(d: SheetDraw) {
  const { p, vm } = d;
  if (!vm || !p.on) return null;
  const a = p.armed;
  const on = wroteActsOf(p.on, wroteOf(d));
  const ask =
    p.mode === "erase" || p.mode === "erasing" ? (
      <LeadPeekAsk vm={vm} mode={p.mode} busy={p.busy} on={on} />
    ) : a && a.asked && a.leadId === vm.id && a.kind === "call" ? (
      <LeadCallAsk armed={a} busy={p.busy} on={on} deck={p.deck} />
    ) : a && a.asked && a.leadId === vm.id && a.kind === "sent" ? (
      <LeadSentAsk busy={p.busy} on={on} />
    ) : null;
  return ask ? (
    <div className="lw-ask" ref={askInView}>
      {ask}
    </div>
  ) : null;
}

/** A question comes into view once, as it is asked, wherever the sheet was left scrolled. */
const askInView = (el: HTMLDivElement | null) => {
  if (!el || el.dataset.shown) return;
  el.dataset.shown = "1";
  if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
};

/**
 * The dock, or what it asks in its place: They wrote back…, Take out, Never write to them again, what should change;
 * while an email of your own is written, its mail app.
 */
function dockOf(d: SheetDraw, desk: boolean) {
  const { p, vm, facts, sheet } = d;
  const pile = p.pile ? p.pile.pile : null;
  const busy = p.busy || d.busy.on || !!(pile && pile.busy);
  if (!vm || !facts || sheet.ui.step !== "card") return null;
  if (d.box.typing) return <SheetBoxDock box={d.box} run={d.run} flash={p.flash} moved={d.moved} />;
  if (p.mode === "draft" && p.on)
    return <SheetWriteDock vm={vm} draft={p.draft} busy={busy} on={wroteActsOf(p.on, wroteOf(d))} />;
  const stands = standing(facts);
  if (sheet.ui.ask === "leave" && stands)
    return (
      <SheetLeaveAsk
        vm={vm}
        place={stands}
        wrote={sheet.ui.wrote}
        busy={busy}
        onYes={() => {
          sheet.put({ ask: null, wrote: false });
          takeOutNow(d);
        }}
        onNever={() => sheet.put({ ask: "stop", wrote: false })}
        onNo={() => sheet.put({ ask: null, wrote: false })}
      />
    );
  if (sheet.ui.ask === "said")
    return (
      <SheetSaidAsk vm={vm} flash={p.flash} moved={d.moved} busy={d.busy} onBack={() => sheet.put({ ask: null })} />
    );
  const row = facts.place ? facts.place.place : null;
  if (sheet.ui.ask === "rewrite" && row && row.send_id)
    return <SheetRewrite row={row} name={vm.name} flash={p.flash} moved={d.moved} put={sheet.put} />;
  if (sheet.ui.ask === "approve" && d.run && facts.place && facts.place.place.batch_id)
    return (
      <SheetApproveAsk
        run={d.run}
        waiting={facts.waiting}
        at={{ sequenceId: facts.place.sequence.id, runId: facts.place.place.batch_id }}
        busy={d.busy}
        onClose={() => sheet.put({ ask: null })}
      />
    );
  if (sheet.ui.ask === "stop") {
    const SW = reachOuts.words.REACH_OUT_STOP_WORDS;
    return (
      <Confirm
        question={SW.ask(vm.name)}
        detail={SW.detail}
        yes={SW.yes}
        danger
        busy={busy}
        onYes={() => {
          sheet.put({ ask: null });
          void stopWritingTo(vm.id, vm.name, p.flash).then(d.moved);
        }}
        onNo={() => sheet.put({ ask: null })}
        testid="lead-sheet-stop"
      />
    );
  }
  const dock = facts.dock;
  if (!dock) return null;
  return (
    <SheetDock
      dock={dock}
      busy={busy}
      onRun={(s: LeadSheetSlotVM) => d.run && !s.off && void runSheetAct(s, d.run)}
      onPick={() => sheet.put({ step: "picker", full: true })}
      phone={!desk}
      toSend={
        dock.toSend ? <SheetToSend vm={vm} flash={p.flash} moved={d.moved} place={facts.place} tz={p.tz} /> : null
      }
    />
  );
}

/** The pile's line, a polite live region: what was done, and who is up now or that it was the last. */
const sheetSaidOf = (pile: SheetPileView | null) =>
  pile ? (
    <p className="lw-said" role="status" aria-live="polite" data-testid="lead-pile-said">
      {pile.pile.said ? `${pile.pile.said} · ${pile.next ? `Next: ${pile.next}` : "That was the last one."}` : null}
    </p>
  ) : null;

/** The pile's progress over the card, with Undo and Add them all. */
const progressOf = (pile: SheetPileView | null) =>
  pile ? (
    <SheetProgress
      words={pile.progress.words}
      share={pile.progress.share}
      undo={
        pile.pile.canUndo
          ? { what: pile.pile.undoWords || null, go: () => void pile.pile.undo(), busy: pile.pile.busy }
          : null
      }
      extra={pile.bulk ? <PileBulk bulk={pile.bulk} busy={pile.pile.busy} /> : null}
    />
  ) : null;

/** A row of the pile's end pressed: Write the emails (the draft's record), Approve N in place, or Go through them. */
async function endAct(d: SheetDraw, row: LeadPileEndVM["rows"][number]) {
  const act = row.act;
  const pile = d.p.pile;
  if (!act || !pile) return;
  if (act.kind === "later") return pile.pile.setPass("later");
  if (act.kind === "approve" && act.batchId) {
    d.busy.set(true);
    await pressed("run", { broadcast_id: act.batchId, verb: "approve", name: row.words }, d.p.flash, d.moved).finally(
      () => d.busy.set(false),
    );
  }
}

/** The pile's end, and the press under it: Write the emails in Sequences, into the draft's record and back. */
function pileEndDrawnOf(d: SheetDraw) {
  const pile = d.p.pile;
  if (!pile) return null;
  const end = pile.end;
  return (
    <>
      <SheetEnd end={end} busy={d.busy.on} onAct={(r) => void endAct(d, r)} />
      {end.primary ? (
        <div className="lw-end-go">
          <Button
            variant="primary"
            onClick={() => {
              const id = end.primary ? end.primary.sequenceId : null;
              if (!id) return;
              // The pile stays as it is: the record's way back returns to its end (use-pile.ts keeps it once).
              keepPileForTheWayBack();
              openRecordFor({ leadId: "", name: "", row: null }, id, "steps");
            }}
            data-testid="lead-pile-end-write"
          >
            {end.primary.label}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------------------------------------- the layouts -- */

/** The body: a step of the sheet, the draft for their own inbox, or who they are, the one card and the five lines. */
function sheetBodyOf(d: SheetDraw, desk: boolean) {
  const { p, vm } = d;
  if (!vm) return p.pile ? pileEndDrawnOf(d) : null;
  const step = sheetStepOf(d);
  if (step) return step;
  if (p.mode === "draft" && p.on) return <SheetWrite vm={vm} draft={p.draft} busy={p.busy} on={p.on} />;
  return (
    <>
      {topOf(d, desk)}
      {sheetLines(d)}
    </>
  );
}

/**
 * The foot: the dock and the pile's line. None at all where neither has anything to say, an empty line above all: a
 * phone's foot is a capsule with or without words in it. The line then waits in the body (sayingInBody).
 */
function footOf(d: SheetDraw, desk: boolean) {
  const dock = dockOf(d, desk);
  const pile = d.p.pile;
  return dock || (pile && pile.pile.said) ? (
    <>
      {dock}
      {sheetSaidOf(pile)}
    </>
  ) : null;
}

/** With no foot, the pile's live region in the body, taking no room: a region has to be there before it speaks. */
const sayingInBody = (d: SheetDraw, foot: unknown) => (foot ? null : sheetSaidOf(d.p.pile));

/** On a desk: a panel beside the rows, one scroll, the dock at its foot. */
function deskOf(d: SheetDraw) {
  const foot = footOf(d, true);
  return (
    <aside
      className="lw lw-desk pl-peek"
      role="dialog"
      aria-label={d.vm ? d.vm.name : d.p.pile ? d.p.pile.searchName : W.label}
      data-testid="lead-peek"
    >
      {progressOf(d.p.pile)}
      <div className="lw-scroll" key={d.vm ? d.vm.id : "end"} data-testid="peek-body">
        {asksOf(d)}
        {sheetBodyOf(d, true)}
        {sayingInBody(d, foot)}
      </div>
      {foot ? <div className="lw-foot">{foot}</div> : null}
    </aside>
  );
}

/** On a phone: the kit's sheet with two rests over the rows, the dock held still at its foot. */
function phoneOf(d: SheetDraw) {
  const { p, vm, sheet } = d;
  // Out of a pile a sideways swipe walks the rows; in one, it walks the pile (the canvas: ‹ › became a swipe).
  const walk = p.deck && !p.pile ? p.deck : null;
  const pileRow = p.pile && p.row ? p.row : null;
  const swipe = d.box.typing
    ? {}
    : walk
      ? touchSwipe({ onLeft: walk.onNext, onRight: walk.onPrev, onDown: null })
      : pileRow && p.pile
        ? touchSwipe({ onLeft: () => p.pile && p.pile.pile.skip(pileRow), onRight: null, onDown: null })
        : {};
  // A line opened raises the sheet, as a step does and an email being written; let down to half, what was open shuts.
  const raised = !!vm && (sheet.ui.full || sheet.ui.step !== "card" || p.mode === "draft" || d.line.open !== null);
  const foot = footOf(d, false);
  const onRest = (at: "half" | "full") => {
    sheet.put({ full: at === "full" });
    if (at === "half" && d.line.open) d.line.turn(d.line.open);
  };
  return (
    <Sheet
      open
      onClose={() => void d.box.leave(p.onClose)}
      title={p.pile ? p.pile.searchName : p.row ? p.row.searchName : W.label}
      kicker
      close={{ label: W.close, glyph: <Icon name="x" size={13} /> }}
      rest={{
        at: raised ? "full" : "half",
        onRest,
        turn: { up: W.raise, down: W.lower },
      }}
      foot={foot}
      className="lw lw-phone"
      testid="lead-peek"
    >
      {p.pile ? <span className="lw-edges" aria-hidden="true" /> : null}
      <div className="lw-in">
        {progressOf(p.pile)}
        <div className="lw-body" key={vm ? vm.id : "end"} {...swipe}>
          {asksOf(d)}
          {sheetBodyOf(d, false)}
          {sayingInBody(d, foot)}
        </div>
      </div>
    </Sheet>
  );
}

/**
 * The line left open: the one pressed, which stays as the rows are walked; until one is pressed, Fit, where a check failed
 * on a lead to decide on. A line opens by itself for a problem alone.
 */
function useLine(facts: SheetFacts | null) {
  const [pressed_, press] = useState<{ open: LeadLineId | null } | null>(null);
  const failed = !!facts && !facts.place && !!facts.why && facts.why.failed;
  const open = pressed_ ? pressed_.open : failed ? ("fit" as const) : null;
  return { open, turn: (id: LeadLineId) => press({ open: open === id ? null : id }) };
}

/** How often their place is read again while their line is being written: the check's clock runs every minute. */
const LINE_READ_MS = 15 * SECOND_MS;

/** The sheet: one lead, a desk's panel or a phone's sheet. */
export function LeadSheet(p: LeadSheetProps) {
  const vm = p.vm;
  const leadId = vm ? vm.id : null;
  const [again, setAgain] = useState(0);
  const moved = () => setAgain((n) => n + 1);
  const [lineRead, setLineRead] = useState(0);
  const place = useLeadPlace(leadId, again + lineRead);
  const written = useLeadEmails(leadId, again);
  const ownWords = useLeadWords(leadId, again);
  const { emails, say } = useSaidWords(leadId, {
    read: written.read && ownWords.read,
    list: written.list,
    words: ownWords.words,
    wordsRead: ownWords.wordsRead,
  });
  const sheet = useSheetUi(leadId);
  const box = useEmailBox({
    leadId,
    flash: p.flash,
    moved,
    open: () => sheet.put({ whole: true, full: true }),
    said: say,
  });
  const [busyOn, setBusy] = useState(false);
  const aim = p.aim;
  const railId = railSequenceOf({ place, aim });
  const rec = useSequenceRead(railId, verbs.record, verbs.peekRecord, { again });
  const railRecord = rec.state === "read" ? rec.data : null;
  // The add door is asked about this lead for the pick while its answer is owed: once, whoever asks first (use-aim.ts).
  const pickId = aim.target ? aim.target.rootId : null;
  const doorOwes = !!leadId && aim.checking(leadId);
  useEffect(() => {
    if (leadId && doorOwes) void aim.check([leadId]);
  }, [leadId, pickId, doorOwes]); // eslint-disable-line react-hooks/exhaustive-deps
  const facts = vm
    ? sheetFactsOf(
        {
          row: p.row,
          vm,
          tz: p.tz,
          aim,
          place,
          emails,
          railRecord,
          railReading: !!railId && rec.state === "reading",
          waiting: waitingOf(railRecord, place.place ? place.place.place.batch_id : null),
          pile: p.pile ? p.pile.facts : null,
          // Over a record the lead has no draft of its own: Write stays on Leads.
          writes: !p.over && !!p.on,
        },
        Date.now(),
      )
    : null;
  // Where a line lands is their place alone, read at the one wait's pace; never under what is being typed.
  useWaitFor(!!facts && !!facts.mail && facts.mail.writing && !box.typing, {
    everyMs: LINE_READ_MS,
    read: () => setLineRead((n) => n + 1),
  });
  const run: SheetRun | null = vm
    ? {
        row: p.row,
        leadId: vm.id,
        name: vm.name,
        contactId: vm.contactId,
        on: p.on,
        pile: p.pile ? p.pile.pile : null,
        aim,
        flash: p.flash,
        place: facts ? facts.place : null,
        elsewhere: facts ? facts.elsewhere : null,
        next: p.deck ? p.deck.onNext : null,
        openPicker: () => sheet.put({ step: "picker", full: true }),
        askSaid: () => sheet.put({ ask: "said" }),
        askRewrite: () => sheet.put({ ask: "rewrite" }),
        askLeave: () => sheet.put({ ask: "leave", wrote: false }),
        // A batch of more than this one email asks before it goes; a batch of one goes on the press, its email above it.
        askApprove: facts && facts.waiting && facts.waiting.ready > 1 ? () => sheet.put({ ask: "approve" }) : null,
        moved,
        over: !!p.over,
      }
    : null;
  const pickRows = aim.targets ? leadPickerRowsOf(aim.targets, pickId) : null;
  const line = useLine(facts);
  const d: SheetDraw = { p, vm, facts, sheet, line, run, busy: { on: busyOn, set: setBusy }, pickRows, moved, box };
  // The dock's keys in a pile: a key does what the press in that place does; ⇧A opens the picker.
  useEffect(() => {
    const dock = facts ? facts.dock : null;
    holdSheetKeys(
      p.pile && dock && run && sheet.ui.step === "card" && !sheet.ui.ask && p.mode !== "draft"
        ? (key) => {
            if (key === "A") return sheet.put({ step: "picker", full: true });
            if (key === "n" && dock.x) return void runSheetAct({ act: "not_a_fit" }, run);
            if (key === "l" && dock.later) return void runSheetAct({ act: "later" }, run);
            const s = dockSlotsOf(dock).find((x) => x.key === key);
            if (s && !s.off) void runSheetAct(s, run);
          }
        : null,
    );
    return () => holdSheetKeys(null);
  });
  return p.phone ? phoneOf(d) : deskOf(d);
}
