/**
 * Broadcasts: a reach-out run's block (moved from legacy/pages/reach-out/reach-out-approval.jsx, decision 0015; Reach out,
 * Part 4 PR 7; F13, R20-R22; drawn as the run-to-leads canvas of 19 Oct 2026). A live reach-out run -- waiting on its
 * owner, scheduled or sending -- opens to this, never to a WhatsApp run's sheet: its sends are reach_out_sends, not
 * recipients. The decision first: how many go and of how many, one bar by count (ready, the coming days, held, still
 * being checked), when and from which mailbox. Then the held, one amber card whose rows open in place, each with why and
 * its answers as pills (contracts heldAnswersOf: the `sequence_send_decide` verb's doors, and Take out at step 1, the leave
 * verb), and "Check the held again" for every email the check could not answer. A run waiting then shows its first ready
 * business's email as an email, what was checked before it goes and who gets it, folded; a run going shows who gets it,
 * open, before the email. Its acts are the pane's foot (RoRunDock), one row: what goes and from when, then Approve, which
 * counts the checked, ready sends only (R21); Skip beside it on a desk and on Approve's caret on a phone, asking first in a
 * card of its own over the dimmed page; the run's own verbs (Cancel, Stop) for one not waiting. Every sentence is
 * contracts' (`reachOuts.run`: reachOutRunWordsOf over approvalWordsOf); never a fetch here. A reach-out its owner sends
 * (00429) adds its To send list (to-send.tsx): the emails handed to them, with their doors.
 */
import { Fragment, useRef, useState } from "react";
import type { ReactNode } from "react";
import { REACH_OUT_SHEET_WORDS, WHO_GETS_IT_WORDS } from "@chanlytics/contracts";
import type { BroadcastDetailDto, HeldChoice, RunPartVM } from "@chanlytics/contracts";
import type { ApiRefusal } from "@/client/api";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
import { canDo, gateTitle, type LegacyFlash } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Face, tileOf } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Meter } from "../../kit/meter/meter";
import { StatePill } from "../../kit/pill/state-pill";
import { leadOverDoor } from "../../leads/sheet/lead-over";
import { SkipCaret } from "../broadcasts/run-sheet";
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
 * The decision: how many go and of how many, the run in one bar by count with its legend (the number heavy), the skipped
 * by reason, and, for a member who may act on it, when it goes and from which mailbox.
 */
function RoDecision({ vm, may }: { vm: RunWords; may: boolean }) {
  return (
    <section className="ro-dec" aria-label={`${vm.count.n} ${vm.count.words}`} data-testid="ro-run-reach">
      <p className="ro-dec-n">
        <b data-testid="ro-run-will">{vm.count.n}</b>
        <span>{vm.count.words}</span>
        <small data-testid="ro-run-of">{vm.count.of}</small>
      </p>
      {vm.parts.length > 0 ? (
        <Meter
          apart
          className="ro-dec-bar"
          parts={vm.parts.map((p) => ({ share: p.n, tone: PART_TONES[p.key] }))}
          aria-label={vm.parts.map((p) => p.words).join(", ")}
        />
      ) : null}
      <p className="ro-leg" data-testid="ro-run-why">
        {vm.parts.map((p) => (
          <span key={p.key} className="ro-leg-part" data-part={p.key}>
            <b>{p.n}</b> {p.rest}
          </span>
        ))}
      </p>
      {vm.skipped.map((t) => (
        <p key={t} className="ro-dec-said" data-testid="ro-run-skipped">
          {t}
        </p>
      ))}
      {may ? (
        <>
          <p className="ro-when" data-testid="ro-run-sub">
            {/* An owner's run goes from their own inbox, a mail's glyph; any other's from a time. */}
            <Icon name={vm.who ? "mail" : "clock"} size={15} />
            <span>
              <b>{vm.when.lead}</b>, {vm.when.rest}
            </span>
          </p>
          {vm.from ? (
            <p className="ro-from" data-testid="ro-run-from">
              <Icon name="mail" size={15} />
              <span>{vm.from}</span>
            </p>
          ) : null}
        </>
      ) : null}
    </section>
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
 * The held, one amber card (R20): how many and what Approve does with them, See them opening the rows in place, each the
 * run's card row of the one held row (held-row.tsx) with why and its answers as pills; and at its foot, Check the held
 * again for every email the check could not answer. A refusal is said at its row. A role that may not answer sees the
 * rows without their answers, told whose say they wait for.
 */
function RoRunHeld({ vm, may, open, onToggle, busy, said, onAnswer, onRecheck }: HeldProps) {
  const L = vm.labels;
  const note = !may ? vm.heldNote.gated : open ? vm.heldNote.open : vm.heldNote.closed;
  return (
    <section className="ro-held" aria-label={vm.heldHead} data-open={open ? "true" : "false"} data-testid="ro-run-held">
      <div className="ro-held-head">
        <span className="ro-held-t">
          <b>{vm.heldHead}</b>
          <small>{note}</small>
        </span>
        <Button className="ro-held-go" aria-expanded={open} onClick={onToggle} data-testid="ro-run-see-held">
          {open ? L.hideHeld : L.seeHeld}
        </Button>
      </div>
      {open
        ? vm.held.map((h) => (
            <HeldEmailRow
              key={h.id}
              look="card"
              h={h}
              may={may}
              busy={busy === h.id}
              said={said && said.id === h.id ? said.text : null}
              onAnswer={(door) => void onAnswer(h.id, door, h.name, h.leadId)}
              ids={RUN_HELD_IDS}
            />
          ))
        : null}
      {open && vm.recheck && may ? (
        <div className="ro-held-foot">
          <span>{vm.recheck.said}</span>
          <Button className="ro-ans" disabled={busy === "recheck"} onClick={onRecheck} data-testid="ro-run-recheck">
            {busy === "recheck" ? L.rechecking : vm.recheck.act}
          </Button>
        </div>
      ) : null}
      {said && said.id === "recheck" ? (
        <p className="ro-hrow-said ro-held-said" role="alert" data-testid="ro-run-recheck-said">
          {said.text}
        </p>
      ) : null}
    </section>
  );
}

/** The first ready business's email, as an email: who reads it, its subject, its opening marked, what is each's own. */
function RoRunMail({ vm }: { vm: RunWords }) {
  const mail = vm.mail;
  if (!mail || vm.words.length === 0) return null;
  return (
    <>
      <p className="ro-cap">
        <span>{vm.labels.email}</span>
      </p>
      <article className="ro-mail" data-testid="ro-run-words">
        <div className="ro-mail-head">
          <Face person={{ name: mail.name }} tile={tileOf(mail.name)} className="ro-tile" />
          <span className="ro-mail-who">
            <b>{mail.name}</b>
            <small data-testid="ro-run-reader">{mail.as}</small>
          </span>
        </div>
        {mail.subject ? (
          <p className="ro-mail-subject" data-testid="ro-run-subject">
            <b>{mail.subject}</b>
          </p>
        ) : null}
        <p className="ro-mail-body">
          {vm.words.map((w, i) =>
            w.opening ? (
              <span key={i} className="ro-slot" data-testid="ro-run-opening">
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
            {mail.opening ? <span className="ro-mail-note ro-mail-own">{mail.opening}</span> : null}
            {mail.same ? <span className="ro-mail-note">{mail.same}</span> : null}
          </p>
        ) : null}
      </article>
    </>
  );
}

/** What was checked before it goes, each its tick in a green ring: the run's rules, its mailbox said above. */
function RoRunChecked({ vm }: { vm: RunWords }) {
  return (
    <>
      <p className="ro-cap">
        <span>{vm.labels.checked}</span>
      </p>
      <div className="ro-pane" data-testid="ro-run-rules">
        {vm.rules.map((r) => (
          <p key={r} className="ro-check">
            <span className="ro-tick" aria-hidden="true">
              <Icon name="check" size={10} />
            </span>
            <span>{r}</span>
          </p>
        ))}
      </div>
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
      size="inherit"
      className="ro-name"
      title={REACH_OUT_SHEET_WORDS.openLead}
      {...leadOverDoor(leadId)}
      data-testid={testid}
    >
      {name}
    </LinkButton>
  ) : (
    <span className="ro-name">{name}</span>
  );
}

/**
 * Who gets it: the checked, ready sends, each its tile, its name and when, a clock time in figures; those still being
 * checked said under them (R21). A pane folded under its head (the name, how many, the chevron), open from the start on a
 * run that is going; opened by a press, it is brought into view.
 */
function RoRunList({ vm, runId, startOpen }: { vm: RunWords; runId: string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const pressedOpen = useRef(false);
  if (vm.list.length === 0) return null;
  const id = `ro-who-${runId}`;
  return (
    <section className="ro-pane ro-fold" data-open={open ? "true" : "false"} data-testid="ro-run-list">
      <Button
        variant="quiet"
        className="ro-fold-h"
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? WHO_GETS_IT_WORDS.hide : WHO_GETS_IT_WORDS.show}
        onClick={() => {
          pressedOpen.current = !open;
          setOpen((v) => !v);
        }}
        data-testid="ro-run-list-press"
      >
        <b>{vm.listHead}</b>
        <span className="ro-fold-n">{vm.listCount}</span>
        <span className="ro-fold-sp" />
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
      </Button>
      <div
        id={id}
        hidden={!open}
        ref={(el) => {
          if (el && open && pressedOpen.current) {
            pressedOpen.current = false;
            el.scrollIntoView({ block: "nearest" });
          }
        }}
      >
        {open
          ? vm.list.map((x) => (
              <div key={x.id} className="ro-whor" data-testid="ro-run-person">
                <Face person={{ name: x.name }} tile={tileOf(x.name)} className="ro-tile" />
                <RoName name={x.name} leadId={x.leadId} testid="ro-person-lead" />
                <small className={x.clock ? "mono" : undefined}>{x.at}</small>
              </div>
            ))
          : null}
        {open && vm.listNote ? <p className="ro-info">{vm.listNote}</p> : null}
      </div>
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
  /** Skip's question asked in the foot: on a phone the page dims under it. */
  armed?: boolean;
}

/** Whether a reach-out run's sheet waits on its owner, an Approve to give: where Skip's question dims a phone's page. */
export const roRunWaits = (d: BroadcastDetailDto, sheet: RunSheet | null): boolean =>
  !!(sheet && reachOuts.run(d)?.approve);

/**
 * A live reach-out run's acts, docked at the pane's foot on a phone and a desk alike, one row: what goes and from when,
 * and under it what else waits, then Approve; Skip beside it on a desk and on Approve's caret on a phone. Skip asks first
 * in the foot's place, a card of its own (the canvas's board 4): the question, what skipping costs, Keep it and Yes, skip
 * it. A run not waiting keeps its own verbs (Cancel, Stop) there; a role that may not approve is told what it waits for.
 */
export function RoRunDock(p: { d: BroadcastDetailDto; sheet: RunSheet | null; acts?: ReactNode; phone: boolean }) {
  const { d, sheet, acts = null, phone } = p;
  const vm = reachOuts.run(d);
  if (!vm) return null;
  const L = vm.labels;
  const waiting = !!(sheet && vm.approve);
  if (waiting && sheet && sheet.armed && sheet.canSend)
    return (
      <div className="ro-ask" role="alertdialog" aria-label={vm.skipAsk} data-testid="ro-run-acts">
        <div className="ro-ask-t" data-testid="ro-run-skip">
          <b>{vm.skipAsk}</b>
          <p>{vm.note}</p>
        </div>
        <Button
          className="ro-ask-no"
          disabled={sheet.stopping}
          onClick={() => sheet.onArm(false)}
          data-testid="ro-run-skip-no"
        >
          {L.keep}
        </Button>
        <Button
          className="ro-ask-yes"
          disabled={sheet.stopping}
          aria-busy={sheet.stopping || undefined}
          onClick={() => void sheet.skip()}
          data-testid="ro-run-skip-yes"
        >
          {L.skipYes}
        </Button>
      </div>
    );
  const may = !!(sheet && sheet.canSend);
  const line = waiting && !may ? vm.waits : vm.dock;
  return (
    <div className="ro-dock" data-testid="ro-run-acts">
      <span className="ro-dock-t">
        <b data-testid="ro-run-dock">{line.lead}</b>
        {line.said ? <small data-testid="ro-run-approve-note">{line.said}</small> : null}
      </span>
      {waiting && sheet && may && !phone ? (
        <Button variant="quiet" className="ro-dock-skip" onClick={() => sheet.onArm(true)} data-testid="ro-run-skip">
          {L.skip}
        </Button>
      ) : null}
      {waiting && sheet && may ? (
        // On a phone Skip rides Approve as its caret (SkipCaret): one split pill, no three dots in the head.
        <span className="bc-dock-split">
          <Button
            variant="primary"
            className="ro-dock-go"
            disabled={sheet.approving}
            onClick={() => sheet.approve(vm.approved)}
            data-testid="ro-run-approve"
          >
            <Icon name="check" size={16} /> {sheet.approving ? L.approving : vm.approve}
          </Button>
          {phone ? <SkipCaret name={vm.title} sheet={sheet} /> : null}
        </span>
      ) : null}
      {waiting || !acts ? null : <span className="ro-dock-acts">{acts}</span>}
    </div>
  );
}

/**
 * What the pane's head says of a live reach-out run (run.tsx draws the pane, as it does a run's report and a WhatsApp
 * run's sheet): its name whole, and under it one line of where it stands, the parts a dot apart (the canvas's head): what it
 * is -- waiting for your OK, scheduled, sending -- in its colour, whose sending it is, its step and its place among those
 * waiting; a desk says it is to leads too. Null where the run is not a reach-out's.
 */
export function roRunHead(d: BroadcastDetailDto, sheet: RunSheet | null, phone = false) {
  const vm = reachOuts.run(d);
  if (!vm) return null;
  const pos = sheet && sheet.position;
  const place = pos && pos[1] > 1 ? `${pos[0]} of ${pos[1]}` : null;
  const parts = (
    phone ? [place, vm.who, vm.step] : [vm.labels.toLeads, vm.who, vm.step, place ? `${place} waiting` : null]
  ).filter((x): x is string => !!x);
  return {
    title: vm.title,
    sub: (
      <span className="ro-meta">
        <StatePill kind="tone" value={vm.kTone} label={vm.k} testid="ro-run-k" />
        {parts.map((x) => (
          <Fragment key={x}>
            <i className="ro-meta-dot" aria-hidden="true" />
            <span>{x}</span>
          </Fragment>
        ))}
      </span>
    ),
  };
}

export function ReachOutRun({ d, onDecided = () => undefined, flash = null, armed = false }: RunProps) {
  const vm = reachOuts.run(d);
  const b = d.broadcast;
  const waiting = b.state === "pending_approval";
  // The held folded under their head in every state, See them opening them in place (the canvas's boards 1, 6 and 7).
  const [seeHeld, setSeeHeld] = useState(false);
  const doors = useRoRunDoors({ runId: b.id, sequenceId: b.sequence_id, flash, onDecided });
  if (!vm) return null;
  const may = canDo("approve");
  const held =
    vm.held.length > 0 ? (
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
    ) : null;
  const list = <RoRunList key="list" vm={vm} runId={b.id} startOpen={!waiting} />;
  return (
    <div className="bc-sheet ro-run bc-approval" data-testid="ro-run" data-state={b.state}>
      {armed ? <div className="ro-scrim" aria-hidden="true" /> : null}
      <div className="ro-cols">
        <div className="ro-col">
          <RoDecision vm={vm} may={may} />
          {!may && vm.held.length > 0 ? (
            <p className="ro-gate" data-testid="ro-run-role">
              <Icon name="lock" size={14} />
              <span>{gateTitle("approve", vm.labels.gated)}</span>
            </p>
          ) : null}
          {/* A reach-out its owner sends (00429): the emails handed to them, each to send from their own inbox. */}
          <RoToSend d={d} onSaid={onDecided} />
          {held}
        </div>
        <div className="ro-col">
          {/* Waiting, the email is the decision's evidence; going, who it goes to comes first (the canvas's boards 1 and 7). */}
          {waiting ? (
            <>
              <RoRunMail vm={vm} />
              <RoRunChecked vm={vm} />
              {list}
            </>
          ) : (
            <>
              {list}
              <RoRunMail vm={vm} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
