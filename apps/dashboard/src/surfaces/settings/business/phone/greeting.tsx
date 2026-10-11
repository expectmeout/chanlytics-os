// Chanlytics — Settings › Business › How it answers: "Greets every caller with" (decision 0051).
//
// The first thing a caller hears, in the owner's words: one box, what callers hear under it, every note that applies, and
// the way back to the standard greeting. Drawn only where the workspace answers calls. Nothing is refused: a line that
// never says it is automated has the product's words added where the preview shows them, and one that denies it plays
// the standard greeting, which the note says before the save. Its own folder because the Business tab's holds twenty
// modules, the ratchet's limit.

import type { ComponentProps } from "react";
import type { GreetingNote } from "@chanlytics/contracts";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { gate } from "../../../legacy-verbs";
import { RecordField, RecordTip } from "../../../kit/record/field";
import type { Fields } from "../answers-fields";
import { BtFold } from "../gestures/fold";
import type { Brain } from "../save";
import { greetingSays } from "./greeting-draft";

type FoldProps = ComponentProps<typeof BtFold>;

/** What every fold of the card is given by the page, as answers.tsx hands it. */
interface Shared {
  canEdit: boolean;
  flash: NonNullable<FoldProps["flash"]>;
  saver: NonNullable<FoldProps["saver"]>;
}

/** The name callers hear, and whether a price may not be said, as the row and the box read them. */
const spokenOf = (brain: Brain) => ({
  name: String(brain.business_name || "").trim() || null,
  neverQuotePrices: BUSINESS_TAB.guardrailsInForce(brain.profile?.guardrails).never_quote_prices,
});

/** The notes under the box, most important first: the amber tone where the line will not be spoken as written. */
const GreetingNoteLines = ({ notes }: { notes: readonly GreetingNote[] }) =>
  notes.map((note) => (
    <span
      key={note.key}
      className={note.key === "denies_ai" ? "bt-held" : "bt-fold-note"}
      data-testid={`rec-greeting-note-${note.key}`}
    >
      {note.words}
    </span>
  ));

/** The box, what callers hear and when they hear another line, the notes, and the way back to the standard greeting. */
const BtaGreeting = ({ draft, update, problems, readOnly, press, brain }: Fields & { brain: Brain }) => {
  const { name, neverQuotePrices } = spokenOf(brain);
  const says = greetingSays(draft, name, neverQuotePrices);
  return (
    <>
      <RecordField
        id="bt-phone-greeting"
        label={null}
        aria-labelledby="rec-fold-phone_greeting-label"
        rows={3}
        value={draft as string}
        onChange={(v) => update(() => v, ["phone_greeting"])}
        problem={problems.phone_greeting || null}
        readOnly={readOnly || undefined}
        testid="rec-greeting-box"
      />
      <span className="bt-fallback-reads" data-testid="rec-greeting-hears">
        <b className="bt-fold-lead">Callers hear</b> {says.hears}{" "}
        <RecordTip
          label="When callers hear the standard greeting"
          testid="rec-greeting-tip"
          text="While billing is paused, callers hear the standard greeting, saying it can only take a message today. If your settings can't be read in time, they hear it without your name. {business} is your name."
        />
      </span>
      <GreetingNoteLines notes={says.notes} />
      {says.standard ? null : (
        <button
          type="button"
          className="btn btn-ghost btn-sm bt-fallback-default"
          {...press(() => update(() => BUSINESS_TAB.GREETING_TEMPLATE, ["phone_greeting"]))}
          data-testid="rec-greeting-default"
        >
          Use the standard greeting
        </button>
      )}
    </>
  );
};

/** The row: what callers hear, at rest; the fold opens on the box. */
export const greetingFold = (shared: Shared, brain: Brain) => {
  const { name } = spokenOf(brain);
  const stored = brain.profile?.phone_greeting;
  const hears = BUSINESS_TAB.greetingOf({ name, stored, paused: false }).text;
  return (
    <BtFold
      {...shared}
      id="phone_greeting"
      label="Greets every caller with"
      channel={null}
      said="Saved. Callers hear it from their next call."
      gate={gate("settings", "change what callers hear first")}
      row={{
        value: (
          <span className="bt-own" data-testid="rec-greeting-line">
            <span className="bt-own-opening">{hears}</span>
          </span>
        ),
        empty: "Standard greeting",
        name: "Change what callers hear first",
      }}
      body={(f) => <BtaGreeting {...f} brain={brain} />}
    />
  );
};
