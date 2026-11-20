/**
 * Need you's rows (decision 0071), each in the kit's one row grammar (AttnRow) with its work under its words: the people
 * and the team's own to-dos and reviews (Ask's ideas are Ask found's, zones/found.tsx). A row says four things and no state
 * line (one row, 9 Nov 2026): who or what, how long they have waited or when its clock runs out (in the amber past the
 * business's own target), and the verb, with Ask's mark where Ask prepared it, on its first line, and what it is about
 * across the whole row under them; why it was handed to you is said beside the name once the row is open. One row is the
 * focus and draws its work in place (the queue's `focus`: on a phone the card, the first open row; on a desk the one
 * opened, Up next until another is), its act the page's coral; a row acted on keeps its work, its receipt and its undo,
 * for the visit; every other row is drawn short and opens itself with its verb.
 */
import type { ReactElement } from "react";
import {
  addressOf,
  NOTE_WORDS,
  needYouVerbOf,
  type AppointmentWord,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import { carryDraft, carryFromToday } from "../../inbox/carried-reply";
import { AttnRow } from "../../kit/attention/attn-row";
import { Icon } from "../../kit/icon/icon";
import type { Nav } from "../../waits/wait-rows";
import { gate, type Flash } from "../shell";
import { useDraft } from "./drafts";
import { answersInThread, draftWantOf, opensToWork, shortLabel, workOf, worksInPlace } from "./rows";
import { doorRow, rowWords } from "./sheet/row-words";
import { stepNoteOf } from "./step-note";

/** What the section hands its rows. */
export interface NeedYouRowsCtx {
  nav: Nav;
  /**
   * The row whose act is the page's coral, by its id, as the model chose it (need-you-model.ts): the focus still open, or
   * where its act takes none, the first row waiting; To do's first act where Need you's took none. Null where none of these
   * rows holds it.
   */
  coral: string | null;
  may: boolean;
  tz: string;
  flash: (f: Flash) => void;
  keep: (row: TodayQueueRowVM) => void;
  /** A kept row let go: refused, or put back by its Undo or Wake (WorkProps.unkeep). */
  unkeep: (row: TodayQueueRowVM) => void;
  /** The rows acted on this visit, reviews among them: they keep their place, and their work. */
  kept: ReadonlySet<string>;
  /**
   * The one row drawn open, by its id: on a phone the card, the first row still open; on a desk the one the member opened,
   * Up next until they open another, or none where they closed it. Its act is the page's coral.
   */
  focus: string | null;
  /** Open a row drawn short: on a desk in place, closing the one open; on a phone in the sheet that walks the list. */
  open: (rowId: string) => void;
  word: AppointmentWord;
  stepDone: (row: TodayQueueRowVM) => void | Promise<void>;
  /**
   * On a phone (the phone canvas, 28 Oct 2026): the card's words cut to two lines with Read, which opens the sheet that
   * walks the list on it (walk-sheet.tsx), as a row drawn short does.
   */
  phone?: { walk: (rowId: string) => void } | null;
}

/**
 * The kind of a row's act: the coral for the one row the model gave it (a reply of the receptionist's counting down never
 * holds it: it goes unless stopped, so its press is Stop, and the coral is for what waits on you), quiet for the rest.
 */
const actKindOf = (r: { id: string }, c: NeedYouRowsCtx): "primary" | "ghost" =>
  r.id === c.coral ? "primary" : "ghost";

/**
 * A row's verb as a short row draws it: Ask's mark first where its words for the row are ready (a reply drafted, a call's
 * notes), then the verb. Drawn, since it hears the row's draft as it lands.
 */
export function VerbWords({ row, words }: { row: TodayQueueRowVM; words: string }) {
  const draft = useDraft(draftWantOf(row));
  // A call's read says nothing of words ready: only a reply's mark says Ask has them.
  const ready = draft?.state === "ready" && row.kind !== "callback" && !row.failed;
  return (
    <>
      {ready ? <Icon name="three" size={13} className="ny-ready" /> : null}
      {words}
    </>
  );
}

/**
 * A row drawn short. Its verb is the page's coral where the focus took none (a reply that goes on its own: Stop is no coral), else
 * quiet (the canvas of 2 Nov 2026: Lea's reply going alone, and Try again on the first row waiting). A to-do's Done is the one short
 * verb that acts where it stands, with its toast and Undo: there is nothing to see first. A to-do that arrives with its note
 * written opens instead, since its words are to be read before they go (decision 0120).
 */
function shortRow(r: TodayQueueRowVM, c: NeedYouRowsCtx): ReactElement {
  const open = () => c.open(r.id);
  const kind = actKindOf(r, c);
  return (
    <AttnRow
      key={r.id}
      {...rowWords(r)}
      note=""
      cta={
        r.kind === "step" && c.may && !stepNoteOf(r)
          ? {
              label: r.cta.label,
              kind,
              onClick: () => c.stepDone(r),
              // Several rows say Done: a reader hears whose, as the thread header's does.
              gate: { ...gate("approve", "mark a step done"), "aria-label": NOTE_WORDS.markDone(r.sentence) },
            }
          : { label: <VerbWords row={r} words={shortLabel(r)} />, kind, onClick: open }
      }
      also={null}
      onOpen={open}
    />
  );
}

/**
 * Open a row's conversation (rows.ts answersInThread): a reply's with AI's draft asked for its box (carried-reply.ts
 * carryDraft), a call back's ready to call. Older's rows open theirs the same way (older.tsx).
 */
export function openInThread(row: TodayQueueRowVM, conversationId: string, nav: Nav): void {
  const to = addressOf({ kind: "conversation", id: conversationId });
  if (row.kind !== "callback") carryDraft(to);
  carryFromToday(to);
  nav(to);
}

/**
 * A row answered in its conversation (rows.ts answersInThread): its verb and its words open the thread (openInThread). The
 * coral where the model gave it.
 */
function threadRow(row: TodayQueueRowVM, conversationId: string, ctx: NeedYouRowsCtx): ReactElement {
  const open = () => openInThread(row, conversationId, ctx.nav);
  return (
    <AttnRow
      key={row.id}
      {...rowWords(row)}
      note=""
      // Why it was handed over, a desk's: on a phone its sentence says it, and the thread says the rest.
      meta={ctx.phone ? "" : (row.why ?? "")}
      cta={{ label: <VerbWords row={row} words={shortLabel(row)} />, kind: actKindOf(row, ctx), onClick: open }}
      also={null}
      onOpen={open}
    />
  );
}

/** The queue's rows, worked in place where they are the focus, short where they are not. */
export function needYouRows(rows: readonly TodayQueueRowVM[], c: NeedYouRowsCtx): ReactElement[] {
  const phone = c.phone ?? null;
  return rows.map((r) => {
    // A row of no work of its own keeps its one door: a call worth a listen, a search's question, a lead who tried.
    if (!worksInPlace(r)) return doorRow(r, c.nav);
    const verb = needYouVerbOf(r);
    const waits = verb === "reply" || verb === "call";
    const common = rowWords(r);
    const kept = c.kept.has(r.id);
    // Answered in its conversation, never on Today (D8), unless it was acted on here before (it keeps its receipt).
    if (answersInThread(r) && r.conversationId && !kept) return threadRow(r, r.conversationId, c);
    // Short until opened: a row that opens to be worked and is not the focus, nor acted on this visit.
    if (opensToWork(r) && r.id !== c.focus && !kept) return shortRow(r, c);
    const kind = actKindOf(r, c);
    // The card on a phone: its words cut to two lines, Read and its own words open the sheet on it.
    const card = !!phone && !kept && opensToWork(r);
    const work = workOf(
      r,
      {
        main: kind === "primary" ? "primary" : "secondary",
        may: c.may,
        tz: c.tz,
        flash: c.flash,
        keep: c.keep,
        unkeep: c.unkeep,
        read: card && phone ? () => phone.walk(r.id) : null,
        // A desk's open row is drawn whole; a phone's Up next is short of it, and a row kept says only what became of it.
        whole: !phone && !kept,
      },
      { word: c.word, stepDone: () => c.stepDone(r) },
    );
    return (
      <AttnRow
        key={r.id}
        {...common}
        // Why it was handed over, a desk's: on a phone its sentence says it, and a reply that never arrived says so itself.
        meta={waits && !phone && !r.failed ? (r.why ?? "") : ""}
        cta={null}
        also={null}
        onOpen={card && phone ? () => phone.walk(r.id) : () => c.nav(r.cta.to)}
        work={work}
      />
    );
  });
}
