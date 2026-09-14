/* global React, Icon */
// The one row grammar for a person who needs something: an avatar, a name with
// where and when, one sentence, one state line, one button — and, where the
// state asks a second thing of you, a quiet second verb. People's strip and
// Today's queue both draw it. The classes are the strip's (clients.css), so
// the two read alike wherever a row appears.
//
// Verbs are the caller's: `cta.onClick` and `also.onClick` do the work, and
// `cta.gate` and `also.gate` carry window.gate(...)'s props; the row itself
// opens whatever `onOpen` says. Nothing here reads a surface.
//
// The lead line's colour is the row's tone: one of contracts' six (tone.ts),
// or the receptionist's standing on a thread (people.ts: escalated, queued,
// snoozed, paused, silent, answering) said in them. Without the bridge, the
// name as given.
const attnTone = (tone) => {
  const say = window.__chrome && window.__chrome.state;
  if (!say) return tone;
  const own = say("tone", tone).tone;
  return own === "plain" ? say("standing", tone).tone : own;
};
const AttnRow = ({
  initials,
  glyph = null,
  name,
  meta = "",
  sentence = "",
  quoted = false,
  status = [],
  tone = "answering",
  cta = null,
  also = null,
  onOpen = () => {},
  testid = "attention-row",
  ctaTestid = "attention-cta",
}) => (
  <div
    className={`cl-attn-row tone-${attnTone(tone)}`}
    role="button"
    tabIndex={0}
    onClick={onOpen}
    // Its own Enter and Space only: a key pressed on a button inside the row is that button's.
    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}
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
          <span key={i} className={i === 0 ? "lead" : ""}>{i > 0 && <span className="sep"> · </span>}{seg}</span>
        ))}
      </div>
    </div>
    {(cta || also) && (
      <span className="cl-attn-acts" onClick={(e) => e.stopPropagation()}>
        {also && (
          <button className="cl-attn-cta ghost" onClick={also.onClick} {...(also.gate || {})} data-testid={also.testid || "attention-also"}>{also.label}</button>
        )}
        {cta && (
          <button className={`cl-attn-cta ${cta.kind || "primary"}`} onClick={cta.onClick} {...(cta.gate || {})} data-testid={ctaTestid}>{cta.label}</button>
        )}
      </span>
    )}
  </div>
);

window.AttnRow = AttnRow;
