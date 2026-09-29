/* global React, Icon, Confirm, LeadStrip */
// Chanlytics -- Leads while a reach-out writes (Reach out, Part 6: H8-H10; canvas board 06). An open search that a
// reach-out writes to draws a strip under the finder's own (how many it has written to, today's count of the day's
// share, the next email and who it goes to, the domain), each row's Stage cell a line saying where that business
// stands, and the peek a block with its story and three doors: Read what went out (the person's thread), Stop writing
// to them, and Read as no · undo. Every sentence is contracts' (window.__reachOuts: reachOutLineOf, reachOutStripOf,
// reachOutTimelineOf), read through the bridge (GET reach-outs/leads); a read that failed draws nothing of it, never
// a line it did not read. Who may press is the role store's answer (window.gate / canDo "approve").

/** The search's lines are read again at most this often when the leads themselves are read again. */
const RO_LEADS_REREAD_MS = 30_000;

/**
 * An open search's reach-out: its lines, read when the search opens, again when the leads are read again (at most every
 * thirty seconds) and at once after a door here moved something. Null while there is none, or it could not be read.
 * Answers the lines with `lineOf(leadId)`, the Stage cell's words.
 */
const useReachOutLeads = (searchId) => {
  const [dto, setDto] = React.useState(null);
  const [tick, bump] = React.useReducer((n) => n + 1, 0);
  const readAt = React.useRef(0);
  React.useEffect(() => {
    const again = () => { if (Date.now() - readAt.current >= RO_LEADS_REREAD_MS) bump(); };
    window.addEventListener("surface:leads", again);
    window.addEventListener("reach_out:leads", bump);
    return () => {
      window.removeEventListener("surface:leads", again);
      window.removeEventListener("reach_out:leads", bump);
    };
  }, []);
  // Another search: nothing of the last one's stands while this one's is read.
  React.useEffect(() => { setDto(null); }, [searchId]);
  React.useEffect(() => {
    const V = window.__reachOuts;
    if (!searchId || !V) return undefined;
    let live = true;
    readAt.current = Date.now();
    V.leadLines(searchId).then((d) => { if (live) setDto(d && d.lines ? d : null); });
    return () => { live = false; };
  }, [searchId, tick]);
  return React.useMemo(() => {
    const V = window.__reachOuts;
    if (!dto || !V) return null;
    const byLead = new Map(dto.lines.leads.map((l) => [l.lead_id, l]));
    return { dto, lineOf: (id) => { const l = byLead.get(id); return l ? V.lineOf(l) : null; } };
  }, [dto]);
};

/** A door here moved a lead or its chain: the strip and the lines are read again at once. */
const roLeadsMoved = () => window.dispatchEvent(new CustomEvent("reach_out:leads"));

/**
 * The strip under the finder's own, drawn by the finder's strip itself (LeadStrip) so the two read as one family: how
 * it is going (the chain's row on Playbooks), a run that waits, and Pause or Resume for a role that may.
 */
const ReachOutLeadsStrip = ({ leads }) => {
  const [toastNode, flash] = window.usePPToast();
  const [busy, setBusy] = React.useState(false);
  const V = window.__reachOuts;
  const s = leads && V ? V.stripOf(leads.dto) : null;
  if (!s) return toastNode;
  const root = leads.dto.lines.chain.root_id;
  const name = leads.dto.lines.chain.name;
  const mayToggle = !!(window.canDo && window.canDo("approve"));
  const vm = {
    state: s.running ? "running" : "",
    title: s.title,
    parts: s.parts,
    alert: false,
    progress: s.progress,
    actions: [
      ...(s.waiting ? [{ id: "waiting", label: s.waiting.label, primary: true }] : []),
      { id: "going", label: s.going.label },
      ...(mayToggle ? [{ id: "toggle", label: s.toggle.label }] : []),
    ],
  };
  const onAction = async (id) => {
    if (id === "going") return window.CHANLY && window.CHANLY.nav(s.going.to);
    if (id === "waiting" && s.waiting) return window.CHANLY && window.CHANLY.nav(s.waiting.to);
    if (id !== "toggle" || busy) return undefined;
    setBusy(true);
    const r = await (s.toggle.pause ? V.pause(root) : V.resume(root)).finally(() => setBusy(false));
    const RW = V.words.REACH_OUT_ROW_WORDS;
    flash(r && r.ok ? { tone: "ok", msg: s.toggle.pause ? RW.paused(name) : RW.resumed(name) } : window.refusalToast(r));
    roLeadsMoved();
    return undefined;
  };
  return (
    <div data-testid="ro-leads-strip" data-state={s.running ? "running" : "paused"}>
      <LeadStrip vm={vm} onAction={onAction} />
      {toastNode}
    </div>
  );
};

/** The peek's block (H9): a lead's story with the reach-out, and its doors. Nothing when no reach-out planned it. */
const LeadReachOut = ({ lead, flash }) => {
  const leadId = lead ? lead.id : null;
  const [story, setStory] = React.useState(null);
  const [tick, bump] = React.useReducer((n) => n + 1, 0);
  const [sure, setSure] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    const reads = window.__reachOuts;
    if (!reads || !leadId) return undefined;
    let live = true;
    reads.leadTimeline(leadId).then((t) => { if (live) setStory(t); });
    return () => { live = false; };
  }, [leadId, tick]);
  const V = window.__reachOuts;
  if (!V || !story || !story.chain || story.lead_id !== leadId) return null;
  const vm = V.timelineOf(story);
  const W = V.words.REACH_OUT_STOP_WORDS;
  const said = (r, ok) => { if (flash) flash(r && r.ok ? { tone: "ok", msg: ok } : window.refusalToast(r)); };
  const stop = async () => {
    setSure(false);
    setBusy(true);
    const r = await V.stopLead(lead.id).finally(() => setBusy(false));
    said(r, r && r.ok && r.data && r.data.already ? W.already(story.business_name) : W.done(story.business_name));
    bump();
    roLeadsMoved();
  };
  const undo = async () => {
    const R = window.__replies;
    if (!R || busy || !vm.undo) return;
    setBusy(true);
    const r = await R.undo(vm.undo.messageId).finally(() => setBusy(false));
    said(r, "Undone: it no longer reads as a no.");
    bump();
    roLeadsMoved();
  };
  return (
    <details className="pk-box" open data-testid="peek-reach-out">
      <summary className="pk-box-head">
        <span className="pk-box-line">
          <Icon name="mail" size={12} />
          <span className="pk-box-sum" data-testid="peek-reach-out-label">{vm.label}</span>
          <Icon name="chevron-down" size={12} />
        </span>
      </summary>
      <ol className="pk-steps" data-testid="peek-reach-out-lines">
        {vm.lines.map((l) => <li key={l.id} className="pk-step">{l.when} · {l.text}</li>)}
      </ol>
      {vm.stopped ? <p className="pk-alt-why" data-testid="peek-reach-out-stopped">{vm.stopped}</p> : null}
      {sure ? (
        <Confirm question={W.ask(story.business_name)} detail={W.detail} yes={W.yes} danger busy={busy} onYes={stop} onNo={() => setSure(false)} testid="peek-reach-out-stop" />
      ) : (
        <div className="pk-decide">
          {vm.read ? <button type="button" className="btn btn-sm" onClick={() => window.CHANLY && window.CHANLY.nav(vm.read.to)} data-testid="peek-reach-out-read">{vm.read.label}</button> : null}
          {vm.stop ? <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setSure(true)} data-testid="peek-reach-out-stop-ask" {...window.gate("approve", "stop writing to a business")}>{vm.stop.label}</button> : null}
          {vm.undo ? <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={undo} data-testid="peek-reach-out-undo" {...window.gate("approve", "undo a reply read as no")}>{vm.undo.label}</button> : null}
        </div>
      )}
    </details>
  );
};

Object.assign(window, { useReachOutLeads, ReachOutLeadsStrip, LeadReachOut });
