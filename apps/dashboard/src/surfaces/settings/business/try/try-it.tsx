// Chanlytics — Settings › How it answers: Try it.
//
// A message written as a customer would, answered by the receptionist as it stands, and why (Ruben, 17 Oct 2026: "a Try
// it box on How it answers that shows the answer and why"). The last card of How it answers, under what it is told: an
// owner who has just changed how it talks, what it knows or a rule it keeps sees what that does before a customer does.
//
// At rest it is one row and its act, as every row of the page is (the page's rule: what an owner acts on without looking
// for it, and each row's act, quietly). The act opens the box under the row, a sheet on a phone, through the fold
// registry like any other row's editor, so one editor is open at a time and `admin/receptionist/try` opens it too.
//
// The answer is the server's (POST receptionist/try): the live prompt, clock and model, and what the live turn would do
// with it, nothing sent. Every word is contracts' (TRY_IT_WORDS, tryItVM): what a customer would read, what it wrote
// where your rules replaced it, what it read the message as, how sure it was, what it leaned on, its reason, and what
// happens next. A conversation is kept to six messages and starts over on a press; nothing of it is stored, and Close
// lets it go.
//
// Drawn on every draw of How it answers (tab.tsx), so its hooks keep their place; for a role that may not change the
// settings it draws nothing, as a row's act is absent rather than dead.

import { useState, type SyntheticEvent } from "react";
import { TRY_IT_MAX_CHARS, TRY_IT_MAX_EXCHANGES, TRY_IT_WORDS as W, type TryItVM } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { LinkButton } from "../../../kit/link-button/link-button";
import { RecordField } from "../../../kit/record/field";
import { RecordFold } from "../../../kit/record/fold";
import { useRecordFold } from "../../../kit/record/hooks";
import { RecordRow } from "../../../kit/record/row";
import { RecordSays } from "../../../kit/record/says";
import { tryVerbs, type TryTurn } from "./verbs";

/** The fold's id: the row's, which the address names (frame/tabs.ts ROW_PANES). */
const TRY = "try";

/** One message tried, and what came back. */
interface Tried {
  asked: string;
  vm: TryItVM;
}

/** The turns a try is asked after: each message tried and what a customer would have read back. */
const historyOf = (tried: readonly Tried[]): TryTurn[] =>
  tried.flatMap((t) => [
    { role: "user" as const, content: t.asked },
    { role: "assistant" as const, content: t.vm.said },
  ]);

/** One message and its answer: what was written, what it would answer, and why. Hookless. */
function BtTried({ t, at }: { t: Tried; at: number }) {
  const id = `try-${at}`;
  return (
    <div className="bt-try-turn" data-testid={`bt-try-turn-${at}`}>
      <RecordRow id={`${id}-asked`} label={W.customer} value={t.asked} />
      <RecordSays testid={`${id}-said`} label={W.receptionist} text={t.vm.said} gone={t.vm.wrote} goneLabel={W.wrote} />
      {t.vm.rows.map((r) => (
        <RecordRow key={r.key} id={`${id}-${r.key}`} label={r.label} value={r.value} />
      ))}
      <RecordRow
        id={`${id}-then`}
        label={W.rows.then}
        value={<span data-tone={t.vm.then.tone}>{t.vm.then.words}</span>}
      />
    </div>
  );
}

export function BtTryIt({ canEdit }: { canEdit: boolean }) {
  const fold = useRecordFold(TRY);
  const [text, setText] = useState("");
  const [tried, setTried] = useState<Tried[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!canEdit) return null;
  const full = tried.length >= TRY_IT_MAX_EXCHANGES;
  const asked = text.trim();

  const sendTry = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (busy || !asked || full) return;
    setBusy(true);
    setProblem(null);
    const r = await tryVerbs.ask(asked, historyOf(tried));
    setBusy(false);
    if (!r.ok) {
      setProblem(r.message);
      return;
    }
    setTried((was) => [...was, { asked, vm: r.vm }]);
    setText("");
  };
  const startOver = () => {
    setTried([]);
    setProblem(null);
  };
  // Close lets the conversation go: a try is never kept, so the next opens on an empty box.
  const close = () => {
    fold.close();
    startOver();
    setText("");
  };

  const row = (
    <RecordRow id={TRY} label={W.row.label} value={W.row.value} act={{ label: W.row.act, onClick: fold.request }} />
  );
  return (
    <section className="rec-card" data-testid="rec-card-try" aria-labelledby="bt-try-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-try-title">
          {W.title}
        </h2>
        <span className="rec-card-sub">{W.sub}</span>
      </div>
      {fold.open ? null : row}
      <RecordFold wide id={TRY} label={W.row.label} open={fold.open} onCancel={close} behind={row}>
        {tried.map((t, i) => (
          <BtTried key={i} t={t} at={i} />
        ))}
        <form className="bt-try-ask" onSubmit={sendTry} aria-busy={busy || undefined}>
          {full ? (
            <p className="rec-hint" data-testid="bt-try-full">
              {W.full}
            </p>
          ) : (
            <RecordField
              id="bt-try-text"
              label={W.label}
              value={text}
              onChange={setText}
              placeholder={W.placeholder}
              maxLength={TRY_IT_MAX_CHARS}
              problem={problem}
              readOnly={busy || undefined}
              testid="bt-try-field"
            />
          )}
          <span className="bt-try-acts">
            {full ? null : (
              <Button type="submit" size="sm" variant="primary" disabled={busy || !asked} data-testid="bt-try-ask">
                {busy ? W.asking : W.ask}
              </Button>
            )}
            {tried.length ? (
              <LinkButton onClick={startOver} disabled={busy} data-testid="bt-try-again">
                {W.again}
              </LinkButton>
            ) : null}
          </span>
        </form>
      </RecordFold>
    </section>
  );
}
