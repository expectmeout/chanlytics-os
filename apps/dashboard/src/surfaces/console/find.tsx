/**
 * Find (decision 0066, the canvas's Find board): one box over every workspace, opened from the rail or with ⌘K. A name
 * or an address, an owner's email, a line's number, a caller's whole number (which answers with the workspace alone,
 * never who called), a report's words or its R-number. The matches come grouped by kind; the arrows move, Enter opens.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FIND_LIMITS, SUPPORT_WORDS, consolePathOf, findGroups, type FindRowDto } from "@chanlytics/contracts";
import { AttnRow } from "../kit/attention/attn-row";
import { Icon } from "../kit/icon/icon";
import { Search } from "../kit/search/search";
import { Sheet } from "../kit/sheet/sheet";
import { NoneRow, type Go } from "./parts";
import { consoleVerbs } from "./verbs";

/** How long the box waits after a key before it asks: a word typed, not each letter. */
const FIND_PAUSE_MS = 200;

/** Where a match opens: its workspace, or Support for a report with none. */
const whereOf = (r: FindRowDto): string => (r.slug ? consolePathOf("workspaces", r.slug) : consolePathOf("support"));

export function FindSheet({ open, onClose, go }: { open: boolean; onClose: () => void; go: Go }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<FindRowDto[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const box = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const words = q.trim();
    if (words.length < FIND_LIMITS.min) {
      setRows(null);
      setProblem(null);
      return undefined;
    }
    let on = true;
    const wait = window.setTimeout(() => {
      void consoleVerbs.find(words).then((r) => {
        if (!on) return;
        if (r.ok) {
          setRows(r.data.rows);
          setProblem(null);
          setAt(0);
        } else setProblem(r.message);
      });
    }, FIND_PAUSE_MS);
    return () => {
      on = false;
      window.clearTimeout(wait);
    };
  }, [q]);

  const flat = rows ?? [];
  const openRow = (r: FindRowDto | undefined) => {
    if (!r) return;
    onClose();
    go(whereOf(r));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAt((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAt((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      openRow(flat[at]);
    }
  };
  let index = -1;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Find"
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      initialFocus={box}
      testid="console-find"
    >
      {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- the arrows and Enter move through the matches under the box */}
      <div className="cs-find-body" onKeyDown={onKey}>
        <Search label={SUPPORT_WORDS.findHint} value={q} onChange={setQ} inputRef={box} testid="console-find-box" />
        {problem && <NoneRow words={problem} />}
        {rows && rows.length === 0 && <NoneRow words={SUPPORT_WORDS.findEmpty} testid="console-find-empty" />}
        {rows &&
          findGroups(rows).map((g) => (
            <div key={g.kind} className="cs-find-group">
              <div className="set-nav-group">{g.words}</div>
              <div className="cl-attn-list">
                {g.rows.map((r) => {
                  index += 1;
                  const mine = index;
                  return (
                    <div key={`${r.kind}-${r.tenant_id}-${r.label}`} className={mine === at ? "cs-find-at" : undefined}>
                      <AttnRow
                        glyph={
                          r.kind === "report"
                            ? "chat"
                            : r.kind === "owner"
                              ? "user"
                              : r.kind === "line"
                                ? "phone"
                                : "monitor"
                        }
                        name={r.label}
                        meta={r.name ?? ""}
                        sentence={r.detail ?? ""}
                        onOpen={() => openRow(r)}
                        onHover={() => setAt(mine)}
                        testid={`console-find-${r.kind}-${mine}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        <div className="cs-find-keys">
          ↑↓ {SUPPORT_WORDS.findKeys.move} · ↵ {SUPPORT_WORDS.findKeys.open} · esc {SUPPORT_WORDS.findKeys.close}
        </div>
      </div>
    </Sheet>
  );
}
