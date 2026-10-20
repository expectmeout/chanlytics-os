/**
 * Add people, a list (import-sheet.tsx draws it): a business's own client list (a Booksy or Square export) read in the
 * browser, matched, counted and written in parts of fifty through the owner's door (importPeople), as the Import sheet
 * did (moved whole from legacy/pages/people-import.jsx, decision 0015). Nothing is written until the owner has seen the
 * counts; the door fills only what is empty and records no yes.
 *
 * Where the rows come from (the import frame, which Leads' Import leads draws too), then the file read with its line
 * and a taste of it, then what the import came to, each in the steady sheet's one room (Ruben, 20 Oct 2026: A list
 * dropped the switch 202px). The reader is contracts' (csv.ts). The door answers each part's skipped and failed lines
 * counted within the part; they are said here as the file's own lines. A part the door refuses before any went says so
 * on the line, over the preview; one that stops the import after others went says where, over what went in, with the
 * rest one press away (Try the other N).
 */
import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { formatPhoneDisplay } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { importPeople } from "../people-detail";
import { ImportFile, ImportSource, ImportTaste } from "./frame";
import type { Flash } from "../types";
import { plImportColumnWords, plImportHeads, plImportPlan, plImportReadWords } from "./plan";
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

/** What one more run of the import adds to what went before it (Try the other N, after a stop). */
const plImportMore = (was: Totals, now: Totals): Totals => ({
  added: was.added + now.added,
  existed: was.existed + now.existed,
  emails_set: was.emails_set + now.emails_set,
  skipped: [...was.skipped, ...now.skipped].sort((a, b) => a.line - b.line),
  failed: [...was.failed, ...now.failed],
});

/** The lines the door skipped or refused, under their heading, the first few, and how many more. */
function importLines<T extends { line: number }>(
  heading: string,
  list: T[],
  testid: string,
  wordsOf: (l: T) => string,
): ReactNode {
  if (!list.length) return null;
  return (
    <>
      <p className="pl-import-lines-head">{heading}</p>
      <ul className="pl-import-lines" data-testid={testid}>
        {list.slice(0, PL_IMPORT_SAID).map((l, k) => (
          <li key={`${l.line}:${k}`}>
            <span>Line {l.line}:</span> <span>{wordsOf(l)}</span>
          </li>
        ))}
        {list.length > PL_IMPORT_SAID && <li>and {(list.length - PL_IMPORT_SAID).toLocaleString()} more</li>}
      </ul>
    </>
  );
}

/** What was read, before anything is written: a taste of the rows under each column's own word, and how many more. */
function previewOf(plan: ImportPlan, readable: ImportRow[], taste: ImportRow[]) {
  return (
    <ImportTaste
      columns={plan.header ? null : plImportColumnWords(plan)}
      heads={plImportHeads(plan)}
      rows={taste.map((p) => ({
        key: p.line,
        cells: [
          p.name || "—",
          <span key="phone" className="tabular">
            {p.phone ? plImportPhone(p.phone) : "—"}
          </span>,
          p.email || "—",
        ],
      }))}
      more={readable.length - taste.length}
      testid="import"
    />
  );
}

/** What went in: how many, what else came of it, and the lines that did not; with what is left after a stop. */
function summaryOf(result: Totals, left: number | null) {
  const n = (k: number) => k.toLocaleString();
  return (
    <>
      <div className="pl-import-summary" data-testid="import-summary">
        <p className="pl-import-total">
          <span className="pl-import-tick" aria-hidden="true">
            <Icon name="check" size={14} />
          </span>
          {n(result.added)} {result.added === 1 ? "person" : "people"} added
        </p>
        <div className="pl-import-nums" data-testid="import-counts">
          <p>
            <b>{n(result.existed)}</b> already here
          </p>
          <p>
            <b>{n(result.emails_set)}</b> {result.emails_set === 1 ? "email" : "emails"} added
          </p>
          {left === null ? (
            <p>
              <b>{n(result.skipped.length)}</b> skipped
            </p>
          ) : (
            <p>
              <b>{n(left)}</b> not tried yet
            </p>
          )}
        </div>
      </div>
      {importLines("Skipped", result.skipped, "import-skipped", (s) => s.reason)}
      {importLines("Could not be added", result.failed, "import-failed", (f) => f.message)}
    </>
  );
}

/** The parts of the file from one row on, one at a time, through the owner's door: the totals, and where it stopped. */
async function sendParts(
  plan: ImportPlan,
  readable: ImportRow[],
  run: { from: number; importId: string; first: boolean },
  progress: (p: { done: number; total: number }) => void,
): Promise<{ totals: Totals; sent: number; stopped: string | null; at: number }> {
  const totals: Totals = {
    added: 0,
    existed: 0,
    emails_set: 0,
    // The rows the door was never sent, having neither a number nor an address: said once, with the first run.
    skipped: run.first
      ? plan.people
          .filter((p) => !p.phone && !p.email)
          .map((p) => ({ line: p.line, reason: "No number and no address." }))
      : [],
    failed: [],
  };
  // The door's lines are counted from 1 within the part; the file's line is the row's own.
  const lineOf = (from: number, n: number) => {
    const at = readable[from + n - 1];
    return at ? at.line : n;
  };
  let sent = 0;
  // However it ends, the lines skipped are said in the file's order.
  const end = (stopped: string | null, at: number) => {
    totals.skipped.sort((a, b) => a.line - b.line);
    return { totals, sent, stopped, at };
  };
  for (let i = run.from; i < readable.length; i += PL_IMPORT_PART) {
    progress({ done: i, total: readable.length });
    const r = await importPeople({
      import_id: run.importId,
      rows: plImportPartOf(readable.slice(i, i + PL_IMPORT_PART)),
    });
    if (!r.ok) {
      const message = r.message || "The import could not go on.";
      return end(`Stopped at line ${readable[i]?.line}: ${message}`, i);
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
      const at = last ? readable.findIndex((p) => p.line === last.line) : -1;
      return end(
        last ? `Stopped at line ${last.line}: ${last.message}` : "The import stopped.",
        at < 0 ? Math.min(i + PL_IMPORT_PART, readable.length) : at,
      );
    }
  }
  return end(null, readable.length);
}

/** The import's own state: the rows read, the plan, the parts sent, what they came to, and where they stopped. */
export function useImport({ flash }: { flash: Flash | null }) {
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Totals | null>(null);
  const [stopped, setStopped] = useState<{ at: number; words: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importId = useRef<string | null>(null);
  // The rows the door can take: a number or an address. The rest are skipped here and said with the door's.
  const readable = useMemo(() => (plan ? plan.people.filter((p) => p.phone || p.email) : []), [plan]);
  const read = (t: string, fileName: string | null = null) => {
    setPlan(plImportPlan(t));
    setFile(fileName);
    setResult(null);
    setStopped(null);
    setError(null);
    importId.current = null;
  };
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    // The same file chosen again after a Change is a choice too.
    e.target.value = "";
    if (!f) return;
    const r = new FileReader();
    r.onload = () => read(typeof r.result === "string" ? r.result : "", f.name);
    r.readAsText(f);
  };
  // Back to where the rows came from: what was pasted is still there.
  const change = () => {
    setPlan(null);
    setFile(null);
    setResult(null);
    setStopped(null);
    setError(null);
  };
  const run = async () => {
    if (busy || !readable.length || !plan) return;
    if (!importId.current) importId.current = plImportId();
    const from = stopped ? stopped.at : 0;
    setBusy(true);
    setError(null);
    const r = await sendParts(plan, readable, { from, importId: importId.current, first: !stopped }, setProgress);
    setProgress(null);
    setBusy(false);
    // Refused before any of this run went: the words on the line; the preview, or what went before, stays as it was.
    if (!r.sent) {
      if (stopped && r.stopped) setStopped({ at: stopped.at, words: r.stopped });
      else setError(r.stopped);
      return;
    }
    setResult(stopped && result ? plImportMore(result, r.totals) : r.totals);
    setStopped(r.stopped ? { at: r.at, words: r.stopped } : null);
    if (flash && (r.totals.added || r.totals.existed)) {
      flash({
        msg: (
          <>
            Imported <b>{r.totals.added.toLocaleString()}</b> new {r.totals.added === 1 ? "person" : "people"}
            {r.totals.existed ? `, ${r.totals.existed.toLocaleString()} already here` : ""}
          </>
        ),
      });
    }
  };
  return { text, setText, plan, file, busy, progress, result, stopped, error, readable, read, onFile, change, run };
}

export type AddList = ReturnType<typeof useImport>;

/** The line under the file: the rows going in, what stopped them, why none can go, or how many can. */
function importLine(list: AddList): ReactNode {
  const { plan, readable, progress, stopped, error } = list;
  if (list.busy) {
    const total = progress ? progress.total : readable.length;
    const done = progress ? Math.min(progress.done + PL_IMPORT_PART, total) : 0;
    return (
      <p className="pl-add-line" data-tone="going" role="status" data-testid="import-progress">
        <span>
          Importing <b>{done.toLocaleString()}</b> of {total.toLocaleString()}
        </span>
        <progress className="pl-add-progress" value={done} max={Math.max(total, 1)} />
      </p>
    );
  }
  const bad = stopped ? stopped.words : error;
  if (bad)
    return (
      <p className="pl-add-line" data-tone="bad" id="people-import-problem" role="alert" data-testid="import-error">
        <Icon name="alert" size={14} />
        <span>{bad}</span>
      </p>
    );
  if (!plan) return null;
  const none =
    plan.counts.rows === 0
      ? "No rows were read from that."
      : !readable.length
        ? "No row has a number or an email."
        : null;
  if (none)
    return (
      <p className="pl-add-line" data-tone="warn" role="status" data-testid="import-counts">
        <Icon name="alert" size={14} />
        <span>{none}</span>
      </p>
    );
  return (
    <p className="pl-add-line" data-tone="ok" data-testid="import-counts">
      <span className="pl-add-dot" aria-hidden="true" />
      <span>{plImportReadWords(plan.counts)}</span>
    </p>
  );
}

/** Where the rows come from: a file chosen, or rows pasted, read as they land (the import frame). */
function sourceFields(list: AddList): ReactNode {
  return (
    <ImportSource
      words={{
        file: "Choose a file",
        fileHint: "A CSV from your booking app, or a spreadsheet",
        paste: "Or paste the rows",
        placeholder: "Name, Mobile, Email\nAna Ruiz, (646) 555-0101, ana@example.com",
        read: "Read",
      }}
      text={list.text}
      busy={list.busy}
      onFile={list.onFile}
      onText={list.setText}
      onRead={(t) => list.read(t)}
      testid="import"
    />
  );
}

/** The import's body: where the rows come from; the file, its line and a taste of it; or what the import came to. */
export function listBody(list: AddList): ReactNode {
  const { plan, readable, result, stopped } = list;
  if (!plan)
    return (
      <>
        {sourceFields(list)}
        <p className="pl-add-line">Nothing here is overwritten, and no one is signed up.</p>
      </>
    );
  if (result && !stopped) return summaryOf(result, null);
  return (
    <>
      <ImportFile
        name={list.file ?? "Pasted rows"}
        rows={plan.counts.rows}
        onChange={list.busy || result ? null : list.change}
        testid="import"
      />
      {importLine(list)}
      {result && stopped
        ? summaryOf(result, readable.length - stopped.at)
        : previewOf(plan, readable, readable.slice(0, PL_IMPORT_TASTE))}
    </>
  );
}
