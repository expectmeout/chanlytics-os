/**
 * Chanlytics, Broadcasts: one run, opened, its people and the verbs on it (moved from
 * legacy/pages/broadcasts-run.jsx, decision 0015; a run waiting on you opens as the sheet in run-sheet.tsx).
 *
 * One run, opened, as the canvas's After board draws it: what went out and what came back, by the run's own people.
 * Five figures, everyone it touched in the words of what happened to them, every reply quoted with what has happened
 * since, and, for a run that stopped, why and what to do next. The words are the contracts' (toRunReportVM, through
 * `broadcasts.report`); this draws them. It is the pane beside the list (parts/split.tsx), drawn in every state it can
 * be in -- being read, gone, unread, a reach-out's block, a run's approval sheet, its report -- and it is read when it
 * opens.
 */
import { useEffect, useReducer, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  LIFECYCLE_WORDS,
  RUN_UNNAMED_WORDS,
  runStillMoving,
  runStopWords,
  runTitleOf,
  sequenceRoute,
} from "@chanlytics/contracts";
import type { BroadcastDetailDto, BroadcastDto, BroadcastVM, RunFilterId, RunReportVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { PolicyChip } from "../../kit/policy-chip/policy-chip";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { gate, gatedProps, navigate, touchSwipe } from "../../legacy-verbs";
import { CmDot } from "../parts/head";
import { CmPane, useCmPhone } from "../parts/split";
import { ReachOutRun, RoRunDock, RoRunMore, roRunHead, roRunWaits } from "../reach-out/approval";
import { reachOuts } from "../reach-out/surface";
import { starters } from "../templates/verbs";
import { BcSheet, BcSheetMore, bcPersonRow, bcSheetDock, bcSheetSub } from "./run-sheet";
import type { BcSheetAsk } from "./run-sheet";
import { broadcasts } from "./verbs";
import { bcLateWords, bcOpensOnItsSheet } from "./when-words";

// Stable empties, so a workspace without lists or templates does not re-run
// the effects on every render.
export const BC_NONE: never[] = [];

/**
 * When a run went, for the head's line, by the business's clock as the ledger says it: "Today 9:00 AM",
 * "Sep 12 · 10:00 AM".
 */
const bcWhen = (iso: string | null | undefined): string | null => {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return null;
  const w = pageClock().when(ms);
  return w.charAt(0).toUpperCase() + w.slice(1);
};

// A broadcast that can still change: waiting for a person, scheduled, or sending.
export const BC_LIVE = new Set(["pending_approval", "scheduled", "sending"]);

// Who "Everyone it touched" can show; who is in each is the report's (RunPersonVM.in).
const BC_FILTERS: ReadonlyArray<readonly [RunFilterId, string]> = [
  ["all", "All"],
  ["replied", "Replied"],
  ["held", "Held back"],
  ["stopped", "Stopped"],
];

const BC_FILTER_NONE: Record<RunFilterId, string> = {
  all: "Nobody is on this run.",
  replied: "Nobody has written back yet.",
  held: "Nobody was held back.",
  stopped: "Nobody asked to stop.",
};

// How many replies "What came back" quotes; the rest are threads in the Inbox, and it says how many.
const BC_REPLIES_SHOWN = 5;

/** The last answer for a run, kept with the broadcast it answered for: a read of another id is not this one's. */
interface BcAnswer {
  id: string;
  ok: boolean;
  data: BroadcastDetailDto | null;
  gone: boolean;
}

// A live reach-out run the check is still reading, or whose owner's drafts are still to come (00429), read again every
// fifteen seconds until neither or the run is closed (R21): the bridge's one timer (`reachOuts.watchRun`), each answer
// kept as the run's.
function useBcRunWatch(id: string, d: BroadcastDetailDto | null, setAnswer: Dispatch<SetStateAction<BcAnswer | null>>) {
  const checking = !!(d && d.reach_out && BC_LIVE.has(d.broadcast.state) && reachOuts.moving(d.reach_out));
  useEffect(() => {
    if (!checking) return undefined;
    return reachOuts.watchRun(id, (data) => setAnswer({ id, ok: true, data, gone: false }));
  }, [id, checking, setAnswer]);
}

// A live reach-out run is its own block (Reach out Part 4 PR 7, reach-out/approval.tsx), waiting on you or not (R20).
const bcReachOutBlock = (
  d: BroadcastDetailDto,
  p: {
    sheet: BcSheetAsk | null;
    acts: ReactNode;
    onDecided: () => void;
    docked: { seeAll: boolean; onSeeAll: () => void } | null;
  },
) =>
  d.reach_out && BC_LIVE.has(d.broadcast.state) ? (
    <div className="bc-report is-sheet is-approval" data-testid="bc-detail">
      <ReachOutRun d={d} {...p} />
    </div>
  ) : null;

/** What a pane's head says, beside the name the pane is given: the rest of what CmPane draws there. */
interface BcPaneHead {
  title?: ReactNode;
  badge?: ReactNode;
  sub?: ReactNode;
  tools?: ReactNode;
}

/**
 * What the pane's head says of a run: its state beside its name, and under it when it went, whose it is, how many, and
 * the template it sent. Its verbs (`tools`) are the run's, and Send it again.
 */
function bcRunHead(p: {
  d: BroadcastDetailDto;
  acts: ReactNode;
  again: ((b: BroadcastDto) => ReactNode) | null;
}): BcPaneHead {
  const { d, acts, again } = p;
  const b = d.broadcast;
  const playbookId = b.playbook_id;
  const when = bcWhen(b.started_at || b.scheduled_for);
  const lang = b.template_language ? String(b.template_language).slice(0, 2).toUpperCase() : null;
  return {
    title: b.name,
    badge: <StatePill kind="broadcast" value={b.state} />,
    sub: (
      <>
        {when && (
          <>
            <span>{when}</span>
            <CmDot />
          </>
        )}
        {playbookId ? (
          <LinkButton className="bc-run-link" onClick={() => navigate(sequenceRoute(b.sequence_id))}>
            {b.audience.label} campaign
          </LinkButton>
        ) : (
          <span>{b.audience.label}</span>
        )}
        <CmDot />
        <span className="tabular">{d.recipients.length} enrolled</span>
        <CmDot />
        <span className="mono bc-report-tpl">
          {b.template_name}
          {lang ? ` · ${lang}` : ""}
        </span>
      </>
    ),
    tools: (
      <>
        {acts}
        {again && again(b)}
      </>
    ),
  };
}

/** What the pane's head says of a run waiting on you: its name, its policy class, and where it sits in the queue. */
function bcSheetHead(d: BroadcastDetailDto, sheet: BcSheetAsk): BcPaneHead {
  const pb = sheet.playbook;
  return {
    title: runTitleOf(d.broadcast),
    badge: pb ? <PolicyChip cls={pb.policy_class} /> : null,
    sub: bcSheetSub(sheet),
  };
}

/**
 * A slot's value, in words: its source's own, or what was typed. A row that kept a bare string (from before values
 * were specs) reads as itself.
 */
const bcParamWords = (p: BroadcastDto["params"][number]) => {
  if (p && p.kind && p.kind !== "text") return (starters.sources[p.kind] || p.kind).toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- as the JSX had it (decision 0015)
  return (p && p.value) || String(p);
};

/** What filled each slot, in words. */
function bcValues(b: BroadcastDto) {
  return (
    <div className="bc-report-values">
      <span className="cl-prof-aut-hint">Values: {b.params.map(bcParamWords).join(" · ")}</span>
    </div>
  );
}

/** The five figures: what went out and what came back, each with when it came. */
function bcFigures(vm: RunReportVM) {
  return (
    <div className="bc-figs" data-testid="bc-figures">
      {vm.figures.map((f) => {
        const top = Math.max(...f.bars, 1);
        return (
          <div key={f.id} className="bc-fig" data-tone={f.tone} data-testid={`bc-fig-${f.id}`}>
            <span className="bc-fig-k">{f.label}</span>
            <span className="bc-fig-n">
              <span className="bc-fig-v tabular">{f.n}</span>
              {f.pct !== null && <span className="bc-fig-pct">{f.pct}%</span>}
            </span>
            <span className="bc-fig-bars" aria-hidden="true" title={`When they came, across ${vm.span}`}>
              {f.bars.map((v, i) => (
                <span key={i} style={{ height: `${v > 0 ? Math.max(3, Math.round((v / top) * 16)) : 1}px` }} />
              ))}
            </span>
            <span className="bc-fig-sub">{f.sub}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Everyone it touched, and the filter over them: the kit's sub-tabs, as the person's History filters are. */
function bcTouched(p: { vm: RunReportVM; filter: RunFilterId; setFilter: (filter: RunFilterId) => void }) {
  const { vm, filter, setFilter } = p;
  const shown = vm.people.filter((q) => q.in.includes(filter));
  return (
    <section className="bc-touched" data-testid="bc-touched">
      <div className="bc-touched-head">
        <span className="bc-card-title">Everyone it touched</span>
        <SubTabs
          label="Who to show"
          className="bc-touched-filters"
          value={filter}
          tabs={BC_FILTERS.map(([k, label]) => ({
            id: k,
            label,
            count: vm.groups[k],
            testid: `bc-touched-${k}`,
          }))}
          onSelect={(k) => {
            const next = BC_FILTERS.find(([id]) => id === k);
            if (next) setFilter(next[0]);
          }}
          dense
        />
      </div>
      {shown.map(bcPersonRow)}
      {shown.length === 0 && <div className="bc-touched-none">{BC_FILTER_NONE[filter]}</div>}
    </section>
  );
}

/** Beside the people: why it stopped, and what came back. */
function bcAside(vm: RunReportVM) {
  return (
    <div className="bc-report-aside">
      {/* Why it stopped and what to do next, in the run's own words: a failed run never says "something went wrong". */}
      {vm.stop && (
        <section className="bc-card" data-testid="bc-stopped">
          <span className="bc-card-title">Why it stopped</span>
          <div className="bc-stop-box" data-tone={vm.stop.tone}>
            <span className="bc-stop-dot" aria-hidden="true" />
            <span className="bc-stop-text">
              <span className="bc-stop-line" data-testid="bc-detail-failure">
                It stopped: <strong>{vm.stop.words}</strong>.
              </span>
              {vm.stop.fix && <span className="bc-stop-fix">{vm.stop.fix}</span>}
            </span>
          </div>
        </section>
      )}
      <section className="bc-card" data-testid="bc-back">
        <span className="bc-card-title">What came back</span>
        <p className="bc-card-lede">
          A broadcast does not hold a conversation. Every reply is a thread in the Inbox, and the receptionist answers
          it under its usual autonomy.
        </p>
        {vm.replies.length > 0 ? (
          <div className="bc-back-list">
            {vm.replies.slice(0, BC_REPLIES_SHOWN).map((x) => (
              <LinkButton
                key={x.contact_id}
                className="bc-back-row"
                disabled={!x.to}
                onClick={() => navigate(x.to as string)}
                title={`${x.name} — open the thread`}
                data-testid="bc-reply"
              >
                <Face person={{ name: x.name, initials: x.initials }} size="sm" />
                <span className="bc-back-text">
                  <span className="bc-back-quote">{x.quote || "A reply with no words in it"}</span>
                  <span className="bc-back-outcome" data-tone={x.outcome.tone}>
                    {x.outcome.words}
                  </span>
                </span>
              </LinkButton>
            ))}
          </div>
        ) : (
          <p className="bc-back-none">Nobody has written back yet. A reply lands in the Inbox the moment it comes.</p>
        )}
        <LinkButton className="bc-back-all" onClick={() => navigate("inbox")} data-testid="bc-back-inbox">
          {vm.replies.length > BC_REPLIES_SHOWN
            ? `${vm.replies.length - BC_REPLIES_SHOWN} more in the Inbox`
            : "Open the Inbox"}{" "}
          <Icon name="arrow-right" size={11} />
        </LinkButton>
      </section>
    </div>
  );
}

/** What a run decided on its page is drawn with: the run, the page's acts and its pane, and whether it is a phone's. */
interface BcDecidedAsk {
  d: BroadcastDetailDto;
  sheet: BcSheetAsk | null;
  acts: ReactNode;
  phone: boolean;
  seeAll: boolean;
  onSeeAll: () => void;
  onDecided: () => void;
  pane: (head: BcPaneHead, body: ReactNode, foot?: ReactNode) => ReactNode;
}

/**
 * A run decided on its page, as it is decided there: a live reach-out's run as its block, a campaign run waiting for
 * approval as its sheet. On a phone each docks its acts at the pane's foot and keeps Skip in its head's menu, as a
 * sequence's record does. Null for any other run, which is its report.
 */
function bcDecidedPane({ d, sheet, acts, phone, seeAll, onSeeAll, onDecided, pane }: BcDecidedAsk): ReactNode {
  // A reach-out's run waiting on its owner docks its acts on a phone, as a campaign run's sheet does (below).
  const roDock = phone && sheet && roRunWaits(d, sheet) ? sheet : null;
  const ro = bcReachOutBlock(d, { sheet, acts, onDecided, docked: roDock ? { seeAll, onSeeAll } : null });
  if (ro)
    return pane(
      { ...(roRunHead(d, sheet) || {}), ...(roDock ? { tools: <RoRunMore d={d} sheet={roDock} /> } : {}) },
      ro,
      roDock ? <RoRunDock d={d} sheet={roDock} seeAll={seeAll} onSeeAll={onSeeAll} /> : undefined,
    );
  const b = d.broadcast;
  const avm =
    sheet && b.state === "pending_approval"
      ? broadcasts.approval(d, sheet.playbook, sheet.businessName, sheet.paused)
      : null;
  if (!sheet || !avm) return null;
  const people = broadcasts.report(d).people;
  return pane(
    { ...bcSheetHead(d, sheet), ...(phone ? { tools: <BcSheetMore b={b} avm={avm} sheet={sheet} /> } : {}) },
    <div className="bc-report is-sheet is-approval" data-testid="bc-detail">
      <BcSheet d={d} people={people} avm={avm} sheet={sheet} seeAll={seeAll} onSeeAll={onSeeAll} docked={phone} />
    </div>,
    phone ? bcSheetDock({ b, avm, sheet, seeAll, onSeeAll }) : undefined,
  );
}

interface BroadcastDetailProps {
  id: string;
  /** The name the list's row has for it, which the pane's head says while the report is read (else "Run"). */
  name?: string | null;
  onClose: () => void;
  acts?: ReactNode;
  again?: ((b: BroadcastDto) => ReactNode) | null;
  sheet?: BcSheetAsk | null;
}

export function BroadcastDetail({
  id,
  name = null,
  onClose,
  acts = null,
  again = null,
  sheet = null,
}: BroadcastDetailProps) {
  // The last answer, kept with the broadcast it answered for: a read of another id is not this one's.
  const [answer, setAnswer] = useState<BcAnswer | null>(null);
  const [asks, ask] = useReducer((n: number) => n + 1, 0);
  const [retrying, setRetrying] = useState(false);
  // Who "Everyone it touched" shows: everyone, or the ones who replied, were held back, or asked to stop.
  const [filter, setFilter] = useState<RunFilterId>("all");
  // Whether a waiting run's sheet shows who gets it.
  const [seeAll, setSeeAll] = useState(false);
  // A run this tab has opened paints at once from the courier's read cache (the loading standard's C), and is read
  // again behind: every open was ~250ms of "Reading who got it…" first, the second open too.
  const held = !answer || answer.id !== id ? broadcasts.peekDetail(id) : null;
  const mine: BcAnswer | null =
    answer && answer.id === id ? answer : held && held.ok ? { id, ok: true, data: held.data, gone: false } : null;
  const d = mine && mine.ok ? mine.data : null;
  // While its report can still move it is read again whenever the surface is -- which re-reads on every message, so the
  // people fill in as a send goes out, and the replies, yeses and stops as they come back for three days after it ended
  // (contracts runStillMoving; the wiring's second audit, X2-2) -- and not once that window has closed.
  const live = !!(d && runStillMoving(d.broadcast, Date.now()));
  useEffect(() => {
    if (!live) return undefined;
    window.addEventListener("surface:broadcasts", ask);
    return () => window.removeEventListener("surface:broadcasts", ask);
  }, [live]);
  useEffect(() => {
    let on = true;
    void broadcasts.detail(id).then((r) => {
      if (!on) return;
      setRetrying(false);
      // A re-read that fails keeps what the last one read. A link to a broadcast this workspace does not have (a 404,
      // or an id that is not one) is gone, and a Retry could only fail again.
      setAnswer((prev) =>
        !r.ok && prev && prev.id === id && prev.ok
          ? prev
          : { id, ok: r.ok, data: r.ok ? r.data : null, gone: !r.ok && (r.status === 404 || r.status === 400) },
      );
    });
    return () => {
      on = false;
    };
  }, [id, asks]);
  useBcRunWatch(id, d, setAnswer);
  // On a phone the pane is the screen: a swipe from its edge goes back as its Back does, and a waiting run's acts dock at
  // its foot.
  const phone = useCmPhone();
  const swipe = phone ? touchSwipe({ onBack: onClose, when: () => phone }) : undefined;
  // The run's pane, in whatever state it is in: Close at its head (Escape closes it too), its name, and the report in its
  // body. While the report is read it has the name the list's row has; the run's own head says the rest once it lands.
  const pane = (head: BcPaneHead, body: ReactNode, foot?: ReactNode) => (
    <CmPane
      id={`bc-run-${id}`}
      testid="bc-run-solo"
      closeTestid="bc-detail-close"
      className="bc-pane"
      title={head.title ?? name ?? RUN_UNNAMED_WORDS}
      badge={head.badge}
      sub={head.sub}
      tools={head.tools}
      foot={foot}
      swipe={swipe}
      onClose={onClose}
    >
      {body}
    </CmPane>
  );
  if (!mine) {
    return pane(
      {},
      <div className="bc-report" data-testid="bc-detail">
        <div className="bc-report-wait">
          <span className="cl-prof-aut-hint">Reading who got it…</span>
        </div>
      </div>,
    );
  }
  if (mine.gone) {
    return pane(
      {},
      <div className="bc-report" data-testid="bc-detail">
        <EmptyState
          kind="line"
          title="This broadcast isn't in this workspace."
          body="The link may be old, or from another workspace."
          testid="bc-detail-gone"
        />
      </div>,
    );
  }
  if (!d) {
    return pane(
      {},
      <div className="bc-report" data-testid="bc-detail">
        <FailedRead
          kind="line"
          what="who got this broadcast"
          onRetry={() => {
            setRetrying(true);
            ask();
          }}
          busy={retrying}
          testid="bc-detail-failed"
        />
      </div>,
    );
  }
  const b = d.broadcast;
  const onSeeAll = () => setSeeAll((v) => !v);
  const decided = bcDecidedPane({ d, sheet, acts, phone, seeAll, onSeeAll, onDecided: ask, pane });
  if (decided) return decided;
  const vm = broadcasts.report(d);
  return pane(
    bcRunHead({ d, acts, again }),
    <div className="bc-report" data-testid="bc-detail">
      {b.params.length > 0 && bcValues(b)}
      {bcFigures(vm)}
      <div className="bc-report-body">
        {bcTouched({ vm, filter, setFilter })}
        {bcAside(vm)}
      </div>
    </div>,
  );
}

interface BcRunVerbsProps {
  row: BroadcastVM;
  canSend: boolean;
  armed: boolean;
  onArm: (on: boolean) => void;
  stopping: boolean;
  approving?: boolean;
  approve: (row: BroadcastVM) => void;
  cancel: (row: BroadcastVM) => void;
}

// A run's verbs: Approve for one waiting on a person, and the stop, armed and
// named for what it does -- stopping a send, skipping a run nobody approved and
// cancelling one still to come are three acts, and none of them is one click
// (the audit's D13). At the head of an opened run. A run the offer says is decided
// on its sheet (a reach-out's: bcOpensOnItsSheet, contracts waitingRunOffer) is
// neither approved nor skipped there: the pane that is already its sheet draws
// none of it.
export function BcRunVerbs({
  row,
  canSend,
  armed,
  onArm,
  stopping,
  approving = false,
  approve,
  cancel,
}: BcRunVerbsProps) {
  const stop = runStopWords(row.state);
  if (row.state === "pending_approval" && bcOpensOnItsSheet(row)) return null;
  // A run whose day has passed is refused by the verb (bcLateWords): the button says why instead of answering 409, and
  // the Skip beside it is the act left.
  const late = row.state === "pending_approval" ? bcLateWords(row) : null;
  if (armed && canSend) {
    return (
      <Confirm
        question={stop.question(row)}
        detail={stop.detail}
        yes={stop.yes}
        danger
        busy={stopping}
        onYes={() => cancel(row)}
        onNo={() => onArm(false)}
        testid="bc-stop"
      />
    );
  }
  return (
    <>
      {row.state === "pending_approval" && (
        <Button
          size="sm"
          variant="primary"
          disabled={approving}
          onClick={() => (late ? undefined : approve(row))}
          data-testid="bc-approve"
          {...(!canSend ? gate("approve", "approve a run") : late ? gatedProps(late) : {})}
        >
          {approving ? "Approving…" : LIFECYCLE_WORDS.ledger.approve(row.recipient_count)}
        </Button>
      )}
      {/* Named for what it does: Stop, Skip or Cancel -- never "Hold", which
          would promise a pause the act does not make. */}
      {canSend && BC_LIVE.has(row.state) && (
        <Button size="sm" tone="danger" onClick={() => onArm(true)} data-testid="bc-stop">
          {stop.verb}
        </Button>
      )}
    </>
  );
}
