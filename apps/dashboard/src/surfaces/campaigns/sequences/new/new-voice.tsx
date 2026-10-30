/**
 * The owner's voice under a draft to leads (decision 0078): the lines Ask learned from how they write, with Memory beside
 * them, where they live and are forgotten; or, where it learned none, one paste. Use keeps what Ask reads in it and has
 * Ask draft again from the same line. A draft to people, one built by hand, and one from a server before this draw none.
 * Every word is contracts' (new-draft.ts), and Use is the page verb `sequence_voice`.
 */
import { useState } from "react";
import {
  VOICE_PASTE_MIN,
  VOICE_WORDS as V,
  voiceLineOf,
  type NewDraftDto,
  type SequenceVoiceDto,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { LinkButton } from "../../../kit/link-button/link-button";
import { gate, navigate } from "../../../legacy-verbs";
import { sequenceVerbs } from "../verbs";

/** Settings › Memory, where a learned line is listed and forgotten. */
const MEMORY = "admin/memory";

export function DraftVoice({ draft, again }: { draft: NewDraftDto; again: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  if (draft.kind !== "sequence" || draft.audience !== "leads" || !draft.said || draft.voice === undefined) return null;
  const line = voiceLineOf(draft.voice);
  if (line)
    return (
      <p className="sq-nw-note" data-testid="sq-nw-voice">
        {line}{" "}
        <LinkButton onClick={() => navigate(MEMORY)} data-testid="sq-nw-voice-memory">
          {V.memory}
        </LinkButton>
      </p>
    );
  const use = async () => {
    setBusy(true);
    setSaid(null);
    const r = await sequenceVerbs.learnVoice(text.trim());
    setBusy(false);
    if (!r.ok) {
      setSaid(r.message);
      return;
    }
    // The receipt says what was kept; a paste that kept a line has Ask draft again with it.
    setSaid(r.receipt);
    if ((r.data as SequenceVoiceDto).lines.length > 0) {
      setText("");
      again();
    }
  };
  return (
    <div className="sq-nw-voice" data-testid="sq-nw-voice-paste">
      <p className="sq-nw-note">{V.paste}</p>
      <Field
        aria-label={V.paste}
        rows={4}
        value={text}
        placeholder={V.placeholder}
        onValueChange={setText}
        data-testid="sq-nw-voice-text"
      />
      <span className="sq-nw-voice-act">
        <Button
          size="sm"
          onClick={() => void use()}
          disabled={busy || text.trim().length < VOICE_PASTE_MIN}
          {...gate("approve")}
          data-testid="sq-nw-voice-use"
        >
          {busy ? V.reading : V.use}
        </Button>
      </span>
      {said ? (
        <p className="sq-nw-note" data-testid="sq-nw-voice-said">
          {said}
        </p>
      ) : null}
    </div>
  );
}
