/**
 * Settings › Memory (decision 0070): what Ask keeps about the business, newest first, each with where it came from (told
 * to Ask in a thread, or written here), whether you kept it and when; Add a line of your own, Change one's words in place, or
 * Forget it; and, for an owner, the journal's newest days as Ask wrote them. Every question Ask answers reads the lines,
 * and an owner's reads the journal too. The presses are the memory's own verbs (verbs.ts), which the door checks again:
 * keeping is the approve permission's, changing the settings permission's, forgetting the settings permission's or the
 * keeper's own. The words are contracts' (ASK_MEMORY_WORDS), the parts the kit's.
 */
import { useState } from "react";
import {
  ASK_MEMORY_LIMITS,
  ASK_MEMORY_WORDS as W,
  memoryTextProblem,
  type AskMemoryLineDto,
} from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { Button } from "../../kit/button/button";
import { EmptyState } from "../../kit/empty/empty";
import { Field, fieldProblem } from "../../kit/field/field";
import { useRecordFold } from "../../kit/record/hooks";
import { RecordInline } from "../../kit/record/inline";
import { RecordRow } from "../../kit/record/row";
import { canDo, gate, meNow, refreshSurface, type LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { memoryVerbs } from "./verbs";

/** What a press said: the receipt, or the refusal's words. */
type Said = { ok: true; receipt: string } | { ok: false; message: string };

/** A press through its verb: what it said, the pane's toast saying the receipt. */
type Press = (run: () => Promise<Said>) => Promise<string | null>;

/** Where a line came from, whether the member kept it, and when, as its row's hint says it. */
function lineHint(l: AskMemoryLineDto, me: string | null): string {
  const mine = !!me && l.kept_by === me;
  return [W.sources[l.source], mine ? W.keptByYou : null, pageClock().dateYear(Date.parse(l.made_at))]
    .filter(Boolean)
    .join(" · ");
}

/** One line: its row at rest, with Change (in place) and Forget where the member may, and its editor. */
function MemoryLine({
  line,
  me,
  mayChange,
  mayForget,
  press,
}: {
  line: AskMemoryLineDto;
  me: string | null;
  mayChange: boolean;
  mayForget: boolean;
  press: Press;
}) {
  const id = `mem-${line.id}`;
  // The member's words while they type, else none: the editor then shows the line as stored, so a Change saved (and read
  // back) or let go opens next time on the words Ask holds, never on the ones before.
  const [draft, setDraft] = useState<string | null>(null);
  const words = draft ?? line.text;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fold = useRecordFold(id, { dirty: () => words.trim() !== line.text, saving: () => busy });
  const open = fold.open && mayChange;
  const close = () => {
    setDraft(null);
    setProblem(null);
    fold.close();
  };
  const run = async (what: () => Promise<Said>, then: () => void) => {
    setBusy(true);
    const wrong = await press(what);
    setBusy(false);
    if (wrong) setProblem(wrong);
    else then();
  };
  const save = () => {
    const wrong = memoryTextProblem(words);
    if (wrong) return setProblem(wrong);
    void run(() => memoryVerbs.change(line, words), close);
  };
  return (
    <>
      {open ? null : (
        <RecordRow
          id={id}
          testid="mem-line"
          label={W.sources[line.source]}
          value={line.text}
          hint={problem ?? lineHint(line, me)}
          act={
            mayChange
              ? { label: W.edit, onClick: fold.request, gate: gate("settings", "change what Ask remembers") }
              : undefined
          }
        >
          {mayForget && (
            <span className="mem-acts">
              <Button
                size="sm"
                variant="quiet"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => memoryVerbs.forget(line),
                    () => undefined,
                  )
                }
                aria-label={`${W.forget}: ${line.text}`}
                data-testid="mem-line-forget"
              >
                {W.forget}
              </Button>
            </span>
          )}
        </RecordRow>
      )}
      <RecordInline
        id={id}
        label={W.sources[line.source]}
        open={open}
        onSave={save}
        onCancel={close}
        saving={busy}
        saveLabel={W.save}
        cancelLabel={W.cancel}
        gate={gate("settings", "change what Ask remembers")}
      >
        <Field
          aria-label={`${W.edit}: ${line.text}`}
          value={words}
          onValueChange={(v) => {
            setDraft(v);
            setProblem(null);
          }}
          rows={2}
          maxLength={ASK_MEMORY_LIMITS.textMax}
          readOnly={busy}
          data-testid="mem-line-box"
          {...fieldProblem(problem)}
        />
      </RecordInline>
    </>
  );
}

/** Add a line: one fact in the member's own words, kept as Ask keeps what it is told. */
function AddLine({ press }: { press: Press }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const add = async () => {
    const wrong = memoryTextProblem(draft);
    if (wrong) return setProblem(wrong);
    setBusy(true);
    const refused = await press(() => memoryVerbs.keep(draft));
    setBusy(false);
    if (refused) setProblem(refused);
    else setDraft("");
  };
  return (
    <div className="mem-add" data-testid="mem-add">
      <Field
        label={W.addLabel}
        hint={W.addHint}
        value={draft}
        onValueChange={(v) => {
          setDraft(v);
          setProblem(null);
        }}
        rows={2}
        maxLength={ASK_MEMORY_LIMITS.textMax}
        readOnly={busy}
        data-testid="mem-add-box"
        {...fieldProblem(problem)}
      />
      <span className="mem-acts">
        <Button
          size="sm"
          variant="primary"
          disabled={busy || !draft.trim()}
          onClick={() => void add()}
          {...gate("approve", "add to what Ask remembers")}
          data-testid="mem-add-save"
        >
          {W.add}
        </Button>
      </span>
    </div>
  );
}

export function PaneMemory({ flash }: { flash: (f: LegacyFlash) => void }) {
  const held = useSurface("ask_memory");
  if (held === undefined)
    return <EmptyState kind="card" glyph="sparkle" title={W.paneTitle} body={W.reading} testid="mem-reading" />;
  if (held === null)
    return (
      <EmptyState
        kind="card"
        glyph="alert"
        tone="warn"
        title={W.paneTitle}
        body={W.unread}
        action={{ label: W.retry, onClick: () => void refreshSurface("ask_memory"), testid: "mem-retry" }}
        testid="mem-unread"
      />
    );
  const { lines, journal, may_change: mayChange } = held.dto;
  const mayKeep = canDo("approve");
  const me = meNow()?.id ?? null;
  // The receipt in the pane's toast, and the refusal's words handed back to the box or the row that pressed.
  const press: Press = async (run) => {
    const r = await run();
    if (!r.ok) return r.message;
    flash({ msg: <>{r.receipt}</> });
    return null;
  };
  return (
    <>
      <section className="rec-card set-card" data-testid="rec-card-memory">
        <div className="rec-card-head">
          <h2 className="rec-card-title">{W.linesHead}</h2>
          <span className="rec-card-sub">{W.paneLede}</span>
        </div>
        {lines.length === 0 && <EmptyState kind="line" glyph="sparkle" body={W.none} testid="mem-none" />}
        {lines.map((l) => (
          <MemoryLine
            key={l.id}
            line={l}
            me={me}
            mayChange={mayChange}
            mayForget={mayChange || (mayKeep && !!me && l.kept_by === me)}
            press={press}
          />
        ))}
        {mayKeep && <AddLine press={press} />}
      </section>
      {/* The journal is the owners' (RLS): anyone else reads none, and the card is not drawn. */}
      {journal.length > 0 && (
        <section className="rec-card set-card" data-testid="rec-card-journal">
          <div className="rec-card-head">
            <h2 className="rec-card-title">{W.journalHead}</h2>
            <span className="rec-card-sub">{W.noJournal}</span>
          </div>
          {journal.map((d) => (
            <RecordRow key={d.day} id={`mem-day-${d.day}`} testid="mem-day" label={d.day} value={d.text} />
          ))}
        </section>
      )}
    </>
  );
}
