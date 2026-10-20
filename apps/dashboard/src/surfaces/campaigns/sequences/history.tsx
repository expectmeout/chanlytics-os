/**
 * A sequence's History (D3: Sent becomes History; the canvas's History board; redrawn in the run-to-leads canvas's vein, 20
 * Oct 2026): what it sent over a period, then day by day. One card over the period picked (the last 30 days, 90, or all of
 * it): what it sent, the one large number, and what came of it on a line under a hairline, each with what it counts on its label,
 * counted from the same batches Reports counts (contracts historyFigures over 00442 sequence_batch_counts), with the door
 * to Reports over the same days, and Replied a door to the Inbox over them (contracts sequenceRepliesRoute: the threads that
 * answered it, and nothing else), as is "All N replies in the Inbox" beside Day by day. Then a row a batch, newest first:
 * when, what it went to and what came of it, each a door to its run's one screen at its home (contracts runRoute, the
 * Campaigns wiring review's lane 2), in one pane under its caption, each marked by what it is (went, waits, to come,
 * canceled): its decision while it waits, its report once it went, where the replies it drew,
 * everyone it went to and its figures are. A day opened in place said the report a second time, and went. Older batches are
 * read a page at a time, and as far back as the period asks.
 */
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import {
  batchModeOf,
  SEQUENCE_HISTORY_PERIODS,
  SEQUENCE_HISTORY_WORDS as H,
  batchWent,
  historyCovers,
  historyDayWords,
  historyDays,
  historyFigures,
  historyIn,
  historySince,
  historyStamp,
  historyUpcomingWords,
  sequenceNextOf,
  sequenceRoute,
  lensRoute,
  runRoute,
  sequenceRepliesRoute,
  zoneDayKey,
  type SequenceBatchDto,
  type SequenceHistoryPeriod,
  type SequenceRecordDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Figure } from "../../kit/figure/figure";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { ListRow } from "../../kit/list-row/list-row";
import { StatePill } from "../../kit/pill/state-pill";
import { Segmented } from "../../kit/segmented/segmented";
import { routeDoor } from "../../legacy-verbs";
import { useSequenceRead } from "./use-record";
import { sequenceVerbs as verbs } from "./verbs";

const isPeriod = (v: string): v is SequenceHistoryPeriod => SEQUENCE_HISTORY_PERIODS.some((p) => p.id === v);

/** A day's mark, by what its batch is: went (or is going), failed, waits for an OK, is to come, or was canceled. */
const DAY_GLYPHS: Record<string, string> = {
  sent: "send",
  sending: "send",
  failed: "alert",
  pending_approval: "clock",
  scheduled: "calendar",
  canceled: "ban",
};
const dayMark = (state: SequenceBatchDto["state"]): ReactElement => (
  <Icon name={DAY_GLYPHS[state] ?? "dot"} size={14} />
);

/**
 * One batch's row: when, and what came of it; pressed, it opens its run's one screen at its home, whatever the run is: a
 * day that went says what came back there, and one that has not (waiting for your OK, or still to go) is decided there.
 */
function DayRow(p: { b: SequenceBatchDto; rec: SequenceRecordDto; nowMs: number }) {
  const { b, rec, nowMs } = p;
  const place = b.place && rec.steps.length > 1 ? H.step(b.place) : null;
  const said = historyDayWords(b, place);
  const end = (cls: string) =>
    b.state === "pending_approval" ? (
      <StatePill kind="tone" value="warn" label={said.end} className={cls} />
    ) : (
      <span className={cls}>{said.end}</span>
    );
  return (
    <ListRow
      mark={dayMark(b.state)}
      name={historyStamp(Date.parse(b.at), rec.timezone, nowMs)}
      end={end}
      said={said.said}
      {...routeDoor(runRoute(b.id, rec.sequence.id))}
      className="sq-day"
      data-testid={`sq-batch-${b.id}`}
    />
  );
}

/**
 * The batch to come, over the days that went: the one made (waiting, scheduled) where the days read do not hold it, else
 * the next run by its hour (a daily moment makes its batch at its hour): when, who it is for where they are counted, and
 * how it goes. A press opens who it goes to (People). A batch the days hold is a day's row of its own.
 */
function UpcomingRow(p: { rec: SequenceRecordDto; nowMs: number; batches: readonly SequenceBatchDto[] }) {
  const { rec, nowMs, batches } = p;
  const row = rec.sequence;
  const next = sequenceNextOf(row, rec.last_run_for, rec.timezone, nowMs);
  const made = row.next;
  if (!next || (made && batches.some((b) => b.id === made.id))) return null;
  // A batch made and waiting for an OK waits; one to come goes by its sequence's mode, or asks while its words are new.
  const said = historyUpcomingWords(
    next.people,
    made?.state === "pending_approval" ? "ask" : batchModeOf({ mode: row.mode, words_ok_at: row.first?.words_ok_at }),
  );
  return (
    <ListRow
      mark={dayMark("scheduled")}
      name={historyStamp(next.at, rec.timezone, nowMs)}
      end={(cls) => (said.end ? <span className={`${cls} sq-day-soon`}>{said.end}</span> : null)}
      said={said.said}
      className="sq-day sq-day-next"
      data-testid="sq-history-next"
      {...routeDoor(sequenceRoute(row.id, "people"))}
    />
  );
}

/** A page further back, read to continue the first page: kept with the batch it continues from. */
interface Tail {
  from: string;
  batches: SequenceBatchDto[];
  more: boolean;
  /** A page that could not be read stops the reading on; Older asks again by hand. */
  stalled: boolean;
}

/**
 * History's batches: the first page (the record's own read, kept for the tab) and the pages read after it, as far back as
 * the period asks, and further on Older. A page further back belongs to the first page it continued: when the first page
 * is read again and ends elsewhere (a batch made since pushed one off it), the pages after it are read again.
 */
function useHistoryPages(id: string, again: number, since: string | null, tz: string) {
  const read = useSequenceRead(id, verbs.history, verbs.peekHistory, { again });
  const [tail, setTail] = useState<Tail | null>(null);
  const [busy, setBusy] = useState(false);
  const first = read.state === "read" ? read.data : null;
  const firstEnd = first?.batches[first.batches.length - 1]?.id ?? null;
  const kept = tail && tail.from === firstEnd ? tail : null;
  const batches = first ? [...first.batches, ...(kept?.batches ?? [])] : [];
  const more = kept ? kept.more : (first?.more ?? false);
  const lastAt = batches[batches.length - 1]?.at ?? null;
  const covered = kept?.stalled || historyCovers({ batches, more }, since, tz);
  const older = async () => {
    if (!firstEnd || !lastAt || busy) return;
    setBusy(true);
    const r = await verbs.history(id, lastAt);
    setBusy(false);
    setTail((was) => {
      const base = was && was.from === firstEnd ? was : { from: firstEnd, batches: [], more: true, stalled: false };
      return r.ok
        ? { from: firstEnd, batches: [...base.batches, ...r.data.batches], more: r.data.more, stalled: false }
        : { ...base, stalled: true };
    });
  };
  // Read on while the period reaches past what is read; one page at a time, each from the last batch read.
  useEffect(() => {
    if (!first || covered || busy) return;
    void older();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `older` reads from these; each page read moves lastAt
  }, [first, covered, busy, lastAt]);
  return { read, batches, more, covered, busy, older };
}

export function SequenceHistory(p: { rec: SequenceRecordDto; again: number; moved: () => void }) {
  const { rec, again, moved } = p;
  const [period, setPeriod] = useState<SequenceHistoryPeriod>("30");
  const tz = rec.timezone;
  const nowMs = Date.now();
  const since = historySince(period, tz, nowMs);
  const { read, batches, more, covered, busy, older } = useHistoryPages(rec.sequence.id, again, since, tz);
  if (read.state === "failed")
    return <FailedRead what="what it sent" why={read.why} onRetry={moved} testid="sq-history-failed" />;
  if (read.state === "reading") return <div className="sq-reading" aria-busy="true" />;
  if (batches.length === 0)
    return (
      <div className="sq-history" data-testid="sq-history">
        <UpcomingRow rec={rec} nowMs={nowMs} batches={batches} />
        <p className="sq-none">{H.nothing}</p>
      </div>
    );
  const inPeriod = historyIn(batches, since, tz);
  const figures = historyFigures(inPeriod);
  const reports = lensRoute("campaigns", since ? { from: since, to: zoneDayKey(nowMs, tz) } : null);
  // The replies over the same days, in the Inbox: a door only where somebody wrote back.
  const replied = Number(figures.find((f) => f.id === "replied")?.value ?? 0);
  const inbox = replied > 0 ? routeDoor(sequenceRepliesRoute(rec.sequence.id, period)) : null;
  const [sent, ...came] = figures;
  const figure = (f: (typeof figures)[number], hero: boolean) => (
    <Figure
      key={f.id}
      id={f.id}
      label={hero ? H.sent : f.label}
      value={f.value}
      meta={f.meta}
      definition={f.definition}
      n={f.n}
      {...(f.minN === null ? {} : { minN: f.minN })}
      {...(f.id === "replied" && inbox ? { door: inbox } : {})}
      {...(hero ? { look: "hero" as const } : {})}
      className={hero ? "sq-hist-hero" : "sq-cell"}
      data-testid={`sq-figure-${f.id}`}
    />
  );
  return (
    <div className="sq-history" data-testid="sq-history">
      <section className="sq-hist-sum" aria-label={H.period}>
        <div className="sq-hist-head">
          <Segmented
            label={H.period}
            value={period}
            onValueChange={(v) => setPeriod(isPeriod(v) ? v : "30")}
            options={SEQUENCE_HISTORY_PERIODS.map((p) => ({
              value: p.id,
              label: p.label,
              testid: `sq-period-${p.id}`,
            }))}
          />
          <LinkButton className="sq-hist-door" {...routeDoor(reports)} data-testid="sq-history-reports">
            {H.inReports} <Icon name="chevron" size={11} />
          </LinkButton>
        </div>
        {covered && !inPeriod.some(batchWent) ? (
          // Nothing went out over the days picked (a run still waiting, or none at all): said once, not four zeros.
          <p className="sq-none" data-testid="sq-history-none">
            {H.nothingIn}
          </p>
        ) : (
          // One card, as a run's decision is (the run-to-leads canvas): what it sent, large, and over how many days at the
          // line's end; what came of it under a hairline. It dims while the pages behind it are still being counted.
          <div className="sq-hist-card" aria-busy={!covered || undefined}>
            <div className="sq-hist-top">
              {sent ? <dl className="sq-hist-one">{figure(sent, true)}</dl> : null}
              <span className="sq-hist-days" aria-live="polite">
                {covered ? H.days(historyDays(inPeriod, tz)) : H.counting}
              </span>
            </div>
            <dl className="sq-figures">{came.map((f) => figure(f, false))}</dl>
          </div>
        )}
      </section>
      <section className="sq-days" aria-label={H.dayByDay}>
        <h3 className="sq-days-cap">
          <span>{H.dayByDay}</span>
          {inbox ? (
            <LinkButton className="sq-group-act" {...inbox} data-testid="sq-history-inbox">
              {H.inInbox(replied)} <Icon name="chevron" size={11} />
            </LinkButton>
          ) : null}
        </h3>
        <div className="sq-days-pane">
          <UpcomingRow rec={rec} nowMs={nowMs} batches={batches} />
          {batches.map((b) => (
            <DayRow key={b.id} b={b} rec={rec} nowMs={nowMs} />
          ))}
        </div>
        {more && covered ? (
          <Button size="sm" variant="quiet" onClick={() => void older()} disabled={busy} data-testid="sq-history-more">
            {H.older}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
