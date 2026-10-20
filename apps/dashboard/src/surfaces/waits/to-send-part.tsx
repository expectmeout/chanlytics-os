/**
 * To send, open: every email handed to its owner, from each reach-out they send themselves (00429), in its sheet over the
 * page its door was pressed on (see/see-sheet.tsx, `?see=to-send`; Ruben, 20 Oct 2026), its row in Needs you (the Campaigns
 * wiring review's rule D and his call 3). It was a pane of its own in Sent's mount (`broadcasts/to-send`,
 * reach-out/to-send-all.tsx), then a part unfolded under its row. An owner with a reach-out a
 * day, and its follow-ups, has a run for each; this is the one list they work down, the oldest run first. The runs are
 * Sent's (contracts toSendAllOf: the going runs with emails handed over); each run's part is its detail, read as the run's
 * own screen reads it (its read cache, detail-read.ts) and again whenever Sent is, and drawn by the run's own To send list
 * (RoToSend, bare), so Sent, Skip and They wrote back… here are the very words the run's screen takes. Its door opens the
 * run over the list (rule C), so Back comes back here. Every sentence is contracts'.
 */
import { useEffect, useReducer, useState } from "react";
import {
  TO_SEND_ALL_WORDS,
  runDraftedEmails,
  runRoute,
  runTitleOf,
  toSendAllOf,
  type BroadcastDetailDto,
  type BroadcastVM,
} from "@chanlytics/contracts";
import { LinkButton } from "../kit/link-button/link-button";
import { canDo, gateTitle } from "../legacy-verbs";
import { peekRunDetail, runDetail } from "../campaigns/broadcasts/detail-read";
import { RoToSend } from "../campaigns/reach-out/to-send";
import { broadcastsRead } from "./run-acts";

/** A run's detail as its part last read it: kept through a re-read that fails, as the run's screen keeps it. */
type PartAnswer = { ok: true; data: BroadcastDetailDto } | { ok: false };

/** A run's detail, read as its part is drawn and again whenever Sent's runs are. */
function useRunPartRead(id: string): PartAnswer | null {
  // A run this tab has read paints at once from the read's cache, and is read again behind.
  const [answer, setAnswer] = useState<PartAnswer | null>(() => {
    const held = peekRunDetail(id);
    return held && held.ok ? { ok: true, data: held.data } : null;
  });
  const [asks, ask] = useReducer((n: number) => n + 1, 0);
  // Read again whenever Sent is: a word said here, or on the run's own screen, or the clock's tick moves its list.
  useEffect(() => {
    window.addEventListener("surface:broadcasts", ask);
    return () => window.removeEventListener("surface:broadcasts", ask);
  }, []);
  useEffect(() => {
    let on = true;
    void runDetail(id).then((r) => {
      if (!on) return;
      setAnswer((prev) => (r.ok ? { ok: true, data: r.data } : prev && prev.ok ? prev : { ok: false }));
    });
    return () => {
      on = false;
    };
  }, [id, asks]);
  return answer;
}

/** One run's part of the list: its reach-out's name and how many wait, its door, and its emails. */
function ToSendRunPart({
  run,
  onOpenRun,
  onSaid,
}: {
  run: BroadcastVM;
  onOpenRun: (to: string) => void;
  onSaid: (said: string) => void;
}) {
  const answer = useRunPartRead(run.id);
  const d = answer && answer.ok ? answer.data : null;
  const name = d?.reach_out?.chain_name || runTitleOf(run);
  // Which of its emails: a first email and its nudge are two parts of one reach-out (null until the detail is read).
  const step = d?.reach_out ? d.reach_out.step_n : null;
  // The detail's own count once read (it leaves out a draft the send door would refuse now), the list's before.
  const n = d?.reach_out?.drafted?.length ?? runDraftedEmails(run);
  return (
    <section className="bc-touched bc-sheet-people bc-approval-people" data-testid="ro-to-send-run">
      <div className="bc-touched-head">
        <span className="bc-card-title">{TO_SEND_ALL_WORDS.runHead(name, step, n)}</span>
        <LinkButton onClick={() => onOpenRun(runRoute(run.id, run.sequence_id))} data-testid="ro-to-send-open-run">
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
 * The list: the note, the last word said, then each run's part. Once every email is said it says so, and stays open on
 * that until its sheet is put away.
 */
export function ToSendPart({ onOpenRun }: { onOpenRun: (to: string) => void }) {
  const all = toSendAllOf(broadcastsRead()?.rows ?? []);
  const [said, setSaid] = useState<string | null>(null);
  const may = canDo("approve");
  return (
    <div className="bc-report wait-to-send" data-testid="bc-to-send-body">
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
  );
}
