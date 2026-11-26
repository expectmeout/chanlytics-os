/**
 * Settings › Autonomy's policy matrix (moved from legacy/pages/settings.jsx, decision 0015 step 11): one row per action
 * class and a column per mode, a table on a desktop and one line per class on a phone. The rows are the bridge's
 * (policy-store.ts uiRows: contracts' classes, the modes each honours, and the workspace's stored mode); every word a
 * mode says is contracts' POLICY_MODE_WORDS, through UI_MODE_WORDS. Under Replies, the one row a held draft belongs to
 * here (Bookings' and Questions' are their own rows' on Settings, business/choices), how often the owner changed what
 * the receptionist wrote (decision 0063, contracts heldDraftsLine): the evidence for the row's mode, and no advice. Under
 * the rows a new sequence starts by (offers, win-backs, follow-ups, reach-outs), what their sequences' batches did over the
 * last 90 days (decision 0064, contracts classEvidenceLine): the same, for the mode a new one starts with.
 * Money is no row here: a class nothing can change, it is said once, on Limits (the Settings wiring review, 18 Oct).
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  classEvidenceLine,
  heldDraftsLine,
  type HeldDraftsClass,
  type HeldDraftsCount,
  type SequenceEvidenceDto,
} from "@chanlytics/contracts";
import { UI_MODES, UI_MODE_WORDS, type UiMode, type UiRow } from "@/bridge/policy-store";
import { Icon } from "../../kit/icon/icon";
import { choiceAct } from "../choice-act";
import { Press } from "../../kit/press";
import { RecordTip } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import { gate } from "../../frame-verbs";

/** A mode's words: its heading, the clause under it, and what it does. A row with no stored mode says nothing. */
interface ModeWords {
  head: string | null;
  sub: string;
  does: string | null;
}

/**
 * A mode's words, said where they are needed rather than hidden in a hover. `Auto | Veto | Ask | Never` are filing
 * words -- the plain sentence for each one existed only as a tip on the heading, which a phone cannot trigger at all.
 * The heading is the sentence now: a verb and the one clause that tells it apart.
 */
export const polMode = (m: UiMode | null): ModeWords => (m ? UI_MODE_WORDS[m] : { head: m, sub: "", does: m });

/** What a press of a mode asks for: the row, and the mode as the database spells it. */
type PutMode = (r: UiRow, mode: string) => void;

/**
 * Rows under a name of their own after the matrix's own (00714, canvas v18 board B5: Content), and a line under them (AI's
 * suggested rung): one matrix, its headings said once.
 */
export interface RowGroup {
  name: string;
  rows: UiRow[];
  foot?: ReactNode;
}

/** The held drafts by the row they belong to (contracts heldDraftsByClass); empty where none were read. */
type HeldByClass = Partial<Record<HeldDraftsClass, HeldDraftsCount>>;

/**
 * What the rows say under them: the held drafts by class (Replies'), and what each sequence's batches did (the rows a new
 * sequence starts by); either empty where it was not read.
 */
interface RowLines {
  held?: HeldByClass;
  evidence?: SequenceEvidenceDto[] | null;
}

/** The classes a sequence is made under: their rows say what their sequences' batches did (decision 0064). */
const SEQUENCE_CLASSES: ReadonlySet<string> = new Set(["reengage", "campaign", "follow_up", "outreach"]);

/** A row's line: Replies' held drafts, or the batches of the sequences of its class; null where it has none to say. */
const heldLineOf = (r: UiRow, lines: RowLines): string | null =>
  r.cls === "reply"
    ? heldDraftsLine((lines.held ?? {})[r.cls])
    : SEQUENCE_CLASSES.has(r.cls)
      ? classEvidenceLine(lines.evidence, r.cls)
      : null;

function PolModeHead({ m }: { m: UiMode }) {
  const w = polMode(m);
  return (
    <span className="pol-mode-words">
      <span className="pol-mode-head">{w.head}</span>
      {w.sub && <span className="pol-mode-sub">{w.sub}</span>}
    </span>
  );
}

/**
 * Whether the pane is a phone's, at the product's phone (tokens.css --bp-phone, 720px; Settings' own 640px until 25 Nov
 * 2026), kept current as the window changes size, as the record kit reads its own. Read whatever the pane draws, so a
 * pane holds the same hooks at either width.
 */
const SET_PHONE_QUERY = "(max-width: 720px)";
const phoneQuery = () => (typeof window.matchMedia === "function" ? window.matchMedia(SET_PHONE_QUERY) : null);
export function useSetPhone(): boolean {
  const [phone, setPhone] = useState(() => {
    const m = phoneQuery();
    return !!(m && m.matches);
  });
  useEffect(() => {
    const m = phoneQuery();
    if (!m || !m.addEventListener) return undefined;
    const on = (e: MediaQueryListEvent) => setPhone(!!e.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

/**
 * One action class as a line: its mode as the row's value, and the row's act a menu of the modes the class takes, each
 * saying what it does (../choice-act.tsx: the phone change list's B3, where the mode was a word with a caret inside it).
 * The phone's matrix is these lines, and Replies is one on every width (its card holds its hold window and its
 * confidence dial under it, pane.tsx).
 */
export function PolModeRow({
  r,
  put,
  busy,
  lines = {},
}: {
  r: UiRow;
  put: PutMode;
  busy: string | null;
  lines?: RowLines;
}) {
  const g = gate("autonomy");
  const gated = busy === r.cls ? "Saving · wait for this one to land." : g["aria-disabled"] ? g["data-tip"] : null;
  return (
    <RecordRow
      id={`pol-${r.id}`}
      testid={`pol-phone-${r.id}`}
      hint={heldLineOf(r, lines)}
      label={
        <>
          {r.label}
          {r.note && <RecordTip text={r.note} label={`What each mode does for ${r.label}: ${r.note}`} />}
        </>
      }
      value={polMode(r.mode).head}
      act={choiceAct({
        // The sheet says which kind it sets, over each mode with what it does under its name (MoreMenu puts a sentence
        // under the words on a phone): the sentence was cut at the line's end.
        items: [
          { header: r.label },
          ...UI_MODES.filter((m) => !r.modes || r.modes.includes(m)).map((m) => ({
            label: polMode(m).head,
            hint: (r.hints && r.hints[m]) || polMode(m).does,
            checked: r.mode === m,
            onClick: () => put(r, m.toLowerCase()),
          })),
        ],
        name: `${r.label}: ${String(polMode(r.mode).head)}`,
        gated,
        testid: `pol-phone-mode-${r.id}`,
      })}
    />
  );
}

/**
 * The matrix on a phone (24 Sep): one line per action class (PolModeRow). The table of four columns collapsed into
 * four captioned dots under every label there -- 107px a row, the four captions repeated seven times down the screen.
 * A desktop keeps the matrix, where four columns read at a glance.
 */
export function PolPhoneRows({
  rows,
  put,
  busy,
  lines = {},
  groups = [],
}: {
  rows: UiRow[];
  put: PutMode;
  busy: string | null;
  lines?: RowLines;
  groups?: readonly RowGroup[];
}) {
  return (
    <div className="pol-phone" data-testid="pol-phone">
      {rows.map((r) => (
        <PolModeRow key={r.id} r={r} put={put} busy={busy} lines={lines} />
      ))}
      {groups.map((g) => (
        <div key={g.name} data-testid={`pol-group-${g.name.toLowerCase()}`}>
          <div className="pol-phone-group">{g.name}</div>
          {g.rows.map((r) => (
            <PolModeRow key={r.id} r={r} put={put} busy={busy} lines={lines} />
          ))}
          {g.foot}
        </div>
      ))}
    </div>
  );
}

/** One mode's cell of a row: a dash where the class cannot honour it, else the dot that sets it. */
function modeCell(r: UiRow, m: UiMode, put: PutMode, busy: string | null) {
  // Why the class cannot honour this mode: the dash's name for a screen reader, which heard only "—", and its tip.
  const reason = m === "Veto" ? "Nothing to hold for review here" : "Answered by AI or by you · there is no never";
  return (
    <td key={m} className="pol-cell" data-mode={polMode(m).head ?? undefined}>
      {r.modes && !r.modes.includes(m) ? (
        <span className="pol-dash" role="img" aria-label={reason} data-tip={reason}>
          —
        </span>
      ) : (
        <Press
          className={`pol-dot ${r.mode === m ? "on" : ""}`}
          aria-label={`${r.label}: ${String(polMode(m).head)}`}
          aria-pressed={r.mode === m}
          title={(r.hints && r.hints[m]) || polMode(m).does || undefined}
          disabled={busy === r.cls}
          onClick={() => put(r, m.toLowerCase())}
          {...gate("autonomy")}
        >
          {r.mode === m ? <Icon name="check" size={11} /> : ""}
        </Press>
      )}
    </td>
  );
}

/** One class as a row of the desktop's matrix: its name and line, and a cell per mode. */
function PolicyRow({ r, put, busy, lines }: { r: UiRow; put: PutMode; busy: string | null; lines: RowLines }) {
  return (
    <tr>
      <td>
        <span className="pol-label">
          {r.label}
          {r.note && <RecordTip text={r.note} label={`What each mode does for ${r.label}: ${r.note}`} />}
        </span>
        {heldLineOf(r, lines) && (
          <span className="pol-held" data-testid={`pol-held-${r.cls}`}>
            {heldLineOf(r, lines)}
          </span>
        )}
      </td>
      {UI_MODES.map((m) => modeCell(r, m, put, busy))}
    </tr>
  );
}

/** The matrix on a desktop: a column per mode, headed by what the mode does, a row per class, then each group's rows. */
export function PolicyTable({
  rows,
  put,
  busy,
  lines = {},
  groups = [],
}: {
  rows: UiRow[];
  put: PutMode;
  busy: string | null;
  lines?: RowLines;
  groups?: readonly RowGroup[];
}) {
  return (
    <table className="pol-table">
      <thead>
        <tr>
          <th>What</th>
          {UI_MODES.map((m) => (
            <th key={m} className="pol-mode">
              <PolModeHead m={m} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <PolicyRow key={r.id} r={r} put={put} busy={busy} lines={lines} />
        ))}
      </tbody>
      {groups.map((g) => (
        <tbody key={g.name} data-testid={`pol-group-${g.name.toLowerCase()}`}>
          <tr className="pol-group">
            <th colSpan={1 + UI_MODES.length} scope="colgroup">
              {g.name}
            </th>
          </tr>
          {g.rows.map((r) => (
            <PolicyRow key={r.id} r={r} put={put} busy={busy} lines={lines} />
          ))}
          {g.foot ? (
            <tr className="pol-group-foot">
              <td colSpan={1 + UI_MODES.length}>{g.foot}</td>
            </tr>
          ) : null}
        </tbody>
      ))}
    </table>
  );
}
