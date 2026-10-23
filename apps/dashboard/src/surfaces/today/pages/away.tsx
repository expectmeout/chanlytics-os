/**
 * What happened while the owner was away: the bell's unread rows, as Today reads them (moved from
 * pages/dashboard-a-week.jsx, decision 0015, step 4). The words are contracts/today.ts todayAwayGrouped through
 * TODAY_HELPERS. Nothing is computed on the page.
 */
import type { AwayGroupVM, AwayQueueRef } from "@chanlytics/contracts";
import { Fragment, useEffect, useState } from "react";
import type { BellApi, BellRow } from "@/legacy-bridge/notifications";
import { Icon } from "../../kit/icon/icon";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, bell, holdStill } from "../shell";
import { runsPending } from "../../waits/run-acts";
import { Button } from "../../kit/button/button";
import { reviewLineOf } from "./review-line";
import { reviewsToAnswer } from "../need-you/reviews";

/** A bell row as the away card's rules read it: the bell writes its tone from a notification's, one of these three. */
type AwayBellRow = BellRow & { tone: "" | "ok" | "warn" };

/** The bell's rows as this device sees them, now. */
const feedOf = (api: BellApi): AwayBellRow[] => api.feed() as AwayBellRow[];

// What happened while the owner was away: the bell's unread rows, as Today reads them.
//
// It showed the newest five, which on a real workspace was five identical "No conversation happened" cards from one
// number, while a WhatsApp quality downgrade and three failed jobs sat under the cap, and the three conversations at
// the top of this very page were said again here. A row about anything the page draws above (a handoff's thread, a
// call-back's call, a closing window's thread, a call worth a listen, a new review the card's line draws) is dropped,
// like rows group and say how many, and a warning never sorts below good news.
//
// The head is the bell's own number, so the two badges on this screen never disagree, and the foot accounts for
// every unread row that is not drawn, including the ones the page above already holds. Both sentences come from
// contracts; this file draws them. It draws wherever a bell is published.
//
// A group does what the bell's does (contracts bellSections is the one grouping, frame/topbar/notif-popover.tsx draws it): a press opens the notes
// under it, in place, and each note opens its own record and is read as it is opened. A press that read the whole group and
// jumped to one page left the records it never showed unseen and counted as read (task 5.2, D1-notice-two-drawings). The card
// lists the unread alone, and has no dismiss of its own (E3): the bell keeps the read ones under Earlier.
export const TodayAway = () => {
  const api = bell() || null;
  const [rows, setRows] = useState<AwayBellRow[]>(() => (api ? feedOf(api) : []));
  // The group that is open, by its newest note: one at a time, as the bell's is.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // The review the card's line draws: its notice is that news a second time (review-line.ts); and the reviews Need you
  // offers to answer, which are rows above (decision 0071).
  const google = useSurface("google");
  const review = reviewLineOf(google);
  const answering = reviewsToAnswer(google);
  useEffect(() => {
    if (!api) return undefined;
    const refresh = () => setRows(feedOf(api));
    refresh();
    return api.onChange(refresh);
  }, [api]);
  // E3's rows carry no dismiss of their own: a note is read when it is opened, and Mark all read clears the rest.
  if (!api) return null;
  const T = surfaceValue("today");
  // What each row above is about: a queue row's thread, its call, or both (contracts AwayQueueRef), a waiting search by its
  // door, the runs the queue draws, by name (a run held for a word is a row up there, and the bell's "is ready" is about the
  // same run), and the review the card draws.
  // The runs the queue draws, waiting and too late alike (waits/run-acts.tsx runsPending), the first three.
  const { waiting: runsWaiting, late: runsLate } = runsPending();
  const runsDrawn = [...runsWaiting, ...runsLate].slice(0, 3);
  const inQueue: AwayQueueRef[] = [
    ...(T
      ? T.queue.rows.map((r) => ({
          conversationId: r.conversationId,
          callId: r.callId,
          searchTo: r.kind === "search" ? r.cta.to : null,
        }))
      : []),
    ...runsDrawn.map((r) => ({ runLabel: r.audience.label })),
    ...(review ? [{ review: review.review }] : []),
    ...answering.map((r) => ({ review: { id: r.id, reviewId: r.review_id } })),
  ];
  // And the unread rows the bell does not list (older than its newest sixty), counted in the head (S6-10).
  const { groups, total, foot, empty } = TODAY_HELPERS.awayGrouped(rows, inQueue, 5, api.older());
  // A note is read as it is opened, and opens its own record.
  const openNote = (n: AwayBellRow, to: string) => {
    api.read(n.id);
    appNavigate(to);
  };
  // One note: its mark, its words and the time, as the bell draws it; its press is its first action.
  const note = (n: AwayBellRow, inGroup: boolean) => {
    const act = n.actions && n.actions[0];
    return (
      <div
        key={n.id}
        className={`ta-row ${n.tone}${inGroup ? " in-group" : ""}`}
        data-testid={inGroup ? "today-away-note" : "today-away-row"}
        data-count={inGroup ? undefined : 1}
      >
        <span className="mark tbn-icon">
          <Icon name={n.icon} size={13} />
        </span>
        <button className="ta-main" onClick={() => act && openNote(n, act.to)} title={act ? act.label : undefined}>
          <span className="ta-line1">
            <span className="ta-title">{n.title}</span>
            <span className="ta-time tabular">{n.time}</span>
          </span>
          <span className="ta-msg">{n.message}</span>
        </button>
      </div>
    );
  };
  // Several notes of one kind said once: a press opens them under it, and holds the page still beneath the thumb.
  const group = (g: AwayGroupVM<AwayBellRow>) => {
    const n = g.row;
    const open = openGroup === n.id;
    return (
      <Fragment key={n.id}>
        <div className={`ta-row ${n.tone}`} data-testid="today-away-row" data-count={g.count}>
          <span className="mark tbn-icon">
            <Icon name={n.icon} size={13} />
          </span>
          <button
            className="ta-main"
            aria-expanded={open}
            aria-label={`${g.title}: ${open ? "hide them" : "show them"}`}
            onClick={(e) => holdStill(e && e.currentTarget, () => setOpenGroup(open ? null : n.id))}
          >
            <span className="ta-line1">
              <span className="ta-title">{g.title}</span>
              <span className="ta-time tabular">{n.time}</span>
              <span className="ta-chev" aria-hidden="true">
                <Icon name="chevron-down" size={12} />
              </span>
            </span>
            <span className="ta-msg">{`newest: ${n.title}`}</span>
          </button>
        </div>
        {open && g.members.map((m) => note(m, true))}
      </Fragment>
    );
  };
  return (
    <section className="tsec ta" data-testid="today-away">
      <div className="tsec-head">
        <span className="tsec-title">While you were away</span>
        <span className={`tq-count ${total ? "" : "calm"}`}>{total}</span>
        {/* The page's last section: as its rows go, the page holds still under the thumb (kit/motion/hold-still.ts holdStill). */}
        {total > 0 && (
          <Button
            variant="quiet"
            size="sm"
            className="ta-readall"
            onClick={(e) => holdStill(e && e.currentTarget, () => api.seenAll())}
          >
            Mark all read
          </Button>
        )}
      </div>
      {empty ? (
        <div className="tq-empty" data-testid="today-away-empty">
          <Icon name={empty.icon} size={14} /> {empty.text}
        </div>
      ) : (
        <div className="ta-list">{groups.map((g) => (g.count > 1 ? group(g) : note(g.row, false)))}</div>
      )}
      {foot && (
        <div className="tq-foot">
          <span>{foot}</span>
        </div>
      )}
    </section>
  );
};
