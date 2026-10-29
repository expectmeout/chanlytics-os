/**
 * The first run (`start`; moved from legacy/pages/first-run.jsx, decision 0015 step 10; five steps since decision 0073).
 *
 * Setup's own rows and the owner's receptionist, one step to a screen, full screen
 * (docs/superpowers/specs/2026-09-24-first-run-design.md, docs/decisions/0073): Your business (Find, or the one press that
 * sets the receptionist up), Your receptionist (Check's rows, the two things only the owner knows, how it sounds), Rehearse
 * (talk to it, see how it did, fix it), Where it answers (choices only), Go live (pay, the number, the forwarding proved by
 * the owner's own call, WhatsApp, then what answers). The steps, which one the workspace is on and every sentence are
 * contracts' (FIRST_RUN_HELPERS); the rows and everything a row does are Setup's (setup/rows). Nothing is stored but the
 * member's own: the step is worked out from Setup's view model on every draw.
 *
 * Drawn by the frame INSTEAD of its chrome (frame/shell-chrome.tsx, the start route), so the page is the whole screen; its
 * App Router page is `app/(os)/w/[workspace]/start/[[...param]]/page.tsx`. Its controls are the kit's, drawn by its
 * classes on plain elements where the first run always drew them so (a chunk other pages share was copied when the kit's
 * components were imported here, 7 Oct 2026), and by the kit's components where a step reuses a surface built with them
 * (Rehearse's parts, the sheets).
 */
import { useRef, useState, type RefObject, type ReactNode } from "react";
import {
  FIRST_RUN_HELPERS,
  FIRST_RUN_ROUTE,
  firstRunStepOf,
  firstRunStepRoute,
  bookingToolOfLink,
  type FirstRunChannelsVM,
  type FirstRunGoLiveVM,
  type FirstRunLiveVM,
  type FirstRunPhoneVM,
  type FirstRunStepKey,
  type FirstRunTryVM,
  type FirstRunVM,
  type FirstRunWho,
} from "@chanlytics/contracts";
import type { SettingsSurface } from "@/legacy-bridge/surfaces/settings";
import { pageClock } from "@/legacy-bridge/zone";
import type { LiveSurface } from "../../live/surface";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { recFolds } from "../../kit/record/registry";
import { canDo, refusalToast, useLegacyToast, type LegacyFlash } from "../../legacy-verbs";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";
import { SetupRows } from "../rows/rows";
import { BtServicesSheet, businessTabSave } from "../shell";
import { setupVerbs, type SetupSurface } from "../surface";
import { businessBody, buildingOf, googleShownOf, type GoogleActs } from "./business";
import { useGoogleBack, type GoogleBack } from "./connect-google";
import { FrChannels } from "./channels/channels";
import { FrGoLive } from "./golive/golive";
import {
  useBusinessTabRedraw,
  useHeadingFocus,
  useKeepAppReady,
  useLanded,
  usePhoneChoice,
  useTryClock,
  useWaitingLook,
  type Waits,
} from "./hooks";
import { alertEmails, brainOf, cardInputs, workspaceNow, type CardBrain } from "./inputs";
import { choiceFromWant, returnedFromStripe, trySince as trySinceKept, type KeptPhoneChoice } from "./memory";
import { FrCard, FrRail } from "./parts";
import { FrReceptionist } from "./receptionist/receptionist";
import { FrRehearse } from "./rehearse";
import { W } from "./words";

interface FirstRunProps {
  param?: string | null;
  /** A move: pushed, or the address's own replace (`replace`), for a move that stays on the step drawn. */
  onNavigate: (to: string, opts?: { replace?: boolean }) => void;
}

/** A move asked while a row on the page holds typing never saved, or a save still out: waiting on the owner's answer. */
interface Leaving {
  move: () => void;
  saving: boolean;
}

/** What the step on screen draws: the first run, and each step's own view model where it is drawn. */
interface StepView {
  fr: FirstRunVM;
  /** The phone: chosen at Where it answers, bought and forwarded at Go live. */
  ph: FirstRunPhoneVM | null;
  ch: FirstRunChannelsVM | null;
  gl: FirstRunGoLiveVM | null;
  tr: FirstRunTryVM | null;
  lv: FirstRunLiveVM | null;
  /** The owner's choice of number: the tab's, else the one their saved view says. */
  choice: KeptPhoneChoice | null;
  /** A test call has been on screen since the owner last moved (Stays.tryHeld), as this draw found it. */
  tryHeld: boolean;
}

/**
 * Holds across draws, as React keeps a ref: whether Rehearse is on screen, whether Try it is, when the test call's
 * listening began, and whether a test call has been on screen since the owner last moved: Go live keeps its list (the
 * call's words, then where a caller who asks for a person goes) though Setup, hearing of the call, says everything is done.
 */
interface Stays {
  onRehearse: RefObject<boolean>;
  onTry: RefObject<boolean>;
  trySince: RefObject<number | null>;
  tryHeld: RefObject<boolean>;
}

/**
 * Who is looking: whoever may set the workspace up (an owner, or the partner who brought it), by the role gate (View-as
 * included), what the business goes by, and the receptionist's own name.
 */
const lookerOf = (S: SetupSurface, brain: CardBrain | null): FirstRunWho => ({
  owner: canDo("settings"),
  receptionistName: S.dto.business.name,
  workspaceName: (workspaceNow() || { name: null }).name || null,
  assistantName: brain?.profile?.assistant_name ?? null,
});

/**
 * The step on screen. Rehearse stays on screen while the owner is on it: its step is done the moment the first review
 * lands, and the first run, which opens where the workspace is, would go on under them while they read it and fix what
 * it got wrong; they go on with Looks good instead.
 */
function stepOn(S: SetupSurface, param: string | null, stays: Stays, who: FirstRunWho): FirstRunVM {
  const asked = FIRST_RUN_HELPERS.of(S.vm, param, who);
  const fr =
    !param && stays.onRehearse.current && asked.shown.key !== "rehearse"
      ? FIRST_RUN_HELPERS.of(S.vm, "rehearse", who)
      : asked;
  stays.onRehearse.current = fr.shown.key === "rehearse";
  return fr;
}

/** Where it answers' tiles, as contracts say them over Setup, the phone's choosing and the settings read. */
function channelsVmOf(
  S: SetupSurface,
  ph: FirstRunPhoneVM,
  brain: CardBrain | null,
  keepApp: boolean,
): FirstRunChannelsVM {
  const wa = S.vm.choices.whatsapp;
  return FIRST_RUN_HELPERS.channels({
    tz: pageClock().zone(),
    dto: S.dto,
    vm: S.vm,
    phone: ph,
    whatsapp: wa,
    onWhatsapp: wa === "same" ? true : null,
    coexistence: keepApp,
    bookingLink: brain?.booking_link ?? null,
    website: brain?.profile?.website ?? null,
    people: S.dto.people ?? null,
  });
}

/** Go live's own: the owner's call listened for, the step's stage, and what answers once everything is done. */
function liveViewOf(o: {
  S: SetupSurface;
  fr: FirstRunVM;
  ph: FirstRunPhoneVM;
  stays: Stays;
  live: LiveSurface | undefined;
  read: SettingsSurface | undefined;
  brain: CardBrain | null;
}): Pick<StepView, "tr" | "gl" | "lv"> {
  const { S, fr, ph, stays, live, read, brain } = o;
  const F = FIRST_RUN_HELPERS;
  if (stays.trySince.current === null) stays.trySince.current = trySinceKept();
  const tr = F.tryIt({
    dto: S.dto,
    calls: live ? [...(live.now || []), ...(live.recent || [])] : [],
    since: stays.trySince.current ?? Date.now(),
    nowMs: Date.now(),
  });
  stays.onTry.current = tr.stage !== "rows";
  if (tr.stage === "call") stays.tryHeld.current = true;
  const ws = workspaceNow();
  const gl = F.goLive({
    dto: S.dto,
    vm: S.vm,
    phone: ph,
    complete: fr.complete && !stays.tryHeld.current,
    whatsapp: S.vm.choices.whatsapp,
    toolName: null,
    people: S.dto.people ?? null,
    tz: (ws && ws.timezone) || "UTC",
    nowMs: Date.now(),
  });
  const lv = fr.complete
    ? F.live({
        dto: S.dto,
        emails: alertEmails(read && read.settings ? read.settings.config : null),
        business: S.dto.business.name,
        owner: canDo("settings"),
        assistant: brain?.profile?.assistant_name ?? null,
      })
    : null;
  return { tr, gl, lv };
}

function stepViewOf(o: {
  S: SetupSurface;
  param: string | null;
  stays: Stays;
  phoneChoice: KeptPhoneChoice | null;
  live: LiveSurface | undefined;
  read: SettingsSurface | undefined;
  keepApp: boolean;
}): StepView {
  const { S, param, stays, phoneChoice, live, read, keepApp } = o;
  const brain = brainOf(read && read.settings ? read.settings.config : null);
  const fr = stepOn(S, param, stays, lookerOf(S, brain));
  const key = fr.shown.key;
  // The tab that made the choice may be gone (a reload, another device, checkout's way back): the member's saved view
  // still says which number they keep, move or got, and the steps go on from there.
  const choice = phoneChoice ?? choiceFromWant(S.want);
  const ph =
    key === "channels" || key === "live"
      ? FIRST_RUN_HELPERS.phone({
          dto: S.dto,
          vm: S.vm,
          choice,
          returned: returnedFromStripe(phoneChoice),
          nowMs: Date.now(),
          at: key,
        })
      : null;
  if (key !== "live") stays.onTry.current = false;
  const golive = key === "live" && ph ? liveViewOf({ S, fr, ph, stays, live, read, brain }) : null;
  return {
    fr,
    ph,
    ch: key === "channels" && ph ? channelsVmOf(S, ph, brain, keepApp) : null,
    gl: golive?.gl ?? null,
    tr: golive?.tr ?? null,
    lv: golive?.lv ?? null,
    choice,
    tryHeld: stays.tryHeld.current,
  };
}

/** What the step drawn waits on from outside the page, for the look it takes at its own pace (hooks.tsx). */
function waitsOf(v: StepView | null): Waits {
  if (!v || v.fr.shown.key !== "live") return null;
  if (v.tr && (v.tr.stage === "listen" || v.tr.stage === "quiet" || v.tr.stage === "call")) return "call";
  return v.gl && (v.gl.stage === "confirming" || v.gl.stage === "switch") ? "setup" : null;
}

/** The step's heading and the sentence under it, Go live's own lead counting the hands it will need. */
function stepHead(v: StepView): ReactNode {
  const { fr, gl } = v;
  const lead = gl && gl.stage === "pay" ? FIRST_RUN_HELPERS.goLiveWords.lead(gl.hands) : fr.lead;
  return (
    <div className="fr-step-head">
      <h1 className="fr-heading" id="fr-heading" tabIndex={-1} data-testid="fr-heading">
        {fr.heading}
      </h1>
      {lead ? <p className="fr-lead">{lead}</p> : null}
    </div>
  );
}

/** The step's foot: Back, why the way on is held, Live's note, and the way on. */
function stepFoot(o: { v: StepView; go: (to: string) => void; onward: () => void; busy: boolean }): ReactNode {
  const { v, go, onward, busy } = o;
  const { fr, lv } = v;
  const back = fr.back;
  return (
    <div className="fr-foot">
      {back ? (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => go(back)} data-testid="fr-back">
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
        <span className="fr-foot-note" data-testid="fr-live-note">
          {lv.finish.note}
        </span>
      ) : null}
      {fr.onward ? (
        <button
          type="button"
          className="btn btn-lg btn-primary fr-go"
          onClick={onward}
          // Held, it stays in reach and says why beside it, as a gated act does: never `disabled`, which lets go of focus.
          aria-disabled={fr.onward.held ? true : undefined}
          aria-describedby={fr.onward.held ? "fr-held" : undefined}
          aria-busy={busy || undefined}
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
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => leave("today")} data-testid="fr-later">
          {W.later}
        </button>
      </header>
      <div className="fr-phone">
        <div className="fr-phone-top">
          <span data-testid="fr-phone-line">{fr.phoneLine}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => leave("today")}>
            {W.laterShort}
          </button>
        </div>
        <div className="fr-bar" aria-hidden="true">
          <span style={{ width: `${fr.progress}%` }} />
        </div>
        <button
          type="button"
          className="btn btn-ghost fr-strip"
          aria-expanded={cardOpen}
          onClick={toggleCard}
          data-testid="fr-strip"
        >
          <span className="face face-sm" aria-hidden="true">
            <span>{card.initials}</span>
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

/** What the page's presses do: a step's move, a way out, the receptionist set up, and the way on. */
interface PageActs {
  go: (to: string) => void;
  leave: (to: string) => void;
  make: () => Promise<void>;
  onward: () => void;
}

/** The step an address of the first run names: `start/find` is the business step's, the bare address nobody's. */
function stepOfAddress(to: string): FirstRunStepKey | null {
  const param = to.startsWith(`${FIRST_RUN_ROUTE}/`) ? to.slice(FIRST_RUN_ROUTE.length + 1) : null;
  return param === "find" ? "business" : firstRunStepOf(param);
}

/**
 * A step's move, as the address takes it. Another step is a PUSHED entry, so the browser's Back (a phone's swipe) walks
 * the steps the owner took. A move within the step drawn (its own address, so it stays on screen) replaces. "On to where
 * the workspace is" (the bare address) is said as that step's own address, read from Setup as it stands NOW (a press may
 * have just changed it): an entry Back returns to must name its step. For the same reason the entry being left is named
 * first, where it was the bare address.
 */
function moveTo(o: {
  to: string;
  S: SetupSurface;
  v: StepView;
  param: string | null;
  onNavigate: FirstRunProps["onNavigate"];
}) {
  const { to, S, v, param, onNavigate } = o;
  const now = surfaceValue("setup") ?? S;
  const target =
    to === FIRST_RUN_ROUTE ? firstRunStepRoute(FIRST_RUN_HELPERS.of(now.vm, null, lookerOf(now, null)).current) : to;
  const here = v.fr.shown.key;
  if (stepOfAddress(target) === here) {
    onNavigate(target, { replace: true });
    return;
  }
  if (!param) onNavigate(firstRunStepRoute(here), { replace: true });
  onNavigate(target);
}

function pageActs(o: {
  S: SetupSurface;
  v: StepView;
  param: string | null;
  onNavigate: FirstRunProps["onNavigate"];
  stays: Stays;
  flash: (f: LegacyFlash) => void;
  setLeaving: (l: Leaving | null) => void;
  busy: { making: boolean; setMaking: (m: boolean) => void; going: boolean; setGoing: (g: boolean) => void };
  finishRefused: RefObject<boolean>;
}): PageActs {
  const { S, v, param, onNavigate, stays, flash, setLeaving, busy, finishRefused } = o;
  // Asked first while typing on the page was never saved (the record kit's own answer, the fold registry).
  const askFirst = (move: () => void) => {
    if (recFolds.dirty() || recFolds.saving()) {
      setLeaving({ move, saving: recFolds.saving() });
      return;
    }
    move();
  };
  const leave = (to: string) => askFirst(() => onNavigate(to));
  // A move asked about already (Rehearse it now asks before it keeps the step as met).
  const goNow = (to: string) => {
    stays.onRehearse.current = false;
    stays.onTry.current = false;
    stays.tryHeld.current = false;
    moveTo({ to, S, v, param, onNavigate });
  };
  const go = (to: string) => askFirst(() => goNow(to));
  // Set the receptionist up from what is known, where none is: once at a time, and a refusal said in its words.
  const make = async () => {
    if (busy.making) return;
    busy.setMaking(true);
    const r = await setupVerbs.receptionist();
    busy.setMaking(false);
    if (!r.ok) flash(refusalToast(r, W.check.notMade));
  };
  // Your receptionist's onward (decision 0073), once typing never saved is asked about: the step kept as met, the agent
  // asked for (best effort, so the first call starts at once), then Rehearse.
  const meet = async () => {
    if (busy.going) return;
    busy.setGoing(true);
    const r = await setupVerbs.later(FIRST_RUN_HELPERS.receptionistMet, { on: true, why: "answer" });
    busy.setGoing(false);
    if (!r.ok) return flash(refusalToast(r, W.find.notSaved));
    void setupVerbs.makeAgent();
    goNow(firstRunStepRoute("rehearse"));
  };
  // Open Today, once everything is done: calls switched on by the owner (the capability's activation, which the first
  // run's first time also emails them that it answers), then Today. A refusal is said and the step stays; again goes on.
  const finish = async (to: string) => {
    if (busy.going) return;
    const voice = S.dto.channels.voice;
    const activated = (S.dto.activations || []).some((a) => a.capability === "voice" && !a.deactivated_at);
    if (!finishRefused.current && voice.active && !activated && canDo("disconnect")) {
      busy.setGoing(true);
      const r = await setupVerbs.activate("voice", { firstRun: true });
      busy.setGoing(false);
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
    const key = v.fr.shown.key;
    if (key === "receptionist") return askFirst(() => void meet());
    if (key === "rehearse") return go(firstRunStepRoute("channels"));
    if (key === "live" && v.fr.complete) return void finish(ow.to);
    if (ow.leaves) return leave(ow.to);
    go(ow.to);
  };
  return { go, leave, make, onward };
}

/**
 * The step's body, and whether it lays out its own two columns (every step but Your business, which has the card). Your
 * receptionist and Rehearse draw the page's foot at the end of their own column (`foot`), as Where it answers does its
 * own: under both columns it stood below the taller aside, far from a short step.
 */
function stepBody(o: {
  S: SetupSurface;
  v: StepView;
  acts: PageActs;
  flash: (f: LegacyFlash) => void;
  making: boolean;
  read: SettingsSurface | undefined;
  setPhoneChoice: (c: KeptPhoneChoice | null) => void;
  card: ReturnType<typeof FIRST_RUN_HELPERS.receptionist>;
  google: GoogleActs;
  foot: ReactNode;
}): ReactNode {
  const { S, v, acts, flash, making, read, setPhoneChoice, card, google, foot } = o;
  const { fr } = v;
  const settings = read ? read.settings : null;
  const cfgNow = settings ? settings.config : null;
  const brain = brainOf(cfgNow);
  const canEdit = canDo("settings");
  switch (fr.shown.key) {
    case "business":
      return businessBody({ fr, S, go: acts.go, make: () => void acts.make(), flash, making, read, google });
    case "receptionist":
      return fr.check ? (
        <FrReceptionist
          check={fr.check}
          card={card}
          flash={flash}
          make={() => void acts.make()}
          making={making}
          go={acts.go}
          canEdit={canEdit}
          settings={settings}
          reads={S.dto.reads ?? null}
          foot={foot}
        />
      ) : null;
    case "rehearse":
      return (
        <FrRehearse
          fr={fr}
          card={card}
          bookingLink={brain?.booking_link ?? null}
          trained={S.vm.rehearsal.kept}
          canEdit={canEdit}
          flash={flash}
          go={acts.go}
          foot={foot}
        />
      );
    case "channels":
      return v.ch && v.ph ? (
        <FrChannels
          vm={v.ch}
          ph={v.ph}
          choice={v.choice}
          setChoice={setPhoneChoice}
          tool={v.ch.bookings.tool ?? bookingToolOfLink(brain?.booking_link ?? null)}
          lines={
            FIRST_RUN_HELPERS.imports(S.dto.imports, pageClock().zone(), {
              whatsappWaiting: S.vm.choices.whatsapp === "same",
            }).lines
          }
          flash={flash}
          go={acts.go}
          back={fr.back}
        />
      ) : null;
    case "live":
      return v.gl && v.ph ? (
        <FrGoLive
          rows={setupRowsOf(S, v.gl.rows)}
          tryHeld={v.tryHeld}
          gl={v.gl}
          ph={v.ph}
          tr={v.tr}
          lv={v.lv}
          choice={v.choice}
          setChoice={setPhoneChoice}
          whatsapp={S.vm.choices.whatsapp}
          waNumber={S.vm.want && S.vm.want.way !== "new" ? S.vm.want.number : null}
          assistant={card.assistant}
          config={cfgNow}
          brain={brain}
          canEdit={canEdit}
          owner={canDo("disconnect")}
          flash={flash}
          go={acts.go}
          leave={acts.leave}
          back={fr.back}
        />
      ) : null;
  }
}

/** Setup's own rows, by id, drawn as the first run draws rows: Go live's for what its list cannot do. */
function setupRowsOf(S: SetupSurface, ids: readonly string[]): ReactNode {
  const rows = S.vm.rows.filter((r) => ids.includes(r.id));
  const first = rows[0];
  return first ? (
    <section className="tq fr-rows">
      <SetupRows S={S} rows={rows} look="row" primary={first.id} later={W.putOff} testid="fr-rows" />
    </section>
  ) : null;
}

/**
 * Every step draws Back and its onward in the page's foot but Find, Connect it to Google and its way back, Where it answers
 * and Go live before it is live, whose own do.
 */
const ownFoot = (v: StepView, google: GoogleBack | null): boolean =>
  v.fr.find ||
  v.fr.connect ||
  !!google ||
  v.fr.shown.key === "channels" ||
  (v.fr.shown.key === "live" && !!v.gl && v.gl.stage !== "live");

export const FirstRun = ({ param = null, onNavigate }: FirstRunProps) => {
  const S = useSurface("setup");
  const read = useSurface("settings");
  const live = useSurface("live");
  const [cardOpen, setCardOpen] = useState(false);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  // The page's toast, lent to every step: a step's move ends what it drew, and what it says outlives it.
  const [toastNode, flash] = useLegacyToast();
  const [making, setMaking] = useState(false);
  const [going, setGoing] = useState(false);
  const stays: Stays = {
    onRehearse: useRef(false),
    onTry: useRef(false),
    trySince: useRef<number | null>(null),
    tryHeld: useRef(false),
  };
  const redraw = useBusinessTabRedraw();
  const [phoneChoice, setPhoneChoice] = usePhoneChoice(param, (to) => onNavigate(to, { replace: true }), flash);
  const [googleBack, setGoogleBack] = useGoogleBack(flash);
  const [matches, setMatches] = useState<number | null | undefined>(undefined);
  const finishRefused = useRef(false);
  useTryClock(stays.onTry, redraw);
  useLanded();
  const keepApp = useKeepAppReady(!!S);
  const v = S ? stepViewOf({ S, param, stays, phoneChoice, live, read, keepApp }) : null;
  // What is on screen, for the heading's focus: the step, and Find apart from Check, whatever the address says.
  useHeadingFocus(v ? (v.fr.find ? "find" : v.fr.shown.key) : null);
  useWaitingLook(waitsOf(v));
  // Every way out of the page before Setup is read: Today, after asking about typing never saved.
  const leaveEarly = (to: string) => {
    if (recFolds.dirty() || recFolds.saving()) setLeaving({ move: () => onNavigate(to), saving: recFolds.saving() });
    else onNavigate(to);
  };
  if (!S || !v) return notRead(S, leaveEarly);
  const acts = pageActs({
    S,
    v,
    param,
    onNavigate,
    stays,
    flash,
    setLeaving,
    busy: { making, setMaking, going, setGoing },
    finishRefused,
  });
  const card = FIRST_RUN_HELPERS.receptionist(cardInputs(S, read));
  const brainRead = read && read.settings ? brainOf(read.settings.config) : null;
  const wide = v.fr.shown.key !== "business";
  const shown = googleShownOf(v.fr, googleBack);
  const foot =
    (v.fr.back || v.fr.onward) && !ownFoot(v, shown)
      ? stepFoot({ v, go: acts.go, onward: acts.onward, busy: going })
      : null;
  // Your receptionist and Rehearse draw it in their own column; every other step under its body.
  const footInColumn = v.fr.shown.key === "receptionist" || v.fr.shown.key === "rehearse";
  // Back from Google, or on without it: on to where the workspace is now.
  const google: GoogleActs = {
    shown,
    done: () => {
      setGoogleBack(null);
      acts.go(FIRST_RUN_ROUTE);
    },
    onFound: setMatches,
  };
  return (
    <div className="fr-root" data-testid="first-run" data-step={v.fr.shown.key}>
      {tops({ fr: v.fr, go: acts.go, leave: acts.leave, card, cardOpen, toggleCard: () => setCardOpen((x) => !x) })}
      <div className="fr-body" data-wide={wide || undefined}>
        <main className="fr-step" aria-labelledby="fr-heading">
          {stepHead(v)}
          {stepBody({
            S,
            v,
            acts,
            flash,
            making,
            read,
            setPhoneChoice,
            card,
            google,
            foot: footInColumn ? foot : null,
          })}
          {footInColumn ? null : foot}
        </main>
        <FrCard card={card} open={cardOpen} beside={buildingOf({ S, fr: v.fr, matches, read })} />
      </div>
      {/* The services list opens in a sheet, as it does on the Business tab, which draws it last of everything there. */}
      {v.fr.check && brainRead ? (
        <BtServicesSheet brain={brainRead} canEdit={canDo("settings")} flash={flash} saver={businessTabSave.saver} />
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
