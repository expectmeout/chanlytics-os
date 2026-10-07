/**
 * The first run (`start`; moved from legacy/pages/first-run.jsx, decision 0015 step 10).
 *
 * Setup's own rows, one step to a screen, full screen, with the owner's receptionist filling in beside them
 * (docs/superpowers/specs/2026-09-24-first-run-design.md). The steps, which one the workspace is on and every sentence are
 * contracts' (first-run.ts, FIRST_RUN_HELPERS); the rows and everything a row does are Setup's (setup/rows). Nothing is
 * stored: the step is worked out from Setup's view model on every draw.
 *
 * Drawn by the frame INSTEAD of its chrome (app-shell.jsx, the start route, as it draws the shared viewer), so the page is
 * the whole screen; its App Router page is `app/(os)/w/[workspace]/start/[[...param]]/page.tsx`.
 *
 * The business step is Find while an owner can link a listing (first-run.ts `find`): what Google has for the business,
 * found already, instead of the step's rows. Setup's Google row opens it (the one finder). After Find it is Check
 * (first-run.ts `check`, canvas R2, V2, P2): what the receptionist answers from, in the Business tab's own rows, and how
 * customers buy. The receptionist it checks is set up from what is known, on an owner's press (setupVerbs.receptionist,
 * the first receptionist's route): Find's "Yes, this is us" and "We're not on Google" ask for it, and so does Check's own
 * press where there is still none. Every row saves through the Business tab's one saver, as it does on that tab.
 */
import { useRef, useState, type RefObject, type ReactNode } from "react";
import {
  FIRST_RUN_HELPERS,
  type FirstRunLiveVM,
  type FirstRunPhoneVM,
  type FirstRunTryVM,
  type FirstRunVM,
} from "@chanlytics/contracts";
import type { SettingsSurface } from "@/legacy-bridge/surfaces/settings";
import type { LiveSurface } from "../../live/surface";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { recFolds } from "../../kit/record/registry";
import { canDo, refusalToast, useLegacyToast, type LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { SetupRows } from "../rows/rows";
import { SetupTry } from "../rows/try";
import { businessPart, businessTabSave } from "../shell";
import { setupVerbs, type SetupSurface } from "../surface";
import { FrCheck } from "./check";
import { FrFind } from "./find";
import { useBusinessTabRedraw, useHeadingFocus, useLanded, usePhoneChoice, useTryClock } from "./hooks";
import { alertEmails, brainOf, cardInputs, sellsByAnswer, sendAnswer, workspaceNow } from "./inputs";
import { returnedFromStripe, trySince as trySinceKept, type KeptPhoneChoice } from "./memory";
import { FrCard, FrLive, FrRail } from "./parts";
import { FrPhone } from "./phone";
import type { SettledEntry } from "./settle";
import { FrTry } from "./try";

const W = FIRST_RUN_HELPERS.words;

interface FirstRunProps {
  param?: string | null;
  /** A move: pushed, or the address's own replace (`replace`), which Back leaves the first run from. */
  onNavigate: (to: string, opts?: { replace?: boolean }) => void;
}

/** A move asked while a row on the page holds typing never saved, or a save still out: waiting on the owner's answer. */
interface Leaving {
  move: () => void;
  saving: boolean;
}

/** What the step on screen draws: the first run, and the phone step, Try it and Live as contracts say each. */
interface StepView {
  fr: FirstRunVM;
  ph: FirstRunPhoneVM | null;
  tr: FirstRunTryVM | null;
  lv: FirstRunLiveVM | null;
  phoneDrawn: boolean;
  tryDrawn: boolean;
}

/** Holds across draws, as React keeps a ref: whether Check and Try it are on screen, and when Try it opened. */
interface Stays {
  onCheck: RefObject<boolean>;
  onTry: RefObject<boolean>;
  trySince: RefObject<number | null>;
}

/**
 * The step on screen. Check stays on screen while the owner is on it: its step is done the moment its last fact lands (a
 * service saved in its sheet), and the first run, which opens where the workspace is, would go on to the phone under
 * them; they go on with Looks right instead. So once Check is drawn, the business step is asked for by name until the
 * owner moves. Try it stays on screen too: its step is done the moment the test call reaches the receptionist, and the
 * call, its words and where transfers go are still to be shown.
 */
function stepViewOf(o: {
  S: SetupSurface;
  param: string | null;
  stays: Stays;
  phoneChoice: KeptPhoneChoice | null;
  live: LiveSurface | undefined;
  read: SettingsSurface | undefined;
}): StepView {
  const { S, param, stays, phoneChoice, live, read } = o;
  const F = FIRST_RUN_HELPERS;
  // Who is looking, for Find: whoever may set the workspace up (an owner, or the partner who brought it), by the role
  // gate (View-as included), and what the business goes by.
  const who = {
    owner: canDo("settings"),
    receptionistName: S.dto.business.name,
    workspaceName: (workspaceNow() || { name: null }).name || null,
  };
  const asked = F.of(S.vm, param, who);
  const fr =
    !param && stays.onCheck.current && asked.shown.key !== "business"
      ? F.of(S.vm, "business", who)
      : !param && stays.onTry.current && asked.shown.key !== "try"
        ? F.of(S.vm, "try", who)
        : asked;
  stays.onCheck.current = !!fr.check;
  const key = fr.shown.key;
  // The phone step as contracts say it over Setup and the owner's choice (first-run-phone.ts); `rows` is Setup's own.
  const ph =
    key === "phone"
      ? F.phone({
          dto: S.dto,
          vm: S.vm,
          choice: phoneChoice,
          returned: returnedFromStripe(phoneChoice),
          nowMs: Date.now(),
        })
      : null;
  // Try it as contracts say it over Setup and the Live page's calls (first-run-try.ts); `rows` is Setup's own.
  if (key === "try" && stays.trySince.current === null) stays.trySince.current = trySinceKept();
  const tr =
    key === "try"
      ? F.tryIt({
          dto: S.dto,
          calls: live ? [...(live.now || []), ...(live.recent || [])] : [],
          since: stays.trySince.current ?? Date.now(),
          nowMs: Date.now(),
        })
      : null;
  const tryDrawn = !!tr && tr.stage !== "rows";
  stays.onTry.current = tryDrawn;
  // Live as contracts say it (first-run-live.ts), over Setup and the settings read's alert addresses and name.
  const cfgNow = read && read.settings ? read.settings.config : null;
  const lv =
    key === "live"
      ? F.live({ dto: S.dto, emails: alertEmails(cfgNow), business: S.dto.business.name, owner: canDo("settings") })
      : null;
  return { fr, ph, tr, lv, phoneDrawn: !!ph && ph.stage !== "rows", tryDrawn };
}

/** The step's heading and the sentence under it: the phone step's, Try it's or Live's while each draws its own. */
function stepHead(v: StepView): ReactNode {
  const { fr, ph, tr, lv, phoneDrawn, tryDrawn } = v;
  const heading = phoneDrawn && ph ? ph.heading : tryDrawn && tr ? tr.heading : lv ? lv.heading : fr.heading;
  const lead = phoneDrawn && ph ? ph.lead : tryDrawn && tr ? tr.lead : lv ? lv.lead : fr.lead;
  return (
    <div className="fr-step-head">
      <h1 className="fr-heading" id="fr-heading" tabIndex={-1} data-testid="fr-heading">
        {heading}
      </h1>
      {lead ? <p className="fr-lead">{lead}</p> : null}
    </div>
  );
}

/** The step's foot: Back, why the way on is held, Live's note, and the way on. */
function stepFoot(o: { v: StepView; go: (to: string) => void; onward: () => void; finishing: boolean }): ReactNode {
  const { v, go, onward, finishing } = o;
  const { fr, lv } = v;
  const back = fr.back;
  return (
    <div className="fr-foot">
      {back ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(back)} data-testid="fr-back">
          {W.back}
        </button>
      ) : (
        <span />
      )}
      {fr.onward && fr.onward.held ? (
        <span className="fr-held" id="fr-held" data-testid="fr-held">
          {fr.onward.held}
        </span>
      ) : null}
      {lv && lv.finish.note ? (
        <span className="fr-live-note" data-testid="fr-live-note">
          {lv.finish.note}
        </span>
      ) : null}
      {fr.onward ? (
        <button
          type="button"
          className="fr-onward"
          onClick={onward}
          // Held, it stays in reach and says why beside it, as a gated act does: never `disabled`, which lets go of focus.
          aria-disabled={fr.onward.held ? true : undefined}
          aria-describedby={fr.onward.held ? "fr-held" : undefined}
          aria-busy={finishing || undefined}
          data-testid="fr-onward"
        >
          {fr.onward.label}
        </button>
      ) : null}
    </div>
  );
}

/** The top on a desktop (the brand, the rail, Finish later) and on a phone (the step's line, the bar, the card's strip). */
function tops(o: {
  fr: FirstRunVM;
  go: (to: string) => void;
  leave: (to: string) => void;
  card: ReturnType<typeof FIRST_RUN_HELPERS.receptionist>;
  cardOpen: boolean;
  toggleCard: () => void;
}) {
  const { fr, go, leave, card, cardOpen, toggleCard } = o;
  return (
    <>
      <header className="fr-top">
        <span className="fr-brand">
          <span className="sidebar-brand-mark" aria-hidden="true">
            C
          </span>
          Chanlytics
        </span>
        <FrRail fr={fr} go={go} label={W.title} />
        <button type="button" className="fr-later" onClick={() => leave("today")} data-testid="fr-later">
          {W.later}
        </button>
      </header>
      <div className="fr-phone">
        <div className="fr-phone-top">
          <span data-testid="fr-phone-line">{fr.phoneLine}</span>
          <button type="button" className="fr-later" onClick={() => leave("today")}>
            {W.laterShort}
          </button>
        </div>
        <div className="fr-bar" aria-hidden="true">
          <span style={{ width: `${fr.progress}%` }} />
        </div>
        <button type="button" className="fr-strip" aria-expanded={cardOpen} onClick={toggleCard} data-testid="fr-strip">
          <span className="fr-card-av" aria-hidden="true">
            {card.initials}
          </span>
          <span className="fr-strip-words">{card.strip}</span>
          <Icon name="chevron-down" size={12} />
        </button>
      </div>
    </>
  );
}

/** Setup's read failed, or is on its way: the page says so, with a retry and a way to Today. */
function notRead(S: SetupSurface | null | undefined, leave: (to: string) => void): ReactNode {
  if (S === null) {
    return (
      <div className="fr-root fr-waiting" data-testid="first-run">
        <FailedRead
          kind="card"
          what={W.failedWhat}
          body={W.failedBody}
          onRetry={() => void setupVerbs.refresh()}
          also={{ label: W.toToday, onClick: () => leave("today") }}
          testid="fr-failed"
          retryTestid="fr-retry"
        />
      </div>
    );
  }
  return (
    <div className="fr-root fr-waiting" data-testid="first-run">
      <p className="fr-reading" data-testid="fr-reading">
        {W.reading}
      </p>
    </div>
  );
}

/** What the page's presses do: a step's move, a way out, the receptionist set up, Finish, and the way on. */
interface PageActs {
  go: (to: string) => void;
  leave: (to: string) => void;
  make: () => Promise<void>;
  onward: () => void;
}

function pageActs(o: {
  S: SetupSurface;
  v: StepView;
  onNavigate: FirstRunProps["onNavigate"];
  stays: Stays;
  flash: (f: LegacyFlash) => void;
  setLeaving: (l: Leaving | null) => void;
  making: boolean;
  setMaking: (m: boolean) => void;
  finishing: boolean;
  setFinishing: (f: boolean) => void;
  finishRefused: RefObject<boolean>;
  heldAnswer: RefObject<SettledEntry | null>;
  canEdit: boolean;
}): PageActs {
  const { S, v, onNavigate, stays, flash, setLeaving, making, setMaking, finishing, setFinishing, finishRefused } = o;
  // Asked first while typing on the page was never saved (the record kit's own answer, the fold registry).
  const askFirst = (move: () => void) => {
    if (recFolds.dirty() || recFolds.saving()) {
      setLeaving({ move, saving: recFolds.saving() });
      return;
    }
    move();
  };
  const leave = (to: string) => askFirst(() => onNavigate(to));
  // The step on screen is the address's, replaced rather than pushed, so the browser's Back leaves the first run. A move
  // opens the next step at its top: the shell is the page's scroll (first-run.css).
  const go = (to: string) =>
    askFirst(() => {
      stays.onCheck.current = false;
      stays.onTry.current = false;
      onNavigate(to, { replace: true });
      const shell = "querySelector" in document ? document.querySelector<HTMLElement>(".fr-shell") : null;
      if (shell && shell.scrollTo) shell.scrollTo(0, 0);
    });
  // Set the receptionist up from what is known, where none is: once at a time, and a refusal said in its words.
  const make = async () => {
    if (making) return;
    setMaking(true);
    const r = await setupVerbs.receptionist();
    setMaking(false);
    if (!r.ok) flash(refusalToast(r, W.check.notMade));
  };
  // Finish, on Live: calls switched on by the owner (the capability's activation, which the first run's first time also
  // emails them that it answers), then Today. A refusal is said here and the step stays, so it is read; Finish again goes
  // on to Today, since nothing here holds the owner.
  const finish = async (to: string) => {
    if (finishing) return;
    const voice = S.dto.channels.voice;
    const activated = (S.dto.activations || []).some((a) => a.capability === "voice" && !a.deactivated_at);
    if (!finishRefused.current && voice.active && !activated && canDo("disconnect")) {
      setFinishing(true);
      const r = await setupVerbs.activate("voice", { firstRun: true });
      setFinishing(false);
      if (!r.ok) {
        finishRefused.current = true;
        flash(refusalToast(r, W.notFinished));
        return;
      }
    }
    leave(to);
  };
  const onward = () => {
    const ow = v.fr.onward;
    if (!ow || ow.held) return;
    if (!v.fr.check) {
      if (v.fr.shown.key === "live") void finish(ow.to);
      else if (ow.leaves) leave(ow.to);
      else go(ow.to);
      return;
    }
    // Looks right: the answer to how customers buy, as Check shows it, is sent where none is stored (as the create card
    // sends it), and the step goes on once it is taken. A role that may not change the workspace sends nothing: the door
    // would refuse it, and the step goes on as it is. The answer being chosen, if one waits for the keys to settle, goes
    // now in its place.
    const a = sellsByAnswer();
    const chosen = o.heldAnswer.current;
    o.heldAnswer.current = null;
    const answer = chosen && chosen.next ? chosen.next : !a.stored ? a.shown : null;
    if (
      !o.canEdit ||
      !answer ||
      !sendAnswer(
        answer,
        (f) => flash(f as LegacyFlash),
        () => go(ow.to),
      )
    )
      go(ow.to);
  };
  return { go, leave, make, onward };
}

/** The step's body: Find, Check, the phone, Try it, Live, or Setup's own rows for it, and its foot. */
function stepBody(o: {
  S: SetupSurface;
  v: StepView;
  acts: PageActs;
  flash: (f: LegacyFlash) => void;
  making: boolean;
  canEdit: boolean;
  heldAnswer: RefObject<SettledEntry | null>;
  read: SettingsSurface | undefined;
  phoneChoice: KeptPhoneChoice | null;
  setPhoneChoice: (c: KeptPhoneChoice | null) => void;
  finishing: boolean;
}): ReactNode {
  const { S, v, acts, flash, making, canEdit, heldAnswer, read, phoneChoice, setPhoneChoice, finishing } = o;
  const { fr, ph, tr, lv, phoneDrawn, tryDrawn } = v;
  const { go, leave, make } = acts;
  const step = fr.shown;
  const settings = read ? read.settings : null;
  const cfgNow = settings ? settings.config : null;
  // The step's foot is the phone step's own while its button is the one to press. A role that may not save the forwarding
  // has nothing to press in the questions, and the step is done then (its line answers): the page's own foot, with
  // Continue.
  const phoneFoot = phoneDrawn && !!ph && !!ph.cta && !(ph.stage === "ask" && !canDo("disconnect"));
  return (
    <>
      {fr.find ? <FrFind W={W.find} flash={flash} done={fr.findDone} go={go} make={() => void make()} /> : null}
      {fr.check ? (
        <FrCheck
          check={fr.check}
          W={W.check}
          flash={flash}
          make={() => void make()}
          making={making}
          go={go}
          canEdit={canEdit}
          held={heldAnswer}
          settings={settings}
        />
      ) : null}
      {phoneDrawn && ph ? (
        <FrPhone
          ph={ph}
          choice={phoneChoice}
          setChoice={setPhoneChoice}
          W={FIRST_RUN_HELPERS.phoneWords}
          flash={flash}
          go={go}
          back={fr.back}
          backLabel={W.back}
          ownFoot={phoneFoot}
        />
      ) : null}
      {tryDrawn && tr ? (
        <FrTry
          tr={tr}
          W={FIRST_RUN_HELPERS.tryWords}
          flash={flash}
          go={go}
          leave={leave}
          back={fr.back}
          backLabel={W.back}
        />
      ) : null}
      {step.key === "try" && !tryDrawn && S.vm.tryIt ? <SetupTry tryIt={S.vm.tryIt} /> : null}
      {lv ? (
        <FrLive
          lv={lv}
          config={cfgNow}
          brain={brainOf(cfgNow)}
          canEdit={canEdit}
          owner={canDo("disconnect")}
          leave={leave}
        />
      ) : null}
      {!fr.find && !fr.check && !phoneDrawn && !tryDrawn && step.rows.length ? (
        <div className="fr-part">
          {step.key === "live" ? <h2 className="fr-sub">{W.liveNext}</h2> : null}
          <section className="tq fr-rows">
            <SetupRows S={S} rows={step.rows} look="row" primary={fr.primaryRow} later={W.putOff} testid="fr-rows" />
          </section>
        </div>
      ) : null}
      {(fr.back || fr.onward) && !phoneFoot && !(tryDrawn && tr && tr.stage === "done")
        ? stepFoot({ v, go, onward: acts.onward, finishing })
        : null}
    </>
  );
}

export const FirstRun = ({ param = null, onNavigate }: FirstRunProps) => {
  const S = useSurface("setup");
  const read = useSurface("settings");
  const live = useSurface("live");
  const [cardOpen, setCardOpen] = useState(false);
  useHeadingFocus(param);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  // How customers buy, while Check's choice of it waits for the keys to settle: Continue sends that one (useSettled).
  const heldAnswer = useRef<SettledEntry | null>(null);
  // The page's toast, lent to Find and Check: a link ends Find as the surfaces repaint, and what it says outlives it.
  const [toastNode, flash] = useLegacyToast();
  // The ask for the receptionist, held here and lent to Find and Check: Find is gone by the time it answers.
  const [making, setMaking] = useState(false);
  const stays: Stays = { onCheck: useRef(false), onTry: useRef(false), trySince: useRef<number | null>(null) };
  const redraw = useBusinessTabRedraw();
  const [phoneChoice, setPhoneChoice] = usePhoneChoice(param, (to) => onNavigate(to, { replace: true }), flash);
  // Finish on Live, while its activation is on its way: pressed once. Refused once, the next Finish just goes on.
  const [finishing, setFinishing] = useState(false);
  const finishRefused = useRef(false);
  useTryClock(stays.onTry, redraw);
  useLanded();
  // Every way out of the page before Setup is read: Today, after asking about typing never saved.
  const leaveEarly = (to: string) => {
    if (recFolds.dirty() || recFolds.saving()) setLeaving({ move: () => onNavigate(to), saving: recFolds.saving() });
    else onNavigate(to);
  };
  if (!S) return notRead(S, leaveEarly);
  const v = stepViewOf({ S, param, stays, phoneChoice, live, read });
  // Whether this role may change the business, as the Business tab asks it: its rows' acts, and the answer's door.
  const canEdit = canDo("settings");
  const acts = pageActs({
    S,
    v,
    onNavigate,
    stays,
    flash,
    setLeaving,
    making,
    setMaking,
    finishing,
    setFinishing,
    finishRefused,
    heldAnswer,
    canEdit,
  });
  const card = FIRST_RUN_HELPERS.receptionist(cardInputs(S, read));
  const brainRead = read && read.settings ? brainOf(read.settings.config) : null;
  const ServicesSheet = businessPart("BtServicesSheet");
  const saveDoors = businessTabSave();
  return (
    <div className="fr-root" data-testid="first-run" data-step={v.fr.shown.key}>
      {tops({ fr: v.fr, go: acts.go, leave: acts.leave, card, cardOpen, toggleCard: () => setCardOpen((x) => !x) })}
      <div className="fr-body">
        <main className="fr-step" aria-labelledby="fr-heading">
          {stepHead(v)}
          {stepBody({ S, v, acts, flash, making, canEdit, heldAnswer, read, phoneChoice, setPhoneChoice, finishing })}
        </main>
        <FrCard card={card} open={cardOpen} />
      </div>
      {/* The services list opens in a sheet, as it does on the Business tab, which draws it last of everything there. */}
      {v.fr.check && brainRead && ServicesSheet && saveDoors ? (
        <ServicesSheet brain={brainRead} canEdit={canEdit} flash={flash} saver={saveDoors.saver} />
      ) : null}
      {leaving ? leaveAsk(leaving, setLeaving) : null}
      {toastNode}
    </div>
  );
};

/** The question a move waits on: leave what was typed, or wait for the save still out. */
function leaveAsk(leaving: Leaving, setLeaving: (l: Leaving | null) => void): ReactNode {
  return (
    <Confirm
      question={leaving.saving ? W.leave.savingQuestion : W.leave.question}
      detail={leaving.saving ? W.leave.savingDetail : W.leave.detail}
      yes={W.leave.yes}
      no={W.leave.no}
      discard={!leaving.saving}
      onYes={() => {
        const { move } = leaving;
        setLeaving(null);
        move();
      }}
      onNo={() => setLeaving(null)}
      testid="fr-leave"
    />
  );
}
