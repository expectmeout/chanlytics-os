/* global React, Icon */
// Chanlytics -- Campaigns › Templates: a reach-out's email as a row (Reach out, Part 4 PR 8; canvas board 14; F15, R19).
// Its words are a chain's step's, so the row says so: the Email chip, the words with their slots as chips, and what
// sends it (the chain, which opens its Playbooks row). How many it has written is its chain's report, read when the row
// opens (window.useReachOutReport, reach-out-row.jsx; R23), and said only once read: nothing while it reads or when it
// could not be read, never a 0 it did not read. It has no Rename, Hide or Delete of its own, and no WhatsApp or Text
// versions: a reach-out sends email only, and its words change where the chain is. Every sentence is contracts'
// (window.__reachOuts.words, emailTemplateWords). The rows are contracts' emailTemplateRowsOf over the reach_outs
// surface's chains (__REACH_OUTS), which __TEMPLATES_ALL (WhatsApp's) never holds.

/** Words with each slot drawn as a chip, read-only (contracts slotParts, the one slot rule). */
const EmailWords = ({ text }) => {
  const W = window.__reachOuts && window.__reachOuts.words;
  const parts = W ? W.slotParts(text || "") : [{ text: text || "", slot: false }];
  return (
    <>
      {parts.map((p, i) => (p.slot ? <span key={i} className="chip em-slot">{p.text}</span> : <React.Fragment key={i}>{p.text}</React.Fragment>))}
    </>
  );
};

const EmailTemplateRow = ({ t, open = false, onOpen }) => {
  const [read] = window.useReachOutReport ? window.useReachOutReport(t.root_id, open) : [null];
  const W = window.__reachOuts && window.__reachOuts.words;
  if (!W) return null;
  const written = open && read && read.state === "ok" ? W.emailRowWrittenOf(read.report, t.step_id) : null;
  const w = W.emailTemplateWords({ chainName: t.chain_name, stepN: t.step_n, afterDays: t.after_days });
  const go = () => window.CHANLY && window.CHANLY.nav(`outbound/${t.root_id}`);
  const oneLine = String(t.body || "").replace(/\s+/g, " ").trim();
  return (
    <div className={`msg-row msg-row-email${open ? " is-open" : ""}`} data-testid="template-email">
      <div className="msg-row-line" onClick={window.cmRowPress}>
        <button type="button" className="msg-row-what" onClick={onOpen} aria-expanded={open} data-row-open data-testid="template-email-open">
          <span className="mark msg-row-mark" data-kind="email" aria-hidden="true"><Icon name="mail" size={13} /></span>
          <span className="msg-row-said">
            <span className="msg-row-titles">
              <span className="msg-row-title">{t.subject || W.stepLabel(t.step_n)}</span>
              <span className="chip msg-tag" data-testid="template-email-chip">{w.chip}</span>
            </span>
            <span className="msg-row-words">{`“${oneLine}”`}</span>
          </span>
        </button>
        <span className="msg-row-use">
          <button type="button" className="msg-use-link" onClick={go} data-testid="template-email-sends">{w.sends}</button>
          <span className="msg-use-note">{w.sendsNote}</span>
        </span>
        <span className="msg-row-sent" data-testid="template-email-sent">
          {written !== null && (
            <span className="msg-row-sent-n">{written}<span className="msg-row-sent-unit"> sent</span></span>
          )}
        </span>
      </div>
      {open && (
        <div className="msg-row-open" data-testid="template-email-body">
          <p className="bc-excl-hint" data-testid="template-email-versions">{w.versionsNote}</p>
          <div className="em-words" data-testid="template-email-words">
            {t.subject && <p className="em-subject"><EmailWords text={t.subject} /></p>}
            <p className="em-body"><EmailWords text={t.body} /></p>
          </div>
          <p className="bc-excl-hint" data-testid="template-email-check">{w.checkNote}</p>
          <div className="msg-card-foot">
            <span className="msg-card-meta">{w.foot}</span>
            <span className="msg-card-spacer" />
            {/* Its words change on its reach-out's sheet; until the sheet comes (PR 6), this opens its Playbooks row. */}
            <button className="btn btn-sm" onClick={go} data-testid="template-email-edit">{w.edit}</button>
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { EmailTemplateRow, EmailWords });
