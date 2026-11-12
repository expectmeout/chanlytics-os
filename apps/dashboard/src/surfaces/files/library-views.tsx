/**
 * How the Library is looked through (Ruben, 12 Nov 2026: tabs that make sense to anyone, nothing preset): one row of what is
 * certain of a file, its kind (All, Photos, Videos), never a guess at what it shows; one line to find any of them by its words,
 * which reads what Ask's look saw in each file, so "balayage" or "the team" finds them without a shelf of our naming; and what
 * waits for a yes, or was set aside, as a quiet line that opens it, never a tab of its own.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FILE_WORDS as W, type FilesTally } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { LineField, LinePress } from "../kit/line/line";
import { Notice } from "../kit/notice/notice";
import { Segmented } from "../kit/segmented/segmented";
import type { FilesView } from "./surface";

/** All of it, from what it keeps. */
export const ALL_FILES: FilesView = { shelf: "all", kind: null, about: null };

type KindTab = "all" | "photos" | "videos";

const tabOf = (view: FilesView): KindTab =>
  view.kind === "image" ? "photos" : view.kind === "video" ? "videos" : "all";

/** All, Photos, Videos, each with how many: drawn where both kinds are kept, since one alone is all of it. */
export function KindTabs({ tally, view, go }: { tally: FilesTally; view: FilesView; go: (view: FilesView) => void }) {
  const photos = tally.kept - tally.videos;
  if (photos === 0 || tally.videos === 0) return null;
  const said = (tab: KindTab, n: number) => ({ value: tab, label: `${W.views[tab]} ${n}`, testid: `fl-kind-${tab}` });
  return (
    <div className="files-shelves">
      <Segmented
        className="files-shelves-row"
        label={W.title}
        value={tabOf(view)}
        onValueChange={(tab: KindTab) =>
          go({ ...view, kind: tab === "photos" ? "image" : tab === "videos" ? "video" : null })
        }
        options={[said("all", tally.kept), said("photos", photos), said("videos", tally.videos)]}
      />
    </div>
  );
}

/** How long the words rest before they are looked for: a word at a time, not a letter at a time. */
const FIND_REST_MS = 300;

/**
 * The one line to find by words, the Library's and Made's alike (Ruben, 12 Nov 2026: one search, both lists): what Ask's look
 * saw in a file, what is written on it, what a video says, and its name. The words rest a moment before they are looked for, a
 * word at a time; Return looks at once; a cleared line shows all of it again.
 */
export function FindWords({
  about,
  onFind,
  placeholder,
  testid,
}: {
  about: string | null;
  onFind: (about: string | null) => void;
  placeholder: string;
  testid: string;
}) {
  const [words, setWords] = useState(about ?? "");
  const asked = useRef(about ?? "");
  const find = (said: string) => {
    const next = said.trim();
    if (next === asked.current) return;
    asked.current = next;
    onFind(next || null);
  };
  useEffect(() => {
    const rest = setTimeout(() => find(words), FIND_REST_MS);
    return () => clearTimeout(rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `find` reads what was asked as it stands; the words alone move it
  }, [words]);
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    find(words);
  };
  return (
    <div className="files-find" data-testid={testid}>
      <Icon name="search" size={14} />
      <LineField
        className="files-find-words"
        rows={1}
        value={words}
        onChange={(event) => setWords(event.currentTarget.value.replace(/\s*\n\s*/g, " "))}
        onKeyDown={onKey}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="search"
        maxLength={80}
        data-testid={`${testid}-words`}
      />
      {words ? (
        <LinePress kind="send" onClick={() => setWords("")} aria-label={W.findClear} data-testid={`${testid}-clear`}>
          <Icon name="x" size={12} />
        </LinePress>
      ) : null}
    </div>
  );
}

/** The Library's line to find a file by its words, over all of what it keeps. */
export function FindLine({ view, go }: { view: FilesView; go: (view: FilesView) => void }) {
  return (
    <FindWords about={view.about} onFind={(about) => go({ ...view, about })} placeholder={W.find} testid="fl-find" />
  );
}

/** What waits for a yes, said once over all of it, with the press that opens it. */
export function WaitingLine({ n, go }: { n: number; go: (view: FilesView) => void }) {
  return (
    <Notice
      label={W.waitingLine(n)}
      fact={W.waitingLine(n)}
      line
      testid="fl-waiting"
      act={
        <Button size="sm" onClick={() => go({ shelf: "inbox", kind: null, about: null })} data-testid="fl-waiting-look">
          {W.look}
        </Button>
      }
    />
  );
}

/** What was set aside, at the foot of all of it: a quiet press that opens it. */
export function SetAsideLine({ n, go }: { n: number; go: (view: FilesView) => void }) {
  return (
    <div className="files-more">
      <Button
        size="sm"
        variant="quiet"
        onClick={() => go({ shelf: "set_aside", kind: null, about: null })}
        data-testid="fl-set-aside"
      >
        {W.setAsideLine(n)}
      </Button>
    </div>
  );
}

/** Over what waits or was set aside: where it is, how many, and the way back to all of it. */
export function ShelfHead({ view, tally, go }: { view: FilesView; tally: FilesTally; go: (view: FilesView) => void }) {
  if (view.shelf === "all") return null;
  const n = tally.shelves[view.shelf] ?? 0;
  return (
    <div className="files-shelf-head" data-testid="fl-shelf-head">
      <Button size="sm" variant="quiet" onClick={() => go(ALL_FILES)} data-testid="fl-back-all">
        {W.backToAll}
      </Button>
      <span className="files-shelf-said">{`${W.shelves[view.shelf]} · ${n}`}</span>
    </div>
  );
}
