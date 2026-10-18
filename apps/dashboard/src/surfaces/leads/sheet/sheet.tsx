/**
 * The lead sheet (canvas B v2, "The Workbench", 16 Oct 2026; the refined canvas, 17 Oct 2026: in Sequences' words): one
 * lead, the panel of every lead opened on Leads, in a pile and out of one. On a desk a panel beside the rows: the card to
 * decide on, then its three tabs (Why, Contact, Sequence) under it, and the dock at its foot. On a phone the kit's sheet
 * with two rests over the rows: the card at half height, the tabs at full (the handle, a drag, or Enter), the dock held
 * still at its foot on both. In a pile its line rides over the card (how far through, a meter, Undo) and its end says
 * what happened; out of one, Next walks the rows.
 *
 * Leads chooses who, Sequences chooses what and when (the hand-off framework): the card's sequence box is a door to the
 * sequence's record, Change picks where the adds go or makes a version or a new sequence in Sequences, and every trip
 * there comes back to this lead (run.ts). The dock holds only what needs you; a held email is decided in its place with
 * the sequence's own verb, and Take out is the sequence's leave, Put back its undo.
 *
 * It keeps every act the lead's panel had (the stage, Stop writing and Erase in its ⋯, Not a fit's reasons, Keep, Leave
 * out, Put back, a call from the owner's phone and how it went, a draft for their own inbox and whether it was sent),
 * through the same acts (peek/acts.tsx), and the page's own state (its mode, the question armed, the draft), so Esc backs
 * out of it as it did. What it holds of its own is only for the lead on screen: which tab, which rest, whether a held
 * email's choices are open, and whether Stop writing is being asked.
 */
import { useEffect, useState } from "react";
import {
  LEAD_CARD_TABS,
  LEAD_DOCK_WORDS,
  LEAD_NOT_A_FIT_WHYS,
  LEAD_SHEET_WORDS as W,
  type HoldDoor,
  type LeadCardTab,
  type LeadNotAFitWhy,
  type LeadPeekVM,
  type LeadRowVM,
  type LeadSheetDockVM,
  type LeadSheetSlotVM,
  type ReachOutChainDto,
} from "@chanlytics/contracts";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { takeTripMade } from "../../campaigns/sequences/trip";
import { pressed } from "../../campaigns/sequences/verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { Sheet } from "../../kit/sheet/sheet";
import { touchSwipe } from "../../legacy-verbs";
import { MenuInPlace, menuGroups, moreButton, type PeopleMenuItem } from "../../people/menu-groups";
import { LeadCallAsk, LeadPeekAsk, LeadSentAsk } from "../peek/asks";
import { LeadDraftPane } from "../peek/draft-pane";
import type { Armed, Deck, DraftState, Flash, PeekActs, PeekMode } from "../peek/types";
import { PileBulk, type PileBulkFacts } from "../pile/bulk";
import type { LeadPile } from "../pile/use-pile";
import { LeadReachOutView, stopWritingTo, useLeadStory } from "../reach-out/lines";
import { SheetDecide, SheetDock, SheetWhy } from "./dock";
import { endRailOf, sheetFactsOf, type SheetFacts, type SheetPileFacts } from "./facts";
import { holdSheetKeys } from "./keys";
import { SHEET_PANE_ID, SheetPane } from "./panes";
import { SheetBox, SheetChecksLine, SheetContactLine, SheetEnd, SheetNow, SheetProgress, SheetWho } from "./parts";
import { newSequenceFor, openRecord, runSheetAct, takeOut } from "./run";
import type { LeadAim } from "./use-aim";

/** The pile, as the sheet draws it: its acts, its own facts, its line, its name, and Add them all. */
export interface SheetPileView {
  pile: LeadPile;
  facts: SheetPileFacts;
  progress: { words: string; share: number };
  searchName: string;
  bulk: PileBulkFacts | null;
  /** Who is up now, for the line a screen reader hears after a press. */
  next: string | null;
  end: { title: string; rows: { icon: string; t: string; n: number }[]; note: string };
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
  searchWrites: { rootId: string; name: string; chain: ReachOutChainDto | null } | null;
  pile: SheetPileView | null;
  monthLeft: number | null;
  /** The list the open search is, whose own sequence Add goes to first. */
  listId: string | null;
  flash: Flash;
  onClose: () => void;
  writeHeld: (ids: string[]) => void;
}

/** What the sheet holds for the lead on screen, as it was left for that lead and none other. */
interface SheetUiState {
  lead: string | null;
  tab: LeadCardTab;
  full: boolean;
  deciding: boolean;
  stopping: boolean;
}

const FRESH = { tab: "why" as LeadCardTab, full: false, deciding: false, stopping: false };

/** The sheet's own state: a decision turns the card, and the next lead comes up at half, on Why, nothing open. */
function useSheetUi(leadId: string | null) {
  const [held, setHeld] = useState<SheetUiState>({ lead: leadId, ...FRESH });
  const ui = held.lead === leadId ? held : { lead: leadId, ...FRESH };
  const put = (next: Partial<SheetUiState>) => setHeld({ ...ui, ...next });
  return { ui, put };
}
type SheetUi = ReturnType<typeof useSheetUi>;

/** Everything a part of the sheet draws from. */
interface SheetDraw {
  p: LeadSheetProps;
  vm: LeadPeekVM | null;
  facts: SheetFacts | null;
  /** The dock, or the pile's end; null when nothing needs you. */
  dock: LeadSheetDockVM | null;
  sheet: SheetUi;
  run: (s: LeadSheetSlotVM) => void;
  story: ReturnType<typeof useLeadStory>;
  busy: { on: boolean; set: (on: boolean) => void };
}

/* ---------------------------------------------------------------------------------------------------- the head -- */

/**
 * The lead's ⋯: its stage, a choice of three, Stop writing to them anywhere while a sequence writes, and what contracts'
 * leadPeekMenu offers this member (Erase, the owner's).
 */
function sheetMoreOf(vm: LeadPeekVM, on: PeekActs | null, stop: (() => void) | null) {
  if (!on) return null;
  const stages: PeopleMenuItem[] = vm.canStage
    ? [
        { header: W.stage },
        ...vm.stages.map((s) => ({ label: s.label, checked: s.on, onClick: () => void on.onStage(s.id) })),
      ]
    : [];
  const rest: PeopleMenuItem[] = [
    ...(stop ? [{ label: W.stop, icon: "stop", onClick: stop }] : []),
    ...(on.menu ?? []).map((m) => ({
      label: m.label,
      icon: "x",
      danger: m.danger,
      onClick: m.id === "erase" ? on.onEraseAsk : undefined,
    })),
  ];
  const items = [...stages, ...(stages.length && rest.length ? [{ divider: true }] : []), ...rest];
  return items.length ? (
    <MenuInPlace>
      <Menu label={W.more} trigger={moreButton({ title: W.more, testid: "peek-more" })} groups={menuGroups(items)} />
    </MenuInPlace>
  ) : null;
}

/** Who they are, with the desk's ⋯ and Close at the row's end. */
const sheetWhoOf = (d: SheetDraw, desk: boolean) => {
  const { vm, facts, p } = d;
  if (!vm || !facts) return null;
  // Stop writing to them anywhere, while a sequence writes to them (their story says it may be stopped).
  const stop = d.story.story && d.story.story.can_stop ? () => d.sheet.put({ stopping: true }) : null;
  const end = desk ? (
    <span className="lw-id-end">
      {sheetMoreOf(vm, p.on, stop)}
      <Button
        variant="quiet"
        size="sm"
        iconOnly
        id="lead-peek-close"
        aria-label={W.close}
        onClick={p.onClose}
        data-testid="peek-close"
      >
        <Icon name="x" size={15} />
      </Button>
    </span>
  ) : (
    <span className="lw-id-end">{sheetMoreOf(vm, p.on, stop)}</span>
  );
  return (
    <SheetWho
      vm={vm}
      row={p.row}
      word={facts.word}
      sub={facts.sub}
      onExpand={() => p.on && p.on.onExpand()}
      onOpenPerson={(id) => p.on && p.on.onOpenPerson(id)}
      end={end}
    />
  );
};

/* -------------------------------------------------------------------------------------------- the card's block -- */

/**
 * Change (the refined canvas): a menu of the sequences fed by a list, the one chosen ticked, each with what its first
 * email would come to here as its hover; then a version of the one chosen, and a new sequence, both made in Sequences and
 * back here. A few words an item, what it does its hover, as every menu of the house says it.
 */
function changeMenuOf(d: SheetDraw) {
  const { facts, vm, p } = d;
  if (!facts || !vm || !facts.box.change) return null;
  const target = p.aim.target;
  const trip = { leadId: vm.id, name: vm.name, row: p.row, listId: p.listId };
  const items: PeopleMenuItem[] = [
    { header: W.choose(vm.short) },
    ...facts.options.map((o) => ({
      label: o.name,
      title: `${o.meta} · ${o.fill}`,
      checked: o.on,
      onClick: () => p.aim.choose(o.rootId),
    })),
    { divider: true },
    ...(target
      ? [{ label: W.versionOf(target.name), title: W.versionHint, onClick: () => newSequenceFor(trip, target.rootId) }]
      : []),
    { label: W.newSequence, title: W.newSequenceHint, onClick: () => newSequenceFor(trip, null) },
  ];
  return (
    <MenuInPlace>
      <Menu
        label={W.choose(vm.short)}
        trigger={
          <Button size="sm" variant="quiet" className="lw-box-change" data-testid="lead-sheet-change">
            {W.change}
          </Button>
        }
        groups={menuGroups(items)}
      />
    </MenuInPlace>
  );
}

/** The sequence box: how they stand to it, its name a door to its record (with the way back), and Change. */
function boxOf(d: SheetDraw) {
  const { facts, vm, p } = d;
  if (!facts || !vm) return null;
  return (
    <SheetBox
      box={facts.box}
      onOpen={(rootId) => openRecord(rootId, { leadId: vm.id, name: vm.name, row: p.row })}
      change={changeMenuOf(d)}
    />
  );
}

/**
 * The card at half height: who, the reason, the checks line, the ways-in line, and the sequence box. A line opens its tab,
 * at full height on a phone.
 */
const sheetCardOf = (d: SheetDraw, desk: boolean) => {
  const { facts, vm, sheet } = d;
  if (!facts || !vm) return null;
  const open = (tab: LeadCardTab) => sheet.put({ tab, full: true });
  return (
    <article key={vm.id} className="lw-card-w lw-turn" aria-label={vm.name} data-testid="lead-pile-lead">
      {sheetWhoOf(d, desk)}
      <SheetNow
        reason={facts.card.reason}
        fallback={vm.fit.sentence}
        reply={facts.reply}
        replied={facts.state === "replied"}
      />
      {facts.state === "replied" || !facts.checks ? null : (
        <SheetChecksLine line={facts.checks} onOpen={() => open("why")} />
      )}
      <SheetContactLine line={facts.contact} onOpen={() => open("contact")} />
      {boxOf(d)}
    </article>
  );
};

/**
 * The three tabs, the record's capsule (the refined canvas, decision 01): a pick shows its pane, at full height on a
 * phone. They are tabs to a screen reader, the picked one naming the pane it opens. At half none is picked (the
 * canvas's PhoneHalf), so any of the three raises the sheet onto its pane.
 */
const tabStripOf = (d: SheetDraw, half = false) => {
  const on = half ? null : d.sheet.ui.tab;
  return (
    <SubTabs
      look="capsule"
      label={W.tabs}
      value={on}
      tabs={LEAD_CARD_TABS.map((t) => ({
        id: t.id,
        label: t.label,
        testid: `lead-sheet-tab-${t.id}`,
        controls: t.id === on ? SHEET_PANE_ID : undefined,
      }))}
      onSelect={(id) => {
        const tab = LEAD_CARD_TABS.find((t) => t.id === id)?.id;
        if (tab) d.sheet.put({ tab, full: true });
      }}
    />
  );
};

/** The tabs at full height, and the open one's pane. */
const tabsOf = (d: SheetDraw) => {
  const { facts, vm, sheet, p } = d;
  if (!facts || !vm || !p.on) return null;
  const on = p.on;
  const reachOut = (
    <LeadReachOutView key={vm.id} lead={vm} story={d.story.story} again={d.story.again} flash={p.flash} inSheet />
  );
  return (
    <div className="lw-read">
      {tabStripOf(d)}
      <SheetPane
        tab={sheet.ui.tab}
        vm={vm}
        card={facts.card}
        state={facts.state}
        why={facts.why}
        on={{ ...on, reachOut }}
        stand={facts.stand}
        mail={facts.mail ? { ...facts.mail, onChange: () => sheet.put({ full: false }) } : null}
        track={facts.track}
        place={facts.place}
        box={facts.box}
        onOpenRecord={(rootId) => openRecord(rootId, { leadId: vm.id, name: vm.name, row: p.row })}
        onTakeOut={facts.track ? () => takeOutNow(d) : null}
        busy={d.busy.on}
      />
    </div>
  );
};

/* ------------------------------------------------------------------------------------- the asks and the rail -- */

/** What the sheet asks over the card: whether to erase, how the call went, whether the draft was sent. */
const asksOf = (d: SheetDraw) => {
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
};

/** A question comes into view once, as it is asked, wherever the sheet was left scrolled (a tab read below the card). */
const askInView = (el: HTMLDivElement | null) => {
  if (!el || el.dataset.shown) return;
  el.dataset.shown = "1";
  if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
};

/** Take out of the sequence they are in: its leave verb, then their story read again. */
function takeOutNow(d: SheetDraw) {
  const { facts, vm, p } = d;
  if (!facts || !vm || !facts.track) return;
  d.busy.set(true);
  void takeOut({
    leadId: vm.id,
    name: vm.name,
    track: facts.track,
    flash: p.flash,
    moved: () => d.story.again(),
  }).finally(() => d.busy.set(false));
}

/** A held email decided in the dock's place: the sequence's own verb, then the story read again. */
async function decideHeld(d: SheetDraw, door: HoldDoor) {
  const { facts, vm, p } = d;
  const place = facts ? facts.place : null;
  if (!vm || !place || !place.sendId) return;
  d.busy.set(true);
  await pressed(
    "sequence_send_decide",
    { send_id: place.sendId, decision: door, name: vm.name, run_id: place.runId },
    p.flash,
    () => d.story.again(),
  ).finally(() => d.busy.set(false));
  d.sheet.put({ deciding: false });
}

/** Not a fit, for a reason: in a pile the pile's own act, which moves to the next; else the lead's. */
function pickWhy(d: SheetDraw, why: LeadNotAFitWhy) {
  const { p } = d;
  const pile = p.pile ? p.pile.pile : null;
  if (!p.on) return;
  if (pile && pile.on && p.row) {
    p.on.onBack();
    void pile.act(p.row, "not_a_fit", why);
  } else void p.on.onWhy(why);
}

/**
 * The dock, Not a fit's reasons or a held email's choices in its place, or Stop writing asked first; on a desk, the keys
 * under it.
 */
function dockOf(d: SheetDraw, desk: boolean) {
  const { p, vm, dock, sheet, facts } = d;
  const pile = p.pile ? p.pile.pile : null;
  const busy = p.busy || d.busy.on || !!(pile && pile.busy);
  if (vm && sheet.ui.stopping) {
    const SW = reachOuts.words.REACH_OUT_STOP_WORDS;
    return (
      <Confirm
        question={SW.ask(vm.name)}
        detail={SW.detail}
        yes={SW.yes}
        danger
        busy={busy}
        onYes={() => {
          sheet.put({ stopping: false });
          void stopWritingTo(vm.id, vm.name, p.flash).then(() => d.story.again());
        }}
        onNo={() => sheet.put({ stopping: false })}
        testid="lead-sheet-stop"
      />
    );
  }
  if (vm && p.mode === "why" && p.on)
    return (
      <SheetWhy
        last={pile ? pile.lastWhy : null}
        busy={busy}
        keys={!!(desk && pile)}
        onBack={p.on.onBack}
        onPick={(why) => pickWhy(d, why)}
      />
    );
  const place = facts ? facts.place : null;
  if (vm && sheet.ui.deciding && place && place.hold && facts && facts.track)
    return (
      <SheetDecide
        hold={place.hold}
        // What the check flagged is the box's line wherever the card shows; raised on a phone, the card is not there.
        flag={!desk && sheet.ui.full ? LEAD_DOCK_WORDS.decideFlag(place.hold, place.holdDetail) : null}
        sequence={facts.track.name}
        busy={busy}
        onDecide={(door) => void decideHeld(d, door)}
        onBack={() => sheet.put({ deciding: false })}
      />
    );
  const keys = !desk ? null : pile ? "pile" : p.deck ? "rows" : null;
  return dock ? <SheetDock dock={dock} busy={busy} onRun={d.run} keys={keys} /> : null;
}

/** The pile's line, a polite live region: what was done, and who is up now or that it was the last. */
const sheetSaidOf = (pile: SheetPileView | null) =>
  pile ? (
    <p className="lw-said" role="status" aria-live="polite" data-testid="lead-pile-said">
      {pile.pile.said ? `${pile.pile.said} · ${pile.next ? `Next: ${pile.next}` : "That was the last one."}` : null}
    </p>
  ) : null;

/** The pile's progress over the card, with Undo and Add them all; and its mode, said once. */
const progressOf = (pile: SheetPileView | null) =>
  pile ? (
    <>
      <SheetProgress
        words={pile.progress.words}
        share={pile.progress.share}
        undo={
          pile.pile.canUndo
            ? {
                what: pile.pile.undoWords || null,
                go: () => void pile.pile.undo(),
                busy: pile.pile.busy,
              }
            : null
        }
        extra={pile.bulk ? <PileBulk bulk={pile.bulk} busy={pile.pile.busy} /> : null}
      />
      {pile.facts.mode === "first" ? <p className="lw-mode">{W.modeFirst}</p> : null}
    </>
  ) : null;

/* ------------------------------------------------------------------------------------------------- the layouts -- */

/** The body: the draft for their own inbox where one is open, else the card and, at full height, the tabs. */
function sheetBodyOf(d: SheetDraw, desk: boolean) {
  const { p, vm } = d;
  if (!vm) return p.pile ? <SheetEnd {...p.pile.end} /> : null;
  if (p.mode === "draft" && p.on) return <LeadDraftPane vm={vm} draft={p.draft} busy={p.busy} on={p.on} />;
  if (desk)
    return (
      <>
        {sheetCardOf(d, true)}
        {tabsOf(d)}
      </>
    );
  return d.sheet.ui.full ? (
    <div className="lw-full" data-testid="lead-sheet-full">
      {sheetWhoOf(d, false)}
      {tabsOf(d)}
    </div>
  ) : (
    // At half, the card and under it the tabs (the canvas's PhoneHalf): a tab raises the sheet onto its pane.
    <>
      {sheetCardOf(d, false)}
      {d.p.on ? <div className="lw-read">{tabStripOf(d, true)}</div> : null}
    </>
  );
}

/** On a desk: a panel beside the rows, the card over its tabs, the rail at its foot. */
const deskOf = (d: SheetDraw) => (
  <aside
    className="lw lw-desk pl-peek"
    role="dialog"
    aria-label={d.vm ? d.vm.name : d.p.pile ? d.p.pile.searchName : W.tabs}
    data-testid="lead-peek"
  >
    {progressOf(d.p.pile)}
    <div className="lw-scroll" data-testid="peek-body">
      {asksOf(d)}
      {sheetBodyOf(d, true)}
    </div>
    <div className="lw-foot">
      {dockOf(d, true)}
      {sheetSaidOf(d.p.pile)}
    </div>
  </aside>
);

/** On a phone: the kit's sheet with two rests over the rows, the rail held still at its foot. */
function phoneOf(d: SheetDraw) {
  const { p, vm, sheet } = d;
  // Out of a pile a sideways swipe walks the rows, as the panel's did; a pull is the sheet's own.
  const swipe = p.deck && !p.pile ? touchSwipe({ onLeft: p.deck.onNext, onRight: p.deck.onPrev, onDown: null }) : {};
  return (
    <Sheet
      open
      onClose={p.onClose}
      title={p.pile ? p.pile.searchName : p.row ? p.row.searchName : W.tabs}
      kicker
      close={{ label: W.close, glyph: <Icon name="x" size={13} /> }}
      rest={{
        at: vm && sheet.ui.full ? "full" : "half",
        onRest: (at) => sheet.put({ full: at === "full" }),
        turn: { up: W.raise, down: W.lower },
      }}
      foot={
        <>
          {dockOf(d, false)}
          {sheetSaidOf(p.pile)}
        </>
      }
      className="lw lw-phone"
      testid="lead-peek"
    >
      {p.pile ? <span className="lw-edges" aria-hidden="true" /> : null}
      <div className="lw-in">
        {progressOf(p.pile)}
        <div className="lw-body" {...swipe}>
          {asksOf(d)}
          {sheetBodyOf(d, false)}
        </div>
      </div>
    </Sheet>
  );
}

/** The sheet: one lead, a desk's panel or a phone's sheet. */
export function LeadSheet(p: LeadSheetProps) {
  const vm = p.vm;
  const leadId = vm ? vm.id : null;
  const story = useLeadStory(leadId);
  const sheet = useSheetUi(leadId);
  const [busyOn, setBusy] = useState(false);
  const aim = p.aim;
  // The sequences Add can go to, read once as the sheet first opens; out of a pile, the add door asked about this lead.
  // Back from a trip into Sequences that started one, that one is chosen, and what it did is said.
  useEffect(() => {
    const made = takeTripMade();
    if (made) {
      void aim.load({ asked: { id: made.rootId, name: null } });
      p.flash({ tone: "ok", msg: made.said });
    } else if (aim.targets === null) void aim.load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const targetId = aim.target ? aim.target.rootId : null;
  useEffect(() => {
    if (leadId && targetId && !p.pile && !p.searchWrites) void aim.check([leadId]);
  }, [leadId, targetId]); // eslint-disable-line react-hooks/exhaustive-deps
  const facts = vm
    ? sheetFactsOf(
        {
          row: p.row,
          vm,
          tz: p.tz,
          aim,
          story: story.story,
          storyRead: story.read,
          searchWrites: p.searchWrites,
          pile: p.pile ? p.pile.facts : null,
          monthLeft: p.monthLeft,
        },
        Date.now(),
      )
    : null;
  // The pile's end: its later ones, the way out, and where the work lands, in the dock's place.
  const end = !facts && p.pile ? endRailOf(p.pile.facts, aim.target ? aim.target.name : null) : null;
  const dock: LeadSheetDockVM | null = facts
    ? facts.dock
    : end
      ? { line: "", fact: "", waiting: false, x: false, acts: end.slots }
      : null;
  const run = (s: LeadSheetSlotVM) => {
    if (s.off) return;
    void runSheetAct(s.act, {
      row: p.row,
      leadId: leadId ?? "",
      name: vm ? vm.name : "",
      contactId: vm ? vm.contactId : null,
      on: p.on,
      pile: p.pile ? p.pile.pile : null,
      aim,
      flash: p.flash,
      track: facts ? facts.track : null,
      place: facts ? facts.place : null,
      listId: p.listId,
      check: facts ? facts.check : undefined,
      searchWrites: p.searchWrites,
      threadTo: story.story ? (reachOuts.timelineOf(story.story).read?.to ?? null) : null,
      next: p.deck ? p.deck.onNext : null,
      askStop: () => sheet.put({ stopping: true }),
      askDecide: () => sheet.put({ deciding: true }),
      moved: () => story.again(),
      writeHeld: p.writeHeld,
    });
  };
  const d: SheetDraw = { p, vm, facts, dock, sheet, run, story, busy: { on: busyOn, set: setBusy } };
  // The dock's keys in a pile: a key does what the press in that place does; with Not a fit's reasons open, 1 to 5 pick.
  useEffect(() => {
    holdSheetKeys(
      p.pile && dock
        ? (key) => {
            const n = Number(key);
            if (p.mode === "why" && n >= 1 && n <= LEAD_NOT_A_FIT_WHYS.length) {
              const why = LEAD_NOT_A_FIT_WHYS[n - 1];
              if (why) pickWhy(d, why);
              return;
            }
            const s = dock.acts.find((x) => x.key === key);
            if (s && !s.off) run(s);
          }
        : null,
    );
    return () => holdSheetKeys(null);
  });
  return p.phone ? phoneOf(d) : deskOf(d);
}
