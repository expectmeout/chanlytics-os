/**
 * What a person says of one file, in its sheet (decision 0099): its name, its shelf, and who is in it. Each is saved as it is said; a
 * member who may not change a file reads the same in words, with nothing dead to press. The sheet is file-sheet.tsx.
 */
import { useEffect, useId, useRef, useState } from "react";
import {
  FILE_NAME_MAX,
  FILE_SHOWS,
  FILE_WORDS as W,
  fileNameOf,
  fileSaidOf,
  whoStandsOf,
  type FileDto,
  type FileShows,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Field, fieldProblem } from "../kit/field/field";
import { MoreMenu } from "../kit/more-menu/more-menu";
import { gateTitle } from "../frame-verbs";
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

/** The two answers to who is in it, for what the look left to a person. Nothing is chosen until one is said. */
function WhoAsked({ question, busy, say }: { question: string; busy: boolean; say: (body: FileChange) => void }) {
  return (
    <div className="files-who">
      <p className="files-from">{question}</p>
      <span className="files-tries">
        <Button size="sm" onClick={() => say({ who_in_it: "agreed" })} disabled={busy} data-testid="fl-who-agreed">
          {W.who.agreed}
        </Button>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => say({ who_in_it: "no_one" })}
          disabled={busy}
          data-testid="fl-who-no_one"
        >
          {W.who.no_one}
        </Button>
      </span>
    </div>
  );
}

/**
 * Who is in it, as it stands: asked only where something is left to ask, else one line and a quiet way to change it. An answer
 * takes the pressed button away, so focus goes to what stands in its place: left to itself it falls to the sheet's first
 * field, and on a phone that is a keyboard nobody asked for.
 */
export function FileWho({ file, busy, say }: Omit<SheetPress, "may">) {
  const [changing, setChanging] = useState(false);
  const changeRef = useRef<HTMLButtonElement>(null);
  const answered = useRef(false);
  const stands = whoStandsOf(file);
  useEffect(() => {
    if (!answered.current || !changeRef.current) return;
    answered.current = false;
    changeRef.current.focus();
  });
  const answer = (body: FileChange) => {
    answered.current = true;
    setChanging(false);
    say(body);
  };
  if (stands.is === "looking") return null;
  if (stands.is === "ask") return <WhoAsked question={W.whoAsk(stands.seen)} busy={busy} say={answer} />;
  if (changing) return <WhoAsked question={W.whoAsk(file.people?.count || null)} busy={busy} say={answer} />;
  return (
    <div className="files-who-line">
      <p className="files-from" data-testid="fl-who-says">
        {stands.is === "said" ? W.who[stands.who] : W.whoClear}
      </p>
      <Button ref={changeRef} size="sm" variant="quiet" onClick={() => setChanging(true)} data-testid="fl-who-change">
        {W.whoChange}
      </Button>
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

/** The same, for a member who may only read it: words, and why, with nothing to press that does nothing. */
export function FileReads({ file }: { file: FileDto }) {
  const stands = whoStandsOf(file);
  const who = stands.is === "said" ? W.who[stands.who] : stands.is === "clear" ? W.whoClear : null;
  return (
    <>
      <p className="files-from">
        {W.shelf}: {file.shows ? W.shows[file.shows] : W.shelfNone}
      </p>
      {who && (
        <p className="files-from">
          {W.who_label}: {who}
        </p>
      )}
      <p className="files-from" data-testid="fl-reader">
        {gateTitle("settings", W.mayChange)}
      </p>
    </>
  );
}
