/**
 * Need you's rows (decision 0071), each in the kit's one row grammar (AttnRow) with its work under its words: the people
 * and the team's own to-dos, then Ask's ideas and the reviews to answer. Since the redesign of 1 Nov 2026 a row says four
 * things and no state line: who, what they want behind the glyph of the wire it came by, how long they have waited or when
 * its clock runs out, and the verb, with Ask's mark where Ask prepared it; why it was handed to you is behind the row's
 * mark. One row is the focus and draws its work in place (the queue's `focus`: on a phone the card, the first open row;
 * on a desk the one opened, Up next until another is), its act the page's coral; a row acted on keeps its work, its
 * receipt and its undo, for the visit; every other row is drawn short and opens itself with its verb.
 */
import type { ReactElement } from "react";
import {
  NEED_YOU_WORDS as W,
  namesAPerson,
  needYouVerbOf,
  needYouWaitOf,
  reviewRoute,
  type AppointmentWord,
  type AskMorningCard,
  type GoogleReviewDto,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import { Icon } from "../../kit/icon/icon";
import { businessTrailFor } from "../../people/business-trail";
import type { Nav, VerbKind } from "../../waits/wait-rows";
import type { Flash } from "../shell";
import { useDraft } from "./drafts";
import { IdeaWork } from "./idea-work";
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
  /** The rows acted on this visit, ideas and reviews among them: they keep their place, and their work. */
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
}

/** What the ideas and the reviews are handed besides: an idea or a review acted on is kept in its place for the visit. */
export interface NeedYouExtrasCtx extends NeedYouRowsCtx {
  keepIdea: (card: AskMorningCard) => void;
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
function VerbWords({ row, may, words }: { row: TodayQueueRowVM; may: boolean; words: string }) {
  const draft = useDraft(draftWantOf(row), may);
  return (
    <>
      {draft?.state === "ready" ? <Icon name="three" size={13} className="ny-ready" /> : null}
      {words}
    </>
  );
}

/** Why a row was handed to you and since when, behind its mark: had once, never printed in the line (AttnRow `note`). */
const whyNoteOf = (r: TodayQueueRowVM): string =>
  [r.reason, r.since, r.status.find((s) => s.startsWith("reply window closes"))].filter(Boolean).join(" · ");

/** The queue's rows, worked in place where they are the focus, short where they are not. */
export function needYouRows(rows: readonly TodayQueueRowVM[], c: NeedYouRowsCtx): ReactElement[] {
  const phone = c.phone ?? null;
  return rows.map((r) => {
    const face = namesAPerson(r) ? { person: { name: r.who, initials: r.initials } } : { initials: r.initials };
    // Someone waiting on you says no state line: how long is beside the name and why is behind the row's mark. Your own
    // to-do keeps its line (a step's day and whom it is for, a visit's "Did they come?"), which is what it says, and so does
    // a search waiting for your OK, as the runs beside it do ("nothing is spent while it waits").
    const verb = needYouVerbOf(r);
    const waits = verb === "reply" || verb === "call";
    const common = {
      ...face,
      name: r.who,
      trail: namesAPerson(r) ? businessTrailFor(r.person_id) : null,
      // The wire is the glyph before what they want, and its name is the glyph's words for a screen reader.
      via: { glyph: VIA_GLYPH[r.channel], words: [r.channel, r.via].filter(Boolean).join(", ") },
      wait: needYouWaitOf(r, W.held.goesAlone),
      sentence: r.sentence,
      quoted: r.quoted,
      lead: r.lead,
      status: waits ? [] : r.status,
      note: waits ? whyNoteOf(r) : "",
      tone: r.tone,
      testid: `queue-${r.kind}`,
    };
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
    if (opensToWork(r) && r.id !== c.focus && !kept) {
      const open = () => c.open(r.id);
      return (
        <AttnRow
          key={r.id}
          {...common}
          note=""
          cta={{ label: <VerbWords row={r} may={c.may} words={shortLabel(r)} />, kind: "ghost", onClick: open }}
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
        read: card && phone ? () => phone.walk(r.id) : null,
      },
      { word: c.word, stepDone: () => c.stepDone(r) },
    );
    return (
      <AttnRow
        key={r.id}
        {...common}
        cta={null}
        also={null}
        onOpen={card && phone ? () => phone.walk(r.id) : () => c.nav(r.cta.to)}
        work={work}
      />
    );
  });
}

/** Ask's ideas from the morning: each a row after the people, with its act and Not today. */
export function ideaRows(
  cards: readonly AskMorningCard[],
  morning: { messageId: string | null; threadId: string | null },
  c: NeedYouExtrasCtx,
): ReactElement[] {
  return cards.map((card) => {
    const kind = actKindOf({ id: card.id }, c);
    return (
      <AttnRow
        key={card.id}
        initials=""
        glyph="three"
        name={card.title}
        meta={W.idea.tag}
        // A new campaign's one line (its rules are behind Details, idea-work.tsx); any other card's summary.
        sentence={card.line ?? card.summary}
        status={[]}
        tone=""
        testid="queue-idea"
        work={
          <IdeaWork
            card={card}
            messageId={morning.messageId}
            threadId={morning.threadId}
            main={kind === "primary" ? "primary" : "secondary"}
            flash={c.flash}
            keep={() => c.keepIdea(card)}
            nav={c.nav}
          />
        }
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
