/**
 * The lead sheet (canvas B v2, "The Workbench", 16 Oct 2026): one lead, the panel of every lead opened on Leads, in a
 * pile and out of one. On a desk a panel beside the rows: the card to decide on, then its five tabs under it, and the
 * rail at its foot. On a phone the kit's sheet with two rests over the rows: the card at half height, the tabs at full
 * (the handle, a drag, or Enter), the rail held still at its foot on both. In a pile its line rides over the card (how
 * far through, a meter, Undo) and its end says what happened; out of one, Next walks the rows.
 *
 * It keeps every act the lead's panel had (the stage and Erase in its ⋯, Not a fit's reasons, Keep, Leave out, Put
 * back, a call from the owner's phone and how it went, a draft for their own inbox and whether it was sent), through the
 * same acts (peek/acts.tsx), and the page's own state (its mode, the question armed, the draft), so Esc backs out of it
 * as it did. What it holds of its own is only for the lead on screen: which tab, which rest, which tip is open, whether
 * Change is open, and whether Stop writing is being asked.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  LEAD_CARD_TABS,
  LEAD_SHEET_WORDS as W,
  type LeadCardTab,
  type LeadPeekVM,
  type LeadRowVM,
  type LeadSheetRailVM,
  type LeadSheetSlotVM,
  type ReachOutChainDto,
} from "@chanlytics/contracts";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { Sheet } from "../../kit/sheet/sheet";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { touchSwipe } from "../../legacy-verbs";
import { MenuInPlace, menuGroups, moreButton, type PeopleMenuItem } from "../../people/menu-groups";
import { LeadCallAsk, LeadPeekAsk, LeadSentAsk } from "../peek/asks";
import { LeadDraftPane } from "../peek/draft-pane";
import type { Armed, Deck, DraftState, Flash, PeekActs, PeekMode } from "../peek/types";
import { PileBulk, type PileBulkFacts } from "../pile/bulk";
import type { LeadPile } from "../pile/use-pile";
import { LeadReachOutView, stopWritingTo, useLeadStory } from "../reach-out/lines";
import { endRailOf, sheetFactsOf, type SheetFacts, type SheetPileFacts } from "./facts";
import { holdSheetKeys } from "./keys";
import { SheetPane } from "./panes";
import {
  SheetCells,
  SheetChoose,
  SheetClosed,
  SheetElsewhere,
  SheetEnd,
  SheetMail,
  SheetMarks,
  SheetNow,
  SheetPhoneOnly,
  SheetProgress,
  SheetStopped,
  SheetTrack,
  SheetWho,
  type SheetTips,
} from "./parts";
import { SheetRail, SheetWhy } from "./rail";
import { runSheetAct } from "./run";
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
  tip: string | null;
  choosing: boolean;
  stopping: boolean;
}

const FRESH = { tab: "why" as LeadCardTab, full: false, tip: null, choosing: false, stopping: false };

/** The sheet's own state: a decision turns the card, and the next lead comes up at half, on Why, nothing open. */
function useSheetUi(leadId: string | null) {
  const [held, setHeld] = useState<SheetUiState>({ lead: leadId, ...FRESH });
  const ui = held.lead === leadId ? held : { lead: leadId, ...FRESH };
  const put = (next: Partial<SheetUiState>) => setHeld({ ...ui, ...next });
  const tips: SheetTips = { open: ui.tip, toggle: (key) => put({ tip: ui.tip === key ? null : key }) };
  return { ui, put, tips };
}
type SheetUi = ReturnType<typeof useSheetUi>;

/** Everything a part of the sheet draws from. */
interface SheetDraw {
  p: LeadSheetProps;
  vm: LeadPeekVM | null;
  facts: SheetFacts | null;
  rail: LeadSheetRailVM | null;
  sheet: SheetUi;
  run: (s: LeadSheetSlotVM) => void;
  story: ReturnType<typeof useLeadStory>;
}

/* ---------------------------------------------------------------------------------------------------- the head -- */

/** The lead's ⋯: its stage, a choice of three, and what contracts' leadPeekMenu offers this member (Erase, the owner's). */
function sheetMoreOf(vm: LeadPeekVM, on: PeekActs | null) {
  if (!on) return null;
  const stages: PeopleMenuItem[] = vm.canStage
    ? [
        { header: W.stage },
        ...vm.stages.map((s) => ({ label: s.label, checked: s.on, onClick: () => void on.onStage(s.id) })),
      ]
    : [];
  const rest: PeopleMenuItem[] = (on.menu ?? []).map((m) => ({
    label: m.label,
    icon: "x",
    danger: m.danger,
    onClick: m.id === "erase" ? on.onEraseAsk : undefined,
  }));
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
  const end = desk ? (
    <span className="lw-id-end">
      {sheetMoreOf(vm, p.on)}
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
    <span className="lw-id-end">{sheetMoreOf(vm, p.on)}</span>
  );
  return (
    <SheetWho
      vm={vm}
      row={p.row}
      fit={facts.fit}
      tips={d.sheet.tips}
      onExpand={() => p.on && p.on.onExpand()}
      onOpenPerson={(id) => p.on && p.on.onOpenPerson(id)}
      end={end}
    />
  );
};

/* -------------------------------------------------------------------------------------------- the card's block -- */

/** The email they would get, or Change open in its place, or why there is none to show. */
function mailBlock(d: SheetDraw) {
  const { facts, vm, sheet, p } = d;
  if (!facts || !vm) return null;
  if (sheet.ui.choosing)
    return (
      <SheetChoose
        name={vm.short}
        options={facts.options}
        pile={!!p.pile}
        onPick={(rootId) => {
          p.aim.choose(rootId);
          sheet.put({ choosing: false });
        }}
        onDone={() => sheet.put({ choosing: false })}
      />
    );
  const card = facts.card;
  if (card.email && facts.mail)
    return (
      <SheetMail
        email={card.email}
        head={facts.mail.head}
        sub={facts.mail.sub}
        canChange={facts.mail.canChange}
        onChange={() => sheet.put({ choosing: true })}
      />
    );
  return <p className="lw-mail-n quiet">{card.firstPile ? W.modeFirst : W.noTarget}</p>;
}

/** The card's block, by the state the lead is in. */
function stateBlockOf(d: SheetDraw): ReactNode {
  const { facts, vm } = d;
  if (!facts || !vm) return null;
  switch (facts.state) {
    case "sequence":
      return facts.track ? <SheetTrack track={facts.track} /> : mailBlock(d);
    case "elsewhere":
      return <SheetElsewhere name={facts.check ? facts.check.chain_name : null} />;
    case "phone":
      return <SheetPhoneOnly number={vm.reach.phone ? vm.reach.phone.value : null} />;
    case "replied":
      return <SheetStopped />;
    case "closed":
      return facts.closed ? <SheetClosed closed={facts.closed} /> : null;
    default:
      return mailBlock(d);
  }
}

/** The card at half height: who, the reason, what it rests on, how to reach them, and the block for its state. */
const sheetCardOf = (d: SheetDraw, desk: boolean) => {
  const { facts, vm, sheet } = d;
  if (!facts || !vm) return null;
  return (
    <article key={vm.id} className="lw-card-w lw-turn" aria-label={vm.name} data-testid="lead-pile-lead">
      {sheetWhoOf(d, desk)}
      <SheetNow
        reason={facts.card.reason}
        fallback={vm.fit.sentence}
        reply={facts.reply}
        replied={facts.state === "replied"}
        tips={sheet.tips}
      />
      {facts.state === "replied" ? null : <SheetMarks marks={facts.card.marks} tips={sheet.tips} />}
      <SheetCells cells={facts.cells} tips={sheet.tips} />
      {stateBlockOf(d)}
    </article>
  );
};

/** The tabs at full height, and the open one's pane. */
const tabsOf = (d: SheetDraw) => {
  const { facts, vm, sheet, p } = d;
  if (!facts || !vm || !p.on) return null;
  const on = p.on;
  const reachOut = (
    <LeadReachOutView key={vm.id} lead={vm} story={d.story.story} again={d.story.again} flash={p.flash} />
  );
  return (
    <div className="lw-read">
      <SubTabs
        label={W.tabs}
        value={sheet.ui.tab}
        tabs={LEAD_CARD_TABS.map((t) => ({ id: t.id, label: t.label, testid: `lead-sheet-tab-${t.id}` }))}
        onSelect={(id) => {
          const found = LEAD_CARD_TABS.find((t) => t.id === id);
          if (found) sheet.put({ tab: found.id });
        }}
        dense
      />
      <SheetPane
        tab={sheet.ui.tab}
        vm={vm}
        card={facts.card}
        on={{ ...on, reachOut }}
        stand={facts.stand}
        mail={facts.mail ? { ...facts.mail, onChange: () => sheet.put({ choosing: true, full: false }) } : null}
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
  return (
    <>
      {p.mode === "erase" || p.mode === "erasing" ? (
        <LeadPeekAsk vm={vm} mode={p.mode} busy={p.busy} on={p.on} />
      ) : null}
      {a && a.asked && a.leadId === vm.id && a.kind === "call" ? (
        <LeadCallAsk armed={a} busy={p.busy} on={p.on} deck={p.deck} />
      ) : null}
      {a && a.asked && a.leadId === vm.id && a.kind === "sent" ? <LeadSentAsk busy={p.busy} on={p.on} /> : null}
    </>
  );
};

/** The rail, Not a fit's reasons in its place, or Stop writing asked first. */
function railOf(d: SheetDraw) {
  const { p, vm, rail, sheet } = d;
  if (!rail) return null;
  const pile = p.pile ? p.pile.pile : null;
  const busy = p.busy || !!(pile && pile.busy);
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
  if (vm && p.mode === "why" && p.on) {
    const on = p.on;
    return (
      <SheetWhy
        last={pile ? pile.lastWhy : null}
        busy={busy}
        onBack={on.onBack}
        onPick={(why) => {
          if (pile && pile.on && p.row) {
            on.onBack();
            void pile.act(p.row, "not_a_fit", why);
          } else void on.onWhy(why);
        }}
      />
    );
  }
  return <SheetRail rail={rail} busy={busy} onRun={d.run} />;
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
                words: `Undo${pile.pile.undoWords ? ` · ${pile.pile.undoWords}` : ""}`,
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
    sheetCardOf(d, false)
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
      {railOf(d)}
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
          {railOf(d)}
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
  const aim = p.aim;
  // The sequences Add can go to, read once as the sheet first opens; out of a pile, the add door asked about this lead.
  useEffect(() => {
    if (aim.targets === null) void aim.load({ listId: p.listId });
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
          searchWrites: p.searchWrites,
          pile: p.pile ? p.pile.facts : null,
          monthLeft: p.monthLeft,
        },
        Date.now(),
      )
    : null;
  const rail = facts ? facts.rail : p.pile ? endRailOf(p.pile.facts, aim.target ? aim.target.name : null) : null;
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
      check: facts ? facts.check : undefined,
      searchWrites: p.searchWrites,
      threadTo: story.story ? (reachOuts.timelineOf(story.story).read?.to ?? null) : null,
      next: p.deck ? p.deck.onNext : null,
      askStop: () => sheet.put({ stopping: true }),
      writeHeld: p.writeHeld,
    });
  };
  // The rail's keys in a pile: a key does what the press in that place does.
  useEffect(() => {
    holdSheetKeys(
      p.pile && rail
        ? (key) => {
            const s = key === "n" ? rail.slots.find((x) => x.key === "n") : rail.slots.find((x) => x.key === key);
            if (s) run(s);
          }
        : null,
    );
    return () => holdSheetKeys(null);
  });
  const d: SheetDraw = { p, vm, facts, rail, sheet, run, story };
  return p.phone ? phoneOf(d) : deskOf(d);
}
