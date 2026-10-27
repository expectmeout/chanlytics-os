/**
 * Need you's rows (decision 0071), each in the kit's one row grammar (AttnRow) with its work under its words: the people
 * and the team's own to-dos the queue holds, then Ask's ideas and the reviews to answer. The section's one coral is the
 * first row still open; a row acted on keeps its place for the visit and gives the coral to the next. A row past the
 * first two that is worked in place is drawn short until opened (E8).
 */
import type { ReactElement } from "react";
import {
  NEED_YOU_WORDS as W,
  namesAPerson,
  reviewRoute,
  type AppointmentWord,
  type AskMorningCard,
  type GoogleReviewDto,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import { businessTrailFor } from "../../people/business-trail";
import type { Nav, VerbKind } from "../../waits/wait-rows";
import type { Flash } from "../shell";
import { IdeaWork } from "./idea-work";
import { ReviewWork, reviewerOf } from "./review-work";
import { opensToWork, shortLabel, workOf, worksInPlace } from "./rows";

/** Where a row worked in place is drawn short: from the third. */
const SHORT_FROM = 2;

/** What the section hands its rows. */
export interface NeedYouRowsCtx {
  nav: Nav;
  verbKind: VerbKind;
  may: boolean;
  tz: string;
  flash: (f: Flash) => void;
  keep: (row: TodayQueueRowVM) => void;
  /** The rows acted on this visit, ideas and reviews among them: they keep their place, and the coral passes over them. */
  kept: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  expand: (id: string) => void;
  word: AppointmentWord;
  stepDone: (row: TodayQueueRowVM) => void;
}

/** What the ideas and the reviews are handed besides: an idea or a review acted on is kept in its place for the visit. */
export interface NeedYouExtrasCtx extends NeedYouRowsCtx {
  keepIdea: (card: AskMorningCard) => void;
  keepReview: (review: GoogleReviewDto) => void;
}

/**
 * The kind of a row's act: the coral for the first row still open, quiet for the rest. A reply of the receptionist's
 * counting down never takes it: it goes unless stopped, so its press is Stop, and the coral is for what waits on you.
 */
function actKindOf(r: { id: string; kind?: TodayQueueRowVM["kind"] }, c: NeedYouRowsCtx): "primary" | "ghost" {
  return c.kept.has(r.id) || r.kind === "held" ? "ghost" : c.verbKind();
}

/** The queue's rows, worked in place where their kind is. */
export function needYouRows(rows: readonly TodayQueueRowVM[], c: NeedYouRowsCtx): ReactElement[] {
  let worked = 0;
  return rows.map((r) => {
    const face = namesAPerson(r) ? { person: { name: r.who, initials: r.initials } } : { initials: r.initials };
    const common = {
      ...face,
      name: r.who,
      trail: namesAPerson(r) ? businessTrailFor(r.person_id) : null,
      meta: [r.channel, r.via, r.when].filter(Boolean).join(", "),
      sentence: r.sentence,
      quoted: r.quoted,
      lead: r.lead,
      status: r.status,
      tone: r.tone,
      testid: `queue-${r.kind}`,
    };
    // A row of no work of its own keeps its one door: a call worth a listen, a search's question, the rows for the rest.
    if (!worksInPlace(r)) {
      const kind = actKindOf(r, c);
      return (
        <AttnRow
          key={r.id}
          {...common}
          cta={{ label: r.cta.label, kind, onClick: () => c.nav(r.cta.to) }}
          also={null}
          onOpen={() => c.nav(r.cta.to)}
        />
      );
    }
    const kind = actKindOf(r, c);
    const at = worked++;
    if (at >= SHORT_FROM && opensToWork(r) && !c.expanded.has(r.id) && !c.kept.has(r.id)) {
      const open = () => c.expand(r.id);
      return (
        <AttnRow key={r.id} {...common} cta={{ label: shortLabel(r), kind, onClick: open }} also={null} onOpen={open} />
      );
    }
    const work = workOf(
      r,
      { main: kind === "primary" ? "primary" : "secondary", may: c.may, tz: c.tz, flash: c.flash, keep: c.keep },
      { word: c.word, stepDone: () => c.stepDone(r) },
    );
    return <AttnRow key={r.id} {...common} cta={null} also={null} onOpen={() => c.nav(r.cta.to)} work={work} />;
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
        sentence={card.summary}
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
