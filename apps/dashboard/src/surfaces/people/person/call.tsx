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
  callDays,
  clockTime,
  personCallClosesBack,
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
import { RecordBox, RecordField, RecordSwitch, RecordToggleGroup } from "../../kit/record/field";
import { Sheet } from "../../kit/sheet/sheet";
import { logCallOn } from "../people-detail";
import { NoteDay } from "./notes";
import type { PageCtx } from "./ctx";

/**
 * What the Call reads of the page it stands on: who, their Call's state, the width, the member's right to log, the
 * page's toast and its read again. Their page hands its own context; the Pipeline's deal sheet hands these alone.
 */
export type CallCtx = Pick<PageCtx, "p" | "call" | "phone" | "canRecord" | "flash" | "load">;

/** The call on a person's page: the number Call rings, and where the question is asked. */
export interface PersonCallCtl {
  /** Nothing to ring: no number of their own and no listing's. */
  vm: PersonCallVM | null;
  /** The question or the dial is showing: the desk's popover from Call, or the phone's sheet. */
  open: boolean;
  /** It shows the question, not the dial. */
  asking: boolean;
  /** When Call was pressed on this page, said in the question's head ("· 4:12 PM"); null for a call logged after. */
  at: number | null;
  setOpen: (open: boolean) => void;
  /** Call was pressed: a desk turns to the question at once, a phone waits for the app to come back. */
  dialled: () => void;
  /** A call already made: the question, without a dial. */
  logPast: () => void;
  close: () => void;
}

/** The person whose Call another page asked for on the way here (askPersonCall), taken once by their page. */
let callAsked: string | null = null;

/**
 * Ask for a person's Call from another page (the Calendar's visit sheet): their page, as it draws them, opens its Call,
 * the dial and then "How did the call go?", so every call is rung and logged in one place, never a bare tel: link.
 */
export function askPersonCall(personId: string): void {
  callAsked = personId;
}

/**
 * The call's state for the page: one popover or sheet, whichever of the head's or the dock's Call opened it. Held before
 * the person is read (a page's hooks come before its early returns), when there is nothing to ring.
 */
export function usePersonCall(p: PersonVM | null, phone: boolean): PersonCallCtl {
  const vm = useMemo(
    () => (p ? personCallOf({ phone: p.phone, standIn: p.standIn, business: p.business, dnc: p.consent.dnc }) : null),
    [p],
  );
  const [open, setOpen] = useState(false);
  // A Call another page asked for (askPersonCall) opens as their page draws them, once.
  const id = p?.id ?? null;
  useEffect(() => {
    if (!id || callAsked !== id || !vm?.rings) return;
    callAsked = null;
    setOpen(true);
  }, [id, vm]);
  const [asking, setAsking] = useState(false);
  const [armed, setArmed] = useState(false);
  const [at, setAt] = useState<number | null>(null);
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
    at,
    setOpen: (next) => {
      setOpen(next);
      if (next) setAsking(false);
    },
    dialled: () => {
      setAt(Date.now());
      if (phone) setArmed(true);
      else setAsking(true);
    },
    logPast: () => {
      setAt(null);
      setAsking(true);
      setOpen(true);
    },
    close: () => {
      setOpen(false);
      setAsking(false);
    },
  };
}

/**
 * "This was the call back they asked for" (X3-1): shown while they have a call-back request open, on whichever outcome is
 * picked, and on, Save hands back their thread holding it (person_call_logged, 00422), so Today, the badge and the bell stop
 * asking.
 */
function ClosesBack({ on, onChange, busy }: { on: boolean; onChange: (on: boolean) => void; busy: boolean }) {
  const id = useId();
  return (
    <div className="cl-prof-call-tell" title={W.closesCallBackHint}>
      <span id={id}>{W.closesCallBack}</span>
      <RecordSwitch on={on} onChange={onChange} labelledBy={id} readOnly={busy} testid="person-call-closes-back" />
    </div>
  );
}

/** The day a call back is for, as the composer holds one: a day chosen, or Pick a day with none yet. */
type Day = { picking: boolean; day: string | null };

/**
 * "How did the call go?": the outcomes, who answered a stand-in's number under Interested, the day to call back under
 * every outcome but Wrong number (Call back later starts on Tomorrow, so the whole job is three presses), what was said,
 * whether the receptionist should know, and Save, which names what it saves, with the line beside it saying where it goes.
 */
function CallAsk({ c, vm, onDone }: { c: CallCtx; vm: PersonCallVM; onDone: () => void }) {
  const [outcome, setOutcome] = useState<PersonCallOutcome | null>(null);
  const [day, setDay] = useState<Day>({ picking: false, day: null });
  const [said, setSaid] = useState("");
  const [tell, setTell] = useState(false);
  const [who, setWho] = useState("");
  // Whether this call was the call back they asked for: the member's answer, else the outcome's (personCallClosesBack).
  const [closes, setCloses] = useState<boolean | null>(null);
  const closesBack = c.p.callBackOpen && (closes ?? personCallClosesBack(outcome));
  const [busy, setBusy] = useState(false);
  const tellId = useId();
  const saidId = useId();
  const tz = pageClock().zone();
  const days = callDays(Date.now(), tz);
  const offer = personCallDays(outcome);
  const due = offer.offered ? day.day : null;
  const pick = (o: PersonCallOutcome) => {
    setOutcome(o);
    const next = personCallDays(o);
    if (!next.offered) setDay({ picking: false, day: null });
    else if (next.tomorrow && !day.day)
      setDay({ picking: false, day: days.find((d) => d.label === "Tomorrow")?.key ?? null });
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
      ...(closesBack ? { closes_call_back: true } : {}),
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
  // Call back: under the outcomes on a desk; on a phone after what was said and the receptionist's switch (canvas A, D1).
  const back = offer.offered ? (
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
        look={c.phone ? "chips" : "chips-sm"}
        testid="person-call"
      />
    </div>
  ) : null;
  return (
    <div className="cl-prof-call-ask" data-testid="person-call-ask">
      <RecordToggleGroup
        label={W.question}
        value={outcome}
        options={vm.outcomes.map((o) => ({ value: o.id, label: o.label }))}
        onChange={pick}
        readOnly={busy}
        look={c.phone ? "chips" : "chips-sm"}
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
      {c.phone ? null : back}
      {/* What was said: a box with no label drawn, its placeholder saying it is the team's (canvas A, M4). */}
      <RecordBox
        id={saidId}
        label={W.said}
        rows={3}
        value={said}
        onChange={setSaid}
        placeholder={W.saidPlaceholder}
        maxLength={PERSON_CALL_SAID_MAX}
        className="cl-prof-call-said"
        testid="person-call-said"
      />
      {/* The phone's sheet asks whether the receptionist should know; the desk's popover logs a team-only note (canvas A,
          M4), its foot saying so. */}
      {c.phone ? (
        <div className="cl-prof-call-tell" title={W.tellHint}>
          <span id={tellId}>{W.tell}</span>
          <RecordSwitch on={tell} onChange={setTell} labelledBy={tellId} readOnly={busy} testid="person-call-tell" />
        </div>
      ) : null}
      {c.phone ? back : null}
      {c.p.callBackOpen && outcome ? <ClosesBack on={closesBack} onChange={setCloses} busy={busy} /> : null}
      <div className="cl-prof-call-foot">
        {/* Where the call goes, beside Save on a desk; a phone's sheet keeps its foot for Save alone (canvas A, D1). */}
        {c.phone ? null : (
          <span className="cl-prof-call-goes" data-testid="person-call-goes">
            {personCallFoot(vm, outcome, tell)}
          </span>
        )}
        {/* On a phone Save is the sheet's one filled control; on a desk the page's one coral stays Open the thread
            (canvas A, D1 and M4). Busy while the door has it, never off. */}
        <Button
          variant={c.phone ? "primary" : "secondary"}
          disabled={!outcome || (offer.offered && day.picking && !day.day)}
          aria-busy={busy || undefined}
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
function CallDial({ c, vm }: { c: CallCtx; vm: PersonCallVM }) {
  return (
    <div className="cl-prof-call-dial" data-testid="person-call-dial">
      <Button href={vm.tel} onClick={c.call.dialled} data-testid="person-call-dial-go">
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
export function CallAct({ c, dock = false, round = false }: { c: CallCtx; dock?: boolean; round?: boolean }) {
  const { vm } = c.call;
  // Nothing to ring, or someone on do-not-contact: no Call (their More still logs a call already made).
  if (!vm?.rings) return null;
  // A phone's Call is a circle (canvas A, P1): of the control layer's glass in the head's row, bare in the dock's capsule.
  if (c.phone)
    return (
      <Button
        iconOnly
        size="touch"
        variant={dock ? "quiet" : "glass"}
        aria-label={W.call}
        title={W.call}
        href={vm.tel}
        onClick={c.canRecord ? c.call.dialled : undefined}
        data-testid={dock ? undefined : "person-call"}
      >
        <Icon name="phone" size={16} />
      </Button>
    );
  // A desk's dock draws it as its circles are drawn (the Pipeline's deal sheet), the popover hanging from it as from the head's.
  const trigger: ReactElement = round ? (
    <Button iconOnly variant="quiet" aria-label={W.call} title={W.call} data-testid="person-call">
      <Icon name="phone" size={16} />
    </Button>
  ) : (
    <Button size="sm" data-testid="person-call">
      {W.call}
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
        <span className="cl-prof-call-sub">
          {c.call.asking
            ? `${vm.number} · ${vm.sub}${c.call.at !== null ? ` · ${clockTime(c.call.at, pageClock().zone())}` : ""}`
            : vm.sub}
        </span>
      </div>
      {c.call.asking && c.canRecord ? <CallAsk c={c} vm={vm} onDone={c.call.close} /> : <CallDial c={c} vm={vm} />}
    </Popover>
  );
}

/** The phone's question, risen once the app is back from the call (or from More's "Log a call you already made"). */
export function CallSheet({ c }: { c: CallCtx }) {
  const { vm } = c.call;
  if (!c.phone || !vm || !c.canRecord) return null;
  return (
    <Sheet
      backCloses
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
