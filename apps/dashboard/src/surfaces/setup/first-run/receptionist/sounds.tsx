/**
 * How it sounds (decision 0073, canvas 2, 2·e, 2·f, 2·g): the panel beside Your receptionist on a desk, a sheet from its
 * one line on a phone. The voice (the eight on the list, each heard in the provider's own sample), the personality (the
 * four presets, written into the tone, with a reply said in it), the pace (R7: each call's voice speed), the name it
 * goes by (said beside "the automated assistant", never instead of it), and, where the first language the business
 * speaks is not the voice's own, the voices that sound native to it.
 *
 * Every pick saves at once through the Business tab's one saver (a profile key each), as the voice's row on How it
 * answers does; the name saves as the box is left. Every word is contracts'.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FIRST_RUN_HELPERS,
  PHONE_PACES,
  PHONE_PACE_WORDS,
  PHONE_VOICES,
  PHONE_VOICES_NATIVE_TO,
  PHONE_VOICE_WORDS,
  PROFILE_LIMITS,
  TONE_PRESETS,
  personalityOf,
  phonePaceShown,
  phoneVoiceShown,
  type PhonePace,
  type Personality,
} from "@chanlytics/contracts";
import { Icon } from "../../../kit/icon/icon";
import { RecordField, RecordToggleGroup } from "../../../kit/record/field";
import { gate, type LegacyFlash } from "../../../legacy-verbs";
import { businessTabSave } from "../../shell";
import type { CardBrain } from "../inputs";

const SW = FIRST_RUN_HELPERS.words.sounds;

/** A profile key saved through the tab's one saver: set, or taken away where emptied. */
function saveProfileKey(o: {
  key: "phone_voice" | "phone_pace" | "tone" | "assistant_name";
  value: string | null;
  said: string;
  flash: (f: LegacyFlash) => void;
}): void {
  businessTabSave.saver.save({
    row: o.key,
    change: (b, p) => {
      if (o.value) p[o.key] = o.value;
      else delete p[o.key];
      b.profile = p;
      return b;
    },
    said: o.said,
    flash: o.flash,
  });
}

/** One voice's sample, played and stopped: one at a time, none left playing once the panel goes. */
export function useVoiceSample(): { playing: string | null; toggle: (id: string) => void } {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(null);
  };
  useEffect(() => stop, []);
  const toggle = (id: string) => {
    const was = playing;
    stop();
    if (was === id) return;
    const a = new Audio(phoneVoiceShown(id).sample);
    audio.current = a;
    a.onended = () => setPlaying(null);
    setPlaying(id);
    void a.play().catch(() => setPlaying(null));
  };
  return { playing, toggle };
}

/** The eight voices, each a pick with its sample beside it. */
function voiceList(o: {
  chosen: string;
  sample: ReturnType<typeof useVoiceSample>;
  canEdit: boolean;
  pick: (id: string) => void;
}): ReactNode {
  const { chosen, sample, canEdit, pick } = o;
  return (
    <ul className="fr-voices" data-testid="fr-voices">
      {PHONE_VOICES.map((v) => (
        <li key={v.id} className="fr-voice" data-chosen={v.id === chosen || undefined}>
          <button
            type="button"
            className="btn btn-sm btn-ghost fr-voice-pick"
            aria-pressed={v.id === chosen}
            onClick={() => canEdit && pick(v.id)}
            data-testid={`fr-voice-${v.name.toLowerCase()}`}
            {...gate("settings", PHONE_VOICE_WORDS.gate)}
          >
            <span className="fr-voice-name">{v.name}</span>
            <span className="fr-detail">{v.says}</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-icon btn-ghost"
            aria-label={sample.playing === v.id ? SW.stop : SW.hear(v.name)}
            onClick={() => sample.toggle(v.id)}
            data-testid={`fr-voice-hear-${v.name.toLowerCase()}`}
          >
            <Icon name={sample.playing === v.id ? "pause" : "play"} size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Where the first language is one the voice is not native to (canvas 2·f): the voices that are, one press to use one. */
function accentNote(o: {
  voiceId: string;
  languages: readonly string[];
  pick: (id: string) => void;
  canEdit: boolean;
}) {
  const first = o.languages[0];
  const natives = first ? (PHONE_VOICES_NATIVE_TO[first] ?? []) : [];
  const [native] = natives;
  if (!native || natives.includes(o.voiceId)) return null;
  const voice = phoneVoiceShown(o.voiceId);
  const names = natives.map((id) => phoneVoiceShown(id).name);
  return (
    <div className="fr-accent" data-testid="fr-accent">
      <p className="fr-detail">{SW.accent(voice.name, first ?? "", names)}</p>
      {o.canEdit ? (
        <button type="button" className="link-btn" onClick={() => o.pick(native)} data-testid="fr-accent-use">
          {SW.switchTo(phoneVoiceShown(native).name)}
        </button>
      ) : null}
    </div>
  );
}

/** The name it goes by: kept as the box is left, emptied to none. */
function NameBox({
  brain,
  canEdit,
  flash,
  id,
}: {
  brain: CardBrain;
  canEdit: boolean;
  flash: (f: LegacyFlash) => void;
  id: string;
}) {
  const stored = (brain.profile?.assistant_name ?? "").trim();
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? stored;
  const keep = () => {
    if (typed === null) return;
    const next = typed.replace(/\s+/g, " ").trim().slice(0, PROFILE_LIMITS.assistantName);
    setTyped(null);
    if (next === stored) return;
    saveProfileKey({ key: "assistant_name", value: next || null, said: SW.kept(next || null), flash });
  };
  return (
    <RecordField
      id={id}
      label={SW.name}
      value={shown}
      // The voice it speaks in, as its example: a name beside the one being heard read as a second receptionist.
      placeholder={phoneVoiceShown(brain.profile?.phone_voice).name}
      maxLength={PROFILE_LIMITS.assistantName}
      onChange={setTyped}
      onBlur={keep}
      readOnly={!canEdit || undefined}
      hint={SW.nameHint}
      testid="fr-sounds-name"
    />
  );
}

/** How it sounds, as a panel: the voices, the personality and its reply, the pace and the name. */
export function FrSounds({
  brain,
  canEdit,
  flash,
  onDone,
  ids = "fr-sounds",
}: {
  brain: CardBrain;
  canEdit: boolean;
  flash: (f: LegacyFlash) => void;
  /** On a phone's sheet, the press that closes it; none beside the step on a desk. */
  onDone?: () => void;
  /** The base its element ids are made from: the panel beside the step and the phone's sheet are on one page. */
  ids?: string;
}) {
  const sample = useVoiceSample();
  const p = brain.profile ?? {};
  const voice = phoneVoiceShown(p.phone_voice);
  const personality = personalityOf(p.tone);
  const preset = personality ? TONE_PRESETS.find((t) => t.key === personality) : null;
  const pace = phonePaceShown(p.phone_pace);
  const pickVoice = (id: string) =>
    saveProfileKey({ key: "phone_voice", value: id, said: PHONE_VOICE_WORDS.saved(phoneVoiceShown(id).name), flash });
  return (
    <section className="panel fr-sounds" aria-labelledby={`${ids}-title`} data-testid="fr-sounds">
      <h2 className="fr-sub" id={`${ids}-title`}>
        {SW.heading}
      </h2>
      <p className="fr-quiet" data-testid="fr-sounds-line">
        {FIRST_RUN_HELPERS.sounds(p)}
      </p>
      <span className="fr-label">{SW.voices}</span>
      {voiceList({ chosen: voice.id, sample, canEdit, pick: pickVoice })}
      <p className="fr-detail">{SW.voicesNote}</p>
      {accentNote({ voiceId: voice.id, languages: p.languages ?? [], pick: pickVoice, canEdit })}
      <span className="fr-label" id={`${ids}-personality-label`}>
        {SW.personality}
      </span>
      <RecordToggleGroup<Personality>
        id={`${ids}-personality`}
        labelledBy={`${ids}-personality-label`}
        value={personality}
        options={TONE_PRESETS.map((t) => ({ value: t.key, label: t.label }))}
        onChange={(key) => {
          const t = TONE_PRESETS.find((x) => x.key === key);
          if (t) saveProfileKey({ key: "tone", value: t.tone, said: SW.kept(t.label), flash });
        }}
        readOnly={!canEdit}
        gate={gate("settings", "change how it sounds")}
        wrap
        testid="fr-sounds-personality"
      />
      {preset ? (
        <p className="fr-quote" data-testid="fr-sounds-sample">
          “{preset.sample}”
        </p>
      ) : null}
      <span className="fr-label" id={`${ids}-pace-label`}>
        {PHONE_PACE_WORDS.label}
      </span>
      <RecordToggleGroup<PhonePace>
        id={`${ids}-pace`}
        labelledBy={`${ids}-pace-label`}
        value={pace}
        options={PHONE_PACES.map((k) => ({ value: k, label: PHONE_PACE_WORDS.options[k] }))}
        onChange={(k) =>
          saveProfileKey({
            key: "phone_pace",
            value: k === "natural" ? null : k,
            said: PHONE_PACE_WORDS.saved(k),
            flash,
          })
        }
        readOnly={!canEdit}
        gate={gate("settings", PHONE_PACE_WORDS.gate)}
        wrap
        testid="fr-sounds-pace"
      />
      <NameBox brain={brain} canEdit={canEdit} flash={flash} id={`${ids}-name`} />
      <p className="fr-detail">{SW.later}</p>
      {onDone ? (
        <button type="button" className="btn btn-primary fr-sounds-done" onClick={onDone} data-testid="fr-sounds-done">
          {SW.done}
        </button>
      ) : null}
    </section>
  );
}
