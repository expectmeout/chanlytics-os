/* global React, Confirm */
// Chanlytics — the business on record, as one form.
//
// Lives beside Settings › Integrations rather than inside it: this is the
// only place a workspace states its legal identity, and every carrier
// registration reads it. The fields, their words and their closed lists
// come from contracts (business-record.ts) through window.__businessRecord,
// so the form offers exactly what the carriers accept and nothing else.
//
// ONE QUESTION FIRST. There are two registrations, they ask different things,
// and the narrow one cannot be withdrawn — so nothing is rendered until it is
// known which one this is. That is three states, not two: a path, or the
// question, or "still reading". A form that guessed from an empty tax-id box
// would either demand an EIN of a business that has none, or quietly file the
// permanent one-message-a-second registration for a business that does not
// need it.
//
// Nothing here decides anything: which fields, what counts as complete, and
// what the narrow path costs all come from the contract, so this page and the
// route and the filing cannot disagree. Filing is its own button, because it
// is the only thing in this product that costs money the moment it is pressed.
const BusinessRecordForm = ({ line, flash }) => {
  // Read once, from the window the bridge installed before this page mounted.
  const API = React.useMemo(() => window.__businessRecord, []);
  const [record, setRecord] = React.useState(null);
  // null = nobody has answered. Seeded by the server for a record on file.
  const [path, setPath] = React.useState(null);
  const [asking, setAsking] = React.useState(false);
  const [problems, setProblems] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [arm, setArm] = React.useState(false);
  // A read that failed is its own state -- never an empty record, and never the
  // one-time question asked over a record that may well be on file.
  const [readFailed, setReadFailed] = React.useState(null);
  const owner = window.canDo ? window.canDo("team") : false;

  const load = (isOn = () => true) => API.read().then((r) => {
    if (!isOn()) return;
    if (!r.ok) { setReadFailed(r.message || "The record could not be read."); return; }
    setReadFailed(null);
    // No website is guessed. Left empty, the filing names the page this
    // product publishes for the workspace (/b/<slug>), as the field's hint
    // says. The guess this replaced was saved as the website and filed with
    // the carriers: the opt-in page, of whichever workspace sorted first.
    setRecord(r.record ?? API.empty({ email: window.__ME?.email ?? "" }));
    setPath(r.path ?? null);
    setProblems(r.problems || {});
  });

  React.useEffect(() => {
    let on = true;
    load(() => on);
    return () => { on = false; };
  }, [API]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!record && readFailed) {
    return <window.FailedRead kind="line" what="the business on record" why={readFailed} body="Nothing was changed. Retry reads it again." onRetry={() => { setReadFailed(null); load(); }} testid="business-record-failed" />;
  }
  if (!record) return <div className="set-row"><div className="set-row-info"><span className="set-row-hint">Reading what is on record…</span></div></div>;

  // A registration already with the carriers. It cannot be withdrawn, so the
  // answer stops being a choice and becomes a fact — one that can still be
  // changed, at the price of a second filing.
  const filedPath = line && line.sms_state && line.sms_state !== "none" && line.sms_state !== "needs_record"
    ? (line.reg_sole_prop ? "sole_proprietor" : "standard")
    : null;

  const set = (name, value) => setRecord((r) => ({ ...r, [name]: value }));
  // Picking the narrow path drops the tax id from the form, the same way the
  // save drops it from the row: a leftover value would keep failing a format
  // check on a box this path does not render.
  const choose = (p) => { setRecord((r) => API.forPath(r, p)); setProblems({}); setPath(p); setAsking(false); };
  const save = async () => {
    if (!owner) return;
    const found = API.problems(record, path);
    setProblems(found);
    // Each box says what it needs; the toast only counts them.
    const count = Object.keys(found).length;
    if (count) { flash({ tone: "warn", msg: <>Not saved — {count === 1 ? "1 field needs" : `${count} fields need`} a look.</> }); return; }
    setBusy(true);
    const r = await API.save(record, path);
    setBusy(false);
    // A saved record is good news, in the ok tone: it used to arrive as a red
    // toast. A refusal marks every field the route named, under its box.
    if (!r.ok) { setProblems(r.problems || {}); flash(window.refusalToast(r, "Not saved")); return; }
    flash({ msg: <>{r.message}</> });
  };
  const file = async () => {
    if (!owner) return;
    setBusy(true);
    const r = await API.register(line.id);
    setBusy(false);
    setArm(false);
    flash(r.ok ? { msg: <>{r.message}</> } : window.refusalToast(r, "Not filed"));
  };

  const head = (
    <div className="set-row-info">
      <span className="set-row-label">Your business, as the carriers need it</span>
      <span className="set-row-hint">{API.line(record.legal_name ? record : null)} The phone carriers ask this of every business before they let a number send texts. It is asked once and reused.</span>
    </div>
  );

  // The fork. Shown until it is answered, and again when an owner reopens it.
  if (path === null || asking) {
    return (
      <div className="set-row set-row-stack biz" data-testid="business-record">
        {head}
        <div className="biz-group" data-testid="biz-fork">
          <div className="biz-group-head">
            <span className="biz-group-title">{API.question.title}</span>
            <span className="biz-group-sub">{API.question.sub}</span>
          </div>
          {owner ? (
            <div className="biz-choices">
              {API.paths.map((p) => (
                <button
                  key={p}
                  className={`biz-choice${p === path ? " biz-choice-on" : ""}`}
                  onClick={() => choose(p)}
                  disabled={busy}
                  data-testid={`biz-path-${p}`}
                >
                  <span className="biz-choice-label">{API.pathWords[p].choice}</span>
                  <span className="biz-hint">{API.pathWords[p].sub}</span>
                </button>
              ))}
            </div>
          ) : (
            <span className="set-row-hint">An owner answers this.</span>
          )}
          <span className="biz-hint">{API.question.nudge}</span>
          <ul className="biz-limits" data-testid="biz-limits">
            {API.limits().map((l) => <li key={l}>{l}</li>)}
          </ul>
          {filedPath && (
            <span className="set-row-hint">
              A registration is already filed as {API.pathWords[filedPath].filed.toLowerCase()}. It cannot be withdrawn — changing this answer means a second filing, and a second fee.
            </span>
          )}
          {asking && <button className="cl-bucket-link" onClick={() => setAsking(false)} data-testid="biz-fork-back">Back to the form</button>}
        </div>
      </div>
    );
  }

  const words = API.groupsFor(path);
  const fields = API.fieldsFor(path);
  const groups = ["business", "address", "contact"];
  const ready = Object.keys(API.problems(record, path)).length === 0;
  return (
    <div className="set-row set-row-stack biz" data-testid="business-record">
      {head}

      <div className="biz-answer" data-testid="biz-answer">
        <span className="biz-hint">{API.pathWords[path].filed}. {API.pathWords[path].sub}</span>
        {owner && <button className="cl-bucket-link" onClick={() => setAsking(true)} disabled={busy} data-testid="biz-path-change">Not right?</button>}
      </div>

      {groups.map((g) => {
        const mine = fields.filter((f) => f.group === g);
        if (!mine.length) return null;
        return (
          <div className="biz-group" key={g}>
            <div className="biz-group-head">
              <span className="biz-group-title">{words[g].title}</span>
              <span className="biz-group-sub">{words[g].sub}</span>
            </div>
            <div className="biz-fields">
              {mine.map((f) => {
                const problem = problems[f.name] || null;
                const problemId = `biz-${f.name}-problem`;
                return (
                  <label className="biz-field" key={f.name} data-testid={`biz-${f.name}`}>
                    <span className="biz-label">{f.label}{f.required ? "" : <span className="dim"> · optional</span>}</span>
                    {f.options ? (
                      <select className={`biz-input${problem ? " biz-bad" : ""}`} value={record[f.name] ?? ""} disabled={!owner || busy} aria-invalid={problem ? true : undefined} aria-describedby={problem ? problemId : undefined} onChange={(e) => set(f.name, e.target.value)}>
                        {f.options.map((o) => <option key={o} value={o}>{API.optionWords(o)}</option>)}
                      </select>
                    ) : (
                      <input
                        className={`biz-input${problem ? " biz-bad" : ""}`}
                        value={record[f.name] ?? ""}
                        placeholder={f.placeholder || ""}
                        disabled={!owner || busy}
                        aria-invalid={problem ? true : undefined}
                        aria-describedby={problem ? problemId : undefined}
                        onChange={(e) => set(f.name, e.target.value)}
                      />
                    )}
                    {problem ? <window.FieldError id={problemId} message={problem} testid={problemId} /> : f.hint ? <span className="biz-hint">{f.hint}</span> : null}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Save and File are the form's acts: a role that may not press them sees them gated, saying why, and the form
          says why once below. They were hidden under a sentence of the form's own (the one gate). */}
        <div className="bc-chips">
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy} data-testid="biz-save" {...window.gate("team", "fill in the business record")}>{busy ? "Saving…" : "Save"}</button>
          {/*
            Not on a line the carriers SENT BACK. Resubmitting one is support's action
            (gate 6), so this button could only be refused there -- a dead button on the
            row a person opens straight after being told their filing was rejected.
            Saving their corrections is still theirs, and is what unblocks it.
          */}
          {ready && line && !arm && line.sms_state !== "rejected" && (
            <button className="btn btn-sm" onClick={() => setArm(true)} disabled={busy} data-testid="biz-file" {...window.gate("team", "file with the carriers")}>File with the carriers</button>
          )}
          {line && line.sms_state === "rejected" && (
            <span className="set-row-hint" data-testid="biz-rejected">Save your corrections here — Chanlytics sends the registration back to the carriers for you, at no cost.</span>
          )}
          {arm && (
            <Confirm question="File with the carriers?" detail={API.costWords[path]} yes="Yes, file it" no="Not yet" busy={busy} onYes={file} onNo={() => setArm(false)} testid="biz-file" />
          )}
        </div>
      {!owner && <span className="set-row-hint">{window.gateTitle("team", "fill in the business record")}</span>}
    </div>
  );
};

window.BusinessRecordForm = BusinessRecordForm;
