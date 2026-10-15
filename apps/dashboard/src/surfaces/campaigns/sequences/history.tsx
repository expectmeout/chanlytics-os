/**
 * A sequence's History (D3: Sent becomes History; the canvas's History board): what it sent, a batch a row, newest first
 * (00441 sequence_history): when, to how many, and what became of its sends (sent, replied, held, failed), with why a
 * batch failed. Older batches are read a page at a time; a batch opens where Sent opens a run.
 */
import { useState } from "react";
import { addressOf, clockStamp, type SequenceBatchDto, type SequenceRecordDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { ListRow } from "../../kit/list-row/list-row";
import { Icon } from "../../kit/icon/icon";
import { routeDoor } from "../../legacy-verbs";
import { useSequenceRead } from "./use-record";
import { sequenceVerbs as verbs } from "./verbs";

/** A batch's state, in the page's words. */
const STATE_WORDS: Record<string, string> = {
  pending_approval: "Waits for your OK",
  scheduled: "Scheduled",
  sending: "Going out",
  sent: "Sent",
  canceled: "Canceled",
  failed: "Failed",
};

/** What became of a batch's sends, in a line: "184 sent · 12 replied · 2 held". */
function countsLine(b: SequenceBatchDto): string {
  const c = b.counts;
  const parts = [`${c.sent ?? 0} sent`, `${c.replied ?? 0} replied`];
  if ((c.held ?? 0) > 0) parts.push(`${c.held} held`);
  if ((c.waiting ?? 0) > 0) parts.push(`${c.waiting} waiting`);
  if ((c.failed ?? 0) > 0) parts.push(`${c.failed} failed`);
  return parts.join(" · ");
}

export function SequenceHistory({ rec, again }: { rec: SequenceRecordDto; again: number }) {
  const read = useSequenceRead(rec.sequence.id, verbs.history, verbs.peekHistory, again);
  const [older, setOlder] = useState<SequenceBatchDto[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  if (read.state === "failed")
    return <FailedRead what="what it sent" why={read.why} onRetry={() => setOlder([])} testid="sq-history-failed" />;
  if (read.state === "reading") return <div className="sq-reading" aria-busy="true" />;
  const batches = [...read.data.batches, ...older];
  const hasMore = more ?? read.data.more;
  const nowMs = Date.now();
  const back = async () => {
    const last = batches[batches.length - 1];
    if (!last) return;
    setBusy(true);
    const r = await verbs.history(rec.sequence.id, last.at);
    setBusy(false);
    if (!r.ok) return;
    setOlder((was) => [...was, ...r.data.batches]);
    setMore(r.data.more);
  };
  if (batches.length === 0) return <p className="sq-none">Nothing has gone out yet.</p>;
  return (
    <div className="sq-history" data-testid="sq-history">
      {batches.map((b) => (
        <ListRow
          key={b.id}
          mark={<Icon name="send" size={13} />}
          name={clockStamp(Date.parse(b.at), rec.timezone, nowMs)}
          end={(place) => (
            <span className={place}>{b.place && rec.steps.length > 1 ? `step ${b.place}` : `${b.people} people`}</span>
          )}
          said={`${STATE_WORDS[b.state] ?? b.state} · ${countsLine(b)}${b.failure ? ` · ${b.failure}` : ""}`}
          data-testid={`sq-batch-${b.id}`}
          {...routeDoor(addressOf({ kind: "send", id: b.id }))}
        />
      ))}
      {hasMore ? (
        <Button size="sm" variant="quiet" onClick={() => void back()} disabled={busy} data-testid="sq-history-more">
          Older
        </Button>
      ) : null}
    </div>
  );
}
