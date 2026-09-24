/* global React */
// Import people: a business's own client list (a Booksy or Square export) read in the browser, matched, counted and
// written in parts of fifty through the owner's door (window.__importPeople), on the record kit's sheet
// (components/record-sheet.jsx). Nothing is written until the owner has seen the counts; the door fills only what is
// empty and records no yes. People (clients-a.jsx) opens it from its Import button and its phone menu, for the owner.
//
// The reader is contracts' (csv.ts), published as window.__csvImport by seed-globals.ts: parseCsv, matchColumns,
// importRowsOf, importCounts. The door answers each part's skipped and failed lines counted within the part; they are
// said here as the file's own lines. A refusal is said by the Save, as the deal sheet says its own (the sheet's foot);
// a part the door stops ends the import there, and the summary says what went through before it.

const PL_IMPORT_PART = 50;
// Rows drawn before the import, as a taste of what was read.
const PL_IMPORT_TASTE = 5;
// Lines listed under the summary before "and N more".
const PL_IMPORT_SAID = 8;

// The file as a plan: its rows, where the columns are, the people as the door takes them, and the counts the owner sees
// before anything is written. Pure, and on the window for the tests.
const plImportPlan = (text) => {
  const C = window.__csvImport;
  const rows = C.parseCsv(text || "");
  const { columns, header } = C.matchColumns(rows);
  const people = C.importRowsOf(rows, columns, header);
  return { rows, columns, header, headers: header ? rows[0] : [], people, counts: C.importCounts(people) };
};

const plImportCountWords = (c) => {
  const n = (k, one, many) => `${k.toLocaleString()} ${k === 1 ? one : many}`;
  return `${n(c.rows, "row", "rows")} · ${c.withPhone.toLocaleString()} with a number · ${c.withEmail.toLocaleString()} with an email · ${c.unreadable.toLocaleString()} with neither`;
};

// Which column was taken for what: the header's own word for it, or that none was found.
const plImportColumnWords = (plan) => {
  if (!plan.header) return "No header row: the columns were told apart by what is in them.";
  const said = (i) => (i === null ? "not found" : `“${String(plan.headers[i] || "").trim()}”`);
  return `Columns: name ${said(plan.columns.name)}, mobile ${said(plan.columns.phone)}, email ${said(plan.columns.email)}.`;
};

// The one id of the whole file: the ledger reads its parts as one import by it.
const plImportId = () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`.replace(/\./g, ""));

// A part as the door takes it: only what each row has.
const plImportPartOf = (people) => people.map((p) => ({ ...(p.name ? { name: p.name } : {}), ...(p.phone ? { phone: p.phone } : {}), ...(p.email ? { email: p.email } : {}) }));

const plImportPhone = (e164) => (window.__phoneDisplay && window.__phoneDisplay(e164)) || e164;

const PeopleImportSheet = ({ onClose, onDone = null, flash = null }) => {
  const [text, setText] = React.useState("");
  const [plan, setPlan] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);
  // The rows the door can take: a number or an address. The rest are skipped here and said with the door's.
  const readable = plan ? plan.people.filter((p) => p.phone || p.email) : [];
  const read = (t) => {
    setPlan(plImportPlan(t));
    setResult(null);
    setError(null);
  };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => read(String(r.result || ""));
    r.readAsText(f);
  };
  const run = async () => {
    if (busy || !readable.length || !window.__importPeople) return;
    setBusy(true);
    setError(null);
    const importId = plImportId();
    const totals = {
      added: 0,
      existed: 0,
      emails_set: 0,
      skipped: plan.people.filter((p) => !p.phone && !p.email).map((p) => ({ line: p.line, reason: "No number and no address." })),
      failed: [],
    };
    // The door's lines are counted from 1 within the part; the file's line is the row's own.
    const lineOf = (from, n) => { const at = readable[from + n - 1]; return at ? at.line : n; };
    let sent = 0;
    let stopped = null;
    for (let i = 0; i < readable.length; i += PL_IMPORT_PART) {
      setProgress({ done: i, total: readable.length });
      const r = await window.__importPeople({ import_id: importId, rows: plImportPartOf(readable.slice(i, i + PL_IMPORT_PART)) });
      if (!r.ok) { stopped = r.message || "The import could not go on."; break; }
      sent += 1;
      const d = r.data;
      totals.added += d.added;
      totals.existed += d.existed;
      totals.emails_set += d.emails_set;
      for (const s of d.skipped) totals.skipped.push({ line: lineOf(i, s.line), reason: s.reason });
      for (const f of d.failed) totals.failed.push({ line: lineOf(i, f.line), message: f.message });
      if (d.stopped) {
        const last = totals.failed[totals.failed.length - 1];
        stopped = last ? `Stopped at line ${last.line}: ${last.message}` : "The import stopped.";
        break;
      }
    }
    totals.skipped.sort((a, b) => a.line - b.line);
    setProgress(null);
    setBusy(false);
    if (stopped) setError(stopped);
    // A refused first part leaves the preview, with the refusal by the Save; a summary is drawn once a part went through.
    if (!sent) return;
    setResult(totals);
    if (flash && (totals.added || totals.existed)) {
      flash({ msg: <>Imported <b>{totals.added.toLocaleString()}</b> new {totals.added === 1 ? "person" : "people"}{totals.existed ? `, ${totals.existed.toLocaleString()} already here` : ""}</> });
    }
    if (onDone) onDone(totals);
  };
  const saveLabel = `Import ${readable.length.toLocaleString()} ${readable.length === 1 ? "person" : "people"}`;
  const savingLabel = progress ? `Importing ${Math.min(progress.done + PL_IMPORT_PART, progress.total).toLocaleString()} of ${progress.total.toLocaleString()}…` : "Importing…";
  const taste = readable.slice(0, PL_IMPORT_TASTE);
  const lines = (list, testid, wordsOf) => (
    <ul className="pl-import-lines" data-testid={testid}>
      {list.slice(0, PL_IMPORT_SAID).map((l, k) => <li key={`${l.line}:${k}`}>Line {l.line}: {wordsOf(l)}</li>)}
      {list.length > PL_IMPORT_SAID && <li>and {(list.length - PL_IMPORT_SAID).toLocaleString()} more</li>}
    </ul>
  );
  return (
    <window.RecordSheet
      id="people-import"
      className="pl-import-sheet"
      title="Import people"
      sub="A spreadsheet of your clients: names, mobile numbers, emails. Nothing already here is overwritten, and nobody is signed up for anything."
      onClose={onClose}
      closeLabel={result ? "Done" : "Cancel"}
      onSave={plan && readable.length && !result ? run : null}
      saveLabel={saveLabel}
      saving={busy}
      savingLabel={savingLabel}
      foot={error || result ? (
        <div className="pl-import-foot">
          <window.FieldError id="people-import-problem" message={error} testid="import-error" />
          {result ? <button type="button" className="btn btn-sm" onClick={onClose} data-testid="import-done">Done</button> : null}
        </div>
      ) : null}
      testid="people-import-sheet"
    >
      <div className="pl-import">
        {!result && (
          <>
            <div className="rec-field">
              <label>
                <span className="rec-field-label">Choose a CSV file</span>
                <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} disabled={busy} data-testid="import-file" />
              </label>
            </div>
            <div className="rec-field">
              <label>
                <span className="rec-field-label">Or paste the rows</span>
                <textarea className="rec-input" rows={5} value={text} disabled={busy} placeholder={"Name,Mobile,Email\nAna Ruiz,(646) 555-0101,ana@example.com"} onChange={(e) => setText(e.target.value)} data-testid="import-paste" />
              </label>
              <button type="button" className="btn btn-sm pl-import-read" disabled={busy || !text.trim()} onClick={() => read(text)} data-testid="import-read">Read the rows</button>
            </div>
          </>
        )}
        {plan && !result && (
          <div className="pl-import-preview" data-testid="import-preview">
            <p className="pl-import-counts" data-testid="import-counts">{plImportCountWords(plan.counts)}</p>
            <p className="pl-import-hint" data-testid="import-columns">
              {plan.counts.rows === 0
                ? "No rows were read from that."
                : plImportColumnWords(plan)}
              {plan.counts.unreadable ? ` ${plan.counts.unreadable.toLocaleString()} ${plan.counts.unreadable === 1 ? "row has" : "rows have"} neither a number nor an address and will be skipped.` : ""}
              {plan.counts.rows > 0 && readable.length === 0 ? " There is nothing to import." : ""}
            </p>
            {taste.length > 0 && (
              <table className="pl-import-table">
                <thead><tr><th>Name</th><th>Mobile</th><th>Email</th></tr></thead>
                <tbody>
                  {taste.map((p) => (
                    <tr key={p.line}><td>{p.name || "—"}</td><td className="tabular">{p.phone ? plImportPhone(p.phone) : "—"}</td><td>{p.email || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {readable.length > taste.length && <p className="pl-import-hint">and {(readable.length - taste.length).toLocaleString()} more</p>}
          </div>
        )}
        {result && (
          <div className="pl-import-summary" data-testid="import-summary">
            <p className="pl-import-counts">
              <b>{result.added.toLocaleString()}</b> new · <b>{result.existed.toLocaleString()}</b> already here · <b>{result.emails_set.toLocaleString()}</b> {result.emails_set === 1 ? "email" : "emails"} added · <b>{result.skipped.length.toLocaleString()}</b> skipped
              {result.failed.length ? <> · <b>{result.failed.length.toLocaleString()}</b> could not be added</> : null}
            </p>
            {result.skipped.length > 0 && lines(result.skipped, "import-skipped", (s) => s.reason)}
            {result.failed.length > 0 && lines(result.failed, "import-failed", (f) => f.message)}
          </div>
        )}
      </div>
    </window.RecordSheet>
  );
};

Object.assign(window, { PeopleImportSheet, plImportPlan, plImportCountWords, plImportColumnWords });
