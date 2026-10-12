/**
 * Call (decision 0052, canvas A M4 and P2): the member's own phone rings the person, never the receptionist, and the page
 * asks how it went. On a desk Call opens a popover that goes from "Call from your phone" to "How did the call go?"; on a
 * phone Call dials at once, and the question rises in a sheet when the app comes back, as Leads asks it. "Log a call you
 * already made" opens the question without dialling. One door keeps the answer (person_call_logged): a note, the team's
 * own unless the receptionist should know, a step with a day, and the outcome on the lead their business is, where it is
 * open. Every word is contracts' (PERSON_CALL_WORDS, personCallOf, personCallSave, personCallFoot).
 */
import { useEffect, useId, useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  NOTE_WORDS,
  PERSON_CALL_SAID_MAX,
  PERSON_CALL_WORDS as W,
  composerDays,
  personCallDays,
  personCallFoot,
  personCallOf,
  personCallSave,
  stepDayName,
} from "@chanlytics/contracts";
import type { PersonCallOutcome, PersonCallVM, PersonVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Popover } from "../../kit/popover/popover";
import { RecordField, RecordSwitch, RecordToggleGroup } from "../../kit/record/field";
import { Sheet } from "../../kit/sheet/sheet";
import { logCallOn } from "../people-detail";
import { NoteDay } from "./notes";
import type { PageCtx } from "./ctx";

/** The call on a person's page: the number Call rings, and where the question is asked. */
export interface PersonCallCtl {
  /** Nothing to ring: no number of their own and no listing's. */
  vm: PersonCallVM | null;
  /** The question or the dial is showing: the desk's popover from Call, or the phone's sheet. */
  open: boolean;
  /** It shows the question, not the dial. */
  asking: boolean;
  setOpen: (open: boolean) => void;
  /** Call was pressed: a desk turns to the question at once, a phone waits for the app to come back. */
  dialled: () => void;
  /** A call already made: the question, without a dial. */
  logPast: () => void;
  close: () => void;
}

/**
 * The call's state for the page: one popover or sheet, whichever of the head's or the dock's Call opened it. Held before
 * the person is read (a page's hooks come before its early returns), when there is nothing to ring.
 */
export function usePersonCall(p: PersonVM | null, phone: boolean): PersonCallCtl {
  const vm = useMemo(
    () => (p ? personCallOf({ phone: p.phone, standIn: p.standIn, business: p.business }) : null),
    [p],
  );
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [armed, setArmed] = useState(false);
  // The dial left the app; the question waits until the member is back to answer it (Leads' leadArmOnReturn).
  useEffect(() => {
    if (!armed) return undefined;
    const wake = () => {
      if (document.hidden) return;
      setArmed(false);
      setAsking(true);
      setOpen(true);
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [armed]);
  return {
    vm,
    open,
    asking,
    setOpen: (next) => {
      setOpen(next);
      if (next) setAsking(false);
    },
    dialled: () => {
      if (phone) setArmed(true);
      else setAsking(true);
    },
    logPast: () => {
      setAsking(true);
      setOpen(true);
    },
    close: () => {
      setOpen(false);
      setAsking(false);
    },
  };
}

/** The day a call back is for, as the composer holds one: a day chosen, or Pick a day with none yet. */
type Day = { picking: boolean; day: string | null };

/**
 * "How did the call go?": the outcomes, who answered a stand-in's number under Interested, the day to call back under
 * every outcome but Wrong number (Call back later starts on Tomorrow, so the whole job is three presses), what was said,
 * whether the receptionist should know, and Save, which names what it saves, with the line beside it saying where it goes.
 */
function CallAsk({ c, vm, onDone }: { c: PageCtx; vm: PersonCallVM; onDone: () => void }) {
  const [outcome, setOutcome] = useState<PersonCallOutcome | null>(null);
  const [day, setDay] = useState<Day>({ picking: false, day: null });
  const [said, setSaid] = useState("");
  const [tell, setTell] = useState(false);
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);
  const tellId = useId();
  const tz = pageClock().zone();
  const days = composerDays(Date.now(), tz);
  const offer = personCallDays(outcome);
  const due = offer.offered ? day.day : null;
  const pick = (o: PersonCallOutcome) => {
    setOutcome(o);
    const next = personCallDays(o);
    // composerDays always offers Tomorrow first.
    if (!next.offered) setDay({ picking: false, day: null });
    else if (next.tomorrow && !day.day) setDay({ picking: false, day: days[0]?.key ?? null });
  };
  const save = async () => {
    if (!outcome || busy || (offer.offered && day.picking && !day.day)) return;
    setBusy(true);
    const r = await logCallOn(c.p.id, {
      outcome,
      ...(said.trim() ? { said: said.trim() } : {}),
      ...(due ? { due_on: due } : {}),
      tell,
      ...(vm.asksWho && outcome === "interested" && who.trim() ? { spoke_with: who.trim() } : {}),
    });
    setBusy(false);
    if (!r.ok) {
      c.flash({ tone: "danger", msg: <>{r.message || W.couldNot}</> });
      return;
    }
    c.flash({ msg: <>{W.saved}</> });
    c.load();
    onDone();
  };
  return (
    <div className="cl-prof-call-ask" data-testid="person-call-ask">
      <RecordToggleGroup
        label={W.question}
        value={outcome}
        options={vm.outcomes.map((o) => ({ value: o.id, label: o.label }))}
        onChange={pick}
        readOnly={busy}
        wrap
        testid="person-call-outcome"
      />
      {vm.asksWho && outcome === "interested" ? (
        <RecordField
          label={W.spokeWith}
          value={who}
          onChange={setWho}
          placeholder={W.spokeWithPlaceholder}
          maxLength={80}
          spellCheck={false}
          testid="person-call-who"
        />
      ) : null}
      {offer.offered ? (
        <div className="cl-prof-call-back">
          <span className="cl-prof-call-word" aria-hidden="true">
            {W.callBack}
          </span>
          <NoteDay
            day={day.day}
            picking={day.picking}
            days={days}
            onDay={setDay}
            disabled={busy}
            W={NOTE_WORDS}
            label={W.callBack}
            testid="person-call"
          />
        </div>
      ) : null}
      <RecordField
        label={W.said}
        rows={2}
        value={said}
        onChange={setSaid}
        placeholder={W.saidPlaceholder}
        maxLength={PERSON_CALL_SAID_MAX}
        testid="person-call-said"
      />
      <div className="cl-prof-call-tell" title={W.tellHint}>
        <span id={tellId}>{W.tell}</span>
        <RecordSwitch on={tell} onChange={setTell} labelledBy={tellId} readOnly={busy} testid="person-call-tell" />
      </div>
      <div className="cl-prof-call-foot">
        <span className="cl-prof-call-goes" data-testid="person-call-goes">
          {personCallFoot(vm, outcome, tell)}
        </span>
        <Button
          variant="primary"
          disabled={!outcome || busy || (offer.offered && day.picking && !day.day)}
          onClick={() => void save()}
          data-testid="person-call-save"
        >
          {outcome ? personCallSave(outcome, due ? stepDayName(due, Date.now(), tz) : null) : W.saveBare}
        </Button>
      </div>
    </div>
  );
}

/** The dial, in the desk's popover: the number and where it is rung from, then the press that rings it. */
function CallDial({ c, vm }: { c: PageCtx; vm: PersonCallVM }) {
  return (
    <div className="cl-prof-call-dial" data-testid="person-call-dial">
      <Button variant="primary" href={vm.tel} onClick={c.call.dialled} data-testid="person-call-dial-go">
        <Icon name="phone" size={12} /> {W.dial}
      </Button>
      <span className="cl-prof-call-sub">{W.dialHint}</span>
      {c.canRecord ? (
        <Button variant="quiet" size="sm" onClick={c.call.logPast} data-testid="person-call-past">
          {W.logPast}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The head's Call, and the phone dock's circle: on a desk the popover hangs from it, the dial first and the question
 * once it is rung; on a phone it rings at once and the sheet asks once the app is back. A viewer rings and is never asked.
 */
export function CallAct({ c, dock = false }: { c: PageCtx; dock?: boolean }) {
  const { vm } = c.call;
  if (!vm) return null;
  if (c.phone)
    return dock ? (
      <Button iconOnly aria-label={W.call} href={vm.tel} onClick={c.canRecord ? c.call.dialled : undefined}>
        <Icon name="phone" size={15} />
      </Button>
    ) : (
      <Button size="sm" href={vm.tel} onClick={c.canRecord ? c.call.dialled : undefined} data-testid="person-call">
        <Icon name="phone" size={12} /> {W.call}
      </Button>
    );
  const trigger: ReactElement = (
    <Button size="sm" data-testid="person-call">
      <Icon name="phone" size={12} /> {W.call}
    </Button>
  );
  return (
    <Popover
      trigger={trigger}
      label={c.call.asking ? W.question : W.dial}
      open={c.call.open}
      onOpenChange={c.call.setOpen}
      side="bottom"
      align="start"
      size="md"
      className="cl-prof-call"
    >
      <div className="cl-prof-call-head">
        <strong>{c.call.asking ? W.question : vm.heading}</strong>
        <span className="cl-prof-call-sub">{c.call.asking ? `${vm.number} · ${vm.sub}` : vm.sub}</span>
      </div>
      {c.call.asking && c.canRecord ? <CallAsk c={c} vm={vm} onDone={c.call.close} /> : <CallDial c={c} vm={vm} />}
    </Popover>
  );
}

/** The phone's question, risen once the app is back from the call (or from More's "Log a call you already made"). */
export function CallSheet({ c }: { c: PageCtx }) {
  const { vm } = c.call;
  if (!c.phone || !vm || !c.canRecord) return null;
  return (
    <Sheet
      open={c.call.open && c.call.asking}
      onClose={c.call.close}
      title={W.question}
      sub={vm.listing ? vm.heading : vm.number}
      close={{ label: W.notNow, glyph: <Icon name="x" size={13} /> }}
      className="cl-prof-call-rise"
      testid="person-call-sheet"
    >
      {c.call.open && c.call.asking ? <CallAsk c={c} vm={vm} onDone={c.call.close} /> : null}
    </Sheet>
  );
}
