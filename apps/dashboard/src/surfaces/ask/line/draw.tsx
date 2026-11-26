/** What the Line draws: plain functions, not components, making its elements in the order AskReal always did. */
import type { MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import { fileViewOf, type AskMessageVM } from "@chanlytics/contracts";
import type { Line } from "./types";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { AskFace } from "../../kit/face/ask-face";
import { Icon } from "../../kit/icon/icon";
import { LinePress } from "../../kit/line/line";
import { AskActs, AskNowPills, AskReads, AskRows } from "../home";
import { ahPanelKeys, ahPinNow } from "../hooks";
import { leaving, touchSwipe } from "../shell";
import { AskLatest, AskListen, AskNextRow, AskQuestion, AskThread, AskTurn } from "../turn";
import { allArrived, AskAttachedRow, AskAttachPress } from "./attached";
import { arField } from "./field";
import { AR_LIFT_MS, arEscape, arPhone, arScopeIcon } from "./place";

/** The field's end: the one button (the mic held to talk, Send, or Stop). */
export const arLineEnd = (ln: Line) => {
  const { t, phone, buzz, talk, held, speech, query, live, stop, submit, begin, end, attached } = ln;
  // Held to talk. The button keeps the finger (pointer capture), so the lift reaches it even once a phone's foot has
  // turned into "Let go to ask" over it; a phone buzzes as it starts (S16). The recogniser may end on its own before
  // the finger lifts (a pause ends it on Android Chrome and iOS Safari) and the words heard are asked then, so by the
  // lift the same held element is Stop, or Send with words heard and an error: the click a lift makes must not press
  // it. `held` marks the hold; the click that follows its lift is swallowed once, and a lift that makes no click on
  // the button (the finger let go elsewhere, no capture) is forgotten a beat later.
  const pressMic = (e: PointerEvent<HTMLElement>) => {
    const el = e && e.currentTarget;
    if (el && el.setPointerCapture && e.pointerId != null) {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* not a live pointer */
      }
    }
    held.current = true;
    if (phone) buzz(8);
    begin(e);
  };
  const liftMic = () => {
    end();
    setTimeout(() => {
      held.current = false;
    }, AR_LIFT_MS);
  };
  const pressed = (act: (() => unknown) | null) => () => {
    if (held.current) {
      held.current = false;
      return;
    }
    if (act) act();
  };
  // One button at the field's end (S12): the mic with no words (hold to talk), Send once there are words, Stop while
  // a turn runs. One element in one place, keyed, so the finger a hold captured is still held as the words heard fill
  // the field; where the browser cannot listen there is no mic, only Send, faint until there are words.
  const hasWords = !!query.trim();
  // A photo beside the field makes a question of it, words or none, once every photo has arrived.
  const hasPhotos = attached.length > 0;
  // Stop while a turn runs; else the mic (a ring breathes out of it while Ask's voice reads, data-state, and a hold
  // stops the reading), or Send once there are words or photos.
  const role = live ? "stop" : talk.listening || (!hasWords && !hasPhotos && talk.canTalk) ? "talk" : "send";
  const one =
    role === "stop"
      ? {
          onClick: pressed(stop),
          "aria-label": t.stopAnswer,
          title: t.stopAnswer,
          "data-testid": "ask-stop",
          icon: "stop",
        }
      : role === "talk"
        ? {
            kind: "talk" as const,
            on: talk.listening,
            "aria-pressed": talk.listening,
            "aria-label": t.talk,
            title: t.talk,
            "data-testid": "ask-talk",
            "data-state": speech.speakingId ? "speaking" : undefined,
            icon: "mic",
            onPointerDown: pressMic,
            onPointerUp: liftMic,
            onPointerLeave: liftMic,
            onPointerCancel: liftMic,
            onClick: pressed(null),
            onContextMenu: (e: MouseEvent) => e.preventDefault(),
          }
        : {
            onClick: pressed(() => submit()),
            disabled: !(hasWords || hasPhotos) || !allArrived(attached),
            "aria-label": t.askSend,
            title: t.askSend,
            "data-testid": "ask-send",
            icon: "arrow-up",
          };
  const { icon, kind = "send", ...oneProps } = one;
  const oneButton = (
    <LinePress key="one" kind={kind} className="ask-send" {...oneProps}>
      <Icon key={icon} name={icon} size={icon === "stop" ? 14 : 15} />
    </LinePress>
  );
  // The foot keeps only the one button: an answer's acts are under it in the thread, and New is the head's.
  return { liftMic, right: oneButton };
};

// ---- What the Line draws: plain functions, not components, making its elements in the order AskReal always did ----

/** Under the band: the rows, the question while Ask reads, or the answer. */
/** The answer on its way, as a turn draws one: its words so far. */
const LIVE_MESSAGE = (text: string) =>
  ({
    id: "live",
    role: "assistant",
    text,
    citations: [],
    followups: [],
    proposals: [],
  }) as Partial<AskMessageVM> as AskMessageVM;

export const arBody = ({
  A,
  rowsDrawn,
  sections,
  sel,
  setSel,
  activate,
  askDelete,
  t,
  view,
  threads,
  composingRows,
  live,
  lang,
  nav,
  submit,
  editWords,
  quick,
  move,
  answerMsg,
  latest,
  noteOutcome,
  thread,
}: Line) => {
  // The rows sit in a fold (ask.css `.ask-rows-fold`): composing keeps it closed while they are gone (`gone`), and
  // their return opens it again, one element throughout so the return is a motion.
  if (rowsDrawn)
    return (
      <div className="ask-rows-fold" data-testid="ask-rows-fold">
        <AskRows
          sections={sections}
          sel={sel}
          setSel={setSel}
          onActivate={activate}
          onDelete={askDelete}
          onRest={(key) => void A.restNotice(key)}
          t={t}
          empty={view === "earlier" && !threads.length ? t.noEarlier : null}
        />
      </div>
    );
  if (composingRows) return <div className="ask-rows-fold gone" data-testid="ask-rows-fold" />;
  if (live && (live.say || live.text))
    return (
      <AskTurn
        m={LIVE_MESSAGE(live.text)}
        say={live.say}
        q={live.q}
        streaming
        t={t}
        lang={lang}
        onNav={nav}
        onFollow={submit}
        onEdit={editWords}
      />
    );
  if (live || (quick && quick.pending)) {
    // While Ask reads, only the question is under the band; what it reads is the band's one line (ask-reading).
    return (
      <div className="ask-trace" data-testid="ask-trace">
        <p className="ask-turn-q">{live ? live.q : quick?.q}</p>
      </div>
    );
  }
  if (answerMsg)
    return (
      <AskTurn
        m={answerMsg}
        q={latest?.q ? latest.q.text : ""}
        latest
        walk
        sel={move}
        next={!thread}
        t={t}
        lang={lang}
        onNav={nav}
        onFollow={submit}
        onOutcome={noteOutcome}
        onEdit={editWords}
        onRetry={
          answerMsg.failed && latest?.q
            ? () => void submit(latest.q?.text, undefined, latest.q?.files ? { files: latest.q.files } : undefined)
            : undefined
        }
      />
    );
  return null;
};
// The hero (spec 5.2-5.5): the three at 140px (ask.css `.ask-hero-stage`; 232px until Ruben, 17 Nov 2026), what they
// hear while held, the question and what Ask reads until the first words; once an answer is written they shrink to the top with its question under them,
// said once (ask.css hides the turn's own copy). In the thread they lead the newest answer under its question's bubble
// (`heroMode`, D3), with what Ask has read under them while it reads (D12), and a held mic's words are the
// band's (AskListen).
// In Earlier the three step aside (`away`, drawn but not laid out, so they are not drawn afresh on the way back) and the
// conversations take the middle.
/**
 * What the hero says under the three: what is heard while it listens (on the bar the field says it instead), the question
 * asked and its reads while the answer comes, else the question the hero holds. Called, not drawn.
 */
function heroSays(
  ln: Pick<Line, "thread" | "t" | "talk" | "query" | "live" | "quick" | "heroQ" | "heroSmall" | "dock">,
) {
  const { thread, t, talk, query, live, quick, heroQ, heroSmall, dock } = ln;
  if (talk.listening && !thread && !dock)
    return (
      <p className="ask-heard" aria-live="polite" data-testid="ask-heard">
        {query || t.listening}
      </p>
    );
  if ((live || (quick && quick.pending)) && !heroSmall)
    return (
      <>
        {thread ? null : <p className="ask-turn-q">{live ? live.q : quick?.q}</p>}
        <AskReads traces={live ? live.traces : []} since={live ? live.at : null} t={t} />
      </>
    );
  return heroQ ? <p className="ask-turn-q">{heroQ}</p> : null;
}

export const arHero = ({
  heroSmall,
  heroMode,
  thread,
  heroRef,
  faceRef,
  holdThree,
  standing,
  parts,
  t,
  talk,
  query,
  live,
  quick,
  heroQ,
  view,
  homeTitled,
  dock,
}: Line) => (
  <div className={`ask-hero${heroMode}${view === "earlier" ? " away" : ""}`} ref={heroRef} data-testid="ask-hero">
    <span className="ask-hero-stage" ref={faceRef} {...holdThree} data-testid="ask-hero-stage">
      {/* On a phone's bar the three are carried in from their circle, whole (hooks.tsx useArOpen): they do not also come in. */}
      <AskFace className="ask-hero-canvas" testId="ask-line-face" enter={!dock} />
    </span>
    {standing && parts ? <AskNowPills people={parts.people} runs={parts.runs} searches={parts.searches} t={t} /> : null}
    {/* The home's title, where the home is the page's own questions (Today, calm, D10). */}
    {homeTitled && !talk.listening ? (
      <h2 className="ask-home-title" data-testid="ask-home-title">
        {t.homeTitle}
      </h2>
    ) : null}
    {heroSays({ thread, t, talk, query, live, quick, heroQ, heroSmall, dock })}
  </div>
);

// While a phone listens its foot is the pill to let go of, over the band (still drawn, hidden, so the mic that holds
// the finger is there for the lift), with a way back to typing that keeps the words heard (spec 5.3).
// On the frame's bar the finger is on the circle, which is the press to let go of: the field says so and fills with the
// words heard, and only the way back to typing stands over it (Today, calm, D8).
export const arFoot = ({ phone, talk, typing, t, liftMic, dock }: Line) =>
  phone && talk.listening ? (
    <div className="ask-letgo-wrap">
      <Button
        variant="quiet"
        onClick={() => {
          typing.current = true;
          talk.stop();
        }}
        data-testid="ask-type-instead"
      >
        {t.typeInstead}
      </Button>
      {dock ? null : (
        <LinePress kind="letgo" aria-pressed="true" onPointerUp={liftMic} data-testid="ask-letgo">
          <Icon name="mic" size={18} />
          {t.letGo}
        </LinePress>
      )}
    </div>
  ) : null;

// The band: the field at the foot (ask.css orders it last), the scope and the one button in it; the three and what Ask
// reads are the hero's. On a phone it is hidden under the pill to let go of while it listens.
const arStage = (ln: Line) => {
  const { talk, live, stageRef, scope, setScope, setActive, t, rows, showRows, sel, move, right, attached, attach } =
    ln;
  const { detach, attachAgain, dock, query } = ln;
  const activeId = showRows ? (rows.length ? `ask-row-${sel}` : undefined) : move >= 0 ? `ask-move-${move}` : undefined;
  const field = arField(ln, activeId);
  // The field's row. On a phone where the frame's bar stands it is drawn in the bar's own capsule, and the one press in
  // the circle beside it (Today, calm, D8): AI has no second capsule there, and what the question is about stays here.
  const press = <span className="ask-line-right">{right}</span>;
  // On the bar the + stands at the field's end, where the one press stood, in the order a reader and Tab meet them, and
  // only while the field is in use: at rest the bar is the way back and what to ask, as drawn, and the field's words
  // have the whole room (ask.css). `data-holds` keeps it while the field holds words or photos (never `data-held`, which
  // is a list held out of sight, components.css).
  const plus = <AskAttachPress t={t} attach={attach} />;
  const row = (
    <div
      className={`ask-stage-row${dock ? " docked" : ""}`}
      {...(dock && (query.trim() || attached.length) ? { "data-holds": "" } : null)}
    >
      {dock ? null : plus}
      {field}
      {dock ? plus : press}
    </div>
  );
  return (
    <div
      className={`ask-stage${talk.listening ? " listening" : ""}${live ? " live" : ""}${dock ? " docked" : ""}`}
      ref={stageRef}
      data-testid="ask-line"
    >
      {attached.length ? <AskAttachedRow photos={attached} t={t} detach={detach} attachAgain={attachAgain} /> : null}
      {/* What the question is about, on a row of its own over the field: a file's picture or the kind's mark, and the whole
          name, never cut to a few letters beside the words (Ruben, 12 Nov 2026). */}
      {scope ? (
        <div className="ask-scope" data-tip={scope.label} data-kind={scope.kind} data-testid="ask-scope">
          {scope.kind === "file" ? (
            <img className="ask-scope-pic" src={`${fileViewOf(scope.id)}?w=96`} alt="" />
          ) : (
            <Icon name={arScopeIcon(scope)} size={12} />
          )}
          <span className="ask-scope-about">{t.about}</span>
          <span className="ask-scope-name">{scope.label}</span>
          <LinePress
            kind="clear"
            className="ask-scope-clear"
            onClick={() => {
              setScope(null);
              setActive((a) => (a && a.scope ? { ...a, scope: null } : a));
            }}
            aria-label={t.clearScope}
          >
            <Icon name="x" size={10} />
          </LinePress>
          {/* the open thread's scope too, so its next question goes with none (the Phase 5 plan, D9) */}
        </div>
      ) : null}
      {dock ? (dock.field ? createPortal(row, dock.field) : null) : row}
      {dock?.press ? createPortal(press, dock.press) : null}
    </div>
  );
};

// The middle is one scroller (spec 5.1, 5.5): on the home, the hero and the rows; in a conversation, the thread (the
// spec 2026-09-27-ask-chat-on-a-phone, D1): every earlier turn in full, then the newest question, the three and its
// answer (`ask-now`, one element throughout, so the three are never drawn afresh), with Copy and Read aloud under it
// once it is whole (D14), never under a turn that failed, which has nothing worth keeping, and an answer with cards has
// its next questions there too (`nextInThread`). At rest, while it listens at home and while a phone's field is in use
// there, what it holds stands centred (`rest`, `composing`; spec 5.2, 5.9); a thread dims under the three come forward
// (`dim`, D4).
const arMiddle = ({
  thread,
  listen,
  restful,
  noticeWaits,
  homeTitled,
  composingRows,
  bodyRef,
  body,
  hero,
  folded,
  nowQ,
  nowFiles,
  drawn,
  answerMsg,
  nextInThread,
  move,
  words,
  spoken,
  speech,
  flash,
  t,
  lang,
  nav,
  submit,
  noteOutcome,
  editWords,
}: Line) => (
  <div
    className={`ask-line-body${restful ? " rest" : ""}${composingRows ? " composing" : ""}${thread ? " thread" : ""}${listen ? " dim" : ""}${homeTitled ? " titled" : ""}`}
    ref={bodyRef}
  >
    {thread ? (
      <AskThread
        turns={folded}
        t={t}
        lang={lang}
        onNav={nav}
        onFollow={submit}
        onOutcome={noteOutcome}
        onEdit={editWords}
      />
    ) : null}
    {/* The page's own questions wait on no read (Today, calm, D10): only what AI noticed holds the home back. */}
    <div className={`ask-now${restful && noticeWaits && !homeTitled ? " waiting" : ""}`}>
      {thread && (nowQ || nowFiles.length) ? <AskQuestion text={nowQ} files={nowFiles} t={t} now /> : null}
      {hero}
      {body}
      {thread && drawn && nextInThread ? <AskNextRow answer={drawn.answer} sel={move} onFollow={submit} /> : null}
      {thread && drawn && !(answerMsg && answerMsg.failed) ? (
        <AskActs
          words={words}
          spoken={spoken}
          speech={speech}
          flash={flash}
          t={t}
          copy={!answerMsg?.proposals?.length}
        />
      ) : null}
    </div>
  </div>
);

// Over the field in a conversation: the three come forward to listen (D4), the newest answer's next questions
// (D6), unless its cards keep them in the thread, and Latest once its question is out of sight, over them (D7).
const arOverField = ({
  thread,
  listen,
  composing,
  talk,
  live,
  drawn,
  nextInThread,
  move,
  query,
  t,
  submit,
  below,
  bodyRef,
  dock,
}: Line) => {
  const nextRow =
    thread && !composing && !talk.listening && !live && drawn && !nextInThread && drawn.answer.do.next.length ? (
      <AskNextRow answer={drawn.answer} sel={move} onFollow={submit} />
    ) : null;
  // While an answer is on its way its next questions' room is held, so the thread does not jump up as they arrive.
  const held =
    thread && !composing && !talk.listening && live ? <div className="ask-next-row hold" aria-hidden="true" /> : null;
  return (
    <>
      {listen ? <AskListen heard={talk.listening && !dock ? query || t.listening : ""} /> : null}
      {nextRow || held}
      {thread && below && !listen ? (
        <AskLatest t={t} overNext={!!nextRow} onPress={() => ahPinNow(bodyRef.current)} />
      ) : null}
    </>
  );
};

/** The Line: the scrim, the dialog, what a screen reader hears, the head, the foot, the band, the question before a delete, what stands over the field, and the middle. */
export const arLineView = (ln: Line) => {
  const {
    onClose,
    tick,
    dialogRef,
    drawn,
    view,
    live,
    setView,
    t,
    active,
    quick,
    clearLine,
    foot,
    doomed,
    removeThread,
    setDoomed,
    toastNode,
    phone,
    dropping,
    dropProps,
  } = ln;
  // What a screen reader hears: the answer's headline (or a prose answer's words) once it is whole (spec 6.10).
  const said = drawn ? drawn.answer.say.headline || drawn.answer.say.detail : "";
  return (
    // It goes the way it came as it closes (kit/motion/leaving.ts leaving): a desk's panel back out to the right, a phone's screen
    // fading, where a thumb also pulls it down or takes it across to either side (touchSwipe). ask-overlay and ask-modal
    // carry the motion.
    <div
      className="ask-overlay ask-line-scrim"
      data-docked={ln.dock ? "" : undefined}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-tick={tick}
      ref={leaving("ask")}
    >
      <div
        ref={dialogRef}
        className={`ask-modal ask-real ask-line${dropping ? " dropping" : ""}`}
        data-docked={ln.dock ? "" : undefined}
        {...dropProps}
        role={phone ? "dialog" : "complementary"}
        // With its field in the frame's bar, the dialog is not all there is to reach: the page under it is taken away
        // by the frame instead (shell-chrome.tsx), and the bar and the circle stay a reader's.
        aria-modal={phone && !ln.dock ? "true" : undefined}
        tabIndex={-1}
        aria-label={t.dialogName}
        data-testid="ask-real"
        {...touchSwipe({ onDown: onClose, onBack: onClose, onAway: onClose, when: arPhone })}
        onKeyDown={phone ? undefined : (e) => ahPanelKeys(e, () => arEscape(ln))}
      >
        <p className="ask-said" role="status" aria-live="polite" data-testid="ask-said">
          {said}
        </p>
        {/* The head: Earlier, New in a conversation or over a quick answer (a preset question is answered without
            one, and was left with no way home but ×; it ends the conversation as Clear did, D9), and a close within the
            thumb's reach; both wait while a turn runs (spec 5.1, 5.4). */}
        <div className="ask-line-head">
          <Button
            variant="quiet"
            className="ask-head-act"
            aria-pressed={view === "earlier"}
            disabled={!!live}
            onClick={() => setView((v) => (v === "earlier" ? "rows" : "earlier"))}
            data-testid="ask-earlier"
          >
            <Icon name="chat" size={13} />
            {t.earlier}
          </Button>
          {active || quick ? (
            <Button
              variant="quiet"
              className="ask-head-act"
              disabled={!!live}
              onClick={clearLine}
              data-testid="ask-clear-head"
            >
              <Icon name="plus" size={13} />
              {t.newChat}
            </Button>
          ) : null}
          <Button
            variant="quiet"
            iconOnly
            className="ask-line-close"
            onClick={onClose}
            aria-label={t.close}
            data-tip={t.close}
            data-testid="ask-close"
          >
            <Icon name="x" size={14} />
          </Button>
        </div>
        {foot}
        {arStage(ln)}
        {doomed ? (
          <Confirm
            question={t.deleteAsk}
            detail={doomed.title}
            yes={t.deleteYes}
            no={t.deleteKeep}
            danger
            block
            className="ask-confirm"
            onYes={() => removeThread(doomed)}
            onNo={() => setDoomed(null)}
            testid="ask-delete"
          />
        ) : null}
        {arOverField(ln)}
        {arMiddle(ln)}
      </div>
      {toastNode}
    </div>
  );
};
