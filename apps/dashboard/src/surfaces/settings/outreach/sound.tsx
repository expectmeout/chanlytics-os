/**
 * Cold email: How you sound. To an owner the tone and the lines learned from how they write are one idea, so they are one
 * row and one sheet. The tone is a cold email's own, apart from the receptionist's, which it reads until one is set. The
 * lines are the ones Ask learned from an email the owner pasted (decision 0078), kept in Ask's memory and forgotten on
 * Settings › Memory; pasting reads one more through the door New's paste takes (the `sequence_voice` verb), never the
 * settings save, so it is a sheet of its own, opened from this one.
 */
import { useRef } from "react";
import {
  REACH_OUT_LIMITS,
  REACH_OUT_SETTINGS_WORDS,
  VOICE_PASTE_MIN,
  VOICE_WORDS,
  reachOutToneOf,
  textOrEmpty,
} from "@chanlytics/contracts";
import { commitVerb } from "@/bridge/verbs/commit";
import { gate, navigate } from "../../frame-verbs";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordField } from "../../kit/record/field";
import { recFolds } from "../../kit/record/registry";
import { RecordRow } from "../../kit/record/row";
import { BtFold } from "../business/gestures/fold";
import { roomSaid, type BoxFields } from "./box";
import { OutreachCard, storedReachOut, type OutreachShared } from "./card";

const SOUND_WORDS = REACH_OUT_SETTINGS_WORDS.sound;

/** The lines learned from how the owner writes, as the sheet lists them. */
const LearnedLines = ({ lines }: { lines: readonly { id: string; text: string }[] }) => (
  <div className="ro-learned" data-testid="rec-cold-voice-lines">
    <span className="ro-learned-head">{SOUND_WORDS.learned}</span>
    {lines.length ? (
      lines.map((l) => <span key={l.id}>{l.text}</span>)
    ) : (
      <span className="ro-learned-none">{SOUND_WORDS.learnedNone}</span>
    )}
    {lines.length ? (
      <LinkButton onClick={() => navigate("admin/memory")} data-testid="rec-cold-voice-memory">
        {SOUND_WORDS.memory}
      </LinkButton>
    ) : null}
  </div>
);

/** The sheet: the tone's box, what was learned, and the way to teach it more. */
function SoundBody({
  f,
  lines,
  shows,
  from,
}: {
  f: BoxFields;
  lines: readonly { id: string; text: string }[];
  shows: string | null;
  from: string | null;
}) {
  const text = textOrEmpty(f.draft);
  return (
    <>
      <RecordField
        id="ro-sound"
        label={null}
        aria-labelledby="rec-fold-sound-label"
        rows={2}
        grows
        value={text}
        onChange={(v) => f.update(() => v, ["sound"])}
        problem={f.problems.sound || null}
        hint={roomSaid(text.length, REACH_OUT_LIMITS.tone) ?? (shows !== null && text === shows ? from : null)}
        placeholder={SOUND_WORDS.tonePlaceholder}
        readOnly={f.readOnly || undefined}
        testid="rec-sound-box"
      />
      <LearnedLines lines={lines} />
      <span>
        <LinkButton {...f.press(() => recFolds.request("cold_voice"))} data-testid="rec-sound-paste">
          {SOUND_WORDS.paste}
        </LinkButton>
      </span>
      <p className="bt-fold-note" data-testid="rec-sound-note">
        {SOUND_WORDS.note} {SOUND_WORDS.reach}
      </p>
    </>
  );
}

/** What the paste's sheet is handed: its box's words, its one change, its refusal and whether it may be typed in. */
interface PasteFields {
  draft: unknown;
  update: (fn: (d: string) => string, keys?: string[]) => boolean;
  problems: Record<string, string>;
  readOnly: boolean;
}

/** The pasted email, read once by Ask into lines about how its owner writes. */
const PasteBox = ({ f }: { f: PasteFields }) => (
  <RecordField
    id="ro-cold_voice"
    label={null}
    aria-labelledby="rec-fold-cold_voice-label"
    rows={8}
    value={textOrEmpty(f.draft)}
    onChange={(v) => f.update(() => v, ["cold_voice"])}
    problem={f.problems.cold_voice || null}
    placeholder={VOICE_WORDS.placeholder}
    readOnly={f.readOnly || undefined}
    testid="rec-cold_voice-box"
  />
);

/** How you sound: one row saying the tone and how much was learned, and one sheet for both. */
export function SoundCard(shared: OutreachShared & { again: () => void }) {
  const tone = storedReachOut(shared, "tone");
  const receptionist = tone
    ? null
    : reachOutToneOf({ brain: { profile: { tone: textOrEmpty(shared.brain.profile?.tone) } } });
  const shown = tone ?? receptionist;
  const lines = shared.read?.voice ?? [];
  // Whether a paste is being read: held across draws, as the editor asks it on each.
  const pasting = useRef(false);
  const door = {
    initial: "",
    pending: () => pasting.current,
    save: (text: string, done: () => void) => {
      pasting.current = true;
      void commitVerb("sequence_voice", { text: text.trim() }).then((r) => {
        pasting.current = false;
        if (!r.ok) {
          shared.flash({ tone: "danger", msg: r.message });
          return;
        }
        shared.flash({ msg: r.receipt });
        shared.again();
        done();
      });
    },
  };
  const editGate = gate("settings", "change how your emails sound");
  return (
    <OutreachCard id="sound" title={SOUND_WORDS.title}>
      <BtFold<unknown>
        canEdit={shared.canEdit}
        flash={shared.flash}
        saver={shared.saver}
        id="sound"
        label={SOUND_WORDS.title}
        channel={null}
        gate={editGate}
        opensOn={tone ? null : receptionist}
        row={{ value: shown }}
        rest={({ request, can }) => (
          <RecordRow
            id="sound"
            stacked
            label={shown ? <span className="ro-clamp">{shown}</span> : SOUND_WORDS.empty}
            value={lines.length ? SOUND_WORDS.learnedCount(lines.length) : null}
            empty={tone ? null : shown ? SOUND_WORDS.toneFrom : null}
            act={
              shared.canEdit && can
                ? {
                    label: "Change",
                    name: `Change ${SOUND_WORDS.title.toLowerCase()}`,
                    onClick: () => request(),
                    gate: editGate,
                  }
                : null
            }
          />
        )}
        body={(f) => <SoundBody f={f} lines={lines} shows={receptionist} from={SOUND_WORDS.toneFrom} />}
      />
      <BtFold
        canEdit={shared.canEdit}
        flash={shared.flash}
        id="cold_voice"
        label={SOUND_WORDS.paste}
        channel={null}
        bare
        light
        saveLabel="Use it"
        gate={gate("settings", "teach it how you write")}
        door={door}
        check={(text: string): Record<string, string> =>
          text.trim().length < VOICE_PASTE_MIN ? { cold_voice: VOICE_WORDS.tooShort } : {}
        }
        body={(f) => <PasteBox f={f} />}
      />
    </OutreachCard>
  );
}
