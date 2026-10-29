/**
 * Going today (decision 0064, step 2): the runs that go on their own today, each with its Stop, above what waits for your
 * OK (the queue, "Need you"). A batch held for a stop, a message sent once and set for later today and a reach-out's run
 * were a row among the people: this is the one place one can be stopped before it goes. The rows and their words are
 * contracts' (goingTodayOf, over the wait rule's words); a run's Stop is Sent's own cancel, asked as Sent asks it. A
 * reply counting down to go in your name is Need you's own row since decision 0071, where it can be stopped, changed and
 * sent (need-you/held-work.tsx), as Ask's read of Today already said (needs_you's replies_on_their_way). Drawn only while
 * a run goes.
 */
import { useState } from "react";
import {
  GOING_TODAY_WORDS,
  goingTodayOf,
  runStopWords,
  runStoppedWords,
  runTitleOf,
  type GoingTodayRowVM,
} from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { AttnRow } from "../../kit/attention/attn-row";
import { Confirm } from "../../kit/confirm/confirm";
import { appNavigate, canDo, gate, refusalFlash, useMoved, useToast, type Flash } from "../shell";
import { broadcastVerbs, broadcastsRead, refreshPlaybooks, useRunsActing } from "../../waits/run-acts";

/** Rows the band draws; the rest are counted in its head. */
const GOING_MAX = 4;

/** The runs that go on their own today, as the band draws them, soonest first (and a phone's day card, phone/day.tsx). */
export function goingNow(): GoingTodayRowVM[] {
  const runs = (broadcastsRead()?.rows ?? []).map((r) => ({ ...r, title: runTitleOf(r) }));
  return goingTodayOf({ runs, tz: pageClock().zone(), nowMs: Date.now() });
}

interface GoingRowProps {
  row: GoingTodayRowVM;
  stop: (row: GoingTodayRowVM) => unknown;
  busy: boolean;
}

/** One run going: its row, and the question Sent asks before the same cancel (contracts runStopWords), in the kit's Confirm under it. */
function GoingRow({ row, stop, busy }: GoingRowProps) {
  const [asking, setAsking] = useState(false);
  const W = runStopWords("scheduled");
  const press = () => setAsking(true);
  return (
    <>
      <AttnRow
        initials="▶"
        glyph="bolt"
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

/**
 * Stop a run going today: Sent's own cancel, asked as Sent asks it, said in the toast. The band's and a phone's day card's
 * (phone/day.tsx) one way to stop one.
 */
export async function stopGoing(row: GoingTodayRowVM, flash: (f: Flash) => void): Promise<void> {
  const api = broadcastVerbs();
  if (!canDo("approve") || !api) return;
  const res = await api.cancel(row.stop.id);
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
}

export function TodayGoing() {
  // The runs it is drawn from: a run made, canceled or sending.
  useMoved(["broadcasts"]);
  const [toastNode, flash] = useToast();
  const acting = useRunsActing();
  const rows = goingNow();
  if (rows.length === 0) return toastNode;
  const stop = (row: GoingTodayRowVM) => acting.run(row.key, () => stopGoing(row, flash));
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
