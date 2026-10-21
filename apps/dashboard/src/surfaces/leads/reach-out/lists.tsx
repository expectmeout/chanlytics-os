/**
 * A list of your own (Reach out Part 7: J1-J12), moved from legacy/pages/reach-out/reach-out-leads.jsx (decision 0015):
 * Leads' *Import leads* (a file of the owner's own businesses, read here, every address checked first by the finder's own
 * check, as a search of its own) and the bulk bar's *Write to them* (the chosen leads as a search of their own, with the
 * reach-out sheet opened on it). A reach-out writes to a search, so both are one. Every reading of a file and every word is
 * contracts' (lead-import.ts), through Campaigns' reach-out reads (`reachOuts.lists`); the page mounts it with one hook,
 * useLeadLists, whose answer is the rail's doors, the bar's act and the sheets they open. Beside Import leads the rail
 * offers Find people (the people card, 00430: finder/people-sheet.tsx), the other door that brings leads in.
 */
import { useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { leadsRoute, type LeadPeoplePlan } from "@chanlytics/contracts";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { RecordSheet } from "../../kit/record/sheet";
import { gate, navigate } from "../../legacy-verbs";
import { useFindPeople } from "../finder/people-sheet";
import { ImportSource, ImportTaste } from "../../people/import/frame";
import type { PeopleFlash } from "../../people/types";

type Lists = typeof reachOuts.lists;
type ImportPlan = ReturnType<Lists["planOf"]>;
type ImportRow = ImportPlan["rows"][number];

// Rows drawn before the import, as a taste of what was read.
const LL_TASTE = 5;

/** Where the rows come from (the import frame, which People's import draws too), and what else a row can hold. */
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
  onRead: (text: string) => void;
}) => (
  <ImportSource
    words={{ file: W.file, paste: W.paste, placeholder: W.pastePlaceholder, read: W.read }}
    text={text}
    busy={busy}
    onFile={onFile}
    onText={onText}
    onRead={onRead}
    testid="lead-import"
  >
    <RecordDisclosure id="lead-import-more" label={W.importMore} testid="lead-import-more">
      <p className="pl-import-hint">{W.importRest}</p>
    </RecordDisclosure>
  </ImportSource>
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
  <ImportTaste
    counts={L.countWords(plan.counts)}
    columns={`${plan.counts.rows === 0 ? "No rows were read from that." : L.columnWords(plan)} ${L.words.costs}`}
    heads={["Business", "Email", "Website"]}
    rows={ready.slice(0, LL_TASTE).map((r) => ({ key: r.line, cells: [r.name, r.email, r.website_host || "—"] }))}
    more={Math.max(0, ready.length - LL_TASTE)}
    testid="lead-import"
  >
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
  </ImportTaste>
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

/** What an import came to: its title, and a line for each thing it says. */
const LlImportSummary = ({ result }: { result: { title: string; lines: readonly string[] } }) => (
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
);

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
      backCloses
      id="lead-import"
      title={W.importTitle}
      sub={W.importLine}
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
          <LlImportPick W={W} text={text} busy={busy} onFile={onFile} onText={setText} onRead={(t) => read(t, null)} />
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
        {result && <LlImportSummary result={result} />}
      </div>
    </RecordSheet>
  );
};

/** What the page draws of a list of your own: the rail's door, the bar's act, the sheets, and a list's strip and empty state. */
export interface LeadLists {
  importDoor: ReactNode;
  /** The rail's Find people (00430), beside Import leads; null while the people card finds nothing (lead_card_live). */
  findPeopleDoor: ReactNode;
  /** Whether the people card finds leads now: the first day and a phone's New search offer it only then. */
  peopleLive: boolean;
  /** Opens the import sheet: the first day's own door to it, where no rail is drawn. */
  openImport: () => void;
  /**
   * Opens Find people (00430), filled in with a plan made before (a people search's Find more like these), or empty: the
   * first day's and a phone's New search door to it, where no rail is drawn.
   */
  openFindPeople: (from?: LeadPeoplePlan | null) => void;
  node: ReactNode;
  stripOf: Lists["stripOf"] | (() => null);
  emptyOf: Lists["emptyOf"] | (() => null);
}

/**
 * The page's one hook (J12): the rail's *Import leads* and *Find people*, and the sheets they open. A list made lands the
 * page on it. Leads chosen go to a sequence by the bar's Add (scope/bulk-add.tsx), never a list of their own first.
 */
export const useLeadLists = ({
  flash = null,
  peopleLive = false,
}: {
  flash?: ((f: PeopleFlash) => void) | null;
  /** Whether the people card finds leads now (the searches' cards_live, 00430 lead_card_live). */
  peopleLive?: boolean;
} = {}): LeadLists => {
  const [importing, setImporting] = useState(false);
  const L = reachOuts.lists;
  const people = useFindPeople({ flash, live: peopleLive });
  const open = (id: string) => navigate(leadsRoute({ searchId: id, list: "all" }));
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
  const node = (
    <>
      {importing ? <LeadImportSheet onClose={() => setImporting(false)} onDone={open} flash={flash} /> : null}
      {people.node}
    </>
  );
  return {
    importDoor,
    findPeopleDoor: people.door,
    peopleLive,
    openImport: () => setImporting(true),
    openFindPeople: people.open,
    node,
    stripOf: L.stripOf,
    emptyOf: L.emptyOf,
  };
};
