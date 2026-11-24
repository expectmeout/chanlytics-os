/**
 * Settings › Content (the content loop PRD's 21.1; the approved boards, Settings 1-5): what is set for a business's posts,
 * seven sentences, each with what is set in it, each changed in place. "Tell AI what to change" stands on top, the quick
 * way; each line's Change is the direct way. Nothing is a row to pick from: what posts are for, how often, the quiet days
 * and the languages are said again as a sentence, which AI reads (POST content/line); offers are kept one by one in the
 * owner's words; the look is said too (pass 4's brand kit: AI reads the sentence, and its colours show beside it as
 * swatches and nothing else); "before anything posts" opens Autonomy, never a second control.
 */
import "../../campaigns/content/sheets/sheets.css";
import "./content.css";
import { useState } from "react";
import { contentLinesOf, zoneDayKey, type ContentLineView, type WeekPageDto } from "@chanlytics/contracts";
import { keepContentLine, keepOffer, withdrawOffer } from "@/bridge/verbs/week";
import { Button } from "../../kit/button/button";
import { Field, fieldProblem } from "../../kit/field/field";
import { useRecordFold } from "../../kit/record/hooks";
import { RecordInline } from "../../kit/record/inline";
import { RecordRow } from "../../kit/record/row";
import { gate, navigate, type FrameFlash } from "../../frame-verbs";
import { useSurface } from "../../use-surface";
import { AskLine } from "../../campaigns/content/sheets/ask-change";
import { ABOUT_CONTENT } from "../../campaigns/content/model/ask-about";

const SAYS = {
  tell: "Tell AI what to change",
  change: "Change",
  save: "Save",
  cancel: "Cancel",
  fine: "Said in your words. AI keeps to it, and posts fewer when the clips are thin.",
  fineLook: "Said in your words. Every video made from now on wears it.",
  withdraw: "Withdraw",
  addOffer: "An offer, in your words",
  until: "Its last day, if it has one",
  add: "Add it",
  gate: "change what your posts say",
} as const;

type Flash = (f: FrameFlash) => void;
type WordsKey = "goals" | "cadence" | "quiet_days" | "languages" | "look";

/** A line's words, with the look's colours beside them as swatches (the board: they only show colours). */
function LineWords({ line }: { line: ContentLineView }) {
  if (!line.colours?.length) return <>{line.words}</>;
  return (
    <span className="cset-look">
      <span>{line.words}</span>
      <span className="cset-swatches" data-testid="cset-swatches">
        {line.colours.map((colour) => (
          <svg key={colour} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <rect width="20" height="20" rx="6" fill={colour} />
          </svg>
        ))}
      </span>
    </span>
  );
}

/** A line said again in the owner's words: AI reads it, and it is kept as they said it. */
function WordsLine({ line }: { line: ContentLineView & { key: WordsKey } }) {
  const id = `cset-${line.key}`;
  const [draft, setDraft] = useState<string | null>(null);
  const words = draft ?? line.words;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fold = useRecordFold(id, { dirty: () => words.trim() !== line.words, saving: () => busy });
  const close = () => {
    setDraft(null);
    setProblem(null);
    fold.close();
  };
  const save = () => {
    if (!words.trim()) return setProblem(SAYS.fine);
    setBusy(true);
    void keepContentLine(line.key, words.trim()).then((answer) => {
      setBusy(false);
      if (answer.ok) close();
      else setProblem(answer.message);
    });
  };
  if (!fold.open)
    return (
      <RecordRow
        id={id}
        testid="cset-line"
        label={line.label}
        value={<LineWords line={line} />}
        stacked
        act={{ label: SAYS.change, onClick: fold.request, gate: gate("settings", SAYS.gate) }}
      />
    );
  return (
    <RecordInline
      id={id}
      label={line.label}
      open
      onSave={save}
      onCancel={close}
      saving={busy}
      saveLabel={SAYS.save}
      cancelLabel={SAYS.cancel}
      gate={gate("settings", SAYS.gate)}
    >
      <Field
        aria-label={line.label}
        value={words}
        onValueChange={(v) => {
          setDraft(v);
          setProblem(null);
        }}
        rows={3}
        maxLength={280}
        readOnly={busy}
        hint={line.key === "look" ? SAYS.fineLook : SAYS.fine}
        data-testid="cset-line-box"
        {...fieldProblem(problem)}
      />
    </RecordInline>
  );
}

/** The offers that stand, each withdrawn by itself, and one more added in the owner's words with its last day. */
function OffersLine({ line, page, flash }: { line: ContentLineView; page: WeekPageDto; flash: Flash }) {
  const id = "cset-offers";
  const [text, setText] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fold = useRecordFold(id, { dirty: () => !!text.trim(), saving: () => busy });
  const today = zoneDayKey(Date.now(), page.zone);
  const standing = page.claims.filter(
    (c) => c.kind === "offer" && !c.withdrawn_at && (!c.valid_until || c.valid_until >= today),
  );
  const close = () => {
    setText("");
    setUntil("");
    setProblem(null);
    fold.close();
  };
  const add = () => {
    if (!text.trim()) return close();
    setBusy(true);
    void keepOffer({ text: text.trim(), valid_until: until || null }).then((answer) => {
      setBusy(false);
      if (answer.ok) close();
      else setProblem(answer.message);
    });
  };
  const withdraw = (claimId: string) =>
    void withdrawOffer(claimId).then((answer) => {
      if (!answer.ok) flash({ tone: "danger", msg: <>{answer.message}</> });
    });
  if (!fold.open)
    return (
      <RecordRow
        id={id}
        testid="cset-line"
        label={line.label}
        value={line.words}
        stacked
        act={{ label: SAYS.change, onClick: fold.request, gate: gate("settings", SAYS.gate) }}
      />
    );
  return (
    <RecordInline
      id={id}
      label={line.label}
      open
      onSave={add}
      onCancel={close}
      saving={busy}
      saveLabel={SAYS.save}
      cancelLabel={SAYS.cancel}
      gate={gate("settings", SAYS.gate)}
    >
      {standing.map((offer) => (
        <div key={offer.id} className="cset-offer" data-testid="cset-offer">
          <span>
            {offer.text}
            {offer.valid_until ? `, until ${offer.valid_until}` : ""}
          </span>
          <Button size="sm" variant="quiet" onClick={() => withdraw(offer.id)}>
            {SAYS.withdraw}
          </Button>
        </div>
      ))}
      <Field
        label={SAYS.addOffer}
        value={text}
        onValueChange={(v) => {
          setText(v);
          setProblem(null);
        }}
        maxLength={280}
        readOnly={busy}
        data-testid="cset-offer-box"
        {...fieldProblem(problem)}
      />
      <Field label={SAYS.until} type="date" value={until} onValueChange={setUntil} readOnly={busy} />
    </RecordInline>
  );
}

const isWordsLine = (line: ContentLineView): line is ContentLineView & { key: WordsKey } => line.edit === "words";

export function PaneContent({ flash }: { flash: Flash }) {
  const page = useSurface("content_week")?.dto;
  if (!page) return null;
  const lines = contentLinesOf(page, zoneDayKey(Date.now(), page.zone));
  return (
    <div className="cset" data-testid="settings-content">
      <AskLine
        about={ABOUT_CONTENT}
        onAsked={() => undefined}
        placeholder={SAYS.tell}
        begin="In Settings › Content: "
      />
      {lines.map((line) =>
        isWordsLine(line) ? (
          <WordsLine key={line.key} line={line} />
        ) : line.edit === "offers" ? (
          <OffersLine key={line.key} line={line} page={page} flash={flash} />
        ) : (
          <RecordRow
            key={line.key}
            testid="cset-line"
            label={line.label}
            value={line.words}
            stacked
            act={line.to ? { label: SAYS.change, onClick: () => navigate(line.to ?? "") } : undefined}
          />
        ),
      )}
    </div>
  );
}
