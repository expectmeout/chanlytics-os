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

Object.assign(window, { CmHead, CmDot, CmFlag, CmBanner });
