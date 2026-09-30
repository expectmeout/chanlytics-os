/**
 * What happened while the owner was away: the bell's unread rows, as Today reads them (moved from
 * pages/dashboard-a-week.jsx, decision 0015, step 4). The words are contracts/today.ts todayAwayGrouped through
 * TODAY_HELPERS. Nothing is computed on the page.
 */
import type { AwayGroupVM, AwayQueueRef } from "@chanlytics/contracts";
import { useEffect, useState } from "react";
import type { BellApi, BellRow } from "@/legacy-bridge/notifications";
import type { BroadcastsSurface } from "@/legacy-bridge/surfaces/broadcasts";
import { Icon } from "../../kit/icon/icon";
import { surfaceValue } from "../../surface-values";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, bell, borrowed, holdStill } from "../shell";
import { Button } from "../../kit/button/button";

/** A bell row as the away card's rules read it: the bell writes its tone from a notification's, one of these three. */
type AwayBellRow = BellRow & { tone: "" | "ok" | "warn" };

/** The bell's rows as this device sees them, now. */
const feedOf = (api: BellApi): AwayBellRow[] => api.feed() as AwayBellRow[];

// What happened while the owner was away: the bell's unread rows, as Today reads them.
//
// It showed the newest five, which on a real workspace was five identical "No conversation happened" cards from one
// number, while a WhatsApp quality downgrade and three failed jobs sat under the cap, and the three conversations at
// the top of this very page were said again here. A row about anything the queue above holds (a handoff's thread, a
// call-back's call, a closing window's thread, a call worth a listen) is dropped, like rows group and say how many,
// and a warning never sorts below good news.
//
// The head is the bell's own number, so the two badges on this screen never disagree, and the foot accounts for
// every unread row that is not drawn, including the ones the queue above already holds. Both sentences come from
// contracts; this file draws them. It draws wherever a bell is published.
export const TodayAway = () => {
  const api = bell() || null;
  const [rows, setRows] = useState<AwayBellRow[]>(() => (api ? feedOf(api) : []));
  useEffect(() => {
    if (!api) return undefined;
    const refresh = () => setRows(feedOf(api));
    refresh();
    return api.onChange(refresh);
  }, [api]);
  if (!api) return null;
  const T = surfaceValue("today");
  // What each queue row is about: its thread, its call, or both (contracts AwayQueueRef), a waiting search by its
  // door, and the runs the queue draws, by name: a run held for a word is a row up there, and the bell's "is ready"
  // is about the same run.
  const B = borrowed<BroadcastsSurface>("__BROADCASTS");
  const runsDrawn = ((B && B.rows) || []).filter((r) => r.state === "pending_approval").slice(0, 3);
  const inQueue: AwayQueueRef[] = [
    ...(T
      ? T.queue.rows.map((r) => ({
          conversationId: r.conversationId,
          callId: r.callId,
          searchTo: r.kind === "search" ? r.cta.to : null,
        }))
      : []),
    ...runsDrawn.map((r) => ({ runLabel: r.audience.label })),
  ];
  const { groups, total, foot, empty } = TODAY_HELPERS.awayGrouped(rows, inQueue, 5);
  // A group is read and dismissed whole: its rows say one thing, so they go together.
  const open = (g: AwayGroupVM<AwayBellRow>, to: string) => {
    g.ids.forEach((id) => api.read(id));
    appNavigate(to);
  };
  const drop = (g: AwayGroupVM<AwayBellRow>) => g.ids.forEach((id) => api.dismiss(id));
  return (
    <section className="tsec ta" data-testid="today-away">
      <div className="tsec-head">
        <span className="tsec-title">While you were away</span>
        <span className={`tq-count ${total ? "" : "calm"}`}>{total}</span>
        {/* The page's last section: as its rows go, the page holds still under the thumb (data-bits holdStill). */}
        {total > 0 && (
          <Button variant="quiet" size="sm" onClick={(e) => holdStill(e && e.currentTarget, () => api.seenAll())}>
            Mark all read
          </Button>
        )}
      </div>
      {empty ? (
        <div className="tq-empty" data-testid="today-away-empty">
          <Icon name={empty.icon} size={14} /> {empty.text}
        </div>
      ) : (
        <div className="ta-list">
          {groups.map((g) => {
            const n = g.row;
            const act = n.actions && n.actions[0];
            return (
              <div key={n.id} className={`ta-row ${n.tone}`} data-testid="today-away-row" data-count={g.count}>
                <span className="mark tbn-icon">
                  <Icon name={n.icon} size={13} />
                </span>
                <button className="ta-main" onClick={() => act && open(g, act.to)} title={act ? act.label : undefined}>
                  <span className="ta-line1">
                    <span className="ta-title">{g.title || n.title}</span>
                    <span className="ta-time tabular">{n.time}</span>
                  </span>
                  <span className="ta-msg">{g.count > 1 ? `newest: ${n.title}` : n.message}</span>
                </button>
                <button
                  className="ta-x"
                  onClick={(e) => holdStill(e && e.currentTarget, () => drop(g))}
                  title={g.count > 1 ? `Dismiss all ${g.count}` : "Dismiss"}
                  aria-label={g.count > 1 ? `Dismiss all ${g.count}` : "Dismiss"}
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {foot && (
        <div className="tq-foot">
          <span>{foot}</span>
        </div>
      )}
    </section>
  );
};
