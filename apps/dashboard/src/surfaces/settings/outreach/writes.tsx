/**
 * How it reaches out (decision 0113): How it writes, and Sign-off. The tone is a cold email's own, apart from the
 * receptionist's, which it reads until one is set. How you write is the lines Ask learned from an email the owner pasted
 * (decision 0078), kept in Ask's memory and forgotten on Settings › Memory; Paste an email reads one more, through the
 * door New's paste takes (the `sequence_voice` verb), never the settings save. The sign-off's rows are the section's,
 * and what is always added at the bottom is code's: the address on Details and the way to say no.
 */
import { useRef } from "react";
import { REACH_OUT_SETTINGS_WORDS, VOICE_PASTE_MIN, VOICE_WORDS, reachOutToneOf } from "@chanlytics/contracts";
import { commitVerb } from "@/bridge/verbs/commit";
import { gate, navigate } from "../../frame-verbs";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordField } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import { BtFold } from "../business/gestures/fold";
import { settingsRowRoute } from "../frame/tabs";
import { OutreachCard, type OutreachShared } from "./card";

const W = REACH_OUT_SETTINGS_WORDS;
type Fields = Parameters<Parameters<typeof BtFold>[0]["body"]>[0];

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
const stored = (shared: OutreachShared, key: string): string | null =>
  textOf(shared.config.reach_out?.[key]).trim() || null;

/** A box of words, named by its fold's label on screen. */
const Box = ({ id, rows, placeholder, f }: { id: string; rows: number; placeholder: string; f: Fields }) => (
  <RecordField
    id={`ro-${id}`}
    label={null}
    aria-labelledby={`rec-fold-${id}-label`}
    rows={rows}
    value={textOf(f.draft)}
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
  p: { id: string; key: string; label: string; rows: number; placeholder: string; empty: string; hint?: string | null },
) => (
  <BtFold
    canEdit={shared.canEdit}
    flash={shared.flash}
    saver={shared.saver}
    id={p.id}
    label={p.label}
    channel={null}
    gate={gate("settings", `change ${p.label.toLowerCase()}`)}
    row={{ value: stored(shared, p.key), empty: p.empty, hint: p.hint ?? null }}
    body={(f) => <Box id={p.id} rows={p.rows} placeholder={p.placeholder} f={f} />}
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
    value={textOf(f.draft)}
    onChange={(v) => f.update(() => v, ["cold_voice"])}
    problem={f.problems.cold_voice || null}
    placeholder={VOICE_WORDS.placeholder}
    readOnly={f.readOnly || undefined}
    testid="rec-cold_voice-box"
  />
);

/** How it writes: a tone of its own for cold email, and the lines learned from how the owner writes. */
export function WritesCard(shared: OutreachShared & { again: () => void }) {
  const tone = stored(shared, "tone");
  const receptionist = tone
    ? null
    : reachOutToneOf({ brain: { profile: { tone: textOf(shared.brain.profile?.tone) } } });
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
    <OutreachCard id="writes" title={W.writes.title} sub={W.writes.sub}>
      {keyFold(shared, {
        id: "cold_tone",
        key: "tone",
        label: W.writes.tone,
        rows: 2,
        placeholder: "Direct and friendly, no small talk",
        empty: receptionist ?? W.offer.empty,
        hint: receptionist ? W.writes.toneFrom : W.writes.toneHint,
      })}
      <BtFold
        canEdit={shared.canEdit}
        flash={shared.flash}
        id="cold_voice"
        label={W.writes.voice}
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
          empty: W.writes.voiceNone,
          hint: lines.length ? (
            <>
              {W.writes.voiceFrom} ·{" "}
              <LinkButton onClick={() => navigate("admin/memory")} data-testid="rec-cold-voice-memory">
                {W.writes.memory}
              </LinkButton>
            </>
          ) : null,
          act: W.writes.paste,
        }}
        body={(f) => <PasteBox f={f} />}
      />
    </OutreachCard>
  );
}

/** Sign-off: the name every email signs with, its signature and phone, and what code always adds under them. */
export function SignOffCard(shared: OutreachShared) {
  const named = stored(shared, "signed_by");
  const fromSequence = named ? null : (shared.read?.sequence?.signed_by ?? null);
  return (
    <OutreachCard id="sign-off" title={W.signOff.title} sub={W.signOff.sub}>
      {keyFold(shared, {
        id: "signed_by",
        key: "signed_by",
        label: W.signOff.signedBy,
        rows: 1,
        placeholder: "Maya",
        empty: fromSequence ?? W.offer.empty,
        hint: fromSequence ? W.signOff.signedByFrom : W.signOff.signedByHint,
      })}
      {keyFold(shared, {
        id: "signature",
        key: "signature",
        label: W.signOff.signature,
        rows: 3,
        placeholder: "Maya Ortiz, Owner, Brightline Cleaning",
        empty: W.signOff.signatureNone,
      })}
      {keyFold(shared, {
        id: "sign_phone",
        key: "phone",
        label: W.signOff.phone,
        rows: 1,
        placeholder: "(512) 555-0148",
        empty: W.signOff.phoneNone,
      })}
      <RecordRow
        id="sign_foot"
        label={W.signOff.foot}
        value={W.signOff.footValue}
        hint={W.signOff.footHint}
        act={{ label: W.signOff.footAct, icon: "chevron", onClick: () => navigate(settingsRowRoute("address")) }}
      />
    </OutreachCard>
  );
}
