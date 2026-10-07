/**
 * Import people: a business's own client list (a Booksy or Square export) read in the browser, matched, counted and
 * written in parts of fifty through the owner's door (importPeople), on the record kit's sheet (moved whole from
 * legacy/pages/people-import.jsx, decision 0015). Nothing is written until the owner has seen the counts; the door fills
 * only what is empty and records no yes. People opens it from its Import button and its phone menu, for the owner.
 *
 * The reader is contracts' (csv.ts). The door answers each part's skipped and failed lines counted within the part; they
 * are said here as the file's own lines. A refusal is said by the Save, as the deal sheet says its own (the sheet's foot);
 * a part the door stops, or refuses after others went through, ends the import at the line it began, and the summary says
 * what went through before it.
 */
import { useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { formatPhoneDisplay } from "@chanlytics/contracts";
import { FieldError } from "../../kit/field-error/field-error";
import { RecordSheet } from "../../kit/record/sheet";
import { importPeople } from "../people-detail";
import type { Flash } from "../types";
import { plImportColumnWords, plImportCountWords, plImportPlan } from "./plan";
import type { ImportPlan } from "./plan";

const PL_IMPORT_PART = 50;
/** Rows drawn before the import, as a taste of what was read. */
const PL_IMPORT_TASTE = 5;
/** Lines listed under the summary before "and N more". */
const PL_IMPORT_SAID = 8;

type ImportRow = ImportPlan["people"][number];

/** What an import came to: how many went in, and the lines the door skipped or could not add. */
interface Totals {
  added: number;
  existed: number;
  emails_set: number;
  skipped: { line: number; reason: string }[];
  failed: { line: number; message: string }[];
}

/** The one id of the whole file: the ledger reads its parts as one import by it. */
const plImportId = (): string =>
  window.crypto && window.crypto.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`.replace(/\./g, "");

/** A part as the door takes it: only what each row has. */
const plImportPartOf = (people: ImportRow[]) =>
  people.map((p) => ({
    ...(p.name ? { name: p.name } : {}),
    ...(p.phone ? { phone: p.phone } : {}),
    ...(p.email ? { email: p.email } : {}),
  }));

const plImportPhone = (e164: string): string => formatPhoneDisplay(e164) || e164;

/** The lines the door skipped or refused, the first few, and how many more. */
function importLines<T extends { line: number }>(list: T[], testid: string, wordsOf: (l: T) => string) {
  return (
    <ul className="pl-import-lines" data-testid={testid}>
      {list.slice(0, PL_IMPORT_SAID).map((l, k) => (
        <li key={`${l.line}:${k}`}>
          Line {l.line}: {wordsOf(l)}
        </li>
      ))}
      {list.length > PL_IMPORT_SAID && <li>and {(list.length - PL_IMPORT_SAID).toLocaleString()} more</li>}
    </ul>
  );
}

/** What was read, before anything is written: the counts, the columns, and a taste of the rows. */
function previewOf(plan: ImportPlan, readable: ImportRow[], taste: ImportRow[]) {
  return (
    <div className="pl-import-preview" data-testid="import-preview">
      <p className="pl-import-counts" data-testid="import-counts">
        {plImportCountWords(plan.counts)}
      </p>
      <p className="pl-import-hint" data-testid="import-columns">
        {plan.counts.rows === 0 ? "No rows were read from that." : plImportColumnWords(plan)}
        {plan.counts.unreadable
          ? ` ${plan.counts.unreadable.toLocaleString()} ${plan.counts.unreadable === 1 ? "row has" : "rows have"} neither a number nor an address and will be skipped.`
          : ""}
        {plan.counts.rows > 0 && readable.length === 0 ? " There is nothing to import." : ""}
      </p>
      {taste.length > 0 && (
        <table className="pl-import-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Mobile</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {taste.map((p) => (
              <tr key={p.line}>
                <td>{p.name || "—"}</td>
                <td className="tabular">{p.phone ? plImportPhone(p.phone) : "—"}</td>
                <td>{p.email || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {readable.length > taste.length && (
        <p className="pl-import-hint">and {(readable.length - taste.length).toLocaleString()} more</p>
      )}
    </div>
  );
}

/** What went in: the counts, and the lines that did not. */
function summaryOf(result: Totals) {
  return (
    <div className="pl-import-summary" data-testid="import-summary">
      <p className="pl-import-counts">
        <b>{result.added.toLocaleString()}</b> new · <b>{result.existed.toLocaleString()}</b>
        {" already here · "}
        <b>{result.emails_set.toLocaleString()}</b> {result.emails_set === 1 ? "email" : "emails"}
        {" added · "}
        <b>{result.skipped.length.toLocaleString()}</b> skipped
        {result.failed.length ? (
          <>
            {" · "}
            <b>{result.failed.length.toLocaleString()}</b> could not be added
          </>
        ) : null}
      </p>
      {result.skipped.length > 0 && importLines(result.skipped, "import-skipped", (s) => s.reason)}
      {result.failed.length > 0 && importLines(result.failed, "import-failed", (f) => f.message)}
    </div>
  );
}

/** The parts of the file, one at a time, through the owner's door: the totals, and where it stopped, if it did. */
async function sendParts(
  plan: ImportPlan,
  readable: ImportRow[],
  progress: (p: { done: number; total: number }) => void,
): Promise<{ totals: Totals; sent: number; stopped: string | null }> {
  const importId = plImportId();
  const totals: Totals = {
    added: 0,
    existed: 0,
    emails_set: 0,
    skipped: plan.people
      .filter((p) => !p.phone && !p.email)
      .map((p) => ({ line: p.line, reason: "No number and no address." })),
    failed: [],
  };
  // The door's lines are counted from 1 within the part; the file's line is the row's own.
  const lineOf = (from: number, n: number) => {
    const at = readable[from + n - 1];
    return at ? at.line : n;
  };
  let sent = 0;
  let stopped: string | null = null;
  for (let i = 0; i < readable.length; i += PL_IMPORT_PART) {
    progress({ done: i, total: readable.length });
    const r = await importPeople({ import_id: importId, rows: plImportPartOf(readable.slice(i, i + PL_IMPORT_PART)) });
    if (!r.ok) {
      // Refused after other parts went through: said at the line this part began, as a stopped part is, over the summary of
      // what went. Refused before anything went: the bare refusal by the Save, over the preview.
      const message = r.message || "The import could not go on.";
      stopped = sent > 0 ? `Stopped at line ${readable[i]?.line}: ${message}` : message;
      break;
    }
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
  return { totals, sent, stopped };
}

export function PeopleImportSheet({
  onClose,
  onDone = null,
  flash = null,
}: {
  onClose: () => void;
  onDone?: ((totals: Totals) => void) | null;
  flash?: Flash | null;
}) {
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The rows the door can take: a number or an address. The rest are skipped here and said with the door's.
  const readable = plan ? plan.people.filter((p) => p.phone || p.email) : [];
  const read = (t: string) => {
    setPlan(plImportPlan(t));
    setResult(null);
    setError(null);
  };
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => read(typeof r.result === "string" ? r.result : "");
    r.readAsText(f);
  };
  const run = async () => {
    if (busy || !readable.length || !plan) return;
    setBusy(true);
    setError(null);
    const { totals, sent, stopped } = await sendParts(plan, readable, setProgress);
    setProgress(null);
    setBusy(false);
    if (stopped) setError(stopped);
    // A refused first part leaves the preview, with the refusal by the Save; a summary is drawn once a part went through.
    if (!sent) return;
    setResult(totals);
    if (flash && (totals.added || totals.existed)) {
      flash({
        msg: (
          <>
            Imported <b>{totals.added.toLocaleString()}</b> new {totals.added === 1 ? "person" : "people"}
            {totals.existed ? `, ${totals.existed.toLocaleString()} already here` : ""}
          </>
        ),
      });
    }
    if (onDone) onDone(totals);
  };
  const saveLabel = `Import ${readable.length.toLocaleString()} ${readable.length === 1 ? "person" : "people"}`;
  const savingLabel = progress
    ? `Importing ${Math.min(progress.done + PL_IMPORT_PART, progress.total).toLocaleString()} of ${progress.total.toLocaleString()}…`
    : "Importing…";
  const taste = readable.slice(0, PL_IMPORT_TASTE);
  return (
    <RecordSheet
      id="people-import"
      title="Import people"
      sub="A spreadsheet of your clients: names, mobile numbers, emails. Nothing already here is overwritten, and nobody is signed up for anything."
      onClose={onClose}
      closeLabel={result ? "Done" : "Cancel"}
      onSave={plan && readable.length && !result ? run : null}
      saveLabel={saveLabel}
      saving={busy}
      savingLabel={savingLabel}
      foot={
        error || result ? (
          <div className="pl-import-foot">
            <FieldError id="people-import-problem" message={error} testid="import-error" />
            {result ? (
              <button type="button" className="btn btn-sm" onClick={onClose} data-testid="import-done">
                Done
              </button>
            ) : null}
          </div>
        ) : null
      }
      testid="people-import-sheet"
    >
      <div className="pl-import">
        {!result && sourceFields({ busy, text, setText, onFile, read })}
        {plan && !result && previewOf(plan, readable, taste)}
        {result && summaryOf(result)}
      </div>
    </RecordSheet>
  );
}

/** Where the rows come from: a file chosen, or pasted, and the button that reads them. */
function sourceFields(p: {
  busy: boolean;
  text: string;
  setText: (t: string) => void;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
  read: (t: string) => void;
}): ReactNode {
  const { busy, text, setText, onFile, read } = p;
  return (
    <>
      <div className="rec-field">
        <label>
          <span className="rec-field-label">Choose a CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={onFile}
            disabled={busy}
            data-testid="import-file"
          />
        </label>
      </div>
      <div className="rec-field">
        <label>
          <span className="rec-field-label">Or paste the rows</span>
          <textarea
            className="rec-input"
            rows={5}
            value={text}
            disabled={busy}
            placeholder={"Name,Mobile,Email\nAna Ruiz,(646) 555-0101,ana@example.com"}
            onChange={(e) => setText(e.target.value)}
            data-testid="import-paste"
          />
        </label>
        <button
          type="button"
          className="btn btn-sm pl-import-read"
          disabled={busy || !text.trim()}
          onClick={() => read(text)}
          data-testid="import-read"
        >
          Read the rows
        </button>
      </div>
    </>
  );
}
