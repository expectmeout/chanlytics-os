/**
 * What a person says of one file, in its sheet (decision 0099): its name and its shelf. Each is saved as it is said. Who is
 * in it is never asked: footage a business provides is taken as cleared (Ruben, 22 Nov 2026).
 */
import { useId, useState } from "react";
import {
  FILE_NAME_MAX,
  FILE_SHOWS,
  FILE_WORDS as W,
  fileNameOf,
  fileSaidOf,
  type FileDto,
  type FileMade,
  type FileShows,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Field, fieldProblem } from "../kit/field/field";
import { MoreMenu } from "../kit/more-menu/more-menu";
import type { FileChange } from "./verbs";

export /** What a press in the sheet is handed: whether it may, whether one is out, and how a word is said. */
interface SheetPress {
  file: FileDto;
  may: boolean;
  busy: boolean;
  say: (body: FileChange) => void;
}

export /** The sheet's name: typed here as words, and saved by Return or by Save, which stands beside it only while there is something to save. */
function NameField({ file, change }: { file: FileDto; change: (body: FileChange) => Promise<string | null> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const dirty = draft !== null && fileNameOf(draft) !== file.name;
  const save = async () => {
    if (!dirty) return setDraft(null);
    const refused = await change({ name: draft });
    setProblem(refused);
    if (!refused) setDraft(null);
  };
  return (
    <div className="files-name-row">
      <Field
        className="files-name-box"
        label={W.name}
        value={draft ?? fileSaidOf(file.name)}
        onValueChange={(v) => setDraft(v)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          // Taken here while there are words to take back, so the sheet is not closed with them.
          if (e.key === "Escape" && dirty) {
            e.preventDefault();
            setDraft(null);
          }
        }}
        maxLength={FILE_NAME_MAX}
        spellCheck={false}
        enterKeyHint="done"
        data-testid="fl-name"
        {...fieldProblem(problem)}
      />
      {dirty && (
        <Button size="sm" onClick={() => void save()} data-testid="fl-name-save">
          {W.save}
        </Button>
      )}
    </div>
  );
}

/** Its shelf, for a member who may say. */
export function FileChoices({ file, busy, say }: Omit<SheetPress, "may">) {
  const shelfId = useId();
  const shelf = file.shows ? W.shows[file.shows] : W.shelfNone;
  return (
    <Field
      label={W.shelf}
      onLabelPress={() => document.getElementById(shelfId)?.focus()}
      control={
        <MoreMenu
          items={FILE_SHOWS.map((s: FileShows) => ({
            label: W.shows[s],
            checked: s === file.shows,
            onClick: () => say({ shows: s }),
          }))}
          label={shelf}
          title={W.shelf}
          ariaLabel={`${W.shelf}: ${shelf}`}
          boxAttrs={{ id: shelfId }}
          btnClass="rec-input rec-select"
          align="left"
          escape
          gated={busy ? W.saving : null}
          testid="fl-shows"
        />
      }
    />
  );
}

/** What the sheet says the look saw, or how it stands. A refused picture a person has since kept waits for no one. */
export function lookSaysOf(file: FileDto): string | null {
  // A video not yet ready says so where its player stands: the look has nothing to read before.
  if (file.kind === "video" && file.media_status !== "ready") return null;
  if (file.look_status === "waiting") return W.looking;
  if (file.look_status === "refused") return file.status === "inbox" ? W.refused : W.notRead;
  if (file.look_status === "failed") return W.notRead;
  return file.line;
}

/** Where a post came from, a door to that photo while it is here; anything else says the road that brought it. */
export function FileFrom({ file, made, open }: { file: FileDto; made: FileMade | null; open: (id: string) => void }) {
  if (file.source !== "made" || !made) return <p className="files-from">{W.sources[file.source]}</p>;
  const { from } = made;
  if (!from) return <p className="files-from">{W.madeFromGone}</p>;
  return (
    <p className="files-from files-made-from">
      {W.madeFrom}
      <Button size="sm" variant="quiet" onClick={() => open(from.id)} data-testid="fl-made-from">
        {fileSaidOf(from.name)}
      </Button>
    </p>
  );
}
