/* global React, Icon, Confirm, LeadStrip */
// Chanlytics -- Leads while a reach-out writes (Reach out, Part 6: H8-H10; canvas board 06). An open search that a
// reach-out writes to draws a strip under the finder's own (how many it has written to, today's count of the day's
// share, the next email and who it goes to, the domain), each row's Stage cell a line saying where that business
// stands, and the peek a block with its story and three doors: Read what went out (the person's thread), Stop writing
// to them, and Read as no · undo. Every sentence is contracts' (window.__reachOuts: reachOutLineOf, reachOutStripOf,
// reachOutTimelineOf), read through the bridge (GET reach-outs/leads); a read that failed draws nothing of it, never
// a line it did not read. Who may press is the role store's answer (window.gate / canDo "approve").
//
// And a list of your own (Part 7: J1-J12): Leads' *Import leads* (a file of the owner's own businesses, read here, every
// address checked first by the finder's own check, as a search of its own) and the bulk bar's *Write to them* (the chosen
// leads as a search of their own, with the reach-out sheet opened on it). A reach-out writes to a search, so both are
// one. Every reading of a file and every word is contracts' (lead-import.ts), through window.__reachOuts.lists; the
// page mounts it with one hook, useLeadLists, whose answer is the rail's door, the bar's act and the sheets they open.

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

/* ------------------------------------------------------------ a list of your own (Part 7) */

const { useState: useLlState, useMemo: useLlMemo } = React;

// Rows drawn before the import, as a taste of what was read.
const LL_TASTE = 5;

/** Where the rows come from: a file, or rows pasted and read. */
const LlImportPick = ({ W, text, busy, onFile, onText, onRead }) => (
  <>
    <div className="rec-field">
      <label>
        <span className="rec-field-label">{W.file}</span>
        <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} disabled={busy} data-testid="lead-import-file" />
      </label>
    </div>
    <div className="rec-field">
      <label>
        <span className="rec-field-label">{W.paste}</span>
        <textarea className="rec-input" rows={5} value={text} disabled={busy} placeholder={W.pastePlaceholder} onChange={(e) => onText(e.target.value)} data-testid="lead-import-paste" />
      </label>
      <button type="button" className="btn btn-sm pl-import-read" disabled={busy || !text.trim()} onClick={onRead} data-testid="lead-import-read">{W.read}</button>
    </div>
  </>
);

/** What was read, before anything is written: the counts, where the columns are, a taste, the name, who they are. */
const LlImportPreview = ({ L, plan, ready, name, asked, busy, onName, onAsked }) => (
  <div className="pl-import-preview" data-testid="lead-import-preview">
    <p className="pl-import-counts" data-testid="lead-import-counts">{L.countWords(plan.counts)}</p>
    <p className="pl-import-hint" data-testid="lead-import-columns">{plan.counts.rows === 0 ? "No rows were read from that." : L.columnWords(plan)} {L.words.costs}</p>
    {ready.length > 0 && (
      <table className="pl-import-table">
        <thead><tr><th>Business</th><th>Email</th><th>Website</th></tr></thead>
        <tbody>
          {ready.slice(0, LL_TASTE).map((r) => (
            <tr key={r.line}><td>{r.name}</td><td>{r.email}</td><td>{r.website_host || "—"}</td></tr>
          ))}
        </tbody>
      </table>
    )}
    {ready.length > LL_TASTE && <p className="pl-import-hint">and {(ready.length - LL_TASTE).toLocaleString()} more</p>}
    <div className="rec-field">
      <label>
        <span className="rec-field-label">{L.words.nameLabel}</span>
        <input className="rec-input" value={name} maxLength={120} disabled={busy} onChange={(e) => onName(e.target.value)} data-testid="lead-import-name" />
      </label>
    </div>
    <div className="rec-field">
      <label>
        <span className="rec-field-label">{L.words.askedLabel}</span>
        <input className="rec-input" value={asked} maxLength={400} disabled={busy} placeholder={L.words.askedHint} onChange={(e) => onAsked(e.target.value)} data-testid="lead-import-asked" />
      </label>
    </div>
  </div>
);

/** The import sheet (J12): People's import's shape, the record kit's sheet, with the list's name and who they are. */
const LeadImportSheet = ({ onClose, onDone = null, flash = null }) => {
  const L = window.__reachOuts.lists;
  const W = L.words;
  const [text, setText] = useLlState("");
  const [file, setFile] = useLlState(null);
  const [plan, setPlan] = useLlState(null);
  const [name, setName] = useLlState("");
  const [asked, setAsked] = useLlState("");
  const [busy, setBusy] = useLlState(false);
  const [error, setError] = useLlState(null);
  const [result, setResult] = useLlState(null);
  // Filtered once for each reading of the file, not on every draw of the sheet.
  const ready = useLlMemo(() => (plan ? plan.rows.filter(L.ready) : []), [plan, L]);
  const tooMany = ready.length > L.max;
  const read = (t, fileName) => {
    setPlan(L.planOf(t));
    setResult(null);
    setError(null);
    if (!name.trim()) setName(L.nameOf(fileName));
  };
  // A file past the sheet's size is refused before it is read, and one that cannot be read says so (G:1): any file was
  // read and parsed whole before the row cap applied, and a failed read left the sheet as it was, with no word.
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (L.maxBytes && f.size > L.maxBytes) { setPlan(null); setResult(null); setError(W.tooBig); return; }
    const r = new FileReader();
    r.onload = () => { setFile(f.name); read(String(r.result || ""), f.name); };
    r.onerror = () => { setPlan(null); setError(W.unreadable); };
    r.readAsText(f);
  };
  const run = async () => {
    if (busy || !ready.length || tooMany) return;
    setBusy(true);
    setError(null);
    const rows = ready.map((r) => ({ name: r.name, email: r.email, phone: r.phone, website_host: r.website_host, city: r.city, region: r.region, category: r.category }));
    const r = await L.importLeads({ name: name.trim() || L.nameOf(file), asked: asked.trim(), rows });
    setBusy(false);
    if (!r.ok) { setError(r.message || W.failed); return; }
    const said = L.importAnswerWords(r.data, plan.counts.rows - ready.length);
    setResult(said);
    if (flash) flash({ msg: <>{said.title}</> });
    if (onDone) onDone(r.data.search_id);
  };
  const problem = error || (tooMany ? W.tooMany : plan && plan.counts.rows > 0 && !ready.length ? W.nothing : null);
  return (
    <window.RecordSheet
      id="lead-import"
      title={W.importTitle}
      sub={W.importSub}
      onClose={onClose}
      closeLabel={result ? "Done" : "Cancel"}
      onSave={plan && ready.length && !tooMany && !result ? run : null}
      saveLabel={`${L.saveLabel(ready.length)} · about ${L.cents(ready.length)}¢`}
      saving={busy}
      savingLabel="Importing…"
      foot={problem || result ? (
        <div className="pl-import-foot">
          <window.FieldError id="lead-import-problem" message={problem} testid="lead-import-error" />
          {result ? <button type="button" className="btn btn-sm" onClick={onClose} data-testid="lead-import-done">Done</button> : null}
        </div>
      ) : null}
      testid="lead-import-sheet"
    >
      <div className="pl-import">
        {!result && <LlImportPick W={W} text={text} busy={busy} onFile={onFile} onText={setText} onRead={() => read(text, null)} />}
        {plan && !result && <LlImportPreview L={L} plan={plan} ready={ready} name={name} asked={asked} busy={busy} onName={setName} onAsked={setAsked} />}
        {result && (
          <div className="pl-import-summary" data-testid="lead-import-summary">
            <p className="pl-import-counts"><b>{result.title}</b></p>
            {result.lines.map((l) => <p key={l} className="pl-import-hint">{l}</p>)}
          </div>
        )}
      </div>
    </window.RecordSheet>
  );
};

// Where the bridge is absent: no door, no act, no sheet.
const LL_NONE = { importDoor: null, writeAct: () => null, node: null, stripOf: () => null, emptyOf: () => null };

/**
 * The page's one hook (J12): the rail's *Import leads*, the bar's *Write to them* for the rows chosen and shown, and the
 * sheet either opens. A list made lands the page on it; one chosen opens the reach-out sheet over it.
 */
const useLeadLists = ({ flash = null } = {}) => {
  const [importing, setImporting] = useLlState(false);
  const [writing, setWriting] = useLlState(null);
  const [busy, setBusy] = useLlState(false);
  const L = window.__reachOuts && window.__reachOuts.lists;
  if (!L) return LL_NONE;
  const open = (id) => { if (window.CHANLY && window.__leadsRouteOf) window.CHANLY.nav(window.__leadsRouteOf({ searchId: id, list: "all" })); };
  const may = !window.canDo || window.canDo("approve");
  const choose = async (ids) => {
    if (busy || !ids.length) return;
    setBusy(true);
    const name = L.chooseNameOf();
    const r = await L.chooseLeads({ name, lead_ids: ids.slice(0, L.max) });
    setBusy(false);
    if (!r.ok) { if (flash) flash({ tone: "warn", msg: <>{r.message || L.words.failed}</> }); return; }
    if (flash) flash({ msg: <>{L.chooseAnswerWords(r.data)}</> });
    open(r.data.search_id);
    setWriting({ id: r.data.search_id, name });
  };
  const importDoor = (
    <button type="button" className="cl-rail-newseg" onClick={() => setImporting(true)} data-testid="leads-import" {...window.gate("find", "import leads")}>
      <Icon name="download" size={11} /> {L.words.importDoor}
    </button>
  );
  // The act for the rows chosen and shown (never "all that match": a view is not a list of ids), on a desk the bar's
  // button and on a phone a row of its sheet (`shut` closes the sheet first).
  const writeAct = ({ ids, phone = false, shut = () => {} }) => {
    if (!ids.length) return null;
    if (phone) return <window.PhoneSheetRow icon="mail" label={L.words.write} meta={busy ? L.words.writing : null} disabled={busy} onClick={() => { shut(); choose(ids); }} testid="leads-bulk-write" gate={may ? null : window.gate("approve", "write to these leads")} />;
    return (
      <button type="button" className="btn btn-sm" disabled={busy} title={L.words.writeHint} onClick={() => choose(ids)} data-testid="leads-bulk-write" {...window.gate("approve", "write to these leads")}>
        <Icon name="mail" size={12} /> {busy ? L.words.writing : L.words.write}
      </button>
    );
  };
  const node = (
    <>
      {importing ? <LeadImportSheet onClose={() => setImporting(false)} onDone={open} flash={flash} /> : null}
      {writing && window.ReachOutSheet ? <window.ReachOutSheet search={writing} onClose={() => setWriting(null)} onDone={() => {}} /> : null}
    </>
  );
  // A list's own strip in the finder's strip's place, and what its table says while its addresses are checked (J8).
  return { importDoor, writeAct, node, stripOf: L.stripOf, emptyOf: L.emptyOf };
};

Object.assign(window, { useReachOutLeads, ReachOutLeadsStrip, LeadReachOut, useLeadLists, LeadImportSheet });
