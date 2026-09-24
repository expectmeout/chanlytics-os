/* global React, Icon */
// People › Pipeline, the row carries the deal (docs/decisions/0008-a-proposal-is-part-of-the-deal.md): the pieces a
// row, a card and the peek share. Loaded before pipeline-board.jsx, pipeline-peek.jsx and pipeline-scope.jsx, which
// draw them. Every word is contracts' (pipeline.ts PIPELINE_WORDS, the deal kit's act words), and every rule is too:
// the steps are the row's `track`, a pass is pipelinePassMany's, and what it came to is pipelinePassDone's.

// The deal's steps as a quiet line of short bars: done in the dim ink, where it stands in its tone, what is ahead in the
// rule's. A picture of what the group head and the chip already say in words, so a screen reader is not read it again.
const PipelineTrack = ({ steps }) => (steps && steps.length ? (
  <span className="pipe-track" data-steps={steps.length} aria-hidden="true" data-testid="pipe-track">
    {steps.map((s) => <i key={s.key} className="pipe-step" data-at={s.at} data-tone={s.tone} data-key={s.key} />)}
  </span>
) : null);

// A row's own acts, before the sheet opens: the deal sheet gives focus back to whatever held it as it opened, and a
// menu's item is gone by then, so the row (or the card) takes it first, and closing the sheet lands on it.
const pipeHoldFocus = (id) => {
  const el = typeof document !== "undefined" && document.getElementById ? document.getElementById(`person-${id}`) : null;
  if (el && el.focus) el.focus({ preventScroll: true });
};

const PIPE_ACT_ICON = { propose: "deal", won: "check", lost: "x", edit: "edit", ended: "stop", again: "repeat" };

// The deal's own acts, as the thread's Deal group offers them (the deal kit's menu), then the two doors. The send is
// the peek's, whose card holds the person the words are for: it is not offered here. A member who may not record a
// deal is not shown the acts at all -- an item's secondary acts stay out of sight for a role that may not press them
// (legacy/CLAUDE.md, role gates) -- and keeps the two doors.
const pipeRowItems = (r, { canRecord, onPage, onThread }) => {
  const kit = window.__deal;
  const W = window.__pipeline.words.peek;
  const deal = r.person.deal;
  const acts = canRecord && kit && kit.menu && window.openDealSheet
    ? kit.menu(deal).filter((a) => a.mode).map((a) => ({
        label: a.label,
        icon: PIPE_ACT_ICON[a.mode] || "deal",
        onClick: () => {
          pipeHoldFocus(r.id);
          window.openDealSheet({ personId: r.id, mode: a.mode, dealId: a.mode === "propose" || !deal ? null : deal.id });
        },
      }))
    : [];
  const doors = [
    ...(r.person.threadId ? [{ label: W.thread, icon: "chat", onClick: () => onThread(r) }] : []),
    { label: W.page, icon: "user", onClick: () => onPage(r.id) },
  ];
  return acts.length ? [...acts, { divider: true }, ...doors] : doors;
};

const PipelineRowMenu = ({ r, canRecord = false, onPage, onThread }) => {
  const words = window.__pipeline.words;
  return (
    <span className="cl-row-actions pipe-row-acts" onClick={(e) => e.stopPropagation()}>
      <window.MoreMenu items={pipeRowItems(r, { canRecord, onPage, onThread })} title={`${words.row.menu} ${r.name}`} size={13} btnClass="cl-row-act" escape testid="pipe-row-menu" />
    </span>
  );
};

// Mark as passed · N (0008): only a proposal out can pass, and why is asked once for every one. Each is recorded through
// the one deal door in turn, with the version the person's own read says (a People row carries none), and the row
// moves as the door answers; the last one reads People again behind it. What it came to is said once, and those the
// door would not take (a proposal that moved since) stay selected, so the owner sees which.
const PipelinePassMany = ({ rows, flash, onDone }) => {
  const P = window.__pipeline;
  const W = P.words.pass;
  const vm = P.passMany(rows);
  const [asking, setAsking] = React.useState(false);
  const [reason, setReason] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  if (!vm.words) return null;
  const gate = window.gate ? window.gate("approve", "mark a deal as passed") : {};
  const versionOf = async (d) => {
    const held = window.__peekPerson ? window.__peekPerson(d.personId) : null;
    const person = held || (window.__personDetail ? await window.__personDetail(d.personId).catch(() => null) : null);
    const deals = person ? person.deals || (person.deal ? [person.deal] : []) : [];
    const found = deals.find((x) => x.id === d.dealId);
    return found && found.version ? found.version : null;
  };
  const go = async () => {
    if (busy || !reason || !window.__recordDeal) return;
    setBusy(true);
    let done = 0;
    const left = [];
    for (let i = 0; i < vm.deals.length; i += 1) {
      const d = vm.deals[i];
      const version = await versionOf(d);
      const r = version
        ? await window.__recordDeal(d.personId, { stage: "lost", deal_id: d.dealId, version, lost_reason: reason }, { refresh: i === vm.deals.length - 1 ? "behind" : false })
        : null;
      if (r && r.ok) done += 1;
      else left.push(d.personId);
    }
    setBusy(false);
    setAsking(false);
    setReason(null);
    const said = P.passDone(done, left.length);
    if (flash) flash({ tone: said.tone, msg: said.words });
    if (onDone) onDone(left);
  };
  if (!asking) {
    return (
      <button type="button" className="btn btn-sm" onClick={() => setAsking(true)} data-testid="pipe-pass-open" {...gate}>
        <Icon name="x" size={12} /> {W.button} · {vm.deals.length}
      </button>
    );
  }
  return (
    <span className="cl-bulk-naming pipe-pass" role="group" aria-label={W.ask} data-testid="pipe-pass">
      <span className="pipe-pass-ask">{W.ask}</span>
      {/* The deal sheet's own question, in its own control (deal-sheet.jsx): the record kit's toggle group. */}
      <window.RecordToggleGroup label={W.ask} value={reason} options={vm.reasons.map((x) => ({ value: x.code, label: x.words }))} onChange={setReason} readOnly={busy} testid="pipe-pass-reasons" />
      {vm.rest ? <span className="pipe-pass-rest" data-testid="pipe-pass-rest">{vm.rest}</span> : null}
      <button type="button" className="btn btn-sm btn-primary" disabled={busy || !reason} onClick={go} data-testid="pipe-pass-go">{busy ? W.busy : vm.words}</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setAsking(false); setReason(null); }} data-testid="pipe-pass-cancel">{W.cancel}</button>
    </span>
  );
};

Object.assign(window, { PipelineTrack, PipelineRowMenu, PipelinePassMany, pipeHoldFocus });
