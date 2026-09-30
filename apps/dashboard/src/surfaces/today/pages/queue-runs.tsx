/**
 * The playbook runs Today's queue draws (moved from pages/dashboard-a-command.jsx, decision 0015, step 4).
 *
 * A playbook's run that waits for a person, or one under the veto window (scheduled, not yet sending) as rows of the
 * same grammar, with Approve or Stop where the button goes. What already went out is a line of the day's card. The
 * page keeps deciding WHICH rows wait or are scheduled; the words are contracts' (todayRunWords).
 */
import type { BroadcastVM } from "@chanlytics/contracts";
import type { BroadcastsSurface } from "@/surfaces/campaigns/broadcasts/surface";
import { AttnRow } from "../../kit/attention/attn-row";
import { TODAY_HELPERS } from "../helpers";
import {
  bcWhenWords,
  borrowed,
  broadcastVerbs,
  canDo,
  gate,
  refreshPlaybooks,
  refusalFlash,
  type Flash,
  type VerbAnswer,
} from "../shell";

/** Move to a route (the frame's `appNavigate`). */
export type Nav = (to: string) => void;

/** The shell's one toast, raised. */
export type Say = (flash: Flash) => void;

/** The kind the next verb is drawn as: the page's one primary verb is the first row's, every other is quiet. */
export type VerbKind = () => "primary" | "ghost";

/** The broadcasts surface as the bridge published it, or nothing before its first read (`window.__BROADCASTS`). */
export const broadcastsRead = () => borrowed<BroadcastsSurface>("__BROADCASTS");

/** The runs that want a seat: one waiting for a word, and one inside the veto window, about to send. */
export const runsPending = () => {
  const s = broadcastsRead();
  const all = (s && s.rows) || [];
  return {
    waiting: all.filter((r) => r.state === "pending_approval"),
    soon: all.filter((r) => r.state === "scheduled" && r.playbook_id && Date.parse(r.scheduled_for) > Date.now()),
  };
};

export const runRows = (nav: Nav, flash: Say, verbKind: VerbKind, room: number) => {
  const api = broadcastVerbs();
  const refreshed = () => refreshPlaybooks();
  const { waiting, soon } = runsPending();
  const words = (r: BroadcastVM) => TODAY_HELPERS.runs(r);
  const can = canDo("approve");
  // Each is said the moment the server takes it, from what it answered, not once the runs are read again behind it.
  // What a verb returns is the caller's (the tests await it), so it is typed as nothing React would read.
  const stop: (r: BroadcastVM) => unknown = async (r) => {
    if (!can || !api) return;
    let said = false;
    const say = () => {
      said = true;
      flash({
        msg: (
          <>
            <b>{r.audience.label}</b> stopped: nothing sends
          </>
        ),
      });
    };
    const res = await api.cancel(r.id, { onAccepted: say });
    if (res.ok) refreshed();
    if (!res.ok) flash(refusalFlash(res, "Not stopped"));
    else if (!said) say();
  };
  const approve: (r: BroadcastVM) => unknown = async (r) => {
    if (!can || !api) return;
    let said = false;
    const say = (data: NonNullable<VerbAnswer["data"]>) => {
      said = true;
      const n = data.recipient_count || r.recipient_count;
      // When it really goes (broadcasts-real.jsx bcWhenWords): the server moves a send outside 9:00-20:59 to nine.
      const when = bcWhenWords(data);
      const t = TODAY_HELPERS.runApproved(r.audience.label, n, when);
      flash({
        msg: (
          <>
            <b>{t.lead}</b> {t.rest}
          </>
        ),
      });
    };
    const res = await api.approve(r.id, { onAccepted: say });
    if (res.ok) refreshed();
    if (!res.ok) flash(refusalFlash(res, "Not approved"));
    // The JSX called `say(res.data)` with whatever the server answered: an accepted approve always carries its data.
    else if (!said) say(res.data as NonNullable<VerbAnswer["data"]>);
  };
  // Each row opens its own run (broadcasts/run:<id>): who is on it, and what it has done so far.
  const count = waiting.length + soon.length;
  const drawn = [
    ...waiting.slice(0, room).map((r) => (
      <AttnRow
        key={`run-${r.id}`}
        initials="▶"
        glyph="bolt"
        name={r.audience.label}
        meta={words(r).waiting.meta}
        sentence={words(r).waiting.sentence}
        status={words(r).waiting.status}
        tone="escalated"
        cta={{
          label: "Approve",
          kind: verbKind(),
          onClick: () => approve(r),
          gate: gate("approve", "approve a run"),
        }}
        also={{ label: "See who's on it", onClick: () => nav(`broadcasts/run:${r.id}`) }}
        onOpen={() => nav(`broadcasts/run:${r.id}`)}
        testid="brief-run-row"
      />
    )),
    ...soon
      .slice(0, Math.max(0, room - Math.min(waiting.length, room)))
      .map((r) => (
        <AttnRow
          key={`run-${r.id}`}
          initials="▶"
          glyph="bolt"
          name={r.audience.label}
          meta={words(r).soon.meta}
          sentence={words(r).soon.sentence}
          status={words(r).soon.status}
          tone="warn"
          cta={{ label: "Open", kind: verbKind(), onClick: () => nav(`broadcasts/run:${r.id}`) }}
          also={{ label: "Stop", onClick: () => stop(r), gate: gate("approve", "stop a run") }}
          onOpen={() => nav(`broadcasts/run:${r.id}`)}
          testid="brief-run-soon"
        />
      )),
  ];
  return { drawn, count, cut: count - drawn.length };
};
