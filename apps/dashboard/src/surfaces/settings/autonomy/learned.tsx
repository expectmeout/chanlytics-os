/**
 * What the receptionist learned from the owner's corrections, on Settings › Autonomy (decision 0063): each note an owner's
 * rewrite or reply suggested, newest first, with what they wrote, and Keep as a note or Dismiss. Keep is the settings' own
 * write on the server, so the presses are the settings' role (gate "settings"); the row goes at once, and the settings are
 * read again behind the verb (the refresh map), which carries the list as it then stands. Nothing is drawn while none waits,
 * nor where the read failed: the matrix above stands either way.
 */
import { useState } from "react";
import { FACT_SUGGEST_WORDS as W, type FactSuggestionDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { RecordRow } from "../../kit/record/row";
import { gate, type LegacyFlash } from "../../legacy-verbs";
import { autonomyVerbs } from "./verbs";

export function LearnedFromYou({
  suggestions,
  flash,
}: {
  suggestions: readonly FactSuggestionDto[] | null | undefined;
  flash: (f: LegacyFlash) => void;
}) {
  // The suggestions answered here, gone from the card at once while the settings are read again behind the verb.
  const [gone, setGone] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const shown = (suggestions ?? []).filter((s) => !gone.includes(s.id));
  if (!shown.length) return null;
  const answer = async (s: FactSuggestionDto, keep: boolean) => {
    if (busy) return;
    setBusy(s.id);
    const r = await autonomyVerbs.answerFact(s, keep);
    setBusy(null);
    if (!r.ok) {
      flash({
        tone: "danger",
        msg: (
          <>
            <b>Not changed</b> — {r.message}
          </>
        ),
      });
      return;
    }
    setGone((was) => [...was, s.id]);
    flash({ msg: <>{r.receipt}</> });
  };
  return (
    <section className="rec-card set-card" data-testid="aut-learned">
      <div className="rec-card-head">
        <h2 className="rec-card-title">{W.heading}</h2>
        <span className="rec-card-sub">{W.sub}</span>
      </div>
      {/* One primary press on the card: the newest note's Keep; the others are quieter, as every list's rows are. */}
      {shown.map((s, i) => (
        <RecordRow
          key={s.id}
          id={`aut-fact-${s.id}`}
          testid="aut-fact"
          label={s.title}
          value={s.body}
          hint={W.wrote(s.source, s.quote)}
        >
          <span className="aut-fact-acts">
            <Button
              size="sm"
              variant={i === 0 ? "primary" : "secondary"}
              disabled={busy === s.id}
              onClick={() => void answer(s, true)}
              {...gate("settings", "keep a note for the receptionist")}
              aria-label={`${W.keep}: ${s.title}`}
              data-testid="aut-fact-keep"
            >
              {W.keep}
            </Button>
            <Button
              size="sm"
              variant="quiet"
              disabled={busy === s.id}
              onClick={() => void answer(s, false)}
              {...gate("settings", "dismiss a note for the receptionist")}
              aria-label={`${W.dismiss}: ${s.title}`}
              data-testid="aut-fact-dismiss"
            >
              {W.dismiss}
            </Button>
          </span>
        </RecordRow>
      ))}
    </section>
  );
}
