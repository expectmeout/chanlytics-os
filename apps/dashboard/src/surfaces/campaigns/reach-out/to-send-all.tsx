/**
 * Sent's one To send (`broadcasts/to-send`, 00428): every email handed to its owner, from each reach-out they send
 * themselves, in one pane beside the list, where a run opens. An owner with a reach-out a day, and its follow-ups, has a
 * run for each; this is the one list they work down, the oldest run first. The runs are Sent's own list's (contracts
 * toSendAllOf: the going runs with emails handed over); each run's part is its detail, read as the run's own pane reads it
 * (the broadcasts courier and its read cache) and again whenever Sent is, and drawn by the run's own To send list
 * (RoToSend, bare), so Sent, Skip and They wrote back… here are the very words the run's pane takes. Each word is said at
 * the pane's head. Every sentence is contracts'.
 */
import { useEffect, useReducer, useState } from "react";
import {
  TO_SEND_ALL_WORDS,
  runDraftedEmails,
  toSendAllOf,
  type BroadcastDetailDto,
  type BroadcastVM,
} from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { canDo, gateTitle } from "../../legacy-verbs";
import { broadcasts } from "../broadcasts/verbs";
import { CmPane } from "../parts/split";
import { RoToSend } from "./to-send";

/** A run's detail as its part last read it: kept through a re-read that fails, as the run's pane keeps it. */
type PartAnswer = { ok: true; data: BroadcastDetailDto } | { ok: false };

/** One run's part of the list: its reach-out's name and how many wait, its door, and its emails. */
function ToSendRunPart({
  run,
  onOpenRun,
  onSaid,
}: {
  run: BroadcastVM;
  onOpenRun: (id: string) => void;
  onSaid: (said: string) => void;
}) {
  // A run this tab has read paints at once from the courier's cache, and is read again behind.
  const [answer, setAnswer] = useState<PartAnswer | null>(() => {
    const held = broadcasts.peekDetail(run.id);
    return held && held.ok ? { ok: true, data: held.data } : null;
  });
  const [asks, ask] = useReducer((n: number) => n + 1, 0);
  // Read again whenever Sent is: a word said here, or on the run's own pane, or the clock's tick moves its list.
  useEffect(() => {
    window.addEventListener("surface:broadcasts", ask);
    return () => window.removeEventListener("surface:broadcasts", ask);
  }, []);
  useEffect(() => {
    let on = true;
    void broadcasts.detail(run.id).then((r) => {
      if (!on) return;
      setAnswer((prev) => (r.ok ? { ok: true, data: r.data } : prev && prev.ok ? prev : { ok: false }));
    });
    return () => {
      on = false;
    };
  }, [run.id, asks]);
  const d = answer && answer.ok ? answer.data : null;
  const name = d?.reach_out?.chain_name || run.audience.label || run.name;
  // The detail's own count once read (it leaves out a draft the send door would refuse now), the list's before.
  const n = d?.reach_out?.drafted?.length ?? runDraftedEmails(run);
  return (
    <section className="bc-touched bc-sheet-people bc-approval-people" data-testid="ro-to-send-run">
      <div className="bc-touched-head">
        <span className="bc-card-title">{TO_SEND_ALL_WORDS.runHead(name, n)}</span>
        <LinkButton onClick={() => onOpenRun(run.id)} data-testid="ro-to-send-open-run">
          {TO_SEND_ALL_WORDS.openRun}
        </LinkButton>
      </div>
      {d ? (
        <RoToSend d={d} onSaid={onSaid} bare />
      ) : (
        <p className="pb-note" role={answer ? "alert" : "status"} data-testid="ro-to-send-run-wait">
          {answer ? TO_SEND_ALL_WORDS.unread : TO_SEND_ALL_WORDS.reading}
        </p>
      )}
    </section>
  );
}

/**
 * The pane: its head (how many wait, from how many reach-outs), the note, the last word said, then each run's part. Once
 * every email is said it says so, and stays open on that until it is closed.
 */
export function BcToSendAll({
  rows,
  onClose,
  onOpenRun,
}: {
  /** Sent's list: the runs whose emails are handed over are found in it. */
  rows: readonly BroadcastVM[];
  onClose: () => void;
  onOpenRun: (id: string) => void;
}) {
  const all = toSendAllOf(rows);
  const [said, setSaid] = useState<string | null>(null);
  const may = canDo("approve");
  return (
    <CmPane
      id="bc-to-send"
      testid="bc-to-send"
      closeTestid="bc-to-send-close"
      className="bc-pane"
      title={TO_SEND_ALL_WORDS.title}
      sub={all ? TO_SEND_ALL_WORDS.sub(all.count, all.runs.length) : null}
      onClose={onClose}
    >
      <div className="bc-report" data-testid="bc-to-send-body">
        <p className="pb-note">{may ? TO_SEND_ALL_WORDS.note : gateTitle("approve", TO_SEND_ALL_WORDS.gated)}</p>
        {said && (
          <p className="pb-note" role="status" data-testid="ro-to-send-done">
            {said}
          </p>
        )}
        {all ? (
          all.runs.map((r) => <ToSendRunPart key={r.id} run={r} onOpenRun={onOpenRun} onSaid={setSaid} />)
        ) : (
          <p className="pb-note" data-testid="bc-to-send-none">
            {TO_SEND_ALL_WORDS.none}
          </p>
        )}
      </div>
    </CmPane>
  );
}
