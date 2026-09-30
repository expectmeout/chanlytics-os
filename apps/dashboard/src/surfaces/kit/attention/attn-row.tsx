/**
 * The one row grammar for a person who needs something: an avatar, a name with where and when, one sentence, one state
 * line, one button — and, where the state asks a second thing of you, a quiet second verb. People's strip and
 * Today's queue both draw it. The classes are the strip's (clients.css), so the two read alike wherever a row appears.
 * (Moved whole from pages/attention-bits.jsx, decision 0015: the kit's one implementation, which seed-globals publishes
 * as window.AttnRow for the pages that still read it.)
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
import type { MouseEventHandler, ReactNode } from "react";
import { showTip } from "../../legacy-verbs";
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
  initials?: string;
  glyph?: string | null;
  name: ReactNode;
  meta?: string;
  sentence?: string;
  quoted?: boolean;
  status?: readonly ReactNode[];
  /** The facts worth having once: shown behind the row's mark, never printed in the line. */
  note?: string;
  tone?: string;
  cta?: AttnAct | null;
  also?: AttnAct | null;
  onOpen?: () => void;
  /** A pointer or the keyboard has reached this row: whoever drew it may read ahead. */
  onHover?: (() => void) | null;
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

export function AttnRow({
  initials,
  glyph = null,
  name,
  meta = "",
  sentence = "",
  quoted = false,
  status = [],
  note = "",
  tone = "answering",
  cta = null,
  also = null,
  onOpen = () => undefined,
  onHover = null,
  testid = "attention-row",
  ctaTestid = "attention-cta",
}: AttnRowProps) {
  return (
    <div
      className={`cl-attn-row tone-${attnTone(tone)}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onPointerEnter={onHover || undefined}
      onFocus={onHover || undefined}
      // Its own Enter and Space only: a key pressed on a button inside the row is that button's.
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      data-testid={testid}
    >
      <div className={`cl-attn-avatar ${glyph ? "glyph" : ""}`} title={glyph === "phone" ? "No name yet" : undefined}>
        {glyph ? <Icon name={glyph} size={12} /> : initials}
      </div>
      <div className="cl-attn-body">
        <div className="cl-attn-name">
          <span className="cl-attn-who">{name}</span>
          {meta ? <span className="cl-attn-meta">{meta}</span> : null}
        </div>
        <div className={`cl-attn-sentence ${quoted ? "quoted" : ""}`}>{quoted ? `“${sentence}”` : sentence}</div>
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
    </div>
  );
}
