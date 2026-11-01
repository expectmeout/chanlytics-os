/**
 * The lead sheet (the canvas "Lead sheet, redesigned", 1 Nov 2026): one question, what does this lead need from you. Who
 * they are, with the doors out to what they are and More; one card that changes with where they stand (the fit, the email
 * to OK, why one was held, what they said); and five folded lines that answer before they open, the same five on every
 * lead (Fit, Contact, Company or About, Sequence, History), nothing behind a tab. On a desk a panel beside the rows; on a
 * phone the kit's sheet with two rests, the lines under the card at half, so half is never empty, and opening one raises
 * it. The dock at its foot holds only what to press, and where nothing needs you there is no foot at all.
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
  dockSlotsOf,
  leadPickerRowsOf,
  type LeadLineId,
  type LeadPeekVM,
  type LeadPickerRowVM,
  type LeadPileEndVM,
  type LeadRowVM,
  type LeadSheetSlotVM,
  type SequenceRecordDto,
} from "@chanlytics/contracts";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { useLeadPlace } from "../../campaigns/sequences/place/parts";
import { useSequenceRead } from "../../campaigns/sequences/use-record";
import { pressed, sequenceVerbs as verbs } from "../../campaigns/sequences/verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { Sheet } from "../../kit/sheet/sheet";
import { refusalToast, touchSwipe } from "../../legacy-verbs";
import { MenuInPlace, menuGroups, type PeopleMenuItem } from "../../people/menu-groups";
import { LeadCallAsk, LeadPeekAsk, LeadSentAsk } from "../peek/asks";
import { LeadDraftPane } from "../peek/draft-pane";
import type { Armed, Deck, DraftState, Flash, PeekActs, PeekMode } from "../peek/types";
import { PileBulk, type PileBulkFacts } from "../pile/bulk";
import { keepPileForTheWayBack, type LeadPile } from "../pile/use-pile";
import { stopWritingTo } from "../reach-out/lines";
import { SheetDock } from "./dock";
import { SheetSaidAsk, SheetToSend } from "./dock-asks";
import { railSequenceOf, sheetFactsOf, type SheetFacts, type SheetPileFacts } from "./facts";
import { holdSheetKeys } from "./keys";
import { closeLeadOver } from "./lead-over";
import { SheetLines } from "./panes";
import { SheetDoors, SheetEnd, SheetNow, SheetProgress, SheetWho } from "./parts";
import { SheetNew, SheetPicker, type NewStart } from "./picker";
import { decideEmail, openRecordFor, runSheetAct, takeOut, type SheetRun } from "./run";
import type { LeadAim } from "./use-aim";

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

/** Which step of the sheet is open, and what the dock asks in its place. */
type SheetStep = "card" | "picker" | "new";
type DockAsk = null | "said" | "stop";

/** What the sheet holds for the lead on screen, as it was left for that lead and none other. */
interface SheetUiState {
  lead: string | null;
  step: SheetStep;
  full: boolean;
  ask: DockAsk;
  /** A step of the Sequence line opened: the email as they get it. */
  openStep: number | null;
  /** The card's email asked for whole. */
  whole: boolean;
}

const FRESH = { step: "card" as SheetStep, full: false, ask: null as DockAsk, openStep: null, whole: false };

/** The sheet's own state: a decision turns the card, and the next lead comes up at half, its email cut short. */
function useSheetUi(leadId: string | null) {
  const [held, setHeld] = useState<SheetUiState>({ lead: leadId, ...FRESH });
  const ui = held.lead === leadId ? held : { lead: leadId, ...FRESH };
  const put = (next: Partial<SheetUiState>) => setHeld({ ...ui, ...next });
  return { ui, put };
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
}

/* ---------------------------------------------------------------------------------------------------- the head -- */

/** What is known of them, as text to paste elsewhere: the name, where, the phone, the email and the site. */
const allOf = (vm: LeadPeekVM) =>
  [
    vm.name,
    vm.sub,
    vm.where ? vm.where.line : null,
    vm.reach.phone ? vm.reach.phone.value : null,
    vm.reach.email.address,
    vm.links.website ? vm.links.website.href : null,
  ]
    .filter(Boolean)
    .join("\n");

/**
 * The lead's More, its rare acts behind one labelled caret (Ruben, 20 Oct 2026: no three dots): They wrote back… (an email
 * sent by hand, where no mailbox is read), Copy details, Never write to them again (every sequence), and what contracts'
 * leadPeekMenu offers this member (Erase, the owner's).
 */
function sheetMoreOf(d: SheetDraw) {
  const { vm, p, facts, sheet } = d;
  if (!vm || !p.on) return null;
  const on = p.on;
  const place = facts ? facts.place : null;
  const told = !!place && !place.reads_replies && place.sends.some((s) => s.sent_at);
  const items: PeopleMenuItem[] = [
    ...(told ? [{ label: W.menu.theyWrote, icon: "chat", onClick: () => sheet.put({ ask: "said" }) }] : []),
    {
      label: W.menu.copy,
      icon: "copy",
      onClick: () => {
        void navigator.clipboard?.writeText(allOf(vm)).then(() => p.flash({ tone: "ok", msg: W.menu.copied }));
      },
    },
    ...(place
      ? [{ label: W.menu.never, title: W.menu.neverHint, icon: "stop", onClick: () => sheet.put({ ask: "stop" }) }]
      : []),
    ...(on.menu ?? []).map((m) => ({
      label: m.id === "erase" ? W.menu.erase : m.label,
      icon: "x",
      danger: m.danger,
      onClick: m.id === "erase" ? on.onEraseAsk : undefined,
    })),
  ];
  return (
    <MenuInPlace>
      <Menu
        label={W.moreOf}
        trigger={
          <Button variant="secondary" size="sm" aria-label={W.moreOf} data-testid="peek-more">
            {W.more}
            <Icon name="chevron-down" size={11} />
          </Button>
        }
        groups={menuGroups(items)}
      />
    </MenuInPlace>
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
            onClick={p.onClose}
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

/** Rewrite the opening, under the email it is of: the decide verb's own door. */
function rewriteOf(d: SheetDraw) {
  const { run, facts, sheet } = d;
  if (!run || !facts || !facts.mail || !facts.mail.rewrite) return null;
  return () => {
    sheet.put({ whole: false });
    void decideEmail(run, "rewrite");
  };
}

/** The top of the sheet: who, the doors, the one card. */
function topOf(d: SheetDraw, desk: boolean) {
  const { facts, vm, p, sheet } = d;
  if (!facts || !vm) return null;
  const dockCalls = !!facts.dock && !!facts.dock.primary && facts.dock.primary.act === "call";
  return (
    <article key={vm.id} className="lw-card-w lw-turn" aria-label={vm.name} data-testid="lead-pile-lead">
      {sheetWhoOf(d, desk)}
      <SheetDoors vm={vm} callDoor={!dockCalls} onCall={() => p.on && p.on.onCall(vm.id)} more={sheetMoreOf(d)} />
      <SheetNow
        now={facts.now}
        mail={facts.mail}
        whole={sheet.ui.whole}
        onWhole={() => sheet.put({ whole: !sheet.ui.whole })}
        onRewrite={rewriteOf(d)}
      />
    </article>
  );
}

/** The five lines. */
function linesOf(d: SheetDraw) {
  const { facts, vm, p, sheet } = d;
  if (!facts || !vm || !p.on) return null;
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
        onTakeOut: facts.place && run ? () => void takeOutNow(d) : null,
        onOpenStep: (place) => sheet.put({ openStep: sheet.ui.openStep === place ? null : place }),
        openStep: sheet.ui.openStep,
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

/** The step open: the picker, New, or the card. */
function sheetStepOf(d: SheetDraw) {
  const { vm, sheet, pickRows } = d;
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

/** What the sheet asks over the card: whether to erase, how the call went, whether the draft was sent. */
function asksOf(d: SheetDraw) {
  const { p, vm } = d;
  if (!vm || !p.on) return null;
  const a = p.armed;
  const ask =
    p.mode === "erase" || p.mode === "erasing" ? (
      <LeadPeekAsk vm={vm} mode={p.mode} busy={p.busy} on={p.on} />
    ) : a && a.asked && a.leadId === vm.id && a.kind === "call" ? (
      <LeadCallAsk armed={a} busy={p.busy} on={p.on} deck={p.deck} />
    ) : a && a.asked && a.leadId === vm.id && a.kind === "sent" ? (
      <LeadSentAsk busy={p.busy} on={p.on} />
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

/** The dock, or what it asks in its place: They wrote back…, Never write to them again. */
function dockOf(d: SheetDraw, desk: boolean) {
  const { p, vm, facts, sheet } = d;
  const pile = p.pile ? p.pile.pile : null;
  const busy = p.busy || d.busy.on || !!(pile && pile.busy);
  if (!vm || !facts || sheet.ui.step !== "card") return null;
  if (sheet.ui.ask === "said")
    return (
      <SheetSaidAsk vm={vm} flash={p.flash} moved={d.moved} busy={d.busy} onBack={() => sheet.put({ ask: null })} />
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
  const keys = !desk ? null : pile && pile.on ? "pile" : p.deck ? "rows" : null;
  return (
    <SheetDock
      dock={dock}
      busy={busy}
      onRun={(s: LeadSheetSlotVM) => d.run && !s.off && void runSheetAct(s, d.run)}
      onPick={() => sheet.put({ step: "picker", full: true })}
      keys={keys}
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
  if (p.mode === "draft" && p.on) return <LeadDraftPane vm={vm} draft={p.draft} busy={p.busy} on={p.on} />;
  return (
    <>
      {topOf(d, desk)}
      {linesOf(d)}
    </>
  );
}

/** The foot: the dock and the pile's line. None at all where neither has anything to say. */
function footOf(d: SheetDraw, desk: boolean) {
  const dock = dockOf(d, desk);
  const said = d.p.pile ? sheetSaidOf(d.p.pile) : null;
  return dock || said ? (
    <>
      {dock}
      {said}
    </>
  ) : null;
}

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
  const swipe = walk
    ? touchSwipe({ onLeft: walk.onNext, onRight: walk.onPrev, onDown: null })
    : pileRow && p.pile
      ? touchSwipe({ onLeft: () => p.pile && p.pile.pile.skip(pileRow), onRight: null, onDown: null })
      : {};
  // A line opened raises the sheet; let down to half, what was open shuts.
  const raised = !!vm && (sheet.ui.full || sheet.ui.step !== "card" || d.line.open !== null);
  const onRest = (at: "half" | "full") => {
    sheet.put({ full: at === "full" });
    if (at === "half" && d.line.open) d.line.turn(d.line.open);
  };
  return (
    <Sheet
      open
      onClose={p.onClose}
      title={p.pile ? p.pile.searchName : p.row ? p.row.searchName : W.label}
      kicker
      close={{ label: W.close, glyph: <Icon name="x" size={13} /> }}
      rest={{
        at: raised ? "full" : "half",
        onRest,
        turn: { up: W.raise, down: W.lower },
      }}
      foot={footOf(d, false)}
      className="lw lw-phone"
      testid="lead-peek"
    >
      {p.pile ? <span className="lw-edges" aria-hidden="true" /> : null}
      <div className="lw-in">
        {progressOf(p.pile)}
        <div className="lw-body" key={vm ? vm.id : "end"} {...swipe}>
          {asksOf(d)}
          {sheetBodyOf(d, false)}
        </div>
      </div>
    </Sheet>
  );
}

/** How many an OK sends in the batch the lead's step waits in, by the record's needs (held emails left out). */
const batchOf = (rec: SequenceRecordDto | null, batchId: string | null): number | undefined => {
  if (!rec || !batchId) return undefined;
  const b = rec.sequence.needs.batches.find((x) => x.id === batchId);
  return b ? b.people : undefined;
};

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

/** The sheet: one lead, a desk's panel or a phone's sheet. */
export function LeadSheet(p: LeadSheetProps) {
  const vm = p.vm;
  const leadId = vm ? vm.id : null;
  const [again, setAgain] = useState(0);
  const moved = () => setAgain((n) => n + 1);
  const place = useLeadPlace(leadId, again);
  const sheet = useSheetUi(leadId);
  const [busyOn, setBusy] = useState(false);
  const aim = p.aim;
  const railId = railSequenceOf({ place, aim });
  const rec = useSequenceRead(railId, verbs.record, verbs.peekRecord, { again });
  const railRecord = rec.state === "read" ? rec.data : null;
  // Out of a pile, the add door is asked about this lead for the pick.
  const pickId = aim.target ? aim.target.rootId : null;
  useEffect(() => {
    if (leadId && pickId && !p.pile) void aim.check([leadId]);
  }, [leadId, pickId]); // eslint-disable-line react-hooks/exhaustive-deps
  const facts = vm
    ? sheetFactsOf(
        {
          row: p.row,
          vm,
          tz: p.tz,
          aim,
          place,
          railRecord,
          batch: batchOf(railRecord, place.place ? place.place.place.batch_id : null),
          pile: p.pile ? p.pile.facts : null,
        },
        Date.now(),
      )
    : null;
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
        moved,
        over: !!p.over,
      }
    : null;
  const pickRows = aim.targets ? leadPickerRowsOf(aim.targets, pickId) : null;
  const line = useLine(facts);
  const d: SheetDraw = { p, vm, facts, sheet, line, run, busy: { on: busyOn, set: setBusy }, pickRows, moved };
  // The dock's keys in a pile: a key does what the press in that place does; ⇧A opens the picker.
  useEffect(() => {
    const dock = facts ? facts.dock : null;
    holdSheetKeys(
      p.pile && dock && run && sheet.ui.step === "card" && !sheet.ui.ask
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
