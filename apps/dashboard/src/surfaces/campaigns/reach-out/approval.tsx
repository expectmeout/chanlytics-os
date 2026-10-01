/**
 * Broadcasts: a reach-out run's block (moved from legacy/pages/reach-out/reach-out-approval.jsx, decision 0015; Reach out,
 * Part 4 PR 7; canvas board 05; F13, R20-R22). A live reach-out run -- waiting on its owner, scheduled or sending -- opens
 * to this, never to a WhatsApp run's sheet: its sends are reach_out_sends, not recipients. It says today's share and the
 * rest, the held with their reasons and doors (Include, Rewrite, Skip, Not a fit: `reachOuts.decide`), the skipped by
 * reason, how many are still being checked, and the first ready business's email as it reads, its opening marked. "Check
 * the held again" asks the check once more for every email it could not answer. A run waiting has Approve, which counts
 * and names the checked, ready sends only (R21), and Skip, which asks first; one that is not waiting keeps the run's own
 * verbs (Cancel, Stop). The same bc-sheet classes as a WhatsApp run's sheet, so a keyboard and a screen reader meet the
 * same sheet. Every sentence is contracts' (`reachOuts.run`: reachOutRunWordsOf over approvalWordsOf); never a fetch here.
 */
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import type { BroadcastDetailDto, ReachOutDecision } from "@chanlytics/contracts";
import type { ApiRefusal } from "@/client/api";
import { canDo, gateTitle } from "../../legacy-verbs";
import { confirmPart, policyChipPart } from "../../legacy-parts";
import { Icon } from "../../kit/icon/icon";
import { reachOuts } from "./surface";

/** A live reach-out run as its block says it: never null where the run is a reach-out's. */
type RunWords = NonNullable<ReturnType<typeof reachOuts.run>>;

/** A door pressed or the held checked again: said at its row when refused. */
interface Said {
  id: string;
  text: string;
}

/** The first ready business's email as it reads: the opening marked, as a slot is on a WhatsApp run's sheet. */
function RoRunWords({ vm }: { vm: RunWords }) {
  return vm.words.length > 0 ? (
    <div className="bc-sheet-words" data-testid="ro-run-words">
      <p className="bc-sheet-quote">
        “
        {vm.words.map((w, i) =>
          w.opening ? (
            <span key={i} className="bc-sheet-slot" data-testid="ro-run-opening">
              {w.text}
            </span>
          ) : (
            <Fragment key={i}>
              {i > 0 ? " " : ""}
              {w.text}
            </Fragment>
          ),
        )}
        ”
      </p>
      {vm.reader && (
        <div className="bc-sheet-reader">
          <span data-testid="ro-run-reader">{vm.reader}</span>
        </div>
      )}
    </div>
  ) : null;
}

interface HeldProps {
  vm: RunWords;
  may: boolean;
  busy: string | null;
  said: Said | null;
  onDecide: (sendId: string, door: ReachOutDecision) => Promise<void>;
}

/** The held, each with why and its doors (R20); a door's refusal said at its row. Out of sight for a role that may not. */
function RoRunHeld({ vm, may, busy, said, onDecide }: HeldProps) {
  return (
    <section className="bc-touched bc-sheet-people" data-testid="ro-run-held">
      {vm.held.map((h) => (
        <div key={h.id} className="bc-person is-held" data-testid="ro-held">
          <span className="bc-person-name">{h.name}</span>
          <span className="bc-person-words">{h.why}</span>
          {may && (
            <span className="bc-person-doors">
              {h.doors.map(([door, words]) => (
                <button
                  key={door}
                  type="button"
                  className="bc-person-door"
                  disabled={busy === h.id}
                  onClick={() => onDecide(h.id, door)}
                  data-testid={`ro-door-${door}`}
                >
                  {words}
                </button>
              ))}
            </span>
          )}
          {said && said.id === h.id && (
            <span className="pb-warn" role="alert" data-testid="ro-held-said">
              {said.text}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}

/** Who gets it: the checked, ready sends by name and time; the rest are still being checked (R21). */
function RoRunList({ vm }: { vm: RunWords }) {
  return (
    <section className="bc-touched bc-sheet-people" data-testid="ro-run-list">
      <div className="bc-touched-head">
        <span className="bc-card-title">{vm.listHead}</span>
      </div>
      {vm.list.map((x) => (
        <div key={x.id} className="bc-person" data-testid="ro-run-person">
          <span className="bc-person-name">{x.name}</span>
          <span className="bc-person-at mono">{x.at}</span>
        </div>
      ))}
    </section>
  );
}

/** What the run's sheet hands this block: its place in the queue, and the verbs of a run waiting on its owner. */
interface RunSheet {
  position?: readonly number[] | null;
  canSend: boolean;
  armed: boolean;
  onArm: (on: boolean) => void;
  stopping: boolean;
  approving: boolean;
  approve: (words: string) => void | Promise<void>;
  skip: () => void | Promise<void>;
}

interface ActsProps {
  vm: RunWords;
  sheet: RunSheet | null;
  acts: ReactNode;
  seeAll: boolean;
  onSeeAll: () => void;
}

/** The foot: Approve and Skip for a run waiting on its owner; the run's own verbs for one that is not. */
function RoRunActs({ vm, sheet, acts, seeAll, onSeeAll }: ActsProps) {
  const Confirm = confirmPart();
  const L = vm.labels;
  const waiting = !!(sheet && vm.approve);
  return (
    <div className="bc-sheet-acts" data-testid="ro-run-acts">
      {waiting && sheet?.canSend && !sheet.armed && (
        <button
          type="button"
          className="bc-sheet-approve"
          disabled={sheet.approving}
          onClick={() => sheet.approve(vm.approved)}
          data-testid="ro-run-approve"
        >
          <Icon name="check" size={16} /> {sheet.approving ? L.approving : vm.approve}
        </button>
      )}
      {waiting && vm.approveNote && (
        <p className="bc-sheet-expired" data-testid="ro-run-approve-note">
          {vm.approveNote}
        </p>
      )}
      {waiting && sheet?.armed && sheet.canSend ? (
        <Confirm
          question={vm.skipAsk}
          detail={vm.note}
          yes={L.skipYes}
          danger
          busy={sheet.stopping}
          onYes={sheet.skip}
          onNo={() => sheet.onArm(false)}
          testid="ro-run-skip"
        />
      ) : (
        <div className="bc-sheet-pair">
          {waiting && sheet?.canSend && (
            <button
              type="button"
              className="bc-sheet-second"
              onClick={() => sheet.onArm(true)}
              data-testid="ro-run-skip"
            >
              {L.skip}
            </button>
          )}
          {!waiting && acts}
          {vm.see && (
            <button
              type="button"
              className="bc-sheet-second"
              aria-expanded={seeAll}
              onClick={onSeeAll}
              data-testid="ro-run-see"
            >
              {seeAll ? L.hide : vm.see}
            </button>
          )}
        </div>
      )}
      {waiting && <span className="bc-sheet-note">{sheet?.canSend ? vm.note : gateTitle("approve", L.gated)}</span>}
    </div>
  );
}

/** What a door or the recheck answers: taken, or refused in the owner's words. */
type Answer = { ok: true } | ApiRefusal;

/** A door pressed or the held checked again: said at its row when refused, and the run read again when taken. */
function useRoRunDoors(runId: string, onDecided: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Said | null>(null);
  const press = async (key: string, fn: () => Promise<Answer>) => {
    if (busy) return;
    setBusy(key);
    setSaid(null);
    const r = await fn();
    setBusy(null);
    if (r && r.ok) onDecided();
    else setSaid({ id: key, text: (r && r.message) || "" });
  };
  const V = reachOuts;
  return {
    busy,
    said,
    decide: (id: string, door: ReachOutDecision) => press(id, () => V.decide(id, door)),
    recheck: () => press("recheck", () => V.recheck(runId)),
  };
}

interface RunProps {
  d: BroadcastDetailDto;
  sheet?: RunSheet | null;
  acts?: ReactNode;
  onClose: () => void;
  onDecided?: () => void;
}

export function ReachOutRun({ d, sheet = null, acts = null, onClose, onDecided = () => undefined }: RunProps) {
  const PolicyChip = policyChipPart();
  const vm = reachOuts.run(d);
  const b = d.broadcast;
  // A run not waiting is opened by its held (R20: the notice, Playbooks' "N wait for your say"), so they show at once.
  const [seeHeld, setSeeHeld] = useState(b.state !== "pending_approval");
  const [seeAll, setSeeAll] = useState(false);
  const doors = useRoRunDoors(b.id, onDecided);
  if (!vm) return null;
  const may = canDo("approve");
  const pos = sheet && sheet.position;
  return (
    <div className="bc-sheet ro-run" data-testid="ro-run" data-state={b.state}>
      <div className="bc-sheet-top">
        <button
          type="button"
          className="bc-sheet-back"
          onClick={onClose}
          aria-label={vm.labels.back}
          data-testid="bc-detail-close"
        >
          <Icon name="chevron" size={18} />
        </button>
        <div className="bc-sheet-where">
          <div className="bc-sheet-k" data-testid="ro-run-k">
            {vm.k}
          </div>
          <div className="bc-sheet-pos">{pos && pos[1] > 1 ? `${pos[0]} of ${pos[1]} · Campaigns` : "Campaigns"}</div>
        </div>
      </div>
      <div className="bc-sheet-body">
        <div>
          <div className="bc-sheet-titles">
            <h1 className="bc-sheet-title">{vm.title}</h1>
            <PolicyChip cls="outreach" />
          </div>
          <div className="bc-sheet-sub" data-testid="ro-run-sub">
            {vm.sub}
          </div>
        </div>
        <div className="bc-sheet-reach" data-testid="ro-run-reach">
          <div className="bc-sheet-n">
            <span className="bc-sheet-will" data-testid="ro-run-will">
              {vm.will}
            </span>
            <span className="bc-sheet-will"> {vm.of}</span>
          </div>
          <ul className="bc-sheet-why" data-testid="ro-run-why">
            {vm.why.map((w) => (
              <li key={w.text}>
                <span className="cm-reach-dot" data-tone={w.tone} aria-hidden="true" />
                <span>{w.text}</span>
                {w.door && (
                  <button
                    type="button"
                    className="bc-sheet-door"
                    aria-expanded={seeHeld}
                    onClick={() => setSeeHeld((v) => !v)}
                    data-testid="ro-run-see-held"
                  >
                    {seeHeld ? vm.labels.hideHeld : w.door}
                  </button>
                )}
              </li>
            ))}
            {vm.skipped.map((t) => (
              <li key={t} data-testid="ro-run-skipped">
                <span className="cm-reach-dot" data-tone="plain" aria-hidden="true" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="bc-sheet-rules" data-testid="ro-run-rules">
            {vm.rules.map((r) => (
              <div key={r}>{r}</div>
            ))}
          </div>
        </div>
        <RoRunWords vm={vm} />
        {vm.recheck && may && (
          <button
            type="button"
            className="btn btn-sm"
            disabled={doors.busy === "recheck"}
            onClick={doors.recheck}
            data-testid="ro-run-recheck"
          >
            {doors.busy === "recheck" ? vm.labels.rechecking : vm.recheck}
          </button>
        )}
        {doors.said && doors.said.id === "recheck" && (
          <p className="pb-warn" role="alert" data-testid="ro-run-recheck-said">
            {doors.said.text}
          </p>
        )}
        {!may && vm.held.length > 0 && (
          <p className="bc-excl-hint" data-testid="ro-run-role">
            {gateTitle("approve", vm.labels.gated)}
          </p>
        )}
      </div>
      {seeHeld && vm.held.length > 0 && (
        <RoRunHeld vm={vm} may={may} busy={doors.busy} said={doors.said} onDecide={doors.decide} />
      )}
      {seeAll && <RoRunList vm={vm} />}
      <RoRunActs vm={vm} sheet={sheet} acts={acts} seeAll={seeAll} onSeeAll={() => setSeeAll((v) => !v)} />
    </div>
  );
}
