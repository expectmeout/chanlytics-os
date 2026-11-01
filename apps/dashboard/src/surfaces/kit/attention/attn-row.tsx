/**
 * The one row grammar for a person who needs something: an avatar, a name with where and when, one sentence, one state
 * line, one button — and, where the state asks a second thing of you, a quiet second verb. People's strip and
 * Today's queue both draw it. The classes are the strip's (clients.css), so the two read alike wherever a row appears.
 * (Moved whole from pages/attention-bits.jsx, decision 0015: the kit's one implementation, which the pages import;
 * it was published as window.AttnRow until no page read it there.)
 *
 * Verbs are the caller's: `cta.onClick` and `also.onClick` do the work, and `cta.gate` and `also.gate` carry
 * window.gate(...)'s props; the row itself opens whatever `onOpen` says. Nothing here reads a surface.
 *
 * The lead line's colour is the row's tone: one of contracts' six (tone.ts), or the receptionist's standing on a thread
 * (people.ts: escalated, queued, snoozed, paused, silent, answering) said in them. The JSX read contracts' `stateOf`
 * through the chrome bridge (`window.__chrome.state`) and, without the bridge, drew the name as given; the kit imports
 * `stateOf` and always says the tone.
 */
import { stateOf } from "@chanlytics/contracts";
import type { KeyboardEvent, MouseEventHandler, ReactNode } from "react";
import { showTip } from "../../legacy-verbs";
import { Face, type FacePerson } from "../face/face";
import { Icon } from "../icon/icon";

/** One verb of the row: its words, what it does, and the honesty gate's props (`window.gate(...)`), spread after its handlers. */
interface AttnAct {
  label: ReactNode;
  kind?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  gate?: Record<string, unknown>;
  busy?: boolean;
  testid?: string;
}

interface AttnRowProps {
  /** A person the row is about: the kit's Face draws them, by what contracts says they are (a number's glyph, an address's, or their initials). Over `initials` and `glyph`, which draw what is not a person. */
  person?: FacePerson;
  initials?: string;
  glyph?: string | null;
  name: ReactNode;
  /** The business the person works at (0052), dim after their name, and the first thing cut where the line is short. */
  trail?: string | null;
  meta?: string;
  /**
   * How long they have waited, by itself beside the name (Today on a phone, where the meta line is a desk's: the phone
   * canvas, 28 Oct 2026): its words, and `long` from an hour up, which the amber ink says.
   */
  wait?: { words: string; long: boolean } | null;
  sentence?: string;
  /**
   * The wire it came by, as a glyph before the sentence (Today's Need you, the redesign of 1 Nov 2026): the kit's Icon by
   * name, and its words for a screen reader, where the meta line would have said them.
   */
  via?: { glyph: string; words: string } | null;
  quoted?: boolean;
  /** What the sentence is about, said before it in bold: an email's subject, before the words they wrote. */
  lead?: string;
  status?: readonly ReactNode[];
  /** The facts worth having once: shown behind the row's mark, never printed in the line. */
  note?: string;
  tone?: string;
  cta?: AttnAct | null;
  also?: AttnAct | null;
  onOpen?: () => void;
  /** A pointer or the keyboard has reached this row: whoever drew it may read ahead. */
  onHover?: (() => void) | null;
  /**
   * What the row offers to do in place, drawn under its words across the row (Today's Need you, decision 0071: a draft to
   * send, a brief, the presses and what became of them). Its presses are its own: a press inside it opens nothing. A row
   * with work is not one button, since a button's words would swallow the draft and every control in it: its words are the
   * press that opens it, where `onOpen` opens anything.
   */
  work?: ReactNode;
  testid?: string;
  ctaTestid?: string;
}

const attnTone = (tone: string): string => {
  const own = stateOf("tone", tone).tone;
  return own === "plain" ? stateOf("standing", tone).tone : own;
};

/** The row's one or two buttons: its second verb quiet, then its first. Called, not drawn, so the tree has no part of its own for it. */
function attnActs(cta: AttnAct | null, also: AttnAct | null, ctaTestid: string) {
  return (
    <span className="cl-attn-acts" role="presentation" onClick={(e) => e.stopPropagation()}>
      {also && (
        <button
          className="cl-attn-cta ghost"
          onClick={also.onClick}
          disabled={!!also.busy}
          aria-busy={also.busy ? true : undefined}
          {...(also.gate || {})}
          data-testid={also.testid || "attention-also"}
        >
          {also.label}
        </button>
      )}
      {cta && (
        <button
          className={`cl-attn-cta ${cta.kind || "primary"}`}
          onClick={cta.onClick}
          disabled={!!cta.busy}
          aria-busy={cta.busy ? true : undefined}
          {...(cta.gate || {})}
          data-testid={ctaTestid}
        >
          {cta.label}
        </button>
      )}
    </span>
  );
}

/** Who, with the business they work at, where and when, and how long they have waited. Called, not drawn, as attnActs is. */
function attnName(name: ReactNode, trail: string | null, meta: string, wait: { words: string; long: boolean } | null) {
  return (
    <div className="cl-attn-name">
      <span className="cl-attn-who">
        {name}
        {trail ? (
          <span className="cl-attn-trail" data-testid="attention-business">
            {" "}
            · {trail}
          </span>
        ) : null}
      </span>
      {meta ? <span className="cl-attn-meta">{meta}</span> : null}
      {wait ? (
        <span className="cl-attn-wait" data-long={wait.long || undefined}>
          {wait.words}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The row's one sentence: their words in quotes, after what they are about in bold where it says (an email's subject), and
 * the wire's glyph before them where the row names it.
 */
function attnSentence(sentence: string, quoted: boolean, lead: string, via: { glyph: string; words: string } | null) {
  const said = quoted ? `“${sentence}”` : sentence;
  const wire = via ? (
    <span className="cl-attn-via">
      <Icon name={via.glyph} size={12} />
      <span className="rec-sr">{via.words}: </span>
    </span>
  ) : null;
  if (!lead)
    return (
      <div className={`cl-attn-sentence ${quoted ? "quoted" : ""}`}>
        {wire}
        {said}
      </div>
    );
  return (
    <div className={`cl-attn-sentence ${quoted ? "quoted" : ""}`}>
      {wire}
      <b>{lead}</b>
      {" — "}
      {said}
    </div>
  );
}

/** Who the row is about: a person's face, or the glyph or initials of what is not a person. Called, not drawn, as attnActs is. */
function attnFace(person: FacePerson | undefined, glyph: string | null, initials: string | undefined) {
  if (person) return <Face person={person} className="cl-attn-pic" />;
  return (
    <div className={`cl-attn-avatar ${glyph ? "glyph" : ""}`} title={glyph === "phone" ? "No name yet" : undefined}>
      {glyph ? <Icon name={glyph} size={12} /> : initials}
    </div>
  );
}

export function AttnRow({
  person,
  initials,
  glyph = null,
  name,
  trail = null,
  meta = "",
  wait = null,
  sentence = "",
  via = null,
  quoted = false,
  lead = "",
  status = [],
  note = "",
  tone = "answering",
  cta = null,
  also = null,
  onOpen,
  onHover = null,
  work = null,
  testid = "attention-row",
  ctaTestid = "attention-cta",
}: AttnRowProps) {
  const open = onOpen ?? (() => undefined);
  // The press that opens the row: the whole row, or, with work of its own, its words alone (and none where it opens nothing).
  const opener = {
    role: "button",
    tabIndex: 0,
    onClick: open,
    // Its own Enter and Space only: a key pressed on a button inside the row is that button's.
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        open();
      }
    },
  };
  return (
    <div
      className={`cl-attn-row tone-${attnTone(tone)}`}
      {...(work ? {} : opener)}
      onPointerEnter={onHover || undefined}
      onFocus={onHover || undefined}
      data-testid={testid}
    >
      {attnFace(person, glyph, initials)}
      <div className="cl-attn-body" {...(work && onOpen ? opener : {})}>
        {attnName(name, trail, meta, wait)}
        {attnSentence(sentence, quoted, lead, via)}
        <div className="cl-attn-status">
          {status.map((seg, i) => (
            <span key={i} className={i === 0 ? "lead" : ""}>
              {i > 0 && <span className="sep"> · </span>}
              {seg}
            </span>
          ))}
          {note ? (
            <button
              type="button"
              className="set-mark"
              data-tip={note}
              aria-label={`What else is known: ${note}`}
              onClick={(e) => {
                e.stopPropagation();
                showTip(e.currentTarget);
              }}
            >
              <Icon name="info" size={12} />
            </button>
          ) : null}
        </div>
      </div>
      {(cta || also) && attnActs(cta, also, ctaTestid)}
      {work ? (
        <div
          className="cl-attn-work"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          data-testid={`${testid}-work`}
        >
          {work}
        </div>
      ) : null}
    </div>
  );
}
