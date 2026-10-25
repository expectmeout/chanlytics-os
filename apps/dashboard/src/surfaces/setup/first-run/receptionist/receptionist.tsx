/**
 * Your receptionist (decision 0073, canvas 2, 2·a–2·g): meet it, make it yours. The greeting every caller hears, heard
 * in the voice chosen; what it answers from in the Business tab's own rows (Check, which moved here from Your business);
 * the two things only the owner knows (walk-ins, and what it says of a price: Settings' own three answers); how it sounds
 * (the panel beside the step on a desk, a sheet from its one line on a phone); and the next step, said once: talk to it.
 * Every word is contracts'; every row saves through the Business tab's one saver.
 */
import { useState, type ReactNode } from "react";
import {
  WALK_INS_CHOICES,
  WALK_IN_WORDS,
  phoneVoiceShown,
  type BusinessReadDto,
  type FirstRunCheckVM,
  type ReceptionistCardVM,
  type WalkIns,
} from "@chanlytics/contracts";
import type { SettingsRecord } from "@/legacy-bridge/surfaces/settings";
import { Icon } from "../../../kit/icon/icon";
import { RecordToggleGroup } from "../../../kit/record/field";
import { Sheet } from "../../../kit/sheet/sheet";
import { gate, type LegacyFlash } from "../../../legacy-verbs";
import { businessTabSave } from "../../shell";
import { FrCheck } from "../check";
import { brainOf } from "../inputs";
import { FrSounds, useVoiceSample } from "./sounds";
import { FrFound } from "../found";
import { W } from "../words";

/** Walk-ins' three answers: the Business tab's fourth, not said, is the question still open here. */
const WALK_INS: readonly WalkIns[] = WALK_INS_CHOICES.filter((c): c is WalkIns => c !== "unset");

/** Walk-ins, saved as a booking rule (booking_rules.walk_ins): the owner's answer, one sentence of the rules it keeps. */
function saveWalkIns(value: WalkIns, flash: (f: LegacyFlash) => void): void {
  businessTabSave.saver.save({
    row: "walk_ins",
    change: (b, p) => {
      const rules = { ...(p.booking_rules ?? {}), walk_ins: value };
      p.booking_rules = rules;
      b.profile = p;
      return b;
    },
    said: W.check.walkIns.saved,
    flash,
  });
}

/** The two things only the owner knows (canvas 2): walk-ins here; the price's own row follows it in Check's card. */
function WalkInsRow({
  stored,
  canEdit,
  flash,
}: {
  stored: string | null;
  canEdit: boolean;
  flash: (f: LegacyFlash) => void;
}) {
  const [picked, setPicked] = useState<WalkIns | null>(null);
  const value = picked ?? ((WALK_INS as readonly string[]).includes(stored ?? "") ? (stored as WalkIns) : null);
  const words = W.check.walkIns;
  return (
    <div className="fr-question" data-testid="fr-walk-ins">
      <span className="fr-label" id="fr-walk-ins-label">
        {words.label}
      </span>
      <RecordToggleGroup<WalkIns>
        labelledBy="fr-walk-ins-label"
        value={value}
        options={WALK_INS.map((k) => ({ value: k, label: words.options[k] }))}
        onChange={(k) => {
          setPicked(k);
          saveWalkIns(k, flash);
        }}
        readOnly={!canEdit}
        gate={gate("settings", WALK_IN_WORDS.gate)}
        testid="fr-walk-ins-pick"
      />
    </div>
  );
}

/** The greeting every caller hears, as one line, with the chosen voice's sample beside it. */
function Greeting({ card, voiceId }: { card: ReceptionistCardVM; voiceId: string | null | undefined }) {
  const sample = useVoiceSample();
  const voice = phoneVoiceShown(voiceId);
  return (
    <div className="panel fr-pane fr-greet" data-testid="fr-greeting">
      <span className="fr-label">{card.greetingLabel}</span>
      <p className="fr-sentence">“{card.greeting}”</p>
      <span className="fr-opt">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => sample.toggle(voice.id)}
          data-testid="fr-greeting-hear"
        >
          <Icon name={sample.playing ? "pause" : "play"} size={12} />
          {sample.playing ? W.sounds.stop : W.sounds.hear(voice.name)}
        </button>
        <span className="fr-detail">{W.sounds.ownWords}</span>
      </span>
    </div>
  );
}

export function FrReceptionist(o: {
  check: FirstRunCheckVM;
  card: ReceptionistCardVM;
  flash: (f: LegacyFlash) => void;
  make: () => void;
  making: boolean;
  go: (to: string) => void;
  canEdit: boolean;
  settings: SettingsRecord | null;
  /** What the Business Profile and the website said, offered beside Check's rows (decision 0073, R10, R17). */
  reads: readonly BusinessReadDto[] | null;
  /** The page's foot, at the end of the step's own column (page.tsx stepBody says why). */
  foot?: ReactNode;
}) {
  const { check, card, flash, canEdit, settings } = o;
  const [soundsOpen, setSoundsOpen] = useState(false);
  const brain = brainOf(settings && settings.config);
  const profile = brain?.profile ?? null;
  return (
    <div className="fr-receptionist" data-testid="fr-receptionist">
      <div className="fr-receptionist-main">
        {brain ? <Greeting card={card} voiceId={profile?.phone_voice} /> : null}
        <FrCheck
          check={check}
          W={W.check}
          flash={flash}
          make={o.make}
          making={o.making}
          go={o.go}
          canEdit={canEdit}
          settings={settings}
          found={brain ? <FrFound reads={o.reads} canEdit={canEdit} flash={flash} /> : null}
          onlyYou={
            brain ? (
              <WalkInsRow stored={profile?.booking_rules?.walk_ins ?? null} canEdit={canEdit} flash={flash} />
            ) : null
          }
        />
        {brain ? (
          <button
            type="button"
            className="btn btn-ghost fr-sounds-strip"
            onClick={() => setSoundsOpen(true)}
            data-testid="fr-sounds-open"
          >
            <span className="fr-label">{W.sounds.open}</span>
            <span className="fr-strip-words">{card.sounds}</span>
            <span className="fr-detail">{W.sounds.change}</span>
          </button>
        ) : null}
        {brain ? <p className="fr-note">{W.check.rehearseNote}</p> : null}
        {o.foot ?? null}
      </div>
      {/* How it sounds beside the step on a desk; on a phone, the one line above opens it as a sheet. */}
      {brain ? (
        <div className="fr-sounds-aside">
          <FrSounds brain={brain} canEdit={canEdit} flash={flash} />
        </div>
      ) : null}
      {brain ? (
        <Sheet
          shape="job"
          close={{ word: W.sounds.done }}
          open={soundsOpen}
          onClose={() => setSoundsOpen(false)}
          title={W.sounds.heading}
          testid="fr-sounds-sheet"
        >
          <FrSounds
            brain={brain}
            canEdit={canEdit}
            flash={flash}
            onDone={() => setSoundsOpen(false)}
            ids="fr-sounds-sheet"
          />
        </Sheet>
      ) : null}
    </div>
  );
}
