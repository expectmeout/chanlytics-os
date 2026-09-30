/* global React, Icon, Confirm, FailedRead, StatePill */
// Chanlytics -- Campaigns › Playbooks: a reach-out as one row (Reach out, Part 4 PR 8; canvas board 07). A chain of
// emails to a search's leads is one thing to its owner, so it is one row among the moments, its steps in the open row.
// The row line says what the list read holds (GET reach-outs): its steps and domain, its state, its search, and its
// next run as it is -- paused, set to never, held for billing, a run waiting, or the sweep's own clock (R23). Its
// report -- each step counted once from the database, its last runs, whether it may be removed -- is read when the row
// opens (window.__reachOuts.report), never before and never invented (R23). Every sentence is contracts'
// (window.__reachOuts.words, reach-out-sheet.ts); every act goes through window.__reachOuts, and the surfaces are read
// again behind it. Who may press is the role store's answer (window.gate / canDo "approve": owner, operator, partner).
// Edit opens the reach-out sheet (reach-out-sheet.jsx, PR 6) over the chain as read, for a role that may change it.

/**
 * A chain's report and its search's reach, read when a row of it opens (this one, or a Templates email row), or why they
 * could not be read; and the retry that reads them again.
 */
const useReachOutReport = (rootId, open) => {
  const [read, setRead] = React.useState(null);
  const [tries, retry] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const V = window.__reachOuts;
    if (!open || !V) return undefined;
    let live = true;
    setRead({ state: "reading" });
    V.report(rootId).then(
      (r) => { if (live) setRead(r && r.ok ? { state: "ok", report: r.data.report, reach: r.data.reach } : { state: "failed" }); },
      () => { if (live) setRead({ state: "failed" }); },
    );
    return () => { live = false; };
  }, [rootId, open, tries]);
  return [read, retry];
};

const roGo = (to) => window.CHANLY && window.CHANLY.nav(to);
const RO_NO_REACH = { ready: 0, with_unconfirmed: 0, phone_only: 0, of: 0, chain: null };

/** The chain as it runs: each step, and the days each waits for nothing back. */
const ReachOutPath = ({ chain, W }) => {
  const path = W.chainPathWords(chain);
  return (
    <p className="ro-chain" data-testid="ro-chain">
      {path.steps.map((s) => (
        <React.Fragment key={s.id}>
          {s.after && <span className="ro-chain-gap"> → {s.after} → </span>}
          <span className="ro-chain-step">{s.label}</span>
        </React.Fragment>
      ))}
      <span className="ro-chain-stops"> · {path.stops}</span>
    </p>
  );
};

/** The report said: each step counted once, the sentence, the held opening their run (R20), the runs, how to stop one. */
const ReachOutReport = ({ said }) => (
  <>
    <table className="ro-steps" data-testid="ro-steps">
      <thead><tr>{said.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{said.table.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j} className="tabular">{c}</td>))}</tr>)}</tbody>
    </table>
    <p className="ob-sentence" data-testid="ro-sentence">
      {said.sentence}
      {said.waiting && <>{" "}{said.waiting.run_id
        ? <button type="button" className="ob-link" onClick={() => roGo(`broadcasts/run:${said.waiting.run_id}`)} data-testid="ro-waiting">{said.waiting.text}</button>
        : <span data-testid="ro-waiting">{said.waiting.text}</span>}.</>}
    </p>
    {said.history.length > 0 && (
      <ul className="ro-history" data-testid="ro-history">
        {said.history.map((h) => <li key={h.id}><button type="button" className="ob-link" onClick={() => roGo(`broadcasts/run:${h.id}`)}>{h.text}</button></li>)}
      </ul>
    )}
    <p className="bc-excl-hint" data-testid="ro-stop-one">{said.stopOne}</p>
  </>
);

/** Edit, Pause or Resume, and Remove only while the report says it may go (R16), asking first. */
const ReachOutActs = ({ chain, said, W, flash, onEdit }) => {
  const V = window.__reachOuts;
  const RW = W.REACH_OUT_ROW_WORDS;
  const [busy, setBusy] = React.useState(false);
  const [sure, setSure] = React.useState(false);
  const paused = chain.state !== "running";
  const act = async (fn, words) => {
    if (!V || busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    // A refusal is said as every refusal is (window.refusalToast): its title and the owner's words, never a blank.
    if (flash) flash(r && r.ok ? { tone: "ok", msg: words } : window.refusalToast(r));
  };
  const toggle = () => act(() => (paused ? V.resume(chain.root_id) : V.pause(chain.root_id)), paused ? RW.resumed(chain.name) : RW.paused(chain.name));
  const remove = () => { setSure(false); act(() => V.remove(chain.root_id), RW.removed(chain.name)); };
  return (
    <div className="pb-card-acts ro-acts" data-testid="ro-acts">
      {sure ? (
        <Confirm question={RW.removeAsk(chain.name)} detail={said ? said.remove : null} yes={RW.removeYes} danger busy={busy} onYes={remove} onNo={() => setSure(false)} testid="ro-remove" />
      ) : (
        <>
          {/* A secondary act: out of sight for a role that may not change the chain (legacy/CLAUDE.md, Role gates). */}
          {onEdit && window.canDo && window.canDo("approve") && <button className="btn btn-sm" disabled={busy} onClick={onEdit} data-testid="ro-edit">{RW.edit}</button>}
          <button className="btn btn-sm" disabled={busy} onClick={toggle} data-testid="ro-toggle" {...window.gate("approve", paused ? "resume a reach-out" : "pause a reach-out")}>{paused ? RW.resume : RW.pause}</button>
          {/* Removed only before its first email goes (R16): after that it is paused, and its history stays. */}
          {said && said.canRemove && <button className="cl-bucket-link danger" disabled={busy} onClick={() => setSure(true)} data-testid="ro-remove" {...window.gate("approve", "remove a reach-out")}>{RW.remove}</button>}
        </>
      )}
    </div>
  );
};

/** The open row: the chain's path, its report as read, its acts. */
const ReachOutOpen = ({ chain, canAct, flash, W, pace }) => {
  const [read, retry] = useReachOutReport(chain.root_id, true);
  const [editing, setEditing] = React.useState(false);
  const RW = W.REACH_OUT_ROW_WORDS;
  const said = read && read.state === "ok" ? W.chainReportWordsOf(chain, read.report, read.reach || RO_NO_REACH, pace) : null;
  return (
    <div className="pb-row-open ro-open" data-testid="ro-open-body">
      <ReachOutPath chain={chain} W={W} />
      {(!read || read.state === "reading") && <p className="cm-standing" data-testid="ro-reading">{RW.reading}</p>}
      {read && read.state === "failed" && <FailedRead kind="line" what={RW.failed} onRetry={retry} testid="ro-failed" />}
      {said && <ReachOutReport said={said} />}
      <ReachOutActs chain={chain} said={said} W={W} flash={flash} onEdit={chain.search && window.ReachOutSheet ? () => setEditing(true) : null} />
      {/* Who may is the role store's one answer (contracts roleGate, a partner included), never a copy of it. */}
      {!canAct && window.gateTitle && <p className="bc-excl-hint" data-testid="ro-role">{window.gateTitle("approve", "change, pause, resume or remove a reach-out")}</p>}
      {editing && <window.ReachOutSheet search={chain.search} chain={chain} onClose={() => setEditing(false)} />}
    </div>
  );
};

const ReachOutRow = ({ chain, canAct, flash, open = false, onOpen, tz, now = null, focus = false }) => {
  const W = window.__reachOuts && window.__reachOuts.words;
  if (!W) return null;
  const pace = W.chainPaceOf(chain);
  const next = W.nextRunWords(chain, tz || "America/New_York", now || new Date());
  const state = chain.state !== "running" ? "paused" : chain.next.waiting_run_id ? "approval" : "running";
  return (
    <section id={`pb-${chain.root_id}`} className={`pb-row pb-chain${open ? " is-open" : ""}${focus ? " is-focus" : ""}`} data-testid="ro-row" data-state={state}>
      <div className="pb-row-line" role="presentation" onClick={window.cmRowPress}>
        <button type="button" className="pb-row-what" onClick={onOpen} aria-expanded={open} data-row-open data-testid="ro-open">
          <span className="mark pb-row-mark" aria-hidden="true"><Icon name="mail" size={13} /></span>
          <span className="pb-row-titles">
            <span className="pb-row-name">{chain.name}</span>
            <span className="pb-row-hint" data-testid="ro-hint">{W.chainHintOf(chain, pace.host)}</span>
          </span>
        </button>
        <span className="pb-row-state"><StatePill kind="playbook" value={state} /></span>
        {/* Who it writes to is its search; how many it has reached is its report's, in the open row. */}
        <span className="pb-row-reach">{chain.search && <span className="pb-row-hint" data-testid="ro-search">{chain.search.name}</span>}</span>
        <span className="pb-row-next" data-testid="ro-next">
          {next.run_id
            ? <button type="button" className="ob-link" onClick={() => roGo(`broadcasts/run:${next.run_id}`)} data-testid="ro-next-run">{next.text}</button>
            : <span className="pb-tile-next" data-tone={next.tone}>{next.text}</span>}
        </span>
        <span className="pb-row-runs" />
      </div>
      {open && <ReachOutOpen chain={chain} canAct={canAct} flash={flash} W={W} pace={pace} />}
    </section>
  );
};

Object.assign(window, { ReachOutRow, useReachOutReport });
