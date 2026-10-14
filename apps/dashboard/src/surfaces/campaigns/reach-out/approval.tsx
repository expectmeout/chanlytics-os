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
 * A reach-out its owner sends (00429) adds its To send list (to-send.tsx): the emails handed to them, with their doors.
 */
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { REACH_OUT_SHEET_WORDS } from "@chanlytics/contracts";
import type { BroadcastDetailDto, ReachOutDecision } from "@chanlytics/contracts";
import type { ApiRefusal } from "@/client/api";
import { canDo, gateTitle, navigate } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { PolicyChip } from "../../kit/policy-chip/policy-chip";
import { reachOuts } from "./surface";
import { RoToSend } from "./to-send";

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

/**
 * A business on the sheet, held or ready: its name, which opens its lead in the Leads peek where the read names the lead
 * (`to`, contracts leadDoorOf), so the owner can see who it is before deciding on it. A name with no lead to open is the
 * name alone.
 */
function RoName({ name, to, testid }: { name: string; to: string | null; testid: string }) {
  return to ? (
    <LinkButton
      className="bc-person-name"
      title={REACH_OUT_SHEET_WORDS.openLead}
      onClick={() => navigate(to)}
      data-testid={testid}
    >
      {name}
    </LinkButton>
  ) : (
    <span className="bc-person-name">{name}</span>
  );
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
    <section className="bc-touched bc-sheet-people bc-approval-people" data-testid="ro-run-held">
      {vm.held.map((h) => (
        <div key={h.id} className="bc-person is-held" data-testid="ro-held">
          <RoName name={h.name} to={h.to} testid="ro-held-lead" />
          <span className="bc-person-words">{h.why}</span>
          {may && (
            <span className="bc-person-doors">
              {h.doors.map(([door, words]) => (
                <LinkButton
                  key={door}
                  className="bc-person-door"
                  disabled={busy === h.id}
                  onClick={() => onDecide(h.id, door)}
                  data-testid={`ro-door-${door}`}
                >
                  {words}
                </LinkButton>
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
    <section className="bc-touched bc-sheet-people bc-approval-people" data-testid="ro-run-list">
      <div className="bc-touched-head">
        <span className="bc-card-title">{vm.listHead}</span>
      </div>
      {vm.list.map((x) => (
        <div key={x.id} className="bc-person" data-testid="ro-run-person">
          <RoName name={x.name} to={x.to} testid="ro-person-lead" />
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
  const L = vm.labels;
  const waiting = !!(sheet && vm.approve);
  return (
    <div className="bc-sheet-acts bc-approval-acts" data-testid="ro-run-acts">
      {waiting && sheet?.canSend && !sheet.armed && (
        <Button
          variant="primary"
          className="bc-approve"
          disabled={sheet.approving}
          onClick={() => sheet.approve(vm.approved)}
          data-testid="ro-run-approve"
        >
          <Icon name="check" size={16} /> {sheet.approving ? L.approving : vm.approve}
        </Button>
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
            <Button className="bc-second" onClick={() => sheet.onArm(true)} data-testid="ro-run-skip">
              {L.skip}
            </Button>
          )}
          {!waiting && acts}
          {vm.see && (
            <Button className="bc-second" aria-expanded={seeAll} onClick={onSeeAll} data-testid="ro-run-see">
              {seeAll ? L.hide : vm.see}
            </Button>
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
  onDecided?: () => void;
}

/**
 * What the pane's head says of a live reach-out run (run.tsx draws the pane, as it does a run's report and a WhatsApp
 * run's sheet): its name, the policy class it runs under, and what it is -- waiting on you, scheduled, sending -- with its
 * place among those waiting. Null where the run is not a reach-out's. It was the block's own top, with a back button.
 */
export function roRunHead(d: BroadcastDetailDto, sheet: RunSheet | null) {
  const vm = reachOuts.run(d);
  if (!vm) return null;
  const pos = sheet && sheet.position;
  return {
    title: vm.title,
    badge: <PolicyChip cls="outreach" />,
    sub: (
      <>
        <span data-testid="ro-run-k">{vm.k}</span>
        {pos && pos[1] > 1 ? ` · ${pos[0]} of ${pos[1]}` : ""}
      </>
    ),
  };
}

export function ReachOutRun({ d, sheet = null, acts = null, onDecided = () => undefined }: RunProps) {
  const vm = reachOuts.run(d);
  const b = d.broadcast;
  // A run not waiting is opened by its held (R20: the notice, Playbooks' "N wait for your say"), so they show at once.
  const [seeHeld, setSeeHeld] = useState(b.state !== "pending_approval");
  const [seeAll, setSeeAll] = useState(false);
  const doors = useRoRunDoors(b.id, onDecided);
  if (!vm) return null;
  const may = canDo("approve");
  return (
    <div className="bc-sheet ro-run bc-approval" data-testid="ro-run" data-state={b.state}>
      <div className="bc-sheet-body bc-approval-body">
        <div className="bc-sheet-sub" data-testid="ro-run-sub">
          {vm.sub}
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
                  <LinkButton
                    className="bc-sheet-door"
                    aria-expanded={seeHeld}
                    onClick={() => setSeeHeld((v) => !v)}
                    data-testid="ro-run-see-held"
                  >
                    {seeHeld ? vm.labels.hideHeld : w.door}
                  </LinkButton>
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
          <Button size="sm" disabled={doors.busy === "recheck"} onClick={doors.recheck} data-testid="ro-run-recheck">
            {doors.busy === "recheck" ? vm.labels.rechecking : vm.recheck}
          </Button>
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
      {/* A reach-out its owner sends (00429): the emails handed to them, each to send from their own inbox. */}
      <RoToSend d={d} onSaid={onDecided} />
      {seeHeld && vm.held.length > 0 && (
        <RoRunHeld vm={vm} may={may} busy={doors.busy} said={doors.said} onDecide={doors.decide} />
      )}
      {seeAll && <RoRunList vm={vm} />}
      <RoRunActs vm={vm} sheet={sheet} acts={acts} seeAll={seeAll} onSeeAll={() => setSeeAll((v) => !v)} />
    </div>
  );
}
