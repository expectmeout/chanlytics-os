/**
 * A sequence's History (D3: Sent becomes History; the canvas's History board): what it sent over a period, then day by
 * day. Four figures over the period picked (the last 30 days, 90, or all of it), each with what it counts on its label,
 * counted from the same batches Reports counts (contracts historyFigures over 00442 sequence_batch_counts), with the door
 * to Reports over the same days, and Replied a door to the Inbox over them (contracts sequenceRepliesRoute: the threads that
 * answered it, and nothing else), as is "All N replies in the Inbox" beside Day by day. Then a row a batch, newest first: when, what it went to and what came of it, opened in
 * place onto the replies it drew, each a door to its thread, everyone it went to under them, and the door to its run's
 * sheet in Sent. Older batches are read a page at a time, and as far back as the period asks. An address that names a day
 * (a run's, landed here: the parity review's W4) opens that day, read back to it, and brings it into view.
 */
import { useEffect, useRef, useState } from "react";
import {
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
  runSheetRoute,
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
import { RecordDisclosure } from "../../kit/record/disclosure";
import { Segmented } from "../../kit/segmented/segmented";
import { routeDoor } from "../../legacy-verbs";
import { broadcasts } from "../broadcasts/verbs";
import { useBatchRead, useSequenceRead } from "./use-record";
import { sequenceVerbs as verbs } from "./verbs";

const isPeriod = (v: string): v is SequenceHistoryPeriod => SEQUENCE_HISTORY_PERIODS.some((p) => p.id === v);

/** A day opened in place: the replies it drew, everyone it went to, and the door to its run. */
function DayOpen({ id, region }: { id: string; region: string }) {
  const read = useBatchRead(id);
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

/**
 * One batch's row: when, and what came of it; pressed, a day that went opens in place, and one that has not (waiting for
 * your OK, or still to go) opens its run's sheet, where it is decided: it opened onto that door alone.
 */
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
  const door = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (landed) (row.current ?? door.current)?.scrollIntoView({ block: "center" });
  }, [landed]);
  const place = b.place && rec.steps.length > 1 ? H.step(b.place) : null;
  const said = historyDayWords(b, place);
  const went = batchWent(b);
  const region = `sq-day-${b.id}-open`;
  const end = (cls: string) =>
    b.state === "pending_approval" ? (
      <StatePill kind="tone" value="warn" label={said.end} className={cls} />
    ) : (
      <span className={cls}>{said.end}</span>
    );
  const stamp = historyStamp(Date.parse(b.at), rec.timezone, nowMs);
  if (!went)
    return (
      <ListRow
        bare
        name={stamp}
        end={end}
        said={said.said}
        {...routeDoor(runSheetRoute(b.id))}
        className="sq-day"
        ref={door}
        data-testid={`sq-batch-${b.id}`}
      />
    );
  return (
    <>
      <ListRow
        bare
        name={stamp}
        end={end}
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
      {open ? <DayOpen id={b.id} region={region} /> : null}
    </>
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
  // A batch made and waiting for an OK waits, whoever approves the rest.
  const said = historyUpcomingWords(next.people, made?.state === "pending_approval" ? "ask" : rec.mode);
  return (
    <ListRow
      bare
      name={historyStamp(next.at, rec.timezone, nowMs)}
      end={(cls) => (said.end ? <span className={cls}>{said.end}</span> : null)}
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
        {covered && !inPeriod.some(batchWent) ? (
          // Nothing went out over the days picked (a run still waiting, or none at all): said once, not four zeros.
          <p className="sq-none" data-testid="sq-history-none">
            {H.nothingIn}
          </p>
        ) : (
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
                {...(f.id === "replied" && inbox ? { door: inbox } : {})}
                className="sq-cell"
                data-testid={`sq-figure-${f.id}`}
              />
            ))}
          </dl>
        )}
      </section>
      <section className="sq-days" aria-label={H.dayByDay}>
        <h3 className="sq-group-name">
          {H.dayByDay}
          {inbox ? (
            <LinkButton className="sq-group-act" {...inbox} data-testid="sq-history-inbox">
              {H.inInbox(replied)} <Icon name="chevron" size={11} />
            </LinkButton>
          ) : null}
        </h3>
        <UpcomingRow rec={rec} nowMs={nowMs} batches={batches} />
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
