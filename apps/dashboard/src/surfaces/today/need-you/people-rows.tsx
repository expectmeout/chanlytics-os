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
  NEED_YOU_WORDS as W,
  NOTE_WORDS,
  answerWithinMsOf,
  namesAPerson,
  needYouVerbOf,
  needYouWaitOf,
  type AppointmentWord,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import { Icon } from "../../kit/icon/icon";
import { businessTrailFor } from "../../people/business-trail";
import { surfaceValue } from "../../surface-values";
import type { Nav, VerbKind } from "../../waits/wait-rows";
import { gate, type Flash } from "../shell";
import { useDraft } from "./drafts";
import { draftWantOf, opensToWork, shortLabel, workOf, worksInPlace } from "./rows";
import { stepNoteOf } from "./step-note";
import { needYouLineOf, reviewStars } from "./sheet/row-line";

/** What the section hands its rows. */
export interface NeedYouRowsCtx {
  nav: Nav;
  verbKind: VerbKind;
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
  stepDone: (row: TodayQueueRowVM) => void;
  /**
   * On a phone (the phone canvas, 28 Oct 2026): the card's words cut to two lines with Read, which opens the sheet that
   * walks the list on it (walk-sheet.tsx), as a row drawn short does.
   */
  phone?: { walk: (rowId: string) => void } | null;
  /**
   * The kind a row drawn short gives its verb (Today in three zones, 2 Nov 2026): quiet while the focus's own act takes
   * the page's coral, and in Up next, whose short row is the focus put aside; else `verbKind`, so the first row waiting
   * takes the coral where the focus takes none (a reply that goes on its own, whose press is Stop).
   */
  shortKind?: VerbKind;
}

/**
 * The kind of a row's act: the coral for the focus still open, quiet for the rest. A reply of the receptionist's
 * counting down never takes it: it goes unless stopped, so its press is Stop, and the coral is for what waits on you.
 */
function actKindOf(r: { id: string; kind?: TodayQueueRowVM["kind"] }, c: NeedYouRowsCtx): "primary" | "ghost" {
  return c.kept.has(r.id) || r.kind === "held" ? "ghost" : c.verbKind();
}

/** The glyph of the wire a row came by, before what they want: the kit's Icon by the words a row shows. */
const VIA_GLYPH: Record<TodayQueueRowVM["channel"], string> = {
  WhatsApp: "chat",
  Text: "chat",
  Phone: "phone",
  Email: "mail",
  Instagram: "instagram",
  Leads: "search",
  "Next step": "check",
  Calendar: "calendar",
  Google: "star",
};

/**
 * A row's verb as a short row draws it: Ask's mark first where its words for the row are ready (a reply drafted, a call's
 * notes), then the verb. Drawn, since it hears the row's draft as it lands.
 */
function VerbWords({ row, words }: { row: TodayQueueRowVM; words: string }) {
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
 * The business's own target for answering people (Settings › Autonomy, "Answer people within"), from the settings read
 * the page borrows: a wait past it is the amber. A day until that read lands, as before an owner could set it.
 */
function answerWithin(): number {
  const reply = surfaceValue("settings")?.policies?.rows.find((r) => r.class === "reply");
  return answerWithinMsOf(reply?.limits);
}

/** How long, or a review's stars where a wait would stand. */
function waitOf(row: TodayQueueRowVM) {
  if (row.kind === "review") {
    const rating = row.review?.rating;
    return { words: [row.channel, rating ? reviewStars(rating) : ""].filter(Boolean).join(" · "), long: false };
  }
  return needYouWaitOf(row, W.held.goesAlone, answerWithin());
}

/**
 * What a row says whatever it asks: who or what, the wire for a screen reader, how long, what it is about (contracts
 * needYouLineOf, which says a to-do by its job). Someone waiting on you says no state line: how long is beside the name, and
 * why it was handed over is said beside it once the row is open (row.why), never behind a mark nobody could read (the 10/10
 * read, 2 Nov 2026). A search waiting for your OK keeps its line, as the runs beside it do ("nothing is spent while it
 * waits").
 */
export function rowWords(row: TodayQueueRowVM) {
  const face = namesAPerson(row) ? { person: { name: row.who, initials: row.initials } } : { initials: row.initials };
  const verb = needYouVerbOf(row);
  const waits = verb === "reply" || verb === "call";
  const line = needYouLineOf(row);
  return {
    ...face,
    name: line.name,
    trail: namesAPerson(row) && row.kind !== "step" ? businessTrailFor(row.person_id) : null,
    // No glyph is drawn (his call D2, 9 Nov 2026): a screen reader still hears the wire.
    via: { glyph: VIA_GLYPH[row.channel], words: [row.channel, row.via].filter(Boolean).join(", ") },
    wait: waitOf(row),
    sentence: line.sentence,
    saidTone: line.tone,
    quoted: line.quoted,
    lead: row.lead,
    status: waits ? [] : row.status,
    note: "",
    tone: row.tone,
    testid: `queue-${row.kind}`,
  };
}

/**
 * A row drawn short. Its verb is the page's coral where the focus took none (a reply that goes on its own: Stop is no coral), else
 * quiet (the canvas of 2 Nov 2026: Lea's reply going alone, and Try again on the first row waiting). A to-do's Done is the one short
 * verb that acts where it stands, with its toast and Undo: there is nothing to see first. A to-do that arrives with its note
 * written opens instead, since its words are to be read before they go (decision 0120).
 */
function shortRow(r: TodayQueueRowVM, c: NeedYouRowsCtx): ReactElement {
  const open = () => c.open(r.id);
  const kind = (c.shortKind ?? c.verbKind)();
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

/** The queue's rows, worked in place where they are the focus, short where they are not. */
export function needYouRows(rows: readonly TodayQueueRowVM[], c: NeedYouRowsCtx): ReactElement[] {
  const phone = c.phone ?? null;
  return rows.map((r) => {
    const verb = needYouVerbOf(r);
    const waits = verb === "reply" || verb === "call";
    const common = rowWords(r);
    // A row of no work of its own keeps its one door: a call worth a listen, a search's question, a lead who tried.
    if (!worksInPlace(r)) {
      return (
        <AttnRow
          key={r.id}
          {...common}
          cta={{ label: r.cta.label, kind: "ghost", onClick: () => c.nav(r.cta.to) }}
          also={null}
          onOpen={() => c.nav(r.cta.to)}
        />
      );
    }
    const kept = c.kept.has(r.id);
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
