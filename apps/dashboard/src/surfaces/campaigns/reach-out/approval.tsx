/**
 * Broadcasts: a reach-out run's block (moved from legacy/pages/reach-out/reach-out-approval.jsx, decision 0015; Reach out,
 * Part 4 PR 7; F13, R20-R22; redrawn on the run-to-leads canvas of 19 Oct 2026). A live reach-out run -- waiting on its
 * owner, scheduled or sending -- opens to this, never to a WhatsApp run's sheet: its sends are reach_out_sends, not
 * recipients. The decision first: how many go and of how many, one bar by count (ready, the coming days, held, still being
 * checked), when and from which mailbox. Then the held, one amber card whose rows open in place, each with why and its
 * answers (contracts heldAnswersOf: the `sequence_send_decide` verb's doors, and Take out at step 1, the leave verb), and
 * "Check the held again" for every email the check could not answer. Then the first ready business's email as an email,
 * its opening marked, what was checked before it goes, and who gets it, folded. Its acts are the pane's foot (RoRunDock):
 * Approve, which counts the checked, ready sends only (R21), and Skip, which asks first, for a run waiting on its owner;
 * the run's own verbs (Cancel, Stop) for one that is not. Every sentence is contracts' (`reachOuts.run`:
 * reachOutRunWordsOf over approvalWordsOf); never a fetch here. A reach-out its owner sends (00429) adds its To send list
 * (to-send.tsx): the emails handed to them, with their doors.
 */
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { REACH_OUT_SHEET_WORDS } from "@chanlytics/contracts";
import type { BroadcastDetailDto, HeldChoice, RunPartVM } from "@chanlytics/contracts";
import type { ApiRefusal } from "@/client/api";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
import { canDo, gateTitle, type LegacyFlash } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Meter } from "../../kit/meter/meter";
import { Panel } from "../../kit/panel/panel";
import { StatePill } from "../../kit/pill/state-pill";
import { PolicyChip } from "../../kit/policy-chip/policy-chip";
import { leadOverDoor } from "../../leads/sheet/lead-over";
import { SheetSkipMore, WhoGetsIt } from "../broadcasts/run-sheet";
import { pressed } from "../sequences/verbs";
import { HeldEmailRow, RUN_HELD_IDS } from "./held-row";
import { reachOuts } from "./surface";
import { RoToSend } from "./to-send";

/** A live reach-out run as its block says it: never null where the run is a reach-out's. */
type RunWords = NonNullable<ReturnType<typeof reachOuts.run>>;

/** A door pressed or the held checked again: said at its row when refused. */
interface Said {
  id: string;
  text: string;
}

/** The page's toast, which says a Take out's receipt with its Put back; none where the run is read alone. */
type Flash = ((flash: LegacyFlash) => void) | null;

/** Each part of a run in the meter's tones: ready green, the coming days at rest, held amber, being checked its outline. */
const PART_TONES: Record<RunPartVM["key"], "ok" | "rest" | "warn" | "open"> = {
  go: "ok",
  later: "rest",
  held: "warn",
  checking: "open",
};

/**
 * The decision: how many go and of how many, the run in one bar by count with its legend, the skipped by reason, when it
 * goes and from which mailbox.
 */
function RoDecision({ vm }: { vm: RunWords }) {
  return (
    <Panel as="section" className="ro-dec" aria-label={`${vm.count.n} ${vm.count.words}`} data-testid="ro-run-reach">
      <p className="ro-dec-n">
        <b className="tabular" data-testid="ro-run-will">
          {vm.count.n}
        </b>
        <span>{vm.count.words}</span>
        <small className="tabular" data-testid="ro-run-of">
          {vm.count.of}
        </small>
      </p>
      {vm.parts.length > 0 ? (
        <Meter
          className="ro-dec-bar"
          parts={vm.parts.map((p) => ({ share: p.n, tone: PART_TONES[p.key] }))}
          aria-label={vm.parts.map((p) => p.words).join(", ")}
        />
      ) : null}
      <p className="ro-leg" data-testid="ro-run-why">
        {vm.parts.map((p) => (
          <span key={p.key} className="ro-leg-part" data-part={p.key}>
            <span className="ro-leg-dot" aria-hidden="true" />
            {p.words}
          </span>
        ))}
      </p>
      {vm.skipped.map((t) => (
        <p key={t} className="ro-dec-said" data-testid="ro-run-skipped">
          {t}
        </p>
      ))}
      <p className="ro-when" data-testid="ro-run-sub">
        <Icon name="clock" size={15} />
        <span>
          <b>{vm.when.lead}</b>, {vm.when.rest}
        </span>
      </p>
      {vm.from ? (
        <p className="ro-when" data-testid="ro-run-from">
          <Icon name="mail" size={15} />
          <span>{vm.from}</span>
        </p>
      ) : null}
    </Panel>
  );
}

interface HeldProps {
  vm: RunWords;
  may: boolean;
  open: boolean;
  onToggle: () => void;
  busy: string | null;
  said: Said | null;
  onAnswer: (sendId: string, door: HeldChoice, name: string, leadId: string | null) => Promise<void>;
  onRecheck: () => void;
}

/**
 * The held, one amber card before the email (R20): how many and what Approve does with them, See them opening the rows in
 * place, each the one row a sequence's Needs you draws too (held-row.tsx), with why and its answers; and at its foot, Check
 * the held again for every email the check could not answer. A refusal is said at its row. A role that may not answer
 * sees the rows without their answers, and is told why once, above.
 */
function RoRunHeld({ vm, may, open, onToggle, busy, said, onAnswer, onRecheck }: HeldProps) {
  const L = vm.labels;
  return (
    <Panel as="section" className="ro-held" aria-label={vm.heldHead} data-testid="ro-run-held">
      <div className="ro-held-head">
        <span className="ro-held-t">
          <b>{vm.heldHead}</b>
          {may ? <small>{vm.heldNote}</small> : null}
        </span>
        <Button size="sm" aria-expanded={open} onClick={onToggle} data-testid="ro-run-see-held">
          {open ? L.hideHeld : L.seeHeld}
        </Button>
      </div>
      {open ? (
        <div className="ro-held-rows">
          {vm.held.map((h) => (
            <HeldEmailRow
              key={h.id}
              h={h}
              may={may}
              busy={busy === h.id}
              said={said && said.id === h.id ? said.text : null}
              onAnswer={(door) => void onAnswer(h.id, door, h.name, h.leadId)}
              ids={RUN_HELD_IDS}
            />
          ))}
        </div>
      ) : null}
      {open && vm.recheck && may ? (
        <div className="ro-held-foot">
          <span>{vm.recheck.said}</span>
          <Button size="sm" disabled={busy === "recheck"} onClick={onRecheck} data-testid="ro-run-recheck">
            {busy === "recheck" ? L.rechecking : vm.recheck.act}
          </Button>
        </div>
      ) : null}
      {said && said.id === "recheck" ? (
        <p className="pb-warn ro-held-said" role="alert" data-testid="ro-run-recheck-said">
          {said.text}
        </p>
      ) : null}
    </Panel>
  );
}

/** The first ready business's email, as an email: who reads it, its subject, its opening marked, what is each's own. */
function RoRunMail({ vm }: { vm: RunWords }) {
  const mail = vm.mail;
  if (!mail || vm.words.length === 0) return null;
  return (
    <>
      <p className="ro-cap">{vm.labels.email}</p>
      <Panel as="article" className="ro-mail" data-testid="ro-run-words">
        <div className="ro-mail-head">
          <Face person={{ name: mail.name }} size="sm" />
          <span className="ro-mail-who">
            <b>{mail.name}</b>
            <small data-testid="ro-run-reader">{mail.as}</small>
          </span>
        </div>
        {mail.subject ? (
          <p className="ro-mail-subject" data-testid="ro-run-subject">
            {mail.subject}
          </p>
        ) : null}
        <p className="ro-mail-body">
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
        </p>
        {mail.opening || mail.same ? (
          <p className="ro-mail-foot">
            {mail.opening ? <span className="ro-mail-own">{mail.opening}</span> : null}
            {mail.same ? <span>{mail.same}</span> : null}
          </p>
        ) : null}
      </Panel>
    </>
  );
}

/** What was checked before it goes, each a tick: the run's rules, its mailbox said above. */
function RoRunChecked({ vm }: { vm: RunWords }) {
  return (
    <>
      <p className="ro-cap">{vm.labels.checked}</p>
      <Panel size="flush" className="ro-checks" data-testid="ro-run-rules">
        {vm.rules.map((r) => (
          <p key={r} className="ro-check">
            <Icon name="check" size={14} />
            <span>{r}</span>
          </p>
        ))}
      </Panel>
    </>
  );
}

/**
 * A business ready on the sheet: its name, which opens its lead over the page where the read names the lead (lead-over.ts,
 * as a held one's does: held-row.tsx), so the owner can see who it is and stay where they were. A name with no lead to
 * open is the name alone.
 */
function RoName({ name, leadId, testid }: { name: string; leadId: string | null; testid: string }) {
  return leadId ? (
    <LinkButton
      className="bc-person-name"
      title={REACH_OUT_SHEET_WORDS.openLead}
      {...leadOverDoor(leadId)}
      data-testid={testid}
    >
      {name}
    </LinkButton>
  ) : (
    <span className="bc-person-name">{name}</span>
  );
}

/**
 * Who gets it: the checked, ready sends by name and time, a clock time in figures; those still being checked said under
 * them (R21). Folded under its head, its press at the head's right, as a campaign run's (run-sheet.tsx WhoGetsIt).
 */
function RoRunList({ vm, runId }: { vm: RunWords; runId: string }) {
  const [open, setOpen] = useState(false);
  if (vm.list.length === 0) return null;
  return (
    <WhoGetsIt
      id={`ro-who-${runId}`}
      head={vm.listHead}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      testid="ro-run-list"
    >
      {vm.list.map((x) => (
        <div key={x.id} className="bc-person" data-testid="ro-run-person">
          <Face person={{ name: x.name }} size="sm" className="bc-person-who" />
          <RoName name={x.name} leadId={x.leadId} testid="ro-person-lead" />
          <span className={x.clock ? "bc-person-at mono" : "bc-person-at"}>{x.at}</span>
        </div>
      ))}
      {vm.listNote ? <p className="ro-dec-said ro-who-note">{vm.listNote}</p> : null}
    </WhoGetsIt>
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

/** What a door, the leave or the recheck answers: taken, or refused in the owner's words. */
type Answer = { ok: true } | ApiRefusal;

/**
 * A held email answered or the held checked again: said at its row when refused, and the run read again when taken. A
 * door is the `sequence_send_decide` verb, the one walk every press takes (its receipt, the surfaces it moves), whichever
 * page answers the held: the run's screen, or a sequence's People. Take out is the leave verb on the lead's place, as the
 * lead sheet's and People's are: said in the page's toast with its Put back where the page has one, else committed alone.
 */
function useRoRunDoors(p: { runId: string; sequenceId: string; flash: Flash; onDecided: () => void }) {
  const { runId, sequenceId, flash, onDecided } = p;
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
  const leave = (name: string, leadId: string) => ({
    sequence_id: sequenceId,
    enrollment_ids: [],
    lead_ids: [leadId],
    name,
  });
  return {
    busy,
    said,
    answer: async (id: string, door: HeldChoice, name: string, leadId: string | null) => {
      if (door !== "take_out")
        return press(id, () =>
          commitVerb("sequence_send_decide", { send_id: id, decision: door, name, run_id: runId }),
        );
      if (!leadId) return undefined;
      if (!flash) return press(id, () => commitVerb("sequence_leave", leave(name, leadId)));
      setBusy(id);
      await pressed("sequence_leave", leave(name, leadId), flash, onDecided);
      setBusy(null);
      return undefined;
    },
    recheck: () => press("recheck", () => reachOuts.recheck(runId)),
  };
}

interface RunProps {
  d: BroadcastDetailDto;
  onDecided?: () => void;
  /** The page's toast, for Take out's receipt and its Put back. */
  flash?: Flash;
}

/** Whether a reach-out run's sheet waits on its owner, an Approve to give: where the head's menu holds Skip on a phone. */
export const roRunWaits = (d: BroadcastDetailDto, sheet: RunSheet | null): boolean =>
  !!(sheet && reachOuts.run(d)?.approve);

/**
 * A live reach-out run's acts, docked at the pane's foot on a phone and a desk alike (run-sheet.tsx bcSheetDock): what goes
 * and from when, what else waits, then Approve; Skip beside it on a desk and in the head's menu on a phone, its question in
 * their place once asked. A run not waiting keeps its own verbs (Cancel, Stop) there; a role that may not approve is told
 * what it waits for, with no Approve.
 */
export function RoRunDock(p: { d: BroadcastDetailDto; sheet: RunSheet | null; acts?: ReactNode; phone: boolean }) {
  const { d, sheet, acts = null, phone } = p;
  const vm = reachOuts.run(d);
  if (!vm) return null;
  const L = vm.labels;
  const waiting = !!(sheet && vm.approve);
  if (waiting && sheet && sheet.armed && sheet.canSend)
    return (
      <div className="bc-approval-foot" data-foot-pair="" data-testid="ro-run-acts">
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
      </div>
    );
  const may = !!(sheet && sheet.canSend);
  return (
    <div className="bc-approval-foot ro-dock" data-foot-pair="" data-testid="ro-run-acts">
      <span className="ro-dock-t">
        <b data-testid="ro-run-dock">{waiting && !may ? vm.waits : vm.dock.lead}</b>
        {vm.dock.said ? <small data-testid="ro-run-approve-note">{vm.dock.said}</small> : null}
      </span>
      {waiting && sheet && may && !phone ? (
        <Button variant="quiet" onClick={() => sheet.onArm(true)} data-testid="ro-run-skip">
          {L.skip}
        </Button>
      ) : null}
      {waiting && sheet && may ? (
        <Button
          variant="primary"
          disabled={sheet.approving}
          onClick={() => sheet.approve(vm.approved)}
          data-testid="ro-run-approve"
        >
          <Icon name="check" size={16} /> {sheet.approving ? L.approving : vm.approve}
        </Button>
      ) : null}
      {waiting ? null : acts}
    </div>
  );
}

/** The head's menu for a waiting reach-out run on a phone: Skip, as a campaign run's (run-sheet.tsx SheetSkipMore). */
export function RoRunMore({ d, sheet }: { d: BroadcastDetailDto; sheet: RunSheet }) {
  const vm = reachOuts.run(d);
  return vm?.approve ? <SheetSkipMore name={vm.title} sheet={sheet} /> : null;
}

/**
 * What the pane's head says of a live reach-out run (run.tsx draws the pane, as it does a run's report and a WhatsApp
 * run's sheet): its name whole, what it is in a pill -- waiting on you, scheduled, sending -- and under it whose sending
 * it is, its step and its place among those waiting. On a desk it says it is to leads and keeps the policy it runs under;
 * a phone's head has room for the name and the pill. Null where the run is not a reach-out's.
 */
export function roRunHead(d: BroadcastDetailDto, sheet: RunSheet | null, phone = false) {
  const vm = reachOuts.run(d);
  if (!vm) return null;
  const pos = sheet && sheet.position;
  const place = pos && pos[1] > 1 ? `${pos[0]} of ${pos[1]}` : null;
  return {
    title: vm.title,
    badge: (
      <>
        <StatePill kind="broadcast" value={d.broadcast.state} label={vm.k} testid="ro-run-k" />
        {phone ? null : <PolicyChip cls="outreach" />}
      </>
    ),
    sub: [phone ? null : vm.labels.toLeads, vm.who, vm.step, place].filter(Boolean).join(" · "),
  };
}

export function ReachOutRun({ d, onDecided = () => undefined, flash = null }: RunProps) {
  const vm = reachOuts.run(d);
  const b = d.broadcast;
  // A run not waiting is opened by its held (R20: the notice, Playbooks' "N wait for your say"), so they show at once.
  const [seeHeld, setSeeHeld] = useState(b.state !== "pending_approval");
  const doors = useRoRunDoors({ runId: b.id, sequenceId: b.sequence_id, flash, onDecided });
  if (!vm) return null;
  const may = canDo("approve");
  return (
    <div className="bc-sheet ro-run bc-approval" data-testid="ro-run" data-state={b.state}>
      <div className="ro-cols">
        <div className="ro-col">
          <RoDecision vm={vm} />
          {!may && vm.held.length > 0 ? (
            <p className="ro-gate" data-testid="ro-run-role">
              <Icon name="lock" size={14} />
              <span>{gateTitle("approve", vm.labels.gated)}</span>
            </p>
          ) : null}
          {/* A reach-out its owner sends (00429): the emails handed to them, each to send from their own inbox. */}
          <RoToSend d={d} onSaid={onDecided} />
          {vm.held.length > 0 ? (
            <RoRunHeld
              vm={vm}
              may={may}
              open={seeHeld}
              onToggle={() => setSeeHeld((v) => !v)}
              busy={doors.busy}
              said={doors.said}
              onAnswer={doors.answer}
              onRecheck={() => void doors.recheck()}
            />
          ) : null}
        </div>
        <div className="ro-col">
          <RoRunMail vm={vm} />
          <RoRunChecked vm={vm} />
          <RoRunList vm={vm} runId={b.id} />
        </div>
      </div>
    </div>
  );
}
