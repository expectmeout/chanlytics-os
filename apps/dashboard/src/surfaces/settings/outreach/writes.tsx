/**
 * How it reaches out (decision 0113): How it writes, and Sign-off. The tone is a cold email's own, apart from the
 * receptionist's, which it reads until one is set. How you write is the lines Ask learned from an email the owner pasted
 * (decision 0078), kept in Ask's memory and forgotten on Settings › Memory; Paste an email reads one more, through the
 * door New's paste takes (the `sequence_voice` verb), never the settings save. The sign-off's rows are the section's,
 * and what is always added at the bottom is code's: the address on Details and the way to say no.
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
import { RecordRow } from "../../kit/record/row";
import { BtFold } from "../business/gestures/fold";
import { settingsRowRoute } from "../frame/tabs";
import { reachOutFold } from "./box";
import { OutreachCard, storedReachOut, type OutreachShared } from "./card";

const WRITES_CARDS = REACH_OUT_SETTINGS_WORDS;

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
      {reachOutFold(shared, {
        id: "cold_tone",
        key: "tone",
        label: WRITES_CARDS.writes.tone,
        rows: 2,
        max: REACH_OUT_LIMITS.tone,
        placeholder: WRITES_CARDS.writes.tonePlaceholder,
        empty: WRITES_CARDS.offer.empty,
        hint: WRITES_CARDS.writes.toneHint,
        fallback: receptionist,
        from: WRITES_CARDS.writes.toneFrom,
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
  const known = shared.read?.known;
  const business = shared.brain.business_name?.trim();
  return (
    <OutreachCard id="sign-off" title={WRITES_CARDS.signOff.title} sub={WRITES_CARDS.signOff.sub}>
      {reachOutFold(shared, {
        id: "signed_by",
        key: "signed_by",
        label: WRITES_CARDS.signOff.signedBy,
        max: REACH_OUT_LIMITS.signedBy,
        autoComplete: "name",
        placeholder: WRITES_CARDS.signOff.placeholders.signedBy,
        empty: WRITES_CARDS.offer.empty,
        hint: WRITES_CARDS.signOff.signedByHint,
        fallback: shared.read?.sequence?.signed_by,
        from: WRITES_CARDS.signOff.signedByFrom,
        known: known?.first_name,
      })}
      {reachOutFold(shared, {
        id: "signature",
        key: "signature",
        label: WRITES_CARDS.signOff.signature,
        rows: 3,
        max: REACH_OUT_LIMITS.signature,
        placeholder: WRITES_CARDS.signOff.placeholders.signature,
        empty: WRITES_CARDS.signOff.signatureNone,
        hint: WRITES_CARDS.signOff.signatureHint,
        rule: WRITES_CARDS.signOff.signatureRule,
        known: known?.name && business ? `${known.name}, ${business}` : known?.name,
      })}
      {reachOutFold(shared, {
        id: "sign_phone",
        key: "phone",
        label: WRITES_CARDS.signOff.phone,
        max: REACH_OUT_LIMITS.phone,
        inputMode: "tel",
        autoComplete: "tel",
        placeholder: WRITES_CARDS.signOff.placeholders.phone,
        empty: WRITES_CARDS.signOff.phoneNone,
        known: shared.brain.phone_display?.trim(),
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
