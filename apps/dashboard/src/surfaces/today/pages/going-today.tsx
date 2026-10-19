/**
 * Going today (decision 0064, step 2): what goes on its own today, each with its Stop, above what waits for your OK (the
 * queue, "Need you"). A batch held for a stop, a message sent once and set for later today, a reach-out's run and a reply
 * counting down to go in your name were a row among the people (the runs) or no row at all (the replies, said only as a
 * count): the one place a thing that goes unless stopped can be stopped before it goes. The rows and their words are
 * contracts' (goingTodayOf, over the wait rule's words); a run's Stop is Sent's own cancel, asked as Sent asks it, and a
 * reply's is the Inbox's own hold of its draft. Drawn only while something goes.
 */
import { useState } from "react";
import {
  GOING_TODAY_WORDS,
  goingTodayOf,
  runStopWords,
  runStoppedWords,
  runTitleOf,
  type GoingReply,
  type GoingTodayRowVM,
} from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { AttnRow } from "../../kit/attention/attn-row";
import { Confirm } from "../../kit/confirm/confirm";
import { cancelSend } from "../../inbox/verbs";
import { surfaceValue } from "../../surface-values";
import { appNavigate, broadcastVerbs, canDo, gate, refreshPlaybooks, refusalFlash, useMoved, useToast } from "../shell";
import { broadcastsRead, useRunsActing } from "./queue-runs";

/** Rows the band draws; the rest are counted in its head. */
const GOING_MAX = 4;

/** The replies counting down on the threads the Inbox holds: who each answers, when it goes and its draft. */
function repliesCountingDown(): GoingReply[] {
  const inbox = surfaceValue("inbox");
  if (!inbox || !Array.isArray(inbox.THREADS)) return [];
  return inbox.THREADS.flatMap((t) =>
    t.real && t.veto && typeof t.veto.endsAtMs === "number" && t.veto.messageId
      ? [
          {
            conversationId: t.conversationId,
            who: t.who,
            endsAtMs: t.veto.endsAtMs,
            messageId: t.veto.messageId,
            draft: t.veto.draft,
          },
        ]
      : [],
  );
}

/** What goes on its own today, as the band draws it, soonest first. */
function goingNow(): GoingTodayRowVM[] {
  const runs = (broadcastsRead()?.rows ?? []).map((r) => ({ ...r, title: runTitleOf(r) }));
  return goingTodayOf({ runs, replies: repliesCountingDown(), tz: pageClock().zone(), nowMs: Date.now() });
}

interface GoingRowProps {
  row: GoingTodayRowVM;
  stop: (row: GoingTodayRowVM) => unknown;
  busy: boolean;
}

/**
 * One thing going: its row, and, for a run, the question Sent asks before the same cancel (contracts runStopWords), in the
 * kit's Confirm under it. A reply's Stop withdraws its draft at once, as the Inbox's Hold does.
 */
function GoingRow({ row, stop, busy }: GoingRowProps) {
  const [asking, setAsking] = useState(false);
  const W = runStopWords("scheduled");
  const press = () => (row.stop.kind === "run" ? setAsking(true) : void stop(row));
  return (
    <>
      <AttnRow
        initials="▶"
        glyph={row.kind === "reply" ? "clock" : "bolt"}
        name={row.name}
        meta={row.meta}
        sentence={row.sentence}
        status={[]}
        tone="warn"
        cta={{
          label: GOING_TODAY_WORDS.stop,
          kind: "ghost",
          onClick: press,
          busy,
          gate: gate("approve", "stop a send"),
        }}
        also={null}
        onOpen={() => appNavigate(row.to)}
        testid="today-going-row"
      />
      {asking && (
        <Confirm
          block
          danger
          question={W.question({ name: row.name })}
          detail={W.detail}
          yes={W.yes}
          onYes={() => {
            setAsking(false);
            void stop(row);
          }}
          onNo={() => setAsking(false)}
          testid="today-going-stop"
        />
      )}
    </>
  );
}

export function TodayGoing() {
  // The runs and the threads it is drawn from: a run made, canceled or sending, a reply queued, sent or held.
  useMoved(["broadcasts", "inbox"]);
  const [toastNode, flash] = useToast();
  const acting = useRunsActing();
  const rows = goingNow();
  if (rows.length === 0) return toastNode;
  const stopRun = async (row: GoingTodayRowVM, id: string) => {
    const api = broadcastVerbs();
    if (!canDo("approve") || !api) return;
    const res = await api.cancel(id);
    if (!res.ok) {
      flash(refusalFlash(res, "Not canceled"));
      return;
    }
    refreshPlaybooks();
    flash({
      msg: (
        <>
          <b>{row.name}</b> {runStoppedWords("scheduled")}
        </>
      ),
    });
  };
  const stopReply = async (row: GoingTodayRowVM, messageId: string) => {
    if (!canDo("approve")) return;
    const res = await cancelSend(messageId);
    flash(
      res.ok
        ? {
            msg: (
              <>
                Held — <b>{row.name}</b> was not sent the draft
              </>
            ),
          }
        : { tone: "danger", msg: <>{res.message}</> },
    );
  };
  const stop = (row: GoingTodayRowVM) =>
    acting.run(row.key, () =>
      row.stop.kind === "run" ? stopRun(row, row.stop.id) : stopReply(row, row.stop.messageId),
    );
  return (
    <section className="tq today-going" data-testid="today-going">
      <div className="tq-head">
        <span className="tq-num tabular" data-testid="today-going-count">
          {rows.length}
        </span>
        <span className="tq-title">{GOING_TODAY_WORDS.title}</span>
        <span className="tq-sub">{GOING_TODAY_WORDS.sub(rows.length, Math.min(rows.length, GOING_MAX))}</span>
      </div>
      <div className="tq-list">
        {rows.slice(0, GOING_MAX).map((row) => (
          <GoingRow key={row.key} row={row} stop={stop} busy={acting.busy(row.key)} />
        ))}
      </div>
      {toastNode}
    </section>
  );
}
