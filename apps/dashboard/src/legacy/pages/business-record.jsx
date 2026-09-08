/* global React */
// Chanlytics — the business on record, as one form.
//
// Lives beside Settings › Integrations rather than inside it: this is the
// only place a workspace states its legal identity, and every carrier
// registration reads it. The fields, their words and their closed lists
// come from contracts (business-record.ts) through window.__businessRecord,
// so the form offers exactly what the carriers accept and nothing else.
//
// Opened from the Texting row, filled once, and reused by every later
// registration. Nothing here says "brand" or "campaign": the owner is
// telling us who they are, and what that is for is said in one line.
// Filing is its own button, because it is the only thing in this product
// that costs money the moment it is pressed.
const BusinessRecordForm = ({ line, flash }) => {
  // Read once, from the window the bridge installed before this page mounted.
  const API = React.useMemo(() => window.__businessRecord, []);
  const [record, setRecord] = React.useState(null);
  const [problems, setProblems] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [arm, setArm] = React.useState(false);
  const owner = window.canDo ? window.canDo("team") : false;

  React.useEffect(() => {
    let on = true;
    API.read().then((r) => {
      if (!on) return;
      setRecord(r.record ?? API.empty({ websiteUrl: window.location.origin + "/yes/" + (window.__WORKSPACES?.[0]?.slug ?? ""), email: window.__ME?.email ?? "" }));
      setProblems(r.problems || {});
    });
    return () => { on = false; };
  }, [API]);

  if (!record) return <div className="set-row"><div className="set-row-info"><span className="set-row-hint">Reading what is on record…</span></div></div>;

  const set = (name, value) => setRecord((r) => ({ ...r, [name]: value }));
  const save = async () => {
    const found = API.problems(record);
    setProblems(found);
    if (Object.keys(found).length) { flash({ msg: <>{Object.values(found)[0]}</> }); return; }
    setBusy(true);
    const r = await API.save(record);
    setBusy(false);
    flash({ msg: <>{r.message}</> });
  };
  const file = async () => {
    setBusy(true);
    const r = await API.register(line.id);
    setBusy(false);
    setArm(false);
    flash({ msg: <>{r.message}</> });
  };

  const groups = ["business", "address", "contact"];
  const ready = Object.keys(API.problems(record)).length === 0;
  return (
    <div className="set-row set-row-stack biz" data-testid="business-record">
      <div className="set-row-info">
        <span className="set-row-label">Your business, as the carriers need it</span>
        <span className="set-row-hint">{API.line(record.legal_name ? record : null)} The phone carriers ask this of every business before they let a number send texts. It is asked once and reused.</span>
      </div>

      {groups.map((g) => (
        <div className="biz-group" key={g}>
          <div className="biz-group-head">
            <span className="biz-group-title">{API.groups[g].title}</span>
            <span className="biz-group-sub">{API.groups[g].sub}</span>
          </div>
          <div className="biz-fields">
            {API.fields.filter((f) => f.group === g).map((f) => (
              <label className="biz-field" key={f.name} data-testid={`biz-${f.name}`}>
                <span className="biz-label">{f.label}{f.required ? "" : <span className="dim"> · optional</span>}</span>
                {f.options ? (
                  <select className="biz-input" value={record[f.name] ?? ""} disabled={!owner || busy} onChange={(e) => set(f.name, e.target.value)}>
                    {f.options.map((o) => <option key={o} value={o}>{API.optionWords(o)}</option>)}
                  </select>
                ) : (
                  <input
                    className={`biz-input${problems[f.name] ? " biz-bad" : ""}`}
                    value={record[f.name] ?? ""}
                    placeholder={f.placeholder || ""}
                    disabled={!owner || busy}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                )}
                {problems[f.name] ? <span className="biz-problem">{problems[f.name]}</span> : f.hint ? <span className="biz-hint">{f.hint}</span> : null}
              </label>
            ))}
          </div>
        </div>
      ))}

      {owner ? (
        <div className="bc-chips">
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy} data-testid="biz-save">{busy ? "Saving…" : "Save"}</button>
          {ready && line && !arm && (
            <button className="btn btn-sm" onClick={() => setArm(true)} disabled={busy} data-testid="biz-file">File with the carriers</button>
          )}
          {arm && (
            <span className="set-row-hint">
              Filing costs about $19 once and a few dollars a month, and cannot be undone.{" "}
              <button className="cl-bucket-link" onClick={file} disabled={busy} data-testid="biz-file-yes">Yes, file it</button>{" "}
              <button className="cl-bucket-link" onClick={() => setArm(false)}>Not yet</button>
            </span>
          )}
        </div>
      ) : (
        <span className="set-row-hint">An owner fills this in.</span>
      )}
    </div>
  );
};

window.BusinessRecordForm = BusinessRecordForm;
