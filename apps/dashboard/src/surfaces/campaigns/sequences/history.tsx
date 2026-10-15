/**
 * A sequence's History (D3: Sent becomes History; the canvas's History board): what it sent over a period, then day by
 * day. Four figures over the period picked (the last 30 days, 90, or all of it), each with what it counts on its label,
 * counted from the same batches Reports counts (contracts historyFigures over 00442 sequence_batch_counts), with the door
 * to Reports over the same days. Then a row a batch, newest first: when, what it went to and what came of it, opened in
 * place onto the replies it drew, each a door to its thread, everyone it went to under them, and the door to its run's
 * sheet in Sent. Older batches are read a page at a time, and as far back as the period asks. An address that names a day
 * (a run's, landed here: the parity review's W4) opens that day, read back to it, and brings it into view.
 */
import { useEffect, useRef, useState } from "react";
import {
  SEQUENCE_HISTORY_PERIODS,
  SEQUENCE_HISTORY_WORDS as H,
  batchWent,
  clockStamp,
  historyCovers,
  historyDayWords,
  historyDays,
  historyFigures,
  historyIn,
  historySince,
  lensRoute,
  runSheetRoute,
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
import { RecordDisclosure } from "../../kit/record/disclosure";
import { Segmented } from "../../kit/segmented/segmented";
import { routeDoor } from "../../legacy-verbs";
import { broadcasts } from "../broadcasts/verbs";
import { useSequenceRead } from "./use-record";
import { sequenceVerbs as verbs } from "./verbs";

const isPeriod = (v: string): v is SequenceHistoryPeriod => SEQUENCE_HISTORY_PERIODS.some((p) => p.id === v);

/** A day opened in place: the replies it drew, everyone it went to, and the door to its run. */
function DayOpen({ id, region }: { id: string; region: string }) {
  const read = useSequenceRead(id, broadcasts.detail, broadcasts.peekDetail);
  if (read.state === "failed")
    return <FailedRead kind="line" what={H.failed} why={read.why} testid={`sq-day-failed-${id}`} />;
  if (read.state === "reading")
    return (
      <p className="sq-more" id={region} aria-busy="true">
        {H.reading}
      </p>
    );
  const run = runSheetRoute(id);
  // A batch to leads keeps its sends apart (reach_out_sends): its run says them.
  const report = read.data.reach_out ? null : broadcasts.report(read.data);
  return (
    <div className="sq-day-open" id={region} data-testid={`sq-day-open-${id}`}>
      {report ? (
        <>
          <p className="sq-ed-k">{H.replies}</p>
          {report.replies.length === 0 ? <p className="sq-more">{H.noReplies}</p> : null}
          {report.replies.map((r) => (
            <ListRow
              key={r.contact_id}
              face={{ person: { name: r.name }, size: "sm" }}
              name={r.name}
              said={[r.quote ? `“${r.quote}”` : null, r.outcome.words].filter(Boolean).join(" · ")}
              end={(place) =>
                r.to ? (
                  <span className={place}>
                    {H.thread} <Icon name="chevron" size={11} />
                  </span>
                ) : null
              }
              {...(r.to ? routeDoor(r.to) : {})}
              data-testid="sq-day-reply"
            />
          ))}
          {report.people.length > 0 ? (
            <RecordDisclosure id={`sq-day-${id}-all`} label={H.everyone(report.people.length)} testid="sq-day-everyone">
              {report.people.map((x) => (
                <ListRow
                  key={x.contact_id}
                  face={{ person: { name: x.name }, size: "sm" }}
                  name={x.name}
                  said={[x.words, x.channel].filter(Boolean).join(" · ")}
                  end={(place) => <StatePill kind="tone" value={x.pill.tone} label={x.pill.label} className={place} />}
                  {...(x.door ? routeDoor(x.door.to) : {})}
                />
              ))}
            </RecordDisclosure>
          ) : null}
        </>
      ) : null}
      <LinkButton className="sq-day-door" {...routeDoor(run)} data-testid="sq-day-run">
        {H.openRun} <Icon name="chevron" size={11} />
      </LinkButton>
    </div>
  );
}

/** One batch's row: when, and what came of it; pressed, it opens in place. */
function DayRow(p: {
  b: SequenceBatchDto;
  rec: SequenceRecordDto;
  open: boolean;
  onToggle: () => void;
  nowMs: number;
  /** The day the address named: brought into view as it is drawn. */
  landed: boolean;
}) {
  const { b, rec, open, onToggle, nowMs, landed } = p;
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (landed) row.current?.scrollIntoView({ block: "center" });
  }, [landed]);
  const place = b.place && rec.steps.length > 1 ? H.step(b.place) : null;
  const said = historyDayWords(b, place);
  const went = batchWent(b);
  const region = `sq-day-${b.id}-open`;
  return (
    <>
      <ListRow
        bare
        name={clockStamp(Date.parse(b.at), rec.timezone, nowMs)}
        end={(cls) =>
          b.state === "pending_approval" ? (
            <StatePill kind="tone" value="warn" label={said.end} className={cls} />
          ) : (
            <span className={cls}>{said.end}</span>
          )
        }
        said={said.said}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={open ? region : undefined}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="sq-day"
        ref={row}
        data-testid={`sq-batch-${b.id}`}
      />
      {open ? (
        went ? (
          <DayOpen id={b.id} region={region} />
        ) : (
          <div className="sq-day-open" id={region}>
            <LinkButton className="sq-day-door" {...routeDoor(runSheetRoute(b.id))} data-testid="sq-day-run">
              {H.openRun} <Icon name="chevron" size={11} />
            </LinkButton>
          </div>
        )
      ) : null}
    </>
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
  const read = useSequenceRead(id, verbs.history, verbs.peekHistory, again);
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

export function SequenceHistory(p: { rec: SequenceRecordDto; again: number; moved: () => void; day?: string | null }) {
  const { rec, again, moved, day = null } = p;
  const [period, setPeriod] = useState<SequenceHistoryPeriod>("30");
  const [opened, setOpened] = useState<string | null>(day);
  const tz = rec.timezone;
  const nowMs = Date.now();
  const since = historySince(period, tz, nowMs);
  const { read, batches, more, covered, busy, older } = useHistoryPages(rec.sequence.id, again, since, tz);
  // A day the address named and the pages read do not reach yet: read back to it.
  const seek = day !== null && !batches.some((b) => b.id === day) && more && covered && !busy;
  useEffect(() => {
    if (seek) void older();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `older` reads from the pages; each one read moves `seek`
  }, [seek, batches.length]);
  if (read.state === "failed")
    return <FailedRead what="what it sent" why={read.why} onRetry={moved} testid="sq-history-failed" />;
  if (read.state === "reading") return <div className="sq-reading" aria-busy="true" />;
  if (batches.length === 0) return <p className="sq-none">{H.nothing}</p>;
  const inPeriod = historyIn(batches, since, tz);
  const figures = historyFigures(inPeriod);
  const reports = lensRoute("campaigns", since ? { from: since, to: zoneDayKey(nowMs, tz) } : null);
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
          <span className="sq-fl-span" aria-live="polite">
            {covered ? H.days(historyDays(inPeriod, tz)) : H.counting}
          </span>
          <LinkButton className="sq-hist-door" {...routeDoor(reports)} data-testid="sq-history-reports">
            {H.inReports} <Icon name="chevron" size={11} />
          </LinkButton>
        </div>
        <dl className="sq-figures" aria-busy={!covered || undefined}>
          {figures.map((f) => (
            <Figure
              key={f.id}
              id={f.id}
              label={f.label}
              value={f.value}
              meta={f.meta}
              definition={f.definition}
              n={f.n}
              {...(f.minN === null ? {} : { minN: f.minN })}
              className="sq-cell"
              data-testid={`sq-figure-${f.id}`}
            />
          ))}
        </dl>
      </section>
      <section className="sq-days" aria-label={H.dayByDay}>
        <h3 className="sq-group-name">{H.dayByDay}</h3>
        {batches.map((b) => (
          <DayRow
            key={b.id}
            b={b}
            rec={rec}
            nowMs={nowMs}
            open={opened === b.id}
            landed={day === b.id}
            onToggle={() => setOpened((was) => (was === b.id ? null : b.id))}
          />
        ))}
        {more && covered ? (
          <Button size="sm" variant="quiet" onClick={() => void older()} disabled={busy} data-testid="sq-history-more">
            {H.older}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
