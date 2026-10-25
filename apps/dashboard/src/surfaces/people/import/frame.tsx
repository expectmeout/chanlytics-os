/**
 * The import frame: what People's Add people (a list of the business's own clients) and Leads' Import leads (a list of
 * the owner's own businesses) both draw around their own reading and their own door (the sheets as verbs, 14 Oct 2026:
 * each drew the two parts again, word for word). Where the rows come from, a file chosen or rows pasted, read as they
 * land; the file once read, with its Change; and what was read, before anything is written: the counts, where the
 * columns are, a taste of the rows under the file's own word for each column, and how many more. What a row is, which
 * columns it shows and what the import does are each sheet's own, passed in.
 */
import { useRef } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";

/** Where the rows come from, in the sheet's own words. */
interface ImportSourceWords {
  file: string;
  /** A line under the file's words: where such a file comes from. */
  fileHint?: string;
  paste: string;
  placeholder: string;
  read: string;
}

/** The files a CSV reader takes. */
const CSV_FILES = ".csv,text/csv,text/plain";
/** And with an Excel workbook (decision 0073, R22: Vagaro exports nothing else). */
export const CSV_OR_EXCEL_FILES = `${CSV_FILES},.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;

/**
 * Where the rows come from: a file, chosen from the kit's button over the browser's own picker (its "Choose File · No
 * file chosen" was the one control on the sheet the kit did not draw), or rows pasted, read as they are pasted, the
 * paste being the whole of the ask (Add people, 20 Oct 2026: a Read pressed after every paste was a step for nothing);
 * rows typed by hand wait for Read, in the box's corner. What else the sheet says of them goes under it (`children`).
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
  accept = CSV_FILES,
}: {
  words: ImportSourceWords;
  text: string;
  busy: boolean;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onText: (text: string) => void;
  /** Reads these rows: the words as they now stand, which a paste hands over before the page has drawn them. */
  onRead: (text: string) => void;
  /** The prefix of each part's test id: `import` on People, `lead-import` on Leads. */
  testid: string;
  children?: ReactNode;
  /** The files the picker offers: a CSV, or a CSV and an Excel workbook where the reader takes one (xlsx.ts). */
  accept?: string;
}) {
  const picker = useRef<HTMLInputElement | null>(null);
  const pasted = useRef(false);
  return (
    <>
      <input
        ref={picker}
        type="file"
        accept={accept}
        hidden
        onChange={onFile}
        disabled={busy}
        data-testid={`${testid}-file`}
      />
      <Button
        className="pl-import-pick"
        disabled={busy}
        onClick={() => picker.current?.click()}
        data-testid={`${testid}-choose`}
      >
        <span className="pl-import-glyph" aria-hidden="true">
          <Icon name="content" size={16} />
        </span>
        <span className="pl-import-words">
          <b>{words.file}</b>
          {words.fileHint ? <small>{words.fileHint}</small> : null}
        </span>
      </Button>
      <div className="rec-field pl-import-paste">
        <label>
          <span className="rec-field-label">{words.paste}</span>
          <textarea
            className="rec-input"
            rows={5}
            value={text}
            disabled={busy}
            placeholder={words.placeholder}
            onPaste={() => {
              pasted.current = true;
            }}
            onChange={(e) => {
              const next = e.target.value;
              onText(next);
              if (!pasted.current) return;
              pasted.current = false;
              if (next.trim()) onRead(next);
            }}
            data-testid={`${testid}-paste`}
          />
        </label>
        <Button
          size="sm"
          className="pl-import-read"
          disabled={busy || !text.trim()}
          onClick={() => onRead(text)}
          data-testid={`${testid}-read`}
        >
          {words.read}
        </Button>
      </div>
      {children}
    </>
  );
}

/** The file read, or the rows pasted: its name, how many rows, and the Change that goes back to where they came from. */
export function ImportFile({
  name,
  rows,
  onChange,
  testid,
}: {
  name: string;
  rows: number;
  /** Null while the rows go in, and after: the file is then what went. */
  onChange: (() => void) | null;
  testid: string;
}) {
  return (
    <div className="pl-import-chosen" data-testid={`${testid}-chosen`}>
      <span className="pl-import-glyph" aria-hidden="true">
        <Icon name="content" size={15} />
      </span>
      <span className="pl-import-words">
        <b>{name}</b>
        <small>
          {rows.toLocaleString()} {rows === 1 ? "row" : "rows"}
        </small>
      </span>
      {onChange ? (
        <Button size="sm" onClick={onChange} data-testid={`${testid}-change`}>
          Change
        </Button>
      ) : null}
    </div>
  );
}

/** A column of the taste: its name, and the file's own word for it (null: no column was found for it). */
export type ImportHead = string | { label: string; from: string | null };

const headLabel = (h: ImportHead): string => (typeof h === "string" ? h : h.label);

/**
 * What was read, before anything is written: the counts, where the columns are (or that no rows were read), a taste of
 * the rows under the sheet's own heads, how many more, and what the sheet asks after it (`children`). A head may carry
 * the file's own word for its column under it, so a column read wrong is seen before the import, and one not found says
 * so; a sheet that says the counts elsewhere leaves them out.
 */
export function ImportTaste({
  counts = null,
  columns = null,
  heads,
  rows,
  more,
  testid,
  children = null,
}: {
  counts?: string | null;
  columns?: ReactNode;
  heads: readonly ImportHead[];
  rows: readonly { key: string | number; cells: readonly ReactNode[] }[];
  /** The rows read past the taste. */
  more: number;
  testid: string;
  children?: ReactNode;
}) {
  return (
    <div className="pl-import-preview" data-testid={`${testid}-preview`}>
      {counts ? (
        <p className="pl-import-counts" data-testid={`${testid}-counts`}>
          {counts}
        </p>
      ) : null}
      {columns ? (
        <p className="pl-import-hint" data-testid={`${testid}-columns`}>
          {columns}
        </p>
      ) : null}
      {rows.length > 0 && (
        <table className="pl-import-table">
          <thead>
            <tr>
              {heads.map((h) => (
                <th key={headLabel(h)}>
                  {headLabel(h)}
                  {typeof h === "string" ? null : (
                    <small className="pl-import-from" data-missing={h.from === null ? "true" : undefined}>
                      {h.from === null ? "Not found" : h.from}
                    </small>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                {/* A row's cells are its columns, in the heads' order: a cell is keyed by its column's head. */}
                {r.cells.map((c, i) => {
                  const h = heads[i];
                  return <td key={h === undefined ? i : headLabel(h)}>{c}</td>;
                })}
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
