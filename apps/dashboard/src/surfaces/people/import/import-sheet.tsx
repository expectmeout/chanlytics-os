/**
 * Add people: the page's one act (Ruben, 10 Oct 2026: Add a person and Import were two doors to one job), on the record
 * kit's sheet, at every width. One person: a mobile number and, if known, a name, through the door the calendar sweep
 * already uses (plAddPerson); a number already here opens that person rather than making a second. A list: a business's
 * own client list (a Booksy or Square export) read in the browser, matched, counted and written in parts of fifty
 * through the owner's door (importPeople), as the Import sheet did (moved whole from legacy/pages/people-import.jsx,
 * decision 0015). Nothing is written until the owner has seen the counts; the door fills only what is empty and records
 * no yes. The choice between the two is the owner's alone, whose door the import is; anyone else adds one person.
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
import { RecordToggleGroup } from "../../kit/record/field";
import { RecordSheet } from "../../kit/record/sheet";
import { plAddPerson, plAddedWords } from "../lists/doors";
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

/** The two ways in: one person, or a list as a file. */
type AddWay = "one" | "list";
const ADD_WAYS: { value: AddWay; label: string }[] = [
  { value: "one", label: "One person" },
  { value: "list", label: "A list (CSV)" },
];
const ADD_SUBS: Record<AddWay, string> = {
  one: "A mobile number and, if you know it, a name. A number that is already here opens that person instead of adding them twice.",
  list: "A spreadsheet of your clients: names, mobile numbers, emails. Nothing already here is overwritten, and nobody is signed up for anything.",
};

/** One person's two fields: the name, if known, and the mobile number, which the door needs. */
function oneFields(p: {
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  busy: boolean;
  error: string | null;
  submit: () => void;
}): ReactNode {
  const { name, setName, phone, setPhone, busy, error, submit } = p;
  return (
    <>
      <div className="rec-field">
        <label>
          <span className="rec-field-label">Name (optional)</span>
          <input
            className="rec-input"
            value={name}
            maxLength={80}
            autoComplete="name"
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            data-testid="add-person-name"
          />
        </label>
      </div>
      <div className="rec-field">
        <label>
          <span className="rec-field-label">Mobile number</span>
          <input
            className="rec-input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            maxLength={24}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "add-person-error" : undefined}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            data-testid="add-person-phone"
          />
        </label>
      </div>
    </>
  );
}

/** The add's own state: the two fields, its save and its refusal. Added, the sheet closes and their page opens. */
function useAddOne({
  onClose,
  onAdded,
  flash,
}: {
  onClose: () => void;
  onAdded: (id: string) => void;
  flash: Flash | null;
}) {
  const [name, setName] = useState("");
  const [phone, setPhoneNow] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setPhone = (v: string) => {
    setPhoneNow(v);
    setError(null);
  };
  const submit = async () => {
    if (busy) return;
    // Add stands from the first draw, so the sheet says how it ends; pressed with no number, it says what is missing.
    if (!phone.trim()) {
      setError("Their mobile number is the one thing needed.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await plAddPerson({ name, phone });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (flash) flash({ msg: plAddedWords({ name, phone }, r.existed) });
    onClose();
    onAdded(r.id);
  };
  return { name, setName, phone, setPhone, busy, error, submit };
}

/** The import's own state: the rows read, the plan, the parts sent and what they came to. */
function useImport({ flash }: { flash: Flash | null }) {
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
  };
  return { text, setText, plan, busy, progress, result, error, readable, read, onFile, run };
}

/** What the sheet's Save says while it works: the import's part counted, or the add. */
function savingWords(listing: boolean, progress: { done: number; total: number } | null): string {
  if (!listing) return "Adding…";
  if (!progress) return "Importing…";
  const done = Math.min(progress.done + PL_IMPORT_PART, progress.total).toLocaleString();
  return `Importing ${done} of ${progress.total.toLocaleString()}…`;
}

type AddOne = ReturnType<typeof useAddOne>;
type AddList = ReturnType<typeof useImport>;

/** What the sheet's foot says and does for the way chosen: its Save, its words while it works, and its refusal. */
function saveOf(listing: boolean, one: AddOne, list: AddList) {
  if (!listing) return { onSave: one.submit, label: "Add", saving: one.busy, error: one.error, done: false };
  const n = list.readable.length;
  return {
    onSave: list.plan && n && !list.result ? list.run : null,
    label: `Import ${n.toLocaleString()} ${n === 1 ? "person" : "people"}`,
    saving: list.busy,
    error: list.error,
    done: !!list.result,
  };
}

/** Under the Save: the refusal, by the field it names, and once an import is done, Done. */
function footOf(listing: boolean, save: ReturnType<typeof saveOf>, onClose: () => void): ReactNode {
  if (!save.error && !save.done) return null;
  return (
    <div className="pl-import-foot">
      <FieldError
        id={listing ? "people-import-problem" : "add-person-error"}
        message={save.error}
        testid={listing ? "import-error" : "add-person-error"}
      />
      {save.done ? (
        <button type="button" className="btn btn-sm" onClick={onClose} data-testid="import-done">
          Done
        </button>
      ) : null}
    </div>
  );
}

/** The import's body: where the rows come from, what was read, and what the import came to. */
function listBody(list: AddList): ReactNode {
  const { plan, readable, result } = list;
  if (result) return summaryOf(result);
  return (
    <>
      {sourceFields(list)}
      {plan && previewOf(plan, readable, readable.slice(0, PL_IMPORT_TASTE))}
    </>
  );
}

export function PeopleAddSheet({
  onClose,
  onAdded,
  canImport,
  way: firstWay = "one",
  flash = null,
}: {
  onClose: () => void;
  onAdded: (id: string) => void;
  canImport: boolean;
  /** The way it opens on: one person, or a list (a door that asks for a client list opens it there). */
  way?: AddWay;
  flash?: Flash | null;
}) {
  const [way, setWay] = useState<AddWay>(firstWay);
  const one = useAddOne({ onClose, onAdded, flash });
  const list = useImport({ flash });
  const listing = canImport && way === "list";
  const save = saveOf(listing, one, list);
  return (
    <RecordSheet
      id="people-add"
      title="Add people"
      sub={ADD_SUBS[listing ? "list" : "one"]}
      onClose={onClose}
      closeLabel={save.done ? "Done" : "Cancel"}
      onSave={save.onSave}
      saveLabel={save.label}
      saving={save.saving}
      savingLabel={savingWords(listing, list.progress)}
      foot={footOf(listing, save, onClose)}
      className="pl-add"
      testid="people-add-sheet"
    >
      <div className="pl-import">
        {/* The choice is the owner's, whose door the import is; it stands down while a list goes in, and after. */}
        {canImport && !list.busy && !save.done ? (
          <RecordToggleGroup
            label="How to add them"
            value={way}
            options={ADD_WAYS}
            onChange={setWay}
            readOnly={one.busy}
            testid="people-add-way"
          />
        ) : null}
        {listing ? listBody(list) : oneFields(one)}
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
