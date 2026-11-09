/**
 * Ask rewrites an email, in its sheet (2 Nov 2026): the owner says what should change on a line under the email they are
 * reading, and the answer (POST sequences/:id/rewrite) stands in the box as if typed, saved as typed words are, the words
 * it replaced kept for Undo until they type over it. What a rule kept out is said under the line. While it is written the
 * box takes no typing, and a sheet closed by then leaves the email alone.
 */
import { useEffect, useRef, useState } from "react";
import { LEAD_BUILD_WORDS as W, LEAD_REWRITE_CHANGE_MAX } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field, fieldProblem } from "../../../kit/field/field";
import { focusAsDrawn, gate } from "../../../frame-verbs";
import { reachOuts } from "../../reach-out/surface";

/** An email's words, as the sheet holds them: a later one has no subject (null). */
interface EmailWords {
  subject: string | null;
  body: string;
}

const sameWords = (a: EmailWords, b: EmailWords) => (a.subject ?? "") === (b.subject ?? "") && a.body === b.body;

/** The rewrite of the email the sheet holds: what is being said, what came back, and the words it replaced. */
export function useLeadRewrite(sequenceId: string, words: EmailWords, put: (w: EmailWords) => void) {
  const [change, setChange] = useState("");
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [left, setLeft] = useState<string | null>(null);
  const [wrote, setWrote] = useState<{ was: EmailWords; now: EmailWords } | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const rewrite = async () => {
    const said = change.trim();
    if (asking || !said) return;
    setAsking(true);
    setProblem(null);
    setLeft(null);
    const r = await reachOuts
      .rewrite(sequenceId, { subject: words.subject, body: words.body, change: said })
      .catch(() => ({ ok: false as const, message: W.rewriteFailed }));
    if (!live.current) return;
    setAsking(false);
    if (!r.ok) {
      setProblem(r.message);
      return;
    }
    const now = { subject: r.data.subject, body: r.data.body };
    setWrote({ was: words, now });
    setLeft(r.data.cannot);
    setChange("");
    put(now);
  };
  const undo = () => {
    if (!wrote) return;
    put(wrote.was);
    setWrote(null);
    setLeft(null);
  };
  return { change, setChange, asking, problem, left, canUndo: !!wrote && sameWords(wrote.now, words), rewrite, undo };
}

/** What should change, and the press that asks: under the email, which stays in sight. */
export function LeadRewrite({ r }: { r: ReturnType<typeof useLeadRewrite> }) {
  return (
    <div className="ld-write" data-testid="ld-rewrite">
      <Field
        label={W.rewriteChange}
        value={r.change}
        onValueChange={r.setChange}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          void r.rewrite();
        }}
        maxLength={LEAD_REWRITE_CHANGE_MAX}
        readOnly={r.asking}
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- Ask rewrites it opened it to say what should change
        autoFocus={focusAsDrawn()}
        enterKeyHint="go"
        data-testid="ld-rewrite-change"
        {...fieldProblem(r.problem)}
      />
      <div className="ld-write-acts">
        <Button
          size="sm"
          variant="primary"
          disabled={!r.change.trim() && !r.asking}
          aria-busy={r.asking}
          onClick={() => void r.rewrite()}
          data-testid="ld-rewrite-go"
          {...gate("approve", "rewrite this email")}
        >
          {r.asking ? W.rewriteGoing : W.rewriteGo}
        </Button>
        {r.canUndo ? (
          <Button size="sm" variant="quiet" onClick={r.undo} data-testid="ld-rewrite-undo">
            {W.rewriteUndo}
          </Button>
        ) : null}
      </div>
      {r.left ? (
        <p className="ld-note" aria-live="polite" data-testid="ld-rewrite-left">
          {r.left}
        </p>
      ) : null}
    </div>
  );
}
