// Chanlytics — Settings › Business › How it answers › On calls: the voice callers hear (the Settings wiring review,
// item 11, 18 Oct 2026).
//
// Every line spoke in the product's voice, a Spanish-speaking salon's too. One row: the voice the line speaks in, and an
// editor with the list of voices (contracts PHONE_VOICES: what the provider says of each) and the chosen one's sample,
// heard before it is kept. Saved through the tab's one saver as a key of the profile (`phone_voice`), and sent with every
// call from the next one (the edge's inbound webhook, as Retell's agent_override): no agent is changed and nothing is
// published. Every word is contracts' (PHONE_VOICE_WORDS); the samples are the provider's own, which the dashboard's
// media rule allows (csp.ts).

import { useEffect, useRef, useState } from "react";
import { PHONE_VOICES, PHONE_VOICE_WORDS, phoneVoiceOf, phoneVoiceShown } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { RecordCombobox } from "../../../kit/record/combobox";
import { gate, type LegacyFlash } from "../../../legacy-verbs";
import { BtRow } from "../gestures/row";
import type { Brain, Config, Saver } from "../save";

/** A voice as a key of the profile: the one chosen, everything beside it kept. */
const withVoice =
  (id: string) =>
  (c: Config): Config => {
    const brain = c.brain || {};
    return { ...c, brain: { ...brain, profile: { ...(brain.profile || {}), phone_voice: id } } };
  };

/**
 * The chosen voice's sample, played and stopped: one sample at a time, and none left playing once the editor closes.
 * The provider's own recording, so what is heard is the voice, never a guess at it.
 */
function BtVoiceSample({ id }: { id: string }) {
  const voice = phoneVoiceShown(id);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(false);
  };
  // Another voice chosen, or the editor closed: what was playing stops.
  useEffect(() => stop, [id]);
  const play = () => {
    stop();
    const a = new Audio(voice.sample);
    audio.current = a;
    a.onended = () => setPlaying(false);
    setPlaying(true);
    void a.play().catch(() => setPlaying(false));
  };
  return (
    <Button size="sm" variant="quiet" onClick={playing ? stop : play} data-testid="rec-voice-sample">
      {playing ? PHONE_VOICE_WORDS.stop : PHONE_VOICE_WORDS.listen(voice.name)}
    </Button>
  );
}

/** The voice callers hear: the one chosen, else the product's, with what the provider says of it. */
export const BtVoiceRow = ({
  brain,
  canEdit,
  flash,
  saver,
}: {
  brain: Brain;
  canEdit: boolean;
  flash: (f: LegacyFlash) => void;
  saver: Saver | null;
}) => {
  const shown = phoneVoiceShown(brain.profile?.phone_voice);
  const door = saver
    ? {
        save: (id: string, done: () => void) =>
          saver.save({
            row: "phone_voice",
            patch: withVoice(id),
            said: PHONE_VOICE_WORDS.saved(phoneVoiceShown(id).name),
            done,
            flash,
          }),
        pending: () => saver.pending("phone_voice"),
      }
    : null;
  return (
    <BtRow
      brain={brain}
      canEdit={canEdit && !!door}
      flash={flash}
      id="phone_voice"
      label={PHONE_VOICE_WORDS.label}
      value={`${shown.name} · ${shown.says}`}
      gate={gate("settings", PHONE_VOICE_WORDS.gate)}
      initial={shown.id}
      storedAs={(d: string) => d}
      // Only a voice on the list is kept: the edge would send no other.
      check={(d: string) => (phoneVoiceOf(d) ? null : PHONE_VOICE_WORDS.unlisted)}
      door={door}
      body={({ draft, set, field }) => (
        <div className="bt-stack">
          <RecordCombobox
            id={field.id}
            label={PHONE_VOICE_WORDS.label}
            value={draft}
            options={PHONE_VOICES.map((v) => ({ value: v.id, label: v.name, meta: v.says }))}
            onChange={set}
            readOnly={field.readOnly || undefined}
            testid="rec-voice-pick"
          />
          <BtVoiceSample id={draft} />
        </div>
      )}
    />
  );
};
