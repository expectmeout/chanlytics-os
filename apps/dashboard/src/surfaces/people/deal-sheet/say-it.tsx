/**
 * Say it (the sheets as verbs, 14 Oct 2026, step 5): the line at the top of the deal sheet and the note sheet where a
 * member says what happened in their own words, and the sheet's fields are filled from it (POST people/[id]/say,
 * legacy-bridge/verbs/say.ts). Its Fill stands inside the box's end (21 Oct 2026), where it hung on a line of its own.
 * It fills; it never saves: the sheet says what it filled, the member reads the fields, and Save is theirs, through the
 * verb the sheet always commits. Its words are contracts' (SAY_IT_WORDS).
 */
import { useState } from "react";
import { SAY_IT_MAX, SAY_IT_WORDS, sayItFilled, type SayItDto, type SayItVerb } from "@chanlytics/contracts";
import { sayIt } from "@/legacy-bridge/verbs/say";
import { Button } from "../../kit/button/button";
import { RecordField } from "../../kit/record/field";

/** The line: what was said, the press that reads it, and what came of it under it. */
export function SayItLine({
  personId,
  verb,
  busy,
  onFill,
  testid,
}: {
  personId: string;
  verb: SayItVerb;
  /** The sheet's own save is out: nothing is read over it. */
  busy: boolean;
  /** What the sheet takes of the answer into its draft. */
  onFill: (dto: SayItDto) => void;
  testid: string;
}) {
  const W = SAY_IT_WORDS;
  const [words, setWords] = useState("");
  const [reading, setReading] = useState(false);
  const [said, setSaid] = useState<{ tone: "ok" | "problem"; words: string } | null>(null);
  const read = async () => {
    const line = words.trim();
    if (!line || reading || busy) return;
    setReading(true);
    setSaid(null);
    const r = await sayIt(personId, verb, line);
    setReading(false);
    if (!r.ok) {
      setSaid({ tone: "problem", words: r.message || W.failed });
      return;
    }
    if (!sayItFilled(r.data)) {
      setSaid({ tone: "problem", words: W.empty });
      return;
    }
    onFill(r.data);
    setWords("");
    setSaid({ tone: "ok", words: W.filled });
  };
  return (
    <div className="say-it" data-testid={testid}>
      <RecordField
        id={`${testid}-words`}
        label={W.label}
        placeholder={W.placeholder[verb]}
        maxLength={SAY_IT_MAX}
        value={words}
        onChange={setWords}
        readOnly={busy || reading}
        onKeyDown={(e: { key: string; preventDefault: () => void }) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          void read();
        }}
        problem={said?.tone === "problem" ? said.words : null}
        hint={said?.tone === "ok" ? said.words : null}
        data-testid={`${testid}-input`}
        testid={`${testid}-words`}
        action={
          <Button
            size="sm"
            disabled={busy || !words.trim()}
            aria-busy={reading || undefined}
            onClick={() => void read()}
            data-testid={`${testid}-go`}
          >
            {reading ? W.busy : W.go}
          </Button>
        }
      />
    </div>
  );
}
