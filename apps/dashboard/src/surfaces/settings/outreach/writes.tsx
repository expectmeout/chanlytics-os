/**
 * How it reaches out (decision 0113): How it writes, and Sign-off. The tone is a cold email's own, apart from the
 * receptionist's, which it reads until one is set. How you write is the lines Ask learned from an email the owner pasted
 * (decision 0078), kept in Ask's memory and forgotten on Settings › Memory; Paste an email reads one more, through the
 * door New's paste takes (the `sequence_voice` verb), never the settings save. The sign-off's rows are the section's,
 * and what is always added at the bottom is code's: the address on Details and the way to say no.
 */
import { useRef } from "react";
import {
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
import { RecordRow } from "../../kit/record/row";
import { BtFold } from "../business/gestures/fold";
import { settingsRowRoute } from "../frame/tabs";
import { OutreachCard, storedReachOut, type OutreachShared } from "./card";

const WRITES_CARDS = REACH_OUT_SETTINGS_WORDS;
type Fields = Parameters<Parameters<typeof BtFold>[0]["body"]>[0];

/** A box of words, named by its fold's label on screen. */
const Box = ({ id, rows, placeholder, f }: { id: string; rows: number; placeholder: string; f: Fields }) => (
  <RecordField
    id={`ro-${id}`}
    label={null}
    aria-labelledby={`rec-fold-${id}-label`}
    rows={rows}
    value={textOrEmpty(f.draft)}
    onChange={(v) => f.update(() => v, [id])}
    problem={f.problems[id] || null}
    placeholder={placeholder}
    readOnly={f.readOnly || undefined}
    testid={`rec-${id}-box`}
  />
);

/** A fold of one key of the section: what is set, or what stands in its place and why, and its box. */
const keyFold = (
  shared: OutreachShared,
  spec: {
    id: string;
    key: string;
    label: string;
    rows: number;
    placeholder: string;
    empty: string;
    hint?: string | null;
  },
) => (
  <BtFold
    canEdit={shared.canEdit}
    flash={shared.flash}
    saver={shared.saver}
    id={spec.id}
    label={spec.label}
    channel={null}
    gate={gate("settings", `change ${spec.label.toLowerCase()}`)}
    row={{ value: storedReachOut(shared, spec.key), empty: spec.empty, hint: spec.hint ?? null }}
    body={(f) => <Box id={spec.id} rows={spec.rows} placeholder={spec.placeholder} f={f} />}
  />
);

/** The pasted email, read once by Ask into lines about how its owner writes. */
/** What the paste's body is handed: its box's words, its one change, its refusal and whether it may be typed in. */
interface PasteFields {
  draft: unknown;
  update: (fn: (d: string) => string, keys?: string[]) => boolean;
  problems: Record<string, string>;
  readOnly: boolean;
}

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

/** How it writes: a tone of its own for cold email, and the lines learned from how the owner writes. */
export function WritesCard(shared: OutreachShared & { again: () => void }) {
  const tone = storedReachOut(shared, "tone");
  const receptionist = tone
    ? null
    : reachOutToneOf({ brain: { profile: { tone: textOrEmpty(shared.brain.profile?.tone) } } });
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
  return (
    <OutreachCard id="writes" title={WRITES_CARDS.writes.title} sub={WRITES_CARDS.writes.sub}>
      {keyFold(shared, {
        id: "cold_tone",
        key: "tone",
        label: WRITES_CARDS.writes.tone,
        rows: 2,
        placeholder: "Direct and friendly, no small talk",
        empty: receptionist ?? WRITES_CARDS.offer.empty,
        hint: receptionist ? WRITES_CARDS.writes.toneFrom : WRITES_CARDS.writes.toneHint,
      })}
      <BtFold
        canEdit={shared.canEdit}
        flash={shared.flash}
        id="cold_voice"
        label={WRITES_CARDS.writes.voice}
        channel={null}
        light
        saveLabel="Use it"
        gate={gate("settings", "teach it how you write")}
        door={door}
        check={(text: string): Record<string, string> =>
          text.trim().length < VOICE_PASTE_MIN ? { cold_voice: VOICE_WORDS.tooShort } : {}
        }
        row={{
          value: lines.length ? (
            <span className="ro-lines" data-testid="rec-cold-voice-lines">
              {lines.map((l) => (
                <span key={l.id}>{l.text}</span>
              ))}
            </span>
          ) : null,
          empty: WRITES_CARDS.writes.voiceNone,
          hint: lines.length ? (
            <>
              {WRITES_CARDS.writes.voiceFrom} ·{" "}
              <LinkButton onClick={() => navigate("admin/memory")} data-testid="rec-cold-voice-memory">
                {WRITES_CARDS.writes.memory}
              </LinkButton>
            </>
          ) : null,
          act: WRITES_CARDS.writes.paste,
        }}
        body={(f) => <PasteBox f={f} />}
      />
    </OutreachCard>
  );
}

/** Sign-off: the name every email signs with, its signature and phone, and what code always adds under them. */
export function SignOffCard(shared: OutreachShared) {
  const named = storedReachOut(shared, "signed_by");
  const fromSequence = named ? null : (shared.read?.sequence?.signed_by ?? null);
  return (
    <OutreachCard id="sign-off" title={WRITES_CARDS.signOff.title} sub={WRITES_CARDS.signOff.sub}>
      {keyFold(shared, {
        id: "signed_by",
        key: "signed_by",
        label: WRITES_CARDS.signOff.signedBy,
        rows: 1,
        placeholder: "Maya",
        empty: fromSequence ?? WRITES_CARDS.offer.empty,
        hint: fromSequence ? WRITES_CARDS.signOff.signedByFrom : WRITES_CARDS.signOff.signedByHint,
      })}
      {keyFold(shared, {
        id: "signature",
        key: "signature",
        label: WRITES_CARDS.signOff.signature,
        rows: 3,
        placeholder: "Maya Ortiz, Owner, Brightline Cleaning",
        empty: WRITES_CARDS.signOff.signatureNone,
      })}
      {keyFold(shared, {
        id: "sign_phone",
        key: "phone",
        label: WRITES_CARDS.signOff.phone,
        rows: 1,
        placeholder: "(512) 555-0148",
        empty: WRITES_CARDS.signOff.phoneNone,
      })}
      <RecordRow
        id="sign_foot"
        label={WRITES_CARDS.signOff.foot}
        value={WRITES_CARDS.signOff.footValue}
        hint={WRITES_CARDS.signOff.footHint}
        act={{
          label: WRITES_CARDS.signOff.footAct,
          icon: "chevron",
          onClick: () => navigate(settingsRowRoute("address")),
        }}
      />
    </OutreachCard>
  );
}
