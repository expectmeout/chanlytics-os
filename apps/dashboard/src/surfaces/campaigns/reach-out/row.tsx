/**
 * Campaigns › a reach-out's pane (moved from legacy/pages/reach-out/reach-out-row.jsx, decision 0015; Reach out, Part 4
 * PR 8; canvas board 07). A chain of emails to a search's leads is one thing to its owner: a quiet line under the moments
 * on Campaigns' home (surfaces/campaigns/home, from contracts' campaignsHomeOf), its steps in the pane it opens. Its
 * report -- each step counted once from the database, its last runs, whether it may be removed -- is read when the pane
 * opens (`reachOuts.report`), never before and never invented (R23). Every sentence
 * is contracts' (`reachOuts.words`, reach-out-sheet.ts); every act goes through `reachOuts`, and the surfaces are read
 * again behind it. Who may press is the role store's answer (gate / canDo "approve": owner, operator, partner). Edit
 * opens the reach-out sheet (sheet.tsx, PR 6) over the chain as read, for a role that may change it: where the pane is a sheet's
 * own (Campaigns' home drawer, whose modal holds the page behind it, the record sheet included) the host takes the press
 * (`onEdit`) and opens the sheet at an address of its own, in the drawer's place; with no host the pane draws it itself.
 */
import { Fragment, useEffect, useReducer, useState } from "react";
import type { ReactNode } from "react";
import { lifecycleChainStateOf } from "@chanlytics/contracts";
import type { ReachOutChainDto, ReachOutChainReportDto, ReachOutReachDto } from "@chanlytics/contracts";
import type { ApiRefusal } from "@/client/api";
import { canDo, gate, gateTitle, navigate, refusalToast } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { CmPane, useCmPhone } from "../parts/split";
import { reachOuts } from "./surface";
import { ReachOutPeople } from "./people";
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
              <LinkButton
                className="ob-link"
                onClick={() => navigate(`broadcasts/run:${waiting.run_id}`)}
                data-testid="ro-waiting"
              >
                {waiting.text}
              </LinkButton>
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
              <LinkButton className="ob-link" onClick={() => navigate(`broadcasts/run:${h.id}`)}>
                {h.text}
              </LinkButton>
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
  /** The pane's own close: a chain removed leaves the screen before its toast says so. */
  onGone: () => void;
  /** Drawn in a phone's foot: Edit and Pause are its equal pair there (kit.css `data-foot-pair`), as a playbook's are. */
  foot?: boolean;
}

/** Edit, Pause or Resume, and Remove only while the report says it may go (R16), asking first. */
function ReachOutActs({ chain, said, W, flash, onEdit, onGone, foot = false }: ActsProps) {
  const V = reachOuts;
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
    void act(async () => {
      const r = await V.remove(chain.root_id);
      // Closed as the server takes it, then said (spec 2026-10-09 §4.3).
      if (r && r.ok) onGone();
      return r;
    }, RW.removed(chain.name));
  };
  return (
    <div className="pb-card-acts ro-acts" data-foot-pair={foot && !sure ? "" : undefined} data-testid="ro-acts">
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
            <Button size="sm" disabled={busy} onClick={onEdit} data-testid="ro-edit">
              {RW.edit}
            </Button>
          )}
          <Button
            size="sm"
            disabled={busy}
            onClick={toggle}
            data-testid="ro-toggle"
            {...gate("approve", paused ? "resume a reach-out" : "pause a reach-out")}
          >
            {paused ? RW.resume : RW.pause}
          </Button>
          {/* Removed only before its first email goes (R16): after that it is paused, and its history stays. */}
          {said && said.canRemove && (
            <LinkButton
              tone="danger"
              disabled={busy}
              onClick={() => setSure(true)}
              data-testid="ro-remove"
              {...gate("approve", "remove a reach-out")}
            >
              {RW.remove}
            </LinkButton>
          )}
        </>
      )}
    </div>
  );
}

interface OpenProps {
  chain: ReachOutChainDto;
  canAct: boolean;
  W: Words;
  /** The report as read, the way to read it again, and what it says. */
  read: ReportRead | null;
  retry: () => void;
  said: Said | null;
  /** Its acts, where the body holds them (a desk's pane); a phone's are the pane's foot. */
  acts: ReactNode;
  editing: boolean;
  onEditDone: () => void;
  /** The part the address opens at: its People, scrolled to once they are read. */
  at: "people" | null;
  /** The toast, for what a person's door in its People did. */
  flash: Flash | undefined;
}

/** The open row: the chain's path, its report as read, and its acts where the body holds them. */
function ReachOutOpen({ chain, canAct, W, read, retry, said, acts, editing, onEditDone, at, flash }: OpenProps) {
  const RW = W.REACH_OUT_ROW_WORDS;
  return (
    <div className="ro-open" data-testid="ro-open-body">
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
      {/* Who is in it (00426): waiting, writing and done, each a door to the lead; a list-fed one takes more. */}
      {chain.search ? <ReachOutPeople chain={chain} focus={at === "people"} flash={flash} /> : null}
      {acts}
      {/* Who may is the role store's one answer (contracts roleGate, a partner included), never a copy of it. */}
      {!canAct && (
        <p className="bc-excl-hint" data-testid="ro-role">
          {gateTitle("approve", "change, pause, resume or remove a reach-out")}
        </p>
      )}
      {editing && chain.search && <ReachOutSheet search={chain.search} chain={chain} onClose={onEditDone} />}
    </div>
  );
}

interface PaneProps {
  chain: ReachOutChainDto;
  canAct: boolean;
  flash?: Flash;
  onClose: () => void;
  /** The host's Edit: it opens the chain's sheet where the pane's own would stand under a modal. */
  onEdit?: (chain: ReachOutChainDto) => void;
  /** The part the address opens at (`moment:<id>:people`). */
  at?: "people" | null;
}

/**
 * The reach-out open, in the pane beside the list (parts/split.tsx): its name and state over its path, report and acts.
 * On a phone its acts are the pane's foot, Edit and Pause an equal pair a thumb reaches, as a playbook's drawer has them
 * (Ruben, 11 Oct 2026: two small buttons stood in the body under the report), and its head has no glyph.
 */
export function ReachOutPane({ chain, canAct, flash, onClose, onEdit, at = null }: PaneProps) {
  const W = reachOuts.words;
  const pace = W.chainPaceOf(chain);
  const phone = useCmPhone();
  const [read, retry] = useReachOutReport(chain.root_id, true);
  const [editing, setEditing] = useState(false);
  const said =
    read && read.state === "ok" ? W.chainReportWordsOf(chain, read.report, read.reach || RO_NO_REACH, pace) : null;
  // Its state as the home says it, a run waiting first (paused or not) and "On" for "Running" (contracts lifecycleChainStateOf).
  const state = lifecycleChainStateOf(chain);
  const acts = (
    <ReachOutActs
      chain={chain}
      said={said}
      W={W}
      flash={flash}
      onEdit={chain.search ? () => (onEdit ? onEdit(chain) : setEditing(true)) : null}
      onGone={onClose}
      foot={phone}
    />
  );
  return (
    <CmPane
      testid="ro-pane"
      mark={
        phone ? null : (
          <span className="mark pb-row-mark" aria-hidden="true">
            <Icon name="mail" size={13} />
          </span>
        )
      }
      title={chain.name}
      badge={<StatePill kind="tone" value={state.tone} label={state.words} />}
      sub={W.chainHintOf(chain, pace.host)}
      foot={phone && canAct ? acts : undefined}
      onClose={onClose}
    >
      <ReachOutOpen
        chain={chain}
        canAct={canAct}
        W={W}
        read={read}
        retry={retry}
        said={said}
        acts={phone && canAct ? null : acts}
        editing={editing}
        onEditDone={() => setEditing(false)}
        at={at}
        flash={flash}
      />
    </CmPane>
  );
}
