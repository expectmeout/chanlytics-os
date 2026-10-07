/**
 * A list of your own (Reach out Part 7: J1-J12), moved from legacy/pages/reach-out/reach-out-leads.jsx (decision 0015):
 * Leads' *Import leads* (a file of the owner's own businesses, read here, every address checked first by the finder's own
 * check, as a search of its own) and the bulk bar's *Write to them* (the chosen leads as a search of their own, with the
 * reach-out sheet opened on it). A reach-out writes to a search, so both are one. Every reading of a file and every word is
 * contracts' (lead-import.ts), through Campaigns' reach-out reads (`reachOuts.lists`); the page mounts it with one hook,
 * useLeadLists, whose answer is the rail's door, the bar's act and the sheets they open.
 */
import { useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { leadsRoute } from "@chanlytics/contracts";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { ReachOutSheet } from "../../campaigns/reach-out/sheet";
import { Button } from "../../kit/button/button";
import { FieldError } from "../../kit/field-error/field-error";
import { ActWords } from "../../kit/head/act-words";
import { Icon } from "../../kit/icon/icon";
import { RecordSheet } from "../../kit/record/sheet";
import { canDo, gate, navigate } from "../../legacy-verbs";
import { PhoneSheetRow } from "../../people/sheets/phone-sheet";
import type { PeopleFlash } from "../../people/types";

type Lists = typeof reachOuts.lists;
type ImportPlan = ReturnType<Lists["planOf"]>;
type ImportRow = ImportPlan["rows"][number];

// Rows drawn before the import, as a taste of what was read.
const LL_TASTE = 5;

/** Where the rows come from: a file, or rows pasted and read. */
const LlImportPick = ({
  W,
  text,
  busy,
  onFile,
  onText,
  onRead,
}: {
  W: Lists["words"];
  text: string;
  busy: boolean;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onText: (text: string) => void;
  onRead: () => void;
}) => (
  <>
    <div className="rec-field">
      <label>
        <span className="rec-field-label">{W.file}</span>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={onFile}
          disabled={busy}
          data-testid="lead-import-file"
        />
      </label>
    </div>
    <div className="rec-field">
      <label>
        <span className="rec-field-label">{W.paste}</span>
        <textarea
          className="rec-input"
          rows={5}
          value={text}
          disabled={busy}
          placeholder={W.pastePlaceholder}
          onChange={(e) => onText(e.target.value)}
          data-testid="lead-import-paste"
        />
      </label>
      <button
        type="button"
        className="btn btn-sm pl-import-read"
        disabled={busy || !text.trim()}
        onClick={onRead}
        data-testid="lead-import-read"
      >
        {W.read}
      </button>
    </div>
  </>
);

/** What was read, before anything is written: the counts, where the columns are, a taste, the name, who they are. */
const LlImportPreview = ({
  L,
  plan,
  ready,
  name,
  asked,
  busy,
  onName,
  onAsked,
}: {
  L: Lists;
  plan: ImportPlan;
  ready: readonly ImportRow[];
  name: string;
  asked: string;
  busy: boolean;
  onName: (name: string) => void;
  onAsked: (asked: string) => void;
}) => (
  <div className="pl-import-preview" data-testid="lead-import-preview">
    <p className="pl-import-counts" data-testid="lead-import-counts">
      {L.countWords(plan.counts)}
    </p>
    <p className="pl-import-hint" data-testid="lead-import-columns">
      {plan.counts.rows === 0 ? "No rows were read from that." : L.columnWords(plan)} {L.words.costs}
    </p>
    {ready.length > 0 && (
      <table className="pl-import-table">
        <thead>
          <tr>
            <th>Business</th>
            <th>Email</th>
            <th>Website</th>
          </tr>
        </thead>
        <tbody>
          {ready.slice(0, LL_TASTE).map((r) => (
            <tr key={r.line}>
              <td>{r.name}</td>
              <td>{r.email}</td>
              <td>{r.website_host || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    {ready.length > LL_TASTE && <p className="pl-import-hint">and {(ready.length - LL_TASTE).toLocaleString()} more</p>}
    <div className="rec-field">
      <label>
        <span className="rec-field-label">{L.words.nameLabel}</span>
        <input
          className="rec-input"
          value={name}
          maxLength={120}
          disabled={busy}
          onChange={(e) => onName(e.target.value)}
          data-testid="lead-import-name"
        />
      </label>
    </div>
    <div className="rec-field">
      <label>
        <span className="rec-field-label">{L.words.askedLabel}</span>
        <input
          className="rec-input"
          value={asked}
          maxLength={400}
          disabled={busy}
          placeholder={L.words.askedHint}
          onChange={(e) => onAsked(e.target.value)}
          data-testid="lead-import-asked"
        />
      </label>
    </div>
  </div>
);

/** The import's own state: what was read, the list's name and who they are, and what came back. */
function useImportState(L: Lists) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [name, setName] = useState("");
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReturnType<Lists["importAnswerWords"]> | null>(null);
  // Filtered once for each reading of the file, not on every draw of the sheet.
  const ready = useMemo(() => (plan ? plan.rows.filter(L.ready) : []), [plan, L]);
  return {
    text,
    setText,
    file,
    setFile,
    plan,
    setPlan,
    name,
    setName,
    asked,
    setAsked,
    busy,
    setBusy,
    error,
    setError,
    result,
    setResult,
    ready,
  };
}

/** The import sheet (J12): People's import's shape, the record kit's sheet, with the list's name and who they are. */
export const LeadImportSheet = ({
  onClose,
  onDone = null,
  flash = null,
}: {
  onClose: () => void;
  onDone?: ((searchId: string) => void) | null;
  flash?: ((f: PeopleFlash) => void) | null;
}) => {
  const L = reachOuts.lists;
  const W = L.words;
  const s = useImportState(L);
  const {
    text,
    setText,
    file,
    setFile,
    plan,
    setPlan,
    name,
    setName,
    asked,
    setAsked,
    busy,
    setBusy,
    error,
    setError,
    result,
    setResult,
    ready,
  } = s;
  const tooMany = ready.length > L.max;
  const read = (t: string, fileName: string | null) => {
    setPlan(L.planOf(t));
    setResult(null);
    setError(null);
    if (!name.trim()) setName(L.nameOf(fileName));
  };
  // A file past the sheet's size is refused before it is read, and one that cannot be read says so (G:1): any file was
  // read and parsed whole before the row cap applied, and a failed read left the sheet as it was, with no word.
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (L.maxBytes && f.size > L.maxBytes) {
      setPlan(null);
      setResult(null);
      setError(W.tooBig);
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      setFile(f.name);
      read(typeof r.result === "string" ? r.result : "", f.name);
    };
    r.onerror = () => {
      setPlan(null);
      setError(W.unreadable);
    };
    r.readAsText(f);
  };
  const run = async () => {
    if (busy || !ready.length || tooMany || !plan) return;
    setBusy(true);
    setError(null);
    const rows = ready.map((r) => ({
      // A row is ready only with a name and an address (contracts leadImportReady).
      name: r.name ?? "",
      email: r.email ?? "",
      phone: r.phone,
      website_host: r.website_host,
      city: r.city,
      region: r.region,
      category: r.category,
    }));
    const r = await L.importLeads({ name: name.trim() || L.nameOf(file), asked: asked.trim(), rows });
    setBusy(false);
    if (!r.ok) {
      setError(r.message || W.failed);
      return;
    }
    const said = L.importAnswerWords(r.data, plan.counts.rows - ready.length);
    setResult(said);
    if (flash) flash({ msg: <>{said.title}</> });
    if (onDone) onDone(r.data.search_id);
  };
  const problem = error || (tooMany ? W.tooMany : plan && plan.counts.rows > 0 && !ready.length ? W.nothing : null);
  return (
    <RecordSheet
      id="lead-import"
      title={W.importTitle}
      sub={W.importSub}
      onClose={onClose}
      closeLabel={result ? "Done" : "Cancel"}
      onSave={plan && ready.length && !tooMany && !result ? run : null}
      saveLabel={`${L.saveLabel(ready.length)} · about ${L.cents(ready.length)}¢`}
      saving={busy}
      savingLabel="Importing…"
      foot={
        problem || result ? (
          <div className="pl-import-foot">
            <FieldError id="lead-import-problem" message={problem} testid="lead-import-error" />
            {result ? (
              <button type="button" className="btn btn-sm" onClick={onClose} data-testid="lead-import-done">
                Done
              </button>
            ) : null}
          </div>
        ) : null
      }
      testid="lead-import-sheet"
    >
      <div className="pl-import">
        {!result && (
          <LlImportPick
            W={W}
            text={text}
            busy={busy}
            onFile={onFile}
            onText={setText}
            onRead={() => read(text, null)}
          />
        )}
        {plan && !result && (
          <LlImportPreview
            L={L}
            plan={plan}
            ready={ready}
            name={name}
            asked={asked}
            busy={busy}
            onName={setName}
            onAsked={setAsked}
          />
        )}
        {result && (
          <div className="pl-import-summary" data-testid="lead-import-summary">
            <p className="pl-import-counts">
              <b>{result.title}</b>
            </p>
            {result.lines.map((l) => (
              <p key={l} className="pl-import-hint">
                {l}
              </p>
            ))}
          </div>
        )}
      </div>
    </RecordSheet>
  );
};

/** What the page draws of a list of your own: the rail's door, the bar's act, the sheets, and a list's strip and empty state. */
export interface LeadLists {
  importDoor: ReactNode;
  /** Opens the import sheet: the first day's own door to it, where no rail is drawn. */
  openImport: () => void;
  /** Import leads as the page's act: a phone's head holds it, where the rail that keeps the door is a sheet away. */
  importAct: ReactNode;
  writeAct: (a: { ids: string[]; phone?: boolean; shut?: () => void }) => ReactNode;
  node: ReactNode;
  stripOf: Lists["stripOf"] | (() => null);
  emptyOf: Lists["emptyOf"] | (() => null);
}

/**
 * The page's one hook (J12): the rail's *Import leads*, the bar's *Write to them* for the rows chosen and shown, and the
 * sheet either opens. A list made lands the page on it; one chosen opens the reach-out sheet over it.
 */
export const useLeadLists = ({ flash = null }: { flash?: ((f: PeopleFlash) => void) | null } = {}): LeadLists => {
  const [importing, setImporting] = useState(false);
  const [writing, setWriting] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const L = reachOuts.lists;
  const open = (id: string) => navigate(leadsRoute({ searchId: id, list: "all" }));
  const may = canDo("approve");
  const choose = async (ids: string[]) => {
    if (busy || !ids.length) return;
    setBusy(true);
    const name = L.chooseNameOf();
    const r = await L.chooseLeads({ name, lead_ids: ids.slice(0, L.max) });
    setBusy(false);
    if (!r.ok) {
      if (flash) flash({ tone: "warn", msg: <>{r.message || L.words.failed}</> });
      return;
    }
    if (flash) flash({ msg: <>{L.chooseAnswerWords(r.data)}</> });
    open(r.data.search_id);
    setWriting({ id: r.data.search_id, name });
  };
  const importDoor = (
    <button
      type="button"
      className="cl-rail-newseg"
      onClick={() => setImporting(true)}
      data-testid="leads-import"
      {...gate("find", "import leads")}
    >
      <Icon name="download" size={11} /> {L.words.importDoor}
    </button>
  );
  // The act for the rows chosen and shown (never "all that match": a view is not a list of ids), on a desk the bar's
  // button and on a phone a row of its sheet (`shut` closes the sheet first).
  const writeAct = ({
    ids,
    phone = false,
    shut = () => undefined,
  }: {
    ids: string[];
    phone?: boolean;
    shut?: () => void;
  }) => {
    if (!ids.length) return null;
    if (phone)
      return (
        <PhoneSheetRow
          icon="mail"
          label={L.words.write}
          meta={busy ? L.words.writing : null}
          disabled={busy}
          onClick={() => {
            shut();
            void choose(ids);
          }}
          testid="leads-bulk-write"
          gate={may ? null : gate("approve", "write to these leads")}
        />
      );
    return (
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        title={L.words.writeHint}
        onClick={() => choose(ids)}
        data-testid="leads-bulk-write"
        {...gate("approve", "write to these leads")}
      >
        <Icon name="mail" size={12} /> {busy ? L.words.writing : L.words.write}
      </button>
    );
  };
  const node = (
    <>
      {importing ? <LeadImportSheet onClose={() => setImporting(false)} onDone={open} flash={flash} /> : null}
      {writing ? <ReachOutSheet search={writing} onClose={() => setWriting(null)} onDone={() => undefined} /> : null}
    </>
  );
  // A list's own strip in the finder's strip's place, and what its table says while its addresses are checked (J8).
  // The same door as a phone's head draws it (scope/scope.tsx): the page's one filled act there, as Add a person is
  // People's and New proposal the Pipeline's (Ruben, 7 Oct 2026: a phone's Leads had no way to bring a list in but the
  // Lists sheet's last row). Its first word is kept where the row of views is short (kit/head/act-words.tsx).
  const importAct = (
    <Button
      variant="primary"
      size="sm"
      onClick={() => setImporting(true)}
      data-testid="leads-import-open"
      {...gate("find", "import leads")}
    >
      <ActWords icon={<Icon name="download" size={12} />} words={L.words.importDoor} />
    </Button>
  );
  return {
    importDoor,
    openImport: () => setImporting(true),
    importAct,
    writeAct,
    node,
    stripOf: L.stripOf,
    emptyOf: L.emptyOf,
  };
};
