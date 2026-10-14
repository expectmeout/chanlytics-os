/**
 * The import frame: what People's Add people (a list of the business's own clients) and Leads' Import leads (a list of
 * the owner's own businesses) both draw around their own reading and their own door (the sheets as verbs, 14 Oct 2026:
 * each drew the two parts again, word for word). Where the rows come from, a file chosen or rows pasted and read; and
 * what was read, before anything is written: the counts, where the columns are, a taste of the rows and how many more.
 * What a row is, which columns it shows and what the import does are each sheet's own, passed in.
 */
import { useRef } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";

/** Where the rows come from, in the sheet's own words. */
export interface ImportSourceWords {
  file: string;
  paste: string;
  placeholder: string;
  read: string;
}

/**
 * Where the rows come from: a file, chosen from the kit's button over the browser's own picker (its "Choose File · No
 * file chosen" was the one control on the sheet the kit did not draw), or rows pasted and read; what else the sheet says
 * of them under it (`children`).
 */
export function ImportSource({
  words,
  text,
  busy,
  onFile,
  onText,
  onRead,
  testid,
  children = null,
}: {
  words: ImportSourceWords;
  text: string;
  busy: boolean;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onText: (text: string) => void;
  onRead: () => void;
  /** The prefix of each part's test id: `import` on People, `lead-import` on Leads. */
  testid: string;
  children?: ReactNode;
}) {
  const picker = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={picker}
        type="file"
        accept=".csv,text/csv,text/plain"
        hidden
        onChange={onFile}
        disabled={busy}
        data-testid={`${testid}-file`}
      />
      <Button
        className="pl-import-file"
        disabled={busy}
        onClick={() => picker.current?.click()}
        data-testid={`${testid}-choose`}
      >
        <Icon name="content" size={14} />
        {words.file}
      </Button>
      <div className="rec-field">
        <label>
          <span className="rec-field-label">{words.paste}</span>
          <textarea
            className="rec-input"
            rows={5}
            value={text}
            disabled={busy}
            placeholder={words.placeholder}
            onChange={(e) => onText(e.target.value)}
            data-testid={`${testid}-paste`}
          />
        </label>
        <button
          type="button"
          className="btn btn-sm pl-import-read"
          disabled={busy || !text.trim()}
          onClick={onRead}
          data-testid={`${testid}-read`}
        >
          {words.read}
        </button>
      </div>
      {children}
    </>
  );
}

/**
 * What was read, before anything is written: the counts, where the columns are (or that no rows were read), a taste of
 * the rows under the sheet's own heads, how many more, and what the sheet asks after it (`children`).
 */
export function ImportTaste({
  counts,
  columns,
  heads,
  rows,
  more,
  testid,
  children = null,
}: {
  counts: string;
  columns: ReactNode;
  heads: readonly string[];
  rows: readonly { key: string | number; cells: readonly ReactNode[] }[];
  /** The rows read past the taste. */
  more: number;
  testid: string;
  children?: ReactNode;
}) {
  return (
    <div className="pl-import-preview" data-testid={`${testid}-preview`}>
      <p className="pl-import-counts" data-testid={`${testid}-counts`}>
        {counts}
      </p>
      <p className="pl-import-hint" data-testid={`${testid}-columns`}>
        {columns}
      </p>
      {rows.length > 0 && (
        <table className="pl-import-table">
          <thead>
            <tr>
              {heads.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                {/* A row's cells are its columns, in the heads' order: a cell is keyed by its column's head. */}
                {r.cells.map((c, i) => (
                  <td key={heads[i] ?? i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {more > 0 && <p className="pl-import-hint">and {more.toLocaleString()} more</p>}
      {children}
    </div>
  );
}
