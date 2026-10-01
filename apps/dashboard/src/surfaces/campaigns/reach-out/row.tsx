/**
 * Campaigns › Playbooks: a reach-out as one row (moved from legacy/pages/reach-out/reach-out-row.jsx, decision 0015; Reach
 * out, Part 4 PR 8; canvas board 07). A chain of emails to a search's leads is one thing to its owner, so it is one row
 * among the moments, its steps in the open row. The row line says what the list read holds (GET reach-outs): its steps
 * and domain, its state, its search, and its next run as it is -- paused, set to never, held for billing, a run waiting,
 * or the sweep's own clock (R23). Its report -- each step counted once from the database, its last runs, whether it may
 * be removed -- is read when the row opens (`reachOuts.report`), never before and never invented (R23). Every sentence
 * is contracts' (`reachOuts.words`, reach-out-sheet.ts); every act goes through `reachOuts`, and the surfaces are read
 * again behind it. Who may press is the role store's answer (gate / canDo "approve": owner, operator, partner). Edit
 * opens the reach-out sheet (sheet.tsx, PR 6) over the chain as read, for a role that may change it.
 */
import { Fragment, useEffect, useReducer, useState } from "react";
import type { ReactNode } from "react";
import type { ReachOutChainDto, ReachOutChainReportDto, ReachOutReachDto } from "@chanlytics/contracts";
import type { ApiRefusal } from "@/client/api";
import { canDo, gate, gateTitle, navigate, refusalToast } from "../../legacy-verbs";
import { confirmPart, statePillPart } from "../../legacy-parts";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { cmRowPress } from "../parts/head";
import { reachOuts } from "./surface";
import { ReachOutSheet } from "./sheet";

type Words = typeof reachOuts.words;

/** What the toast raises (the shell's one flash). */
type Flash = (flash: { tone?: string; msg: ReactNode }) => void;

/** A chain's report and its search's reach as read, or why they could not be. */
type ReportRead =
  | { state: "reading" }
  | { state: "ok"; report: ReachOutChainReportDto; reach: ReachOutReachDto | null }
  | { state: "failed" };

/**
 * A chain's report and its search's reach, read when a row of it opens (this one, or a Templates email row), or why they
 * could not be read; and the retry that reads them again.
 */
export function useReachOutReport(rootId: string, open: boolean): [ReportRead | null, () => void] {
  const [read, setRead] = useState<ReportRead | null>(null);
  const [tries, retry] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setRead({ state: "reading" });
    reachOuts.report(rootId).then(
      (r) => {
        if (live)
          setRead(r && r.ok ? { state: "ok", report: r.data.report, reach: r.data.reach } : { state: "failed" });
      },
      () => {
        if (live) setRead({ state: "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, [rootId, open, tries]);
  return [read, retry];
}

const RO_NO_REACH: ReachOutReachDto = { ready: 0, with_unconfirmed: 0, phone_only: 0, of: 0, chain: null };

/** The chain as it runs: each step, and the days each waits for nothing back. */
function ReachOutPath({ chain, W }: { chain: ReachOutChainDto; W: Words }) {
  const path = W.chainPathWords(chain);
  return (
    <p className="ro-chain" data-testid="ro-chain">
      {path.steps.map((s) => (
        <Fragment key={s.id}>
          {s.after && <span className="ro-chain-gap"> → {s.after} → </span>}
          <span className="ro-chain-step">{s.label}</span>
        </Fragment>
      ))}
      <span className="ro-chain-stops"> · {path.stops}</span>
    </p>
  );
}

type Said = ReturnType<Words["chainReportWordsOf"]>;

/** The report said: each step counted once, the sentence, the held opening their run (R20), the runs, how to stop one. */
function ReachOutReport({ said }: { said: Said }) {
  const waiting = said.waiting;
  return (
    <>
      <table className="ro-steps" data-testid="ro-steps">
        <thead>
          <tr>
            {said.head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {said.table.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {c}
                  </th>
                ) : (
                  <td key={j} className="tabular">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ob-sentence" data-testid="ro-sentence">
        {said.sentence}
        {waiting && (
          <>
            {" "}
            {waiting.run_id ? (
              <button
                type="button"
                className="ob-link"
                onClick={() => navigate(`broadcasts/run:${waiting.run_id}`)}
                data-testid="ro-waiting"
              >
                {waiting.text}
              </button>
            ) : (
              <span data-testid="ro-waiting">{waiting.text}</span>
            )}
            .
          </>
        )}
      </p>
      {said.history.length > 0 && (
        <ul className="ro-history" data-testid="ro-history">
          {said.history.map((h) => (
            <li key={h.id}>
              <button type="button" className="ob-link" onClick={() => navigate(`broadcasts/run:${h.id}`)}>
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="bc-excl-hint" data-testid="ro-stop-one">
        {said.stopOne}
      </p>
    </>
  );
}

/** What an act answers: taken, or refused in the owner's words. */
type Answer = { ok: true } | ApiRefusal;

interface ActsProps {
  chain: ReachOutChainDto;
  said: Said | null;
  W: Words;
  flash: Flash | undefined;
  onEdit: (() => void) | null;
}

/** Edit, Pause or Resume, and Remove only while the report says it may go (R16), asking first. */
function ReachOutActs({ chain, said, W, flash, onEdit }: ActsProps) {
  const V = reachOuts;
  const Confirm = confirmPart();
  const RW = W.REACH_OUT_ROW_WORDS;
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const paused = chain.state !== "running";
  const act = async (fn: () => Promise<Answer>, words: string) => {
    if (busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    // A refusal is said as every refusal is (refusalToast): its title and the owner's words, never a blank.
    if (flash) flash(r && r.ok ? { tone: "ok", msg: words } : refusalToast(r));
  };
  const toggle = () =>
    act(
      () => (paused ? V.resume(chain.root_id) : V.pause(chain.root_id)),
      paused ? RW.resumed(chain.name) : RW.paused(chain.name),
    );
  const remove = () => {
    setSure(false);
    void act(() => V.remove(chain.root_id), RW.removed(chain.name));
  };
  return (
    <div className="pb-card-acts ro-acts" data-testid="ro-acts">
      {sure ? (
        <Confirm
          question={RW.removeAsk(chain.name)}
          detail={said ? said.remove : null}
          yes={RW.removeYes}
          danger
          busy={busy}
          onYes={remove}
          onNo={() => setSure(false)}
          testid="ro-remove"
        />
      ) : (
        <>
          {/* A secondary act: out of sight for a role that may not change the chain (legacy/CLAUDE.md, Role gates). */}
          {onEdit && canDo("approve") && (
            <button className="btn btn-sm" disabled={busy} onClick={onEdit} data-testid="ro-edit">
              {RW.edit}
            </button>
          )}
          <button
            className="btn btn-sm"
            disabled={busy}
            onClick={toggle}
            data-testid="ro-toggle"
            {...gate("approve", paused ? "resume a reach-out" : "pause a reach-out")}
          >
            {paused ? RW.resume : RW.pause}
          </button>
          {/* Removed only before its first email goes (R16): after that it is paused, and its history stays. */}
          {said && said.canRemove && (
            <button
              className="cl-bucket-link danger"
              disabled={busy}
              onClick={() => setSure(true)}
              data-testid="ro-remove"
              {...gate("approve", "remove a reach-out")}
            >
              {RW.remove}
            </button>
          )}
        </>
      )}
    </div>
  );
}

interface OpenProps {
  chain: ReachOutChainDto;
  canAct: boolean;
  flash: Flash | undefined;
  W: Words;
  pace: { host: string | null; share: number };
}

/** The open row: the chain's path, its report as read, its acts. */
function ReachOutOpen({ chain, canAct, flash, W, pace }: OpenProps) {
  const [read, retry] = useReachOutReport(chain.root_id, true);
  const [editing, setEditing] = useState(false);
  const RW = W.REACH_OUT_ROW_WORDS;
  const said =
    read && read.state === "ok" ? W.chainReportWordsOf(chain, read.report, read.reach || RO_NO_REACH, pace) : null;
  return (
    <div className="pb-row-open ro-open" data-testid="ro-open-body">
      <ReachOutPath chain={chain} W={W} />
      {(!read || read.state === "reading") && (
        <p className="cm-standing" data-testid="ro-reading">
          {RW.reading}
        </p>
      )}
      {read && read.state === "failed" && (
        <FailedRead kind="line" what={RW.failed} onRetry={retry} testid="ro-failed" />
      )}
      {said && <ReachOutReport said={said} />}
      <ReachOutActs
        chain={chain}
        said={said}
        W={W}
        flash={flash}
        onEdit={chain.search ? () => setEditing(true) : null}
      />
      {/* Who may is the role store's one answer (contracts roleGate, a partner included), never a copy of it. */}
      {!canAct && (
        <p className="bc-excl-hint" data-testid="ro-role">
          {gateTitle("approve", "change, pause, resume or remove a reach-out")}
        </p>
      )}
      {editing && chain.search && (
        <ReachOutSheet search={chain.search} chain={chain} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

interface RowProps {
  chain: ReachOutChainDto;
  canAct: boolean;
  flash?: Flash;
  open?: boolean;
  onOpen: () => void;
  tz?: string;
  now?: Date | null;
  focus?: boolean;
}

export function ReachOutRow({ chain, canAct, flash, open = false, onOpen, tz, now = null, focus = false }: RowProps) {
  const StatePill = statePillPart();
  const W = reachOuts.words;
  const pace = W.chainPaceOf(chain);
  const next = W.nextRunWords(chain, tz || "America/New_York", now || new Date());
  const state = chain.state !== "running" ? "paused" : chain.next.waiting_run_id ? "approval" : "running";
  return (
    <section
      id={`pb-${chain.root_id}`}
      className={`pb-row pb-chain${open ? " is-open" : ""}${focus ? " is-focus" : ""}`}
      data-testid="ro-row"
      data-state={state}
    >
      <div className="pb-row-line" role="presentation" onClick={cmRowPress}>
        <button
          type="button"
          className="pb-row-what"
          onClick={onOpen}
          aria-expanded={open}
          data-row-open
          data-testid="ro-open"
        >
          <span className="mark pb-row-mark" aria-hidden="true">
            <Icon name="mail" size={13} />
          </span>
          <span className="pb-row-titles">
            <span className="pb-row-name">{chain.name}</span>
            <span className="pb-row-hint" data-testid="ro-hint">
              {W.chainHintOf(chain, pace.host)}
            </span>
          </span>
        </button>
        <span className="pb-row-state">
          <StatePill kind="playbook" value={state} />
        </span>
        {/* Who it writes to is its search; how many it has reached is its report's, in the open row. */}
        <span className="pb-row-reach">
          {chain.search && (
            <span className="pb-row-hint" data-testid="ro-search">
              {chain.search.name}
            </span>
          )}
        </span>
        <span className="pb-row-next" data-testid="ro-next">
          {next.run_id ? (
            <button
              type="button"
              className="ob-link"
              onClick={() => navigate(`broadcasts/run:${next.run_id}`)}
              data-testid="ro-next-run"
            >
              {next.text}
            </button>
          ) : (
            <span className="pb-tile-next" data-tone={next.tone}>
              {next.text}
            </span>
          )}
        </span>
        <span className="pb-row-runs" />
      </div>
      {open && <ReachOutOpen chain={chain} canAct={canAct} flash={flash} W={W} pace={pace} />}
    </section>
  );
}
