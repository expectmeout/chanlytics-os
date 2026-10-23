/**
 * The Pipeline's deal sheet (docs/decisions/0008-a-proposal-is-part-of-the-deal.md, "the Pipeline is a workspace"; the
 * canvas "Pipeline deal sheet", 20 Oct 2026, made compact 21 Oct: the sheet acts, their page records): one row's deal,
 * opened over the rows, to move it on. Who, where the deal stands, the question it asks, its next step, and its foot;
 * their face and name open their page, which holds their words, how to reach them and every deal. On a phone the kit's
 * Sheet, as tall as what it holds, as the lead sheet and the Calendar's visit open; on a desk the peek beside the rows
 * (the 408px `.pk` pane People's and the Calendar's peeks are), as tall as what it holds, walked with ‹ › as J and K walk
 * it. Both draw the same parts (peek-parts.tsx) and the same foot (peek-foot.tsx).
 *
 * It says nothing of its own. The head is contracts' pipelinePeekOf over the row, there the moment it opens; the deal is
 * pipelineSheetOf over the row and the person once read (the person page's own card, dealCardsOf, for an open deal).
 * Who is open and what was read of them are PipelineScope's, handed down, so the page's one keyboard listener closes it
 * on Esc and it follows the row cursor.
 *
 * A sheet it opens takes over and hands it back: the one deal sheet, the step sheet, a new conversation and the call's
 * question stand on the page, so while one is up a phone's modal sheet steps out of their way, and comes back as it was
 * when they close (the visit closed itself for good; here the address still names the deal).
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import type { PersonVM, PipelinePeekVM, PipelineRowVM, PipelineSheetVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { StoppedMark } from "../../kit/pill/stopped-mark";
import { recFolds } from "../../kit/record/registry";
import { Sheet, SheetOpens, type SheetOpensTo } from "../../kit/sheet/sheet";
import { useNewConversation } from "../../inbox/new-conversation/store";
import { touchSwipe } from "../../legacy-verbs";
import { CallSheet, usePersonCall, type CallCtx } from "../person/call";
import { dealPersonOf } from "../person/ctx";
import { PersonWalkNav } from "../person/hero";
import type { PersonWalk } from "../walk";
import { dealFoot } from "./peek-foot";
import { dealBody, type Compose, type DealSheetCtx } from "./peek-parts";
import { P } from "./pipe";
import { useRowAboveSheet } from "./row-above-sheet";
import type { Flash } from "../types";

/** The record sheets a press here opens (deal-sheet.tsx, step-sheet.tsx): while one is up, a phone's sheet stands aside. */
const TAKES_OVER = new Set<unknown>(["deal-sheet", "step-sheet"]);
const recordUp = () => TAKES_OVER.has(recFolds.open());
const neverUp = () => false;
const hearFolds = (hear: () => void) => recFolds.subscribe(hear);

/** The words a desk's walk says: deals in this view, as People's peek says people. */
const WALK_WORDS = { ...P.words.sheet.walk, at: (at: number, of: number) => `${at} of ${of}` };

export interface PipelinePeekProps {
  vm: PipelinePeekVM | null;
  /** The row the sheet is of, as the Pipeline draws it now: its deal, its steps, its chip. */
  row: PipelineRowVM | null;
  person?: PersonVM | null;
  failed?: string | null;
  canRecord?: boolean;
  phone?: boolean;
  /** Where the row stands among the rows shown, and who is either side: the desk's ‹ › and a phone's sideways swipe. */
  walk?: PersonWalk | null;
  /** Open another row in this sheet: a step of the walk. */
  onStep: (rowId: string) => void;
  onClose: () => void;
  onRetry: () => void;
  onOpenPage: () => void;
  onCompose: Compose;
  flash: Flash;
}

/** Who, as the head says them: the name (in figures for a number or an address) and a stop beside it. */
function nameOf(vm: PipelinePeekVM) {
  return (
    <>
      <span className={vm.numeric ? "tabular" : undefined} data-testid="pipeline-peek-name">
        {vm.name}
      </span>
      {/* They asked to stop: a sheet is where a person is picked up to answer, so it says it (D1-stop-unseen). */}
      {vm.stopped ? <StoppedMark className="pipe-stop-said" testid="pipeline-peek-stopped" /> : null}
    </>
  );
}

/** The deal as the sheet says it, worked out tried: a deal it cannot say is said as a read that failed, never a throw. */
function sheetOf(row: PipelineRowVM | null, person: PersonVM | null): PipelineSheetVM | null {
  if (!row) return null;
  try {
    const p = person ? dealPersonOf(person, row.person) : null;
    return P.sheet(row, p, Date.now(), pageClock().zone());
  } catch (err) {
    console.error("The deal sheet could not say this deal.", err);
    return null;
  }
}

/** Where the head's face and name go: their page, said by their name. */
const toTheirPage = (vm: PipelinePeekVM, press: () => void): SheetOpensTo => ({
  label: P.words.peek.open(vm.name),
  press,
});

/**
 * The desk's peek: its head (who, a press to their page; the deal, the walk, Close), its body, and its foot in the glass
 * a sheet's foot is, as tall as what it holds.
 */
function DeskPeek(p: PipelinePeekProps & { c: DealSheetCtx; foot: ReturnType<typeof dealFoot> }) {
  const { c, foot, walk, onStep, onClose } = p;
  const { vm } = c;
  const to = toTheirPage(vm, p.onOpenPage);
  return (
    <aside className="pk pl-peek pipe-peek" role="dialog" aria-label={vm.name} data-testid="pipeline-peek">
      <div className="pk-head">
        <SheetOpens to={to} mark>
          <Face person={{ name: vm.name, initials: vm.initials }} size="lg" />
        </SheetOpens>
        <div className="pk-titles">
          <h2 className="pk-name">
            <SheetOpens to={to} testid="pipeline-peek-opens">
              {nameOf(vm)}
            </SheetOpens>
          </h2>
          <div className="pk-sub" data-testid="pipeline-peek-sub">
            {c.sheet.sub ?? vm.sub}
          </div>
        </div>
        {walk ? <PersonWalkNav walk={walk} step={onStep} words={WALK_WORDS} /> : null}
        {/* The pane's Close is the 34px glass circle every sheet's is (clients.css `.pipe-scope .pk-x`). */}
        <Button
          iconOnly
          size="sm"
          variant="quiet"
          className="pk-x"
          id="pipeline-peek-close"
          aria-label={P.words.peek.close}
          title={P.words.peek.close}
          onClick={onClose}
          data-testid="pipeline-peek-close"
        >
          <Icon name="x" size={13} />
        </Button>
      </div>
      <div className="pk-body pipe-deal-pane">{dealBody(c)}</div>
      {foot ? <footer className="rec-sheet-foot">{foot}</footer> : null}
    </aside>
  );
}

/**
 * A phone's sheet: the kit's, as tall as what it holds, its face and name a press to their page; a sideways swipe walks
 * the rows shown, as the lead sheet's does.
 */
function PhoneSheet(
  p: PipelinePeekProps & {
    c: DealSheetCtx;
    foot: ReturnType<typeof dealFoot>;
    open: boolean;
  },
) {
  const { c, foot, walk, onStep } = p;
  const { vm } = c;
  const swipe = walk
    ? touchSwipe({
        onLeft: walk.next ? () => walk.next && onStep(walk.next) : null,
        onRight: walk.prev ? () => walk.prev && onStep(walk.prev) : null,
        onDown: null,
      })
    : {};
  return (
    <Sheet
      open={p.open}
      onClose={p.onClose}
      title={nameOf(vm)}
      sub={<span data-testid="pipeline-peek-sub">{c.sheet.sub ?? vm.sub}</span>}
      mark={<Face person={{ name: vm.name, initials: vm.initials }} size="lg" />}
      opens={toTheirPage(vm, p.onOpenPage)}
      close={{ label: P.words.peek.close, glyph: <Icon name="x" size={13} /> }}
      foot={foot ?? undefined}
      className="pipe-deal"
      testid="pipeline-peek"
    >
      <div className="pipe-deal-body" {...swipe}>
        {dealBody(c)}
      </div>
    </Sheet>
  );
}

export function PipelinePeek(props: PipelinePeekProps) {
  const { vm, row, person = null, failed = null, canRecord = false, phone = false, flash } = props;
  const call = usePersonCall(person, phone);
  const id = vm ? vm.id : null;
  // Whether a pass is asked, the deal's own: another deal opens asked nothing.
  const [pass, setPass] = useState<string | null>(null);
  const recordOpen = useSyncExternalStore(hearFolds, recordUp, neverUp);
  const conversation = useNewConversation();
  // A deal opened, or walked to, on a phone: its row comes up above the sheet, and the rows go back down as it closes.
  useRowAboveSheet(phone, id, !!person);
  // A sheet it opened stands on the page: this one steps aside while it is up, and is back as it was once it closes,
  // a frame later, so the Esc that closed that sheet has finished before this one listens for its own.
  const away = recordOpen || conversation.open || (call.open && call.asking);
  const [back, setBack] = useState(true);
  useEffect(() => {
    if (away) {
      setBack(false);
      return undefined;
    }
    if (back) return undefined;
    const frame = window.requestAnimationFrame(() => setBack(true));
    return () => window.cancelAnimationFrame(frame);
  }, [away, back]);
  if (!vm) return null;
  const sheet = sheetOf(row, person);
  if (!row || !sheet) {
    return (
      <aside className="pk pl-peek pipe-peek" role="dialog" aria-label={vm.name} data-testid="pipeline-peek">
        <FailedRead kind="card" what={P.words.peek.what} onRetry={props.onRetry} testid="pipeline-peek-failed" />
      </aside>
    );
  }
  const c: DealSheetCtx = {
    vm,
    row,
    person,
    sheet,
    failed,
    canRecord,
    phone,
    flash,
    onCompose: props.onCompose,
    onRetry: props.onRetry,
    onPass: () => setPass(vm.id),
    passing: pass === vm.id,
  };
  const callCtx: CallCtx | null = person ? { p: person, call, phone, canRecord, flash, load: props.onRetry } : null;
  const foot = callCtx ? dealFoot(c, callCtx, pass === vm.id, () => setPass(null)) : null;
  if (!phone) return <DeskPeek {...props} c={c} foot={foot} />;
  return (
    <>
      <PhoneSheet {...props} c={c} foot={foot} open={!away && back} />
      {callCtx ? <CallSheet c={callCtx} /> : null}
    </>
  );
}
