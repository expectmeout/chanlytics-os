/* global React, Icon */
// Campaigns' shared parts: what Playbooks, Broadcasts and Templates each open on.
//
// The three pages opened on a one-line standing sentence and a toolbar with a
// hairline of its own, and each drew its sections with its own furniture. The
// canvas opens every one of them the same way: a headline and ONE line under it,
// with the page's own act at the right. That is not the header #556-#558 took
// away -- a title the top bar repeated, a sub-headline that ran to six lines at
// 390px and a three-cell stat strip, about 590px of a phone before the first
// message. This is 22px and 12.5px, about fifty pixels, and it wraps rather
// than grows.

/**
 * The page head.
 *
 *   title   the page's name, as the tab says it
 *   sub     one line under it: the page's numbers, or what it holds
 *   right   the page's own act, or a state that outranks it
 */
const CmHead = ({ title, sub = null, right = null, testid = null }) => (
  <header className="cm-head" data-testid={testid || undefined}>
    <div className="cm-head-text">
      <h1 className="cm-head-title">{title}</h1>
      {sub && <div className="cm-head-sub">{sub}</div>}
    </div>
    {right && <div className="cm-head-right">{right}</div>}
  </header>
);

/** The dot between the parts of a head's line: a separator a screen reader skips. */
const CmDot = () => <span className="cm-head-dot" aria-hidden="true">·</span>;

/**
 * A state that asks for the owner, said at the right of a head: "2 waiting on
 * you". The tone is the vocabulary's (tone.ts); this never picks one.
 */
const CmFlag = ({ tone = "warn", children, testid = null }) => (
  <span className="cm-flag" data-tone={tone} data-testid={testid || undefined}>
    <span className="cm-flag-dot" aria-hidden="true" />
    {children}
  </span>
);

/**
 * A notice that sits between the head and the list: one bold sentence saying
 * what is true, the rest saying what it costs, and the one act that fixes it.
 */
const CmBanner = ({ tone = "warn", lead, children = null, act = null, testid = null }) => (
  <div className="cm-banner" data-tone={tone} data-testid={testid || undefined}>
    <Icon name={tone === "plain" ? "info" : "notice"} size={15} />
    <span className="cm-banner-text">
      <strong>{lead}</strong>
      {children ? <> {children}</> : null}
    </span>
    {act}
  </div>
);


/**
 * One language of one message, drawn: filled when WhatsApp approved it, dotted
 * while WhatsApp reads it, struck through when WhatsApp refused it, and an open
 * dashed ring for a language the message does not exist in. The colour is the
 * vocabulary's (tone.ts, through the chrome bridge); `status` null is absence.
 */
const CmLangGlyph = ({ status = null, size = 12 }) => {
  const said = status && window.__chrome && window.__chrome.state ? window.__chrome.state("template", status) : null;
  const tone = said ? said.tone : "none";
  return (
    <svg className="cm-lang-glyph" data-tone={tone} width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="5.1" fill={tone === "ok" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeDasharray={!said ? "2 2.1" : tone === "info" ? "1.3 2.3" : undefined} />
      {tone === "danger" && <path d="M3.8 10.2 L10.2 3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
    </svg>
  );
};

/**
 * Who a run will actually reach, with the subtractions named: the number that
 * gets it, out of how many, a bar of the two -- those it reaches, those held
 * back -- and one line per reason anybody is held back.
 *
 *   will     how many get it
 *   pool     out of how many
 *   of       what the pool is, after "of 36": "who said yes"
 *   held     how many of the pool are held back (the amber part of the bar)
 *   reasons  [{ t, tone }]: "12 heard from a playbook this week"
 */
const CmReach = ({ will, pool, of = null, held = 0, reasons = [], size = "md", progress = null, label = null, testid = null }) => {
  const total = Math.max(pool, will + held, 1);
  const w = Math.round((Math.min(will, total) / total) * 100);
  const h = Math.round((Math.min(held, total - will) / total) * 100);
  return (
    <div className={`cm-reach cm-reach-${size}`} data-testid={testid || undefined}>
      <div className="cm-reach-n">
        <span className="cm-reach-will tabular">{will}</span>
        <span className="cm-reach-of">of <span className="tabular">{pool}</span>{of ? ` ${of}` : ""}</span>
      </div>
      {/* A send in flight is a progress bar a screen reader can hear; otherwise the bar is a picture of the numbers above it. */}
      <div className="cm-reach-bar" {...(progress === null ? { "aria-hidden": "true" } : { role: "progressbar", "aria-label": label || "Sent so far", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(progress * 100) })}>
        {w > 0 && <span className="cm-reach-bar-will" style={{ width: `${w}%` }} />}
        {h > 0 && <span className="cm-reach-bar-held" style={{ width: `${h}%` }} />}
        <span className="cm-reach-bar-rest" />
      </div>
      {reasons.length > 0 && (
        <ul className="cm-reach-why">
          {reasons.map((r, i) => (
            <li key={i}><span className="cm-reach-dot" data-tone={r.tone || "plain"} aria-hidden="true" />{r.t}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** The last few runs as bars of what each sent, oldest first: a shape, not a chart. */
const CmSpark = ({ values = [], label = null }) => {
  if (!values.length) return null;
  const top = Math.max(...values, 1);
  return (
    <span className="cm-spark" aria-label={label || undefined} role={label ? "img" : undefined}>
      {values.map((v, i) => <span key={i} className="cm-spark-bar" style={{ height: `${Math.max(v > 0 ? 3 : 1, Math.round((v / top) * 15))}px` }} />)}
    </span>
  );
};

Object.assign(window, { CmHead, CmDot, CmFlag, CmBanner, CmLangGlyph, CmReach, CmSpark });
