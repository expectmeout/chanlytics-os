/**
 * Need you's rows (decision 0071), each in the kit's one row grammar (AttnRow) with its work under its words: the people
 * and the team's own to-dos, and the reviews to answer (Ask's ideas are Ask found's, zones/found.tsx). Since the redesign
 * of 1 Nov 2026 a row says four things and no state line: who, what they want behind the glyph of the wire it came by, how
 * long they have waited or when its clock runs out (in the amber past the business's own target), and the verb, with
 * Ask's mark where Ask prepared it; why it was handed to you is said beside the name once the row is open. One row is the
 * focus and draws its work in place (the queue's `focus`: on a phone the card, the first open row; on a desk the one
 * opened, Up next until another is), its act the page's coral; a row acted on keeps its work, its receipt and its undo,
 * for the visit; every other row is drawn short and opens itself with its verb.
 */
import type { ReactElement } from "react";
import {
  NEED_YOU_WORDS as W,
  answerWithinMsOf,
  namesAPerson,
  needYouVerbOf,
  needYouWaitOf,
  reviewRoute,
  type AppointmentWord,
  type GoogleReviewDto,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import { Icon } from "../../kit/icon/icon";
import { businessTrailFor } from "../../people/business-trail";
import { surfaceValue } from "../../surface-values";
import type { Nav, VerbKind } from "../../waits/wait-rows";
import type { Flash } from "../shell";
import { useDraft } from "./drafts";
import { ReviewWork, reviewerOf } from "./review-work";
import { draftWantOf, opensToWork, shortLabel, workOf, worksInPlace } from "./rows";

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

/** What the reviews are handed besides: a review acted on is kept in its place for the visit. */
export interface NeedYouExtrasCtx extends NeedYouRowsCtx {
  keepReview: (review: GoogleReviewDto) => void;
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
};

/**
 * A row's verb as a short row draws it: Ask's mark first where its words for the row are ready (a reply drafted, a call's
 * notes), then the verb. Drawn, since it hears the row's draft as it lands.
 */
function VerbWords({ row, words }: { row: TodayQueueRowVM; words: string }) {
  const draft = useDraft(draftWantOf(row));
  return (
    <>
      {draft?.state === "ready" ? <Icon name="three" size={13} className="ny-ready" /> : null}
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

/**
 * What a row says whatever it asks: who, the wire, how long, what they want. Someone waiting on you says no state line: how
 * long is beside the name, and why it was handed over is said beside it once the row is open (row.why), never behind a mark
 * nobody could read (the 10/10 read, 2 Nov 2026). Your own to-do keeps its line (a step's day and whom it is for, a visit's
 * "Did they come?"), which is what it says, and so does a search waiting for your OK, as the runs beside it do ("nothing is
 * spent while it waits").
 */
export function rowWords(r: TodayQueueRowVM) {
  const face = namesAPerson(r) ? { person: { name: r.who, initials: r.initials } } : { initials: r.initials };
  const verb = needYouVerbOf(r);
  const waits = verb === "reply" || verb === "call";
  return {
    ...face,
    name: r.who,
    trail: namesAPerson(r) ? businessTrailFor(r.person_id) : null,
    // The wire is the glyph before what they want, and its name is the glyph's words for a screen reader.
    via: { glyph: VIA_GLYPH[r.channel], words: [r.channel, r.via].filter(Boolean).join(", ") },
    wait: needYouWaitOf(r, W.held.goesAlone, answerWithin()),
    sentence: r.sentence,
    quoted: r.quoted,
    lead: r.lead,
    status: waits ? [] : r.status,
    note: "",
    tone: r.tone,
    testid: `queue-${r.kind}`,
  };
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
    // Short until opened: a row that opens to be worked and is not the focus, nor acted on this visit. Its verb is the
    // page's coral where the focus took none (a reply that goes on its own: Stop is no coral), else quiet (the canvas of
    // 2 Nov 2026: Lea's reply going alone, and Try again on the first row waiting).
    if (opensToWork(r) && r.id !== c.focus && !kept) {
      const open = () => c.open(r.id);
      const kind = (c.shortKind ?? c.verbKind)();
      return (
        <AttnRow
          key={r.id}
          {...common}
          note=""
          cta={{ label: <VerbWords row={r} words={shortLabel(r)} />, kind, onClick: open }}
          also={null}
          onOpen={open}
        />
      );
    }
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
      },
      { word: c.word, stepDone: () => c.stepDone(r) },
    );
    return (
      <AttnRow
        key={r.id}
        {...common}
        meta={waits ? (r.why ?? "") : ""}
        cta={null}
        also={null}
        onOpen={card && phone ? () => phone.walk(r.id) : () => c.nav(r.cta.to)}
        work={work}
      />
    );
  });
}

/** The reviews to answer: each a row, opening the review on Reports, with Ask's draft asked for in place. */
export function reviewRows(reviews: readonly GoogleReviewDto[], c: NeedYouExtrasCtx): ReactElement[] {
  return reviews.map((review) => {
    const id = `q-r-${review.id}`;
    const kind = actKindOf({ id }, c);
    const who = reviewerOf(review);
    return (
      <AttnRow
        key={id}
        person={{ name: who }}
        name={who}
        meta={["Google", review.rating ? W.review.stars(review.rating) : ""].filter(Boolean).join(", ")}
        sentence={review.body ?? ""}
        quoted={!!review.body}
        status={[W.review.toAnswer]}
        tone="warn"
        onOpen={() => c.nav(reviewRoute(review.id))}
        testid="queue-review"
        work={
          <ReviewWork
            review={review}
            rowId={id}
            main={kind === "primary" ? "primary" : "secondary"}
            may={c.may}
            flash={c.flash}
            keep={() => c.keepReview(review)}
          />
        }
      />
    );
  });
}
