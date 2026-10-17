/**
 * The lead sheet's card at half height (canvas B v2, "Decide at half height"): what a decision needs, in the order the
 * eye wants it. Who they are, with the fit as a meter; the reason to write now, in large type; what it rests on, as
 * quiet marks whose source is a tap away; three cells for how they can be reached; and, by the state the lead is in,
 * the email they would get (Change opens in place), their steps in a sequence, what they wrote back, or what stopped.
 * Over it in a pile, how far through it is and Undo; at its end, what happened.
 *
 * Hookless: the sheet (sheet.tsx) holds what is open and hands it down. Every word is contracts' (lead-sheet.ts,
 * lead-card.ts). A tip is the canvas's: its trigger is the thing itself (a mark, a cell, the meter, the reason), a tap
 * on a phone and hover or focus on a desk (`data-tip`), never an act.
 */
import type { ReactNode } from "react";
import {
  LEAD_CARD_WORDS,
  LEAD_SHEET_WORDS as W,
  LEAD_WORDS,
  type LeadCardEmailVM,
  type LeadCardMarkVM,
  type LeadCardPart,
  type LeadCardReasonVM,
  type LeadPeekVM,
  type LeadRowVM,
  type LeadSheetCellVM,
  type LeadSheetClosedVM,
  type LeadSheetFitVM,
  type LeadSheetOptionVM,
  type LeadSheetTrackVM,
} from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { Meter } from "../../kit/meter/meter";
import { statePillPart } from "../../legacy-parts";
import { LeadTile } from "../cells/tile";
import { ldCheckMark } from "../peek/hint";

/** A tip the canvas draws over the thing tapped: shown while it is the one open, its words always in the tree. */
export interface SheetTips {
  open: string | null;
  toggle: (key: string) => void;
}

/** The bubble over a trigger, while it is the open one. */
const bubbleOf = (tips: SheetTips, key: string, words: string, side: "" | " right" | " below" = "") =>
  tips.open === key ? (
    <span className={`lw-bubble${side}`} role="status">
      {words}
    </span>
  ) : null;

/* ------------------------------------------------------------------------------------------------------- who -- */

/** The fit as five parts of a meter, its pill only where the word is news; tapping it says what the checks found. */
const fitOf = (fit: LeadSheetFitVM, tips: SheetTips) => {
  const StatePill = statePillPart();
  return (
    <span className="lw-fit">
      <button
        type="button"
        className="lw-fit-go"
        aria-label={fit.tip}
        data-tip={fit.tip}
        onClick={() => tips.toggle("fit")}
        data-testid="lead-sheet-fit"
      >
        {fit.pill ? (
          <StatePill kind={fit.pill.kind} value={fit.pill.value} label={fit.pill.label} testid="peek-fit-word" />
        ) : null}
        <Meter
          className="lw-fit-bar"
          size="sm"
          parts={fit.meter.map((tone) => ({ share: 1, tone }))}
          aria-label={fit.tip}
        />
      </button>
      {bubbleOf(tips, "fit", fit.tip, " below")}
    </span>
  );
};

/** Who they are: the face (its photo opens large), the name (a door to the person they became), the line about where. */
export const SheetWho = (p: {
  vm: LeadPeekVM;
  row: Pick<LeadRowVM, "id" | "name" | "tile"> | null;
  fit: LeadSheetFitVM;
  tips: SheetTips;
  onExpand: () => void;
  onOpenPerson: (id: string) => void;
  /** The desk's ⋯ and Close, at the row's end; a phone's sheet has its own. */
  end?: ReactNode;
}) => (
  <div className="lw-id" data-testid="peek-identity">
    {p.row ? (
      <LeadTile l={p.row} size={40} onExpand={() => p.onExpand()} />
    ) : (
      <span className="lw-id-ini" aria-hidden="true">
        {p.vm.tile.initials}
      </span>
    )}
    <span className="lw-id-words">
      {p.vm.contactId ? (
        <button
          type="button"
          className="lw-name lw-name-go"
          title={LEAD_WORDS.openPerson}
          onClick={() => p.vm.contactId && p.onOpenPerson(p.vm.contactId)}
          data-testid="peek-name-person"
        >
          {p.vm.name}
        </button>
      ) : (
        <span className="lw-name" data-testid="peek-name">
          {p.vm.name}
        </span>
      )}
      <span className="lw-sub" data-testid="peek-sub">
        {[p.vm.sub, p.vm.today].filter(Boolean).join(" · ")}
      </span>
    </span>
    {fitOf(p.fit, p.tips)}
    {p.end}
  </div>
);

/* ------------------------------------------------------------------------------------- the reason and its marks -- */

/** The reason, the card's headline: where it came from a tap away. They wrote back: what they said, as it was read. */
export const SheetNow = (p: {
  reason: LeadCardReasonVM | null;
  fallback: string;
  reply: string | null;
  replied: boolean;
  tips: SheetTips;
}) => {
  if (p.replied)
    return (
      <div className="lw-quote" data-testid="lead-sheet-reply">
        <p className="lw-quote-t">{p.reply ? `“${p.reply}”` : W.wroteBack}</p>
        <p className="lw-quote-s">{W.stoppedLine}</p>
      </div>
    );
  const text = p.reason ? p.reason.text : p.fallback;
  if (!text) return null;
  return (
    <div className="lw-now-w">
      <button
        type="button"
        className={`lw-now ${p.reason ? p.reason.how : "read"}`}
        data-tip={p.reason ? p.reason.from : undefined}
        onClick={() => p.tips.toggle("now")}
        data-testid="lead-pile-why"
      >
        {text}
      </button>
      {p.reason ? bubbleOf(p.tips, "now", p.reason.from, " below") : null}
    </div>
  );
};

/** What the reason rests on: each check's mark (seen, a dashed ring read, couldn't tell) and its words; its source a tap. */
export const SheetMarks = ({ marks, tips }: { marks: LeadCardMarkVM[]; tips: SheetTips }) =>
  marks.length ? (
    <div className="lw-ev" data-testid="lead-card-marks">
      {marks.map((m) => (
        <span key={m.key} className="lw-ev-w">
          <button
            type="button"
            className={`lw-ev-i ${m.how}${m.answer === "unknown" ? " ask" : ""}`}
            data-tip={m.from}
            onClick={() => tips.toggle(`ev-${m.key}`)}
            data-testid={`lead-card-mark-${m.key}`}
          >
            {ldCheckMark(m.how, m.answer)}
            {m.label}
          </button>
          {bubbleOf(tips, `ev-${m.key}`, m.from)}
        </span>
      ))}
    </div>
  ) : null;

/** How they can be reached: three cells, a dot each, a second word only where the dot is not ok; the story a tap away. */
export const SheetCells = ({ cells, tips }: { cells: LeadSheetCellVM[]; tips: SheetTips }) => (
  <div className="lw-cells" data-testid="lead-card-reach">
    {cells.map((c, i) => (
      <span key={c.key} className="lw-cell-w">
        <button
          type="button"
          className={`lw-cell ${c.tone}`}
          data-tip={c.tip}
          onClick={() => tips.toggle(`cell-${c.key}`)}
          data-testid={`lead-card-reach-${c.key}`}
        >
          <Icon name={c.key === "email" ? "mail" : c.key === "phone" ? "phone" : "globe"} size={14} />
          <span className="lw-cell-t">{c.label}</span>
          <span className="lw-cell-s">
            <i aria-hidden="true" />
            {c.word}
          </span>
        </button>
        {bubbleOf(tips, `cell-${c.key}`, c.tip, i === cells.length - 1 ? " right" : "")}
      </span>
    ))}
  </div>
);

/* ------------------------------------------------------------------------------------------------- the email -- */

/** An email's words in parts: words, a value filled for them, the opening still to come, a slot with no value. */
export const SheetParts = ({ parts }: { parts: LeadCardPart[] }) => (
  <>
    {parts.map((p, i) =>
      p.kind === "text" ? (
        <span key={i}>{p.text}</span>
      ) : p.kind === "value" ? (
        <span key={i} className="lw-val">
          {p.text}
        </span>
      ) : p.kind === "opening" ? (
        <span key={i} className="lw-open" data-testid="lead-card-opening">
          {LEAD_CARD_WORDS.opening}
        </span>
      ) : (
        <span key={i} className="lw-hole" data-testid="lead-card-gap">
          {p.label}
        </span>
      ),
    )}
  </>
);

/** The words cut where the email breaks its lines: a paragraph each, as the canvas draws the preview. */
const paragraphsOf = (parts: LeadCardPart[]): LeadCardPart[][] => {
  const out: LeadCardPart[][] = [];
  let para: LeadCardPart[] = [];
  const next = () => {
    out.push(para);
    para = [];
  };
  for (const p of parts) {
    // The opening is a line of its own, as the email will have it.
    if (p.kind === "opening") {
      next();
      para.push(p);
      next();
      continue;
    }
    if (p.kind !== "text" || !p.text.includes("\n")) {
      para.push(p);
      continue;
    }
    p.text.split(/\n+/).forEach((piece, i) => {
      if (i > 0) next();
      if (piece) para.push({ kind: "text", text: piece });
    });
  }
  next();
  return out.filter((one) => one.length);
};

/** Email 1 as they would read it: whose it is and Change, its words, a gap or a fallback said first, the batch it goes in. */
export const SheetMail = (p: {
  email: LeadCardEmailVM;
  /** Whose email it is (the sequence's name), and what follows it ("· email 1 of 3 · from your own inbox"). */
  head: string;
  sub: string;
  canChange: boolean;
  onChange: () => void;
  full?: boolean;
}) => (
  <section className={`lw-mail${p.email.blocked ? " warn" : ""}`} aria-label={p.head} data-testid="lead-card-email">
    <div className="lw-mail-h">
      <b>{p.head}</b>
      <span>{p.sub}</span>
      {p.canChange ? (
        <button type="button" className="lw-change" onClick={p.onChange} data-testid="lead-sheet-change">
          {W.change}
        </button>
      ) : null}
    </div>
    {p.full && p.email.to ? (
      <dl className="lw-mail-meta">
        <div>
          <dt>{W.emails.to}</dt>
          <dd data-testid="lead-card-to">{p.email.to}</dd>
        </div>
        {p.email.subject ? (
          <div>
            <dt>{LEAD_CARD_WORDS.subject}</dt>
            <dd data-testid="lead-card-subject">
              <SheetParts parts={p.email.subject} />
            </dd>
          </div>
        ) : null}
      </dl>
    ) : null}
    <div className={`lw-mail-b${p.full ? " full" : ""}`} data-testid="lead-card-body">
      {paragraphsOf(p.email.body).map((para, i) => (
        <p key={i}>
          <SheetParts parts={para} />
        </p>
      ))}
    </div>
    {p.email.note ? <p className="lw-mail-n">{p.email.note}</p> : null}
    {p.email.blocked ? (
      <p className="lw-mail-n warn" data-testid="lead-card-blocked">
        {p.email.blocked}
        {p.email.instead === "choose" ? ` ${LEAD_CARD_WORDS.choose}` : null}
      </p>
    ) : null}
    {p.email.when ? (
      <p className="lw-mail-w" data-testid="lead-card-when">
        {p.email.when}
      </p>
    ) : null}
  </section>
);

/** Change, opened in place: the sequences the adds could go to, each with what it would come to here, and Done. */
export const SheetChoose = (p: {
  name: string;
  options: LeadSheetOptionVM[];
  pile: boolean;
  onPick: (rootId: string) => void;
  onDone: () => void;
}) => (
  <section className="lw-mail" aria-label={W.choose(p.name)} data-testid="lead-sheet-choose">
    <div className="lw-mail-h">
      <b>{W.choose(p.name)}</b>
      <button type="button" className="lw-change" onClick={p.onDone} data-testid="lead-sheet-choose-done">
        {W.done}
      </button>
    </div>
    <div className="lw-opts" role="radiogroup" aria-label={W.choose(p.name)}>
      {p.options.map((o) => (
        <button
          key={o.rootId}
          type="button"
          role="radio"
          aria-checked={o.on}
          className={`lw-opt${o.on ? " on" : ""}`}
          onClick={() => p.onPick(o.rootId)}
          data-testid={`lead-sheet-option-${o.rootId}`}
        >
          <span className="lw-radio" aria-hidden="true" />
          <span>
            <span className="lw-opt-n">{o.name}</span>
            <span className="lw-opt-m">{o.meta}</span>
            <span className={`lw-opt-f ${o.tone}`}>{o.fill}</span>
          </span>
        </button>
      ))}
    </div>
    <p className="lw-opts-foot">{p.pile ? W.chooseFootPile : W.chooseFoot}</p>
  </section>
);

/* --------------------------------------------------------------------------------------------- the other states -- */

/** A block of the card's own: a head, and its lines under it. */
const sheetBlockOf = (head: ReactNode, body: ReactNode, testid: string) => (
  <section className="lw-mail" data-testid={testid}>
    <div className="lw-mail-h">{head}</div>
    {body}
  </section>
);

/** In a sequence: its name, their steps (done, next, still to come), and where they stand. */
export const SheetTrack = ({ track }: { track: LeadSheetTrackVM }) =>
  sheetBlockOf(
    <b>{W.inSequence(track.name)}</b>,
    <>
      <ol className="lw-track">
        {track.steps.map((s) => (
          <li key={s.n} className={`lw-track-i ${s.look}`}>
            <i aria-hidden="true" />
            <span>
              <b>{s.label}</b>
              <span>{[s.sub, s.when].filter(Boolean).join(" · ")}</span>
            </span>
          </li>
        ))}
      </ol>
      {track.line ? <p className="lw-mail-w">{track.line}</p> : null}
    </>,
    "lead-sheet-track",
  );

/** In another sequence: which, and why it stays there. */
export const SheetElsewhere = ({ name }: { name: string | null }) =>
  sheetBlockOf(
    <b>{name ? W.elsewhereIn(name) : W.elsewhereIn("another sequence")}</b>,
    <p className="lw-mail-n">{W.elsewhereLine}</p>,
    "lead-sheet-elsewhere",
  );

/** A phone and no email: the yes is a call. */
export const SheetPhoneOnly = ({ number }: { number: string | null }) =>
  sheetBlockOf(
    <b>{W.phoneOnly}</b>,
    <>
      {number ? <p className="lw-mail-b">{number}</p> : null}
      <p className="lw-mail-w">{W.phoneOnlyLine}</p>
    </>,
    "lead-sheet-phone",
  );

/** What stopped, plainly: closed, left out, bounced, or what the door said. */
export const SheetClosed = ({ closed }: { closed: LeadSheetClosedVM }) =>
  sheetBlockOf(<b>{closed.title}</b>, <p className="lw-mail-n">{closed.line}</p>, "lead-sheet-closed");

/** They wrote back: the sequence stopped. */
export const SheetStopped = () =>
  sheetBlockOf(<b>{W.stopped}</b>, <p className="lw-mail-n">{W.stoppedLine}</p>, "lead-sheet-stopped");

/* ---------------------------------------------------------------------------------------------------- the pile -- */

/** The pile's line over the card: how far through it is, a meter, and Undo naming what it takes back. */
export const SheetProgress = (p: {
  words: string;
  share: number;
  /** Undo, and what it takes back: said beside it where there is room, and always to a screen reader. */
  undo: { what: string | null; go: () => void; busy: boolean } | null;
  extra?: ReactNode;
}) => (
  <div className="lw-prog" data-testid="lead-pile-progress">
    <span className="lw-prog-n" data-testid="lead-pile-progress-line">
      {p.words}
    </span>
    <Meter
      className="lw-prog-bar"
      size="sm"
      parts={[
        { share: Math.max(0, p.share), tone: "ok" },
        { share: Math.max(0, 1 - p.share), tone: "rest" },
      ]}
      aria-label={p.words}
    />
    {p.undo ? (
      <button
        type="button"
        className="lw-undo"
        disabled={p.undo.busy}
        onClick={p.undo.go}
        aria-keyshortcuts="Z"
        aria-label={p.undo.what ? `Undo · ${p.undo.what}` : "Undo"}
        data-testid="lead-pile-undo"
      >
        <Icon name="undo" size={12} />
        <span>Undo</span>
        {p.undo.what ? <span className="lw-undo-w">{` · ${p.undo.what}`}</span> : null}
      </button>
    ) : null}
    {p.extra}
  </div>
);

/** The end of the pile: what happened, in rows, and what comes next. */
export const SheetEnd = (p: { title: string; rows: { icon: string; t: string; n: number }[]; note: string }) => (
  <div className="lw-end" data-testid="lead-pile-end">
    <p className="lw-end-t">{p.title}</p>
    <div className="lw-end-l">
      {p.rows.map((r) => (
        <div key={r.t} className="lw-end-r">
          <Icon name={r.icon} size={15} />
          <span>{r.t}</span>
          <b>{r.n}</b>
        </div>
      ))}
    </div>
    <p className="lw-end-n">{p.note}</p>
  </div>
);
