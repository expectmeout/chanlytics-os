// Chanlytics — Settings › Business: How it answers.
//
// The fourth card of the record (docs/superpowers/specs/2026-09-20-business-tab-design.md §4.5 and §4.6; the canvas's
// Record and Group-Answers boards): the voice, the languages, the rules it always keeps, how it hands you a customer,
// the things it should know, what it is told in your own words, and the three messages sent in your name when it cannot
// answer. Seven rows, each a fold (BtFold, gestures/). It replaces the old form's "How it answers" group
// (BusinessEditor, settings.jsx: Languages, Rules it always follows, Hand over to a person when, Other things it should
// know, Anything else it should know, When it can't answer), and what those learned came with them, comments and all;
// and it gives the voice the box it never had. `profile.tone` was read, diffed, saved and composed into every prompt,
// and no form drew a box for it (spec D5).
//
// The page composes and never derives. Every sentence here with a number in it is contracts' (handoffWords,
// handoffChatWords, handoffCallWords, notesWords, noteEndedWords, instructionsWords, fallbacksWords, TONE_PRESETS and
// rulesWithoutFieldsWords, through BUSINESS_TAB); what each fold opens with, refuses and writes is folds.ts's; the
// gesture is BtFold.
//
// It holds no hook of its own (its folds hold theirs), and what comes and goes inside a fold (a language, a note) is
// drawn hookless, as the kit's RecordBox and plain buttons.
//
// The languages it offers are contracts' (COMMON_LANGUAGES, through BUSINESS_TAB), the first run's chips' too: one
// The voice, the languages, the rules it always keeps and how it hands you a customer are drawn by answers-fields.tsx
// (the file-length ratchet's 800 lines); the notes, the owner's own words, the three messages, the two rows the first
// run draws too and the card are here.

import type { BrainConfig, BusinessProfile, GuardrailsInForce } from "@chanlytics/contracts";
import type { ComponentProps, ReactNode } from "react";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { gate } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { FieldError } from "../../kit/field-error/field-error";
import { RecordBox, RecordField } from "../../kit/record/field";
import { RecordChips } from "../../kit/record/row";
import { BtaHandoff, BtaLanguages, BtaRules, BtaVoice } from "./answers-fields";
import type { Fields, HandoffWords } from "./answers-fields";
import { BtFold } from "./gestures/fold";
import { btoWorkspaceZone } from "./open";
import { phoneShown } from "./save";
import type { Brain, Config, Profile } from "./save";
import { businessTabSave } from "./saver";
import { factsNow, fallbackDefaults, fallbackMessages, instructionsDraft, policiesNow } from "./shell";

type FoldProps = ComponentProps<typeof BtFold>;

/** What every fold of the card is given by the page. */
interface Shared {
  canEdit: boolean;
  flash: NonNullable<FoldProps["flash"]>;
  saver: NonNullable<FoldProps["saver"]>;
}

/** The brain the fallbacks' preview reads: the config the next save goes on, or the settings read's. */
interface PreviewBrain {
  business_name?: string;
  phone_display?: string;
  booking_link?: string;
}

/** A fallback's key: the three messages the edge sends. */
type FallbackKey = keyof BrainConfig["fallbacks"];

/**
 * The config the rows state, or the brain alone when the read carried no config: what draftOf opens a fold from. It
 * comes off the settings read, so it is held to the tab's own reading of a config (save.tsx) by a narrow cast.
 */
const btaStored = (brain: Brain, config: Config | null): Config => config || { brain };

/** The brain a fold's preview and the rules' "composes nothing" are judged on: the next save's, else the read's. */
const btaOn = (brain: Brain, base: Config | null): Brain => (base && base.brain) || brain;

/** Whether the record's details compose anything, by the resolver's own test (hasProfile), on a brain. */
const btaComposes = (on: Brain) => BUSINESS_TAB.hasProfile((on.profile || null) as BusinessProfile | null);

/* ------------------------------------ the lists ------------------------------------ */

// The three messages sent in the business's name when the receptionist cannot answer (S5), in the order an owner meets
// them, each with when it goes out -- the edge's own conditions (whatsapp/inbound.ts), in an owner's words.
const BTA_FALLBACK_ROWS: { key: FallbackKey; label: string; when: string }[] = [
  {
    key: "error",
    label: "If it can't write a reply",
    when: "The AI service failed or couldn't finish an answer. The conversation then waits for you.",
  },
  {
    key: "non_text",
    label: "If it gets something it can't read",
    when: "A voice note, a sticker, or a photo it can't look at. It then stays out of that conversation and asks for you.",
  },
  {
    key: "greeting",
    label: "If replies can't be written at all",
    when: "Only while Chanlytics' AI connection is down. Each conversation then waits for you.",
  },
];

/* ------------------------------------ the things it should know ------------------------------------ */

// What the notes say where Add would be, once there are as many as the profile keeps (LIMITS.notes).
const BTA_NOTES_FULL = "That is the most notes it keeps. Remove one to add another.";

/** A note in the draft, as far as a hand-edited record can be trusted. */
type NoteDraft = { title?: unknown; text?: unknown; until?: unknown } | null;

/**
 * One note: a title, what it says and its last day, each in its box, with its remove. The last day is a date box, as a
 * closed day's is (open.tsx), and optional; once it has passed on the business's day, `ended` (contracts
 * noteEndedWords) is said beside the title and describes its box, since the receptionist no longer says the note.
 */
const BtaNote = ({
  note,
  i,
  notes,
  press,
  bad,
  ended,
  readOnly,
}: {
  note: NoteDraft;
  i: number;
  notes: ReturnType<Fields["rows"]>;
  press: Fields["press"];
  bad: string | null;
  ended: string | null;
  readOnly: boolean;
}) => {
  const problemId = `bt-note-${i}-problem`;
  const endedId = `bt-note-${i}-ended`;
  const title = note && typeof note.title === "string" ? note.title : "";
  return (
    <div className="bt-note" data-testid={`rec-note-${i}`} {...notes.row(i)}>
      <RecordBox
        id={`bt-note-${i}-title`}
        label={`Note ${i + 1} title`}
        value={title}
        placeholder="Gift cards"
        onChange={(v) => notes.setAt(i, { title: v })}
        invalid={bad ? problemId : null}
        unit={ended ? <span id={endedId}>{ended}</span> : null}
        aria-describedby={ended ? endedId : undefined}
        readOnly={readOnly}
      />
      <RecordBox
        id={`bt-note-${i}-text`}
        label={`Note ${i + 1}, what it says`}
        rows={2}
        value={note && typeof note.text === "string" ? note.text : ""}
        placeholder="Gift cards are sold at the front desk, any amount — ask for the owner."
        onChange={(v) => notes.setAt(i, { text: v })}
        invalid={bad ? problemId : null}
        readOnly={readOnly}
      />
      <RecordBox
        id={`bt-note-${i}-until`}
        label={`Note ${i + 1}, until`}
        type="date"
        value={note && typeof note.until === "string" ? note.until : ""}
        onChange={(v) => notes.setAt(i, { until: v })}
        readOnly={readOnly}
      />
      <button
        type="button"
        className="btn btn-ghost btn-icon btn-sm"
        aria-label={`Remove ${title.trim() || `note ${i + 1}`}`}
        {...press(() =>
          notes.removeAt(i, (gone) => {
            const g = gone as NoteDraft;
            return <>Removed {g && g.title ? <b>{g.title as ReactNode}</b> : "a note"}</>;
          }),
        )}
        data-testid={`rec-note-remove-${i}`}
      >
        <Icon name="x" size={12} />
      </button>
      <FieldError id={problemId} message={bad} testid={`rec-note-problem-${i}`} />
    </div>
  );
};

/**
 * The notes, each a title, what it says and an optional last day, with a remove. A note is words somebody typed, the
 * same as a closure, and
 * each went with one press and no Undo (S18): now the removal says so and offers it back at its own place (BtFold's
 * rows), and the list stops at the profile's ten, where the old form stopped by hiding Add. Hookless (the kit's
 * RecordBox, a textarea for what a note says): its rows come and go. What stops a note (half of one, or more than the
 * profile keeps) is said once under its row, and both its boxes are wrong by it.
 */
const BtaNotes = ({
  draft,
  rows,
  press,
  problems,
  readOnly,
}: Pick<Fields, "draft" | "rows" | "press" | "problems" | "readOnly">) => {
  const notes = rows({
    id: "notes",
    name: (i) => `note-${i}`,
    max: businessTabSave.LIMITS.notes,
    blank: () => ({ title: "", text: "" }),
    keysOf: (i) => [`note-${i}`],
    key: "notes",
    full: BTA_NOTES_FULL,
  });
  const list = Array.isArray(draft) ? (draft as NoteDraft[]) : [];
  // Whether a note has ended is judged on the workspace's day, as the closed days' row judges what is still ahead.
  const zone = btoWorkspaceZone();
  const now = new Date();
  return (
    <div className="bt-notes" data-testid="rec-notes-rows">
      {/* The columns' names, on screen and not read out: each box carries its own, with its row's place in it. */}
      {list.length > 0 ? (
        <div className="bt-note-head" aria-hidden="true">
          <span>Title</span>
          <span>What it says</span>
          <span>Until (optional)</span>
          <span />
        </div>
      ) : null}
      {list.map((n, i) => (
        <BtaNote
          key={i}
          note={n}
          i={i}
          notes={notes}
          press={press}
          bad={(problems[`note-${i}`] as string | undefined) || null}
          ended={BUSINESS_TAB.noteEndedWords(n && n.until, zone, now)}
          readOnly={readOnly}
        />
      ))}
      {notes.canAdd ? (
        <button
          type="button"
          className="btn btn-sm bt-fold-add"
          {...press(() => notes.add())}
          data-testid="rec-notes-add"
        >
          <Icon name="plus" size={12} /> Add a note
        </button>
      ) : (
        <p className="bt-fold-note" data-testid="rec-notes-cap">
          {BTA_NOTES_FULL}
        </p>
      )}
      <FieldError id="bt-notes-problem" message={problems.notes || null} testid="rec-notes-problem" />
    </div>
  );
};

/* ------------------------------------ in your own words ------------------------------------ */

/** The owner's own words as the fold opens them: the text, and whether it was carried over from before the form. */
type OwnDraft = { text?: unknown; carried?: unknown };

/**
 * The owner's own words, pre-filled with the workspace's existing instructions, so nothing a business already told its
 * receptionist quietly disappears the moment it fills in a form: contracts chooses them (S4, draftOf's
 * instructionsDraft), the owner's own, or the prompt from before the form, carried and said so here -- never the
 * product's opening lines, which no owner wrote. Its save is the one that writes the stored prompt too (saveFold, S4).
 * The count of what is written sits under the box, with the limit in it, and nowhere else: at rest the row says the
 * words, not how many characters they are (contracts instructionsWords).
 */
const BtaOwnWords = ({
  draft,
  update,
  problems,
  readOnly,
}: Pick<Fields, "draft" | "update" | "problems" | "readOnly">) => {
  const d = (draft || {}) as OwnDraft;
  const text = typeof d.text === "string" ? d.text : "";
  const room = BUSINESS_TAB.instructionsWords(text).limit;
  return (
    <>
      {/* Text nobody here wrote sat under "written in your own words" (S4): say where it came from, and which wins. */}
      {d.carried ? (
        <p className="bt-fold-note" data-testid="rec-own-carried">
          Carried over from the instructions your receptionist followed before this form. Trim what the fields above now
          cover — where the two disagree about the address, hours or services, the fields win.
        </p>
      ) : null}
      <RecordField
        id="bt-own-words"
        label={null}
        aria-labelledby="rec-fold-extra_instructions-label"
        rows={Math.min(14, Math.max(4, Math.ceil(text.length / 90)))}
        value={text}
        onChange={(v) => update((was) => ({ ...(was as OwnDraft), text: v }), ["extra_instructions"])}
        problem={problems.extra_instructions || null}
        placeholder="Parking is behind the building. We do not take walk-ins after 5pm."
        readOnly={readOnly || undefined}
        testid="rec-own-box"
      />
      {room && !problems.extra_instructions ? (
        <span className="bt-own-count" data-testid="rec-own-count">
          {room}
        </span>
      ) : null}
    </>
  );
};

/* ------------------------------------ when it can't answer ------------------------------------ */

/** The three messages as the fold holds them: each a string, or whatever a hand-edited record kept. */
type FallbacksDraft = Partial<Record<FallbackKey, unknown>>;

/** What a customer would read with the messages as typed and the details as the brain holds them, by message. */
const btaReads = (d: FallbacksDraft, brain: PreviewBrain, link: string) => {
  const make = fallbackMessages();
  if (typeof make !== "function") return {};
  if (!BTA_FALLBACK_ROWS.some(({ key }) => /\{/.test(typeof d[key] === "string" ? d[key] : ""))) return {};
  const voiceLine = factsNow()?.facts?.voice_line?.value || null;
  return make(
    {
      business_name: String(brain.business_name || "").trim() || "your business",
      booking_link: link,
      phone_display: String(brain.phone_display || "").trim() || undefined,
      fallbacks: { ...d } as BrainConfig["fallbacks"],
    } as BrainConfig,
    { channels: voiceLine ? [{ kind: "voice", number_e164: voiceLine, status: "active" }] : [] },
  );
};

/** What a message written out says of itself: that a link or a number stands where the name for it would follow. */
const BtaWrittenOut = ({ messageKey, written }: { messageKey: FallbackKey; written: "link" | "number" }) => (
  <span className="bt-fold-note" data-testid={`rec-fallback-${messageKey}-written`}>
    {written === "link" ? (
      <>Your booking link is written out here — {"{booking link}"} keeps it current.</>
    ) : (
      <>A number is written out here — {"{phone}"} gives the one you publish.</>
    )}
  </span>
);

/** One of the three messages: its label and when it goes out, its box, what a customer would read, and its default. */
const BtaFallback = ({
  row,
  d,
  reads,
  link,
  update,
  press,
  problems,
  readOnly,
}: {
  row: (typeof BTA_FALLBACK_ROWS)[number];
  d: FallbacksDraft;
  reads: Partial<Record<FallbackKey, string>>;
  link: string;
  update: Fields["update"];
  press: Fields["press"];
  problems: Fields["problems"];
  readOnly: boolean;
}) => {
  const { key, label, when } = row;
  const defaults: Partial<Record<FallbackKey, string>> = fallbackDefaults() || {};
  const text = typeof d[key] === "string" ? d[key] : "";
  const shown = /\{/.test(text) ? reads[key] : null;
  // A link or a number written out stays as written when the details change; a name follows them. The rule is
  // contracts' (writtenOutDetail), written once and tested there.
  const written = BUSINESS_TAB.writtenOutDetail(text, link);
  const defaultWording = defaults[key];
  return (
    <div className="bt-fallback" data-testid={`rec-fallback-${key}`}>
      <span className="bt-fallback-label" id={`bt-fallback-${key}-label`}>
        {label}
      </span>
      <span className="bt-fallback-when">{when}</span>
      <RecordBox
        id={`bt-fallback-${key}`}
        label={label}
        rows={3}
        value={text}
        onChange={(v) => update((was) => ({ ...(was as FallbacksDraft), [key]: v }), [key])}
        problem={problems[key] || null}
        readOnly={readOnly}
      />
      {shown && !problems[key] ? (
        <span className="bt-fallback-reads" data-testid={`rec-fallback-${key}-reads`}>
          A customer reads: {shown}
        </span>
      ) : null}
      {written ? <BtaWrittenOut messageKey={key} written={written} /> : null}
      {defaultWording !== undefined && !BUSINESS_TAB.isProductFallback(key, text) ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm bt-fallback-default"
          aria-describedby={`bt-fallback-${key}-label`}
          {...press(() => update((was) => ({ ...(was as FallbacksDraft), [key]: defaultWording }), [key]))}
          data-testid={`rec-fallback-${key}-default`}
        >
          Use the default wording
        </button>
      ) : null}
    </div>
  );
};

/**
 * The three messages sent in the business's name when the receptionist cannot answer (S5): shown, and the owner's to
 * change. Each is its label and when it goes out (the edge's own conditions), its box, and what a customer would read
 * with the business's details as they are now -- shown only when the message names a detail, since one that names
 * none reads as written (contracts fallbackMessages, the function each goes out through). A link or a number written
 * out stays as written when the details change, where the name of a detail follows them, so the box says so. Each can
 * go back to the product's wording in one press. They are never part of the prompt, so the fold says nothing it will
 * be told.
 */
const BtaFallbacks = ({
  draft,
  update,
  press,
  problems,
  readOnly,
  brain,
}: Pick<Fields, "draft" | "update" | "press" | "problems" | "readOnly"> & { brain: PreviewBrain }) => {
  const d = (draft || {}) as FallbacksDraft;
  const link = String(brain.booking_link || "").trim();
  // What a customer would read with the messages as typed and the details as the brain holds them.
  const reads: Partial<Record<FallbackKey, string>> = btaReads(d, brain, link);
  return (
    <div className="bt-fallbacks" data-testid="rec-fallbacks">
      <p className="bt-fold-note">
        {"{business}"}, {"{booking link}"} and {"{phone}"} are filled in as each goes out.
      </p>
      {BTA_FALLBACK_ROWS.map((row) => (
        <BtaFallback
          key={row.key}
          row={row}
          d={d}
          reads={reads}
          link={link}
          update={update}
          press={press}
          problems={problems}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
};

/* ------------------------------------ the rows drawn elsewhere too ------------------------------------ */

/**
 * The languages it answers in, as its row states them and its fold edits them; the first run's Check draws it too, with
 * its chips at rest in the row's place (`rest`, BtFold's: hookless, and its act opens this same fold).
 */
export const BtLanguagesRow = ({
  brain,
  canEdit,
  flash,
  saver,
  rest = null,
}: Shared & { brain: Brain; rest?: FoldProps["rest"] }) => {
  const profile: Profile = brain.profile || {};
  // A stored list that is not one (a hand-edited record) is none: joined as it stood, it threw as the card drew.
  const languages = (Array.isArray(profile.languages) ? profile.languages : []).filter(
    (l) => typeof l === "string" && l.trim() !== "",
  );
  return (
    <BtFold
      canEdit={canEdit}
      flash={flash}
      saver={saver}
      id="languages"
      label="Languages"
      // The old form's words: on WhatsApp the composer says only "You speak: …", and "whichever the caller uses" is a
      // call's line (config.ts), so the canvas's "It replies in whichever the customer uses" said more than chat is told.
      hint="It answers in whichever of these a customer uses."
      lines
      gate={gate("settings", "change the languages it speaks")}
      rest={rest}
      row={{
        value: languages.length ? languages.join(", ") : null,
        empty: "Not set",
        name: languages.length ? "Change the languages it speaks" : "Add one: a language it speaks",
      }}
      body={(f) => <BtaLanguages {...f} />}
    />
  );
};

/**
 * The rules it always keeps, as its row names them and its fold switches them; the first run's Check draws it too, as
 * the price rule shown as its default. `config` is the settings read's, `base` the config the next save goes on.
 */
export const BtRulesRow = ({
  brain,
  base = null,
  config = null,
  canEdit,
  flash,
  saver,
}: Shared & { brain: Brain; base?: Config | null; config?: Config | null }) => {
  // The rules as the fold opens them (contracts guardrailsInForce, through draftOf: absent means on for three, off for
  // health advice and photos), so the row and the fold never read a stored rule two ways.
  const rules = businessTabSave.draftOf("guardrails", btaStored(brain, config)) as GuardrailsInForce & {
    vision?: boolean;
  };
  // Whether the record's details compose anything, by the resolver's own test (hasProfile), on the brain the rules'
  // save goes on.
  const on = btaOn(brain, base);
  const composes = btaComposes(on);
  // Which of them the row may name, and in what words: contracts', off the three strengths (rulesKept). Not every
  // switch decides the same amount -- the price detector runs with its switch off, the two told-and-trusted rules are
  // lines in a prompt a record composing nothing never gets, and a booking is beyond the product either way. So the
  // row never lists a rule as kept that the receptionist was never told and cannot keep on its own.
  const ruleChips = BUSINESS_TAB.rulesKept({ rules, vision: rules.vision === true, composes }).map((label) => ({
    label,
  }));
  return (
    <BtFold
      canEdit={canEdit}
      flash={flash}
      saver={saver}
      id="guardrails"
      label="Rules it always keeps"
      hint="These hold whatever else you write."
      gate={gate("settings", "change the rules it always keeps")}
      row={{
        // Capped like every other row of chips (the kit's RecordChips, contracts CHIPS_SHOWN): five of them wrapped
        // three deep at a phone's width, which is a paragraph of nouns where the row states one fact.
        value: ruleChips.length ? (
          <RecordChips
            chips={ruleChips}
            max={BUSINESS_TAB.CHIPS_SHOWN}
            more={BUSINESS_TAB.chipsMoreWords}
            testid="rec-rules-chips"
          />
        ) : null,
        name: "Change the rules it always keeps",
      }}
      body={(f) => <BtaRules {...f} unread={composes ? null : BUSINESS_TAB.rulesWithoutFieldsWords(on)} />}
    />
  );
};

/* ------------------------------------ the card ------------------------------------ */

/** What the card states at rest, worked out once from the settings read. */
interface AnswersFacts {
  tone: string | null;
  /** The brain the fallbacks' preview reads: the one the next save goes on. */
  on: PreviewBrain;
  transfer: string | null | undefined;
  calls: boolean;
  handoff: HandoffWords;
  notes: ReturnType<typeof BUSINESS_TAB.notesWords>;
  ownOpening: string | null;
  messages: ReturnType<typeof BUSINESS_TAB.fallbacksWords>;
}

/** The transfer number as the settings read resolved it, read as the Who you are row reads it (its factOf). */
const btaTransfer = (profile: Profile): string | null | undefined => {
  // The fact when the read carried one, and what is typed only when it carried none (an older server).
  const F = factsNow()?.facts;
  const transferFact = F?.handoff_number || { value: profile.handoff_number || null };
  return transferFact.value ? phoneShown(transferFact.value) : null;
};

/** The words of the owner's own opening, which needs the bridge's instructionsDraft (S4): without it the row says nothing it cannot back. */
const btaOwnOpening = (stored: Config): string | null => {
  const own =
    typeof instructionsDraft() === "function"
      ? (businessTabSave.draftOf("extra_instructions", stored) as OwnDraft)
      : null;
  return own ? BUSINESS_TAB.instructionsWords(own.text as string).opening : null;
};

const btaFacts = (brain: Brain, base: Config | null, config: Config | null): AnswersFacts => {
  const profile: Profile = brain.profile || {};
  const stored = btaStored(brain, config);
  const tone = typeof profile.tone === "string" && profile.tone.trim() ? profile.tone.trim() : null;
  const transfer = btaTransfer(profile);
  return {
    tone,
    on: btaOn(brain, base),
    transfer,
    // Whether the workspace answers calls at all: the line it answers on, as Who you are reads it.
    calls: !!factsNow()?.facts?.voice_line?.value,
    handoff: BUSINESS_TAB.handoffWords(profile.escalate_when, transfer),
    notes: BUSINESS_TAB.notesWords(profile.notes),
    ownOpening: btaOwnOpening(stored),
    messages: BUSINESS_TAB.fallbacksWords(brain.fallbacks),
  };
};

/** The card's rows are folds drawn by helpers, not components of their own: BtFold holds their hooks, where they were. */
const toneFold = (shared: Shared, tone: string | null) => (
  <BtFold
    {...shared}
    id="tone"
    label="Its voice"
    hint="A sentence. How it should sound, not what it should say."
    lines
    gate={gate("settings", "change its voice")}
    row={{
      value: tone,
      empty: "Not set",
      act: tone ? "Change" : "Give it one",
      name: tone ? "Change its voice" : "Give it one: a voice of its own",
    }}
    body={(f) => <BtaVoice {...f} />}
  />
);

const handoffFold = (shared: Shared, a: AnswersFacts) => (
  <BtFold
    {...shared}
    id="escalate_when"
    label="Hands you a customer"
    hint="When it hands a conversation to you, on WhatsApp and on a call."
    gate={gate("settings", "change how it hands you a customer")}
    row={{
      // One line, contracts' (handoffWords.line): the reasons counted and what a call does. The reasons themselves
      // are the fold's.
      value: (
        <span className="bt-handoff" data-testid="rec-handoff-line">
          {a.handoff.line}
        </span>
      ),
      empty: "Not set",
      name: "Change how it hands you a customer",
    }}
    body={(f) => <BtaHandoff {...f} words={a.handoff} transfer={a.transfer} calls={a.calls} policies={policiesNow()} />}
  />
);

const notesFold = (shared: Shared, notes: AnswersFacts["notes"]) => (
  <BtFold
    {...shared}
    id="notes"
    label="Things it should know"
    hint="One topic each: parking, gift cards, a second location. Both receptionists say these."
    gate={gate("settings", "change the things it should know")}
    row={{
      value: notes.count ? (
        <RecordChips chips={notes.chips.map((label) => ({ label }))} more={notes.more} testid="rec-notes-chips" />
      ) : null,
      empty: "None",
      name: notes.count ? "Change the things it should know" : "Add one: a thing it should know",
    }}
    body={(f) => <BtaNotes {...f} />}
  />
);

const ownWordsFold = (shared: Shared, opening: string | null) => (
  <BtFold
    {...shared}
    id="extra_instructions"
    label="In your own words"
    hint="Optional. Anything the rows on this page do not cover."
    gate={gate("settings", "change what it is told in your own words")}
    row={{
      // Their opening, and nothing else. "339 characters" stood in front of it, which is a number an owner can do
      // nothing about while reading the page, and on a phone it pushed the words themselves onto a second line.
      value: opening ? (
        <span className="bt-own" data-testid="rec-own-words">
          <span className="bt-own-opening">{opening}</span>
        </span>
      ) : null,
      empty: "None",
      act: opening ? "Change" : "Add some",
      name: opening ? "Change what it is told in your own words" : "Add some: your own words",
    }}
    body={(f) => <BtaOwnWords {...f} />}
  />
);

const fallbacksFold = (shared: Shared, a: AnswersFacts) => (
  <BtFold
    {...shared}
    id="fallbacks"
    label="When it can't answer"
    hint="What a customer is sent when it cannot reply itself."
    channel={null}
    gate={gate("settings", "change the messages sent when it can't answer")}
    row={{
      // One line. Which message differs from the product's wording, and the press that puts it back, are both
      // inside the fold, on the message itself: a count of the difference on the row was a number to read twice.
      value: (
        <span className="bt-messages" data-testid="rec-fallbacks-words">
          {a.messages.line}
        </span>
      ),
      empty: "Not set",
      name: "Change the messages sent when it can't answer",
    }}
    body={(f) => <BtaFallbacks {...f} brain={a.on} />}
  />
);

/**
 * How it answers (spec §4.5): seven rows in the canvas's order, each a fold. `brain` and `config` are the settings
 * read's, which the rows state; `base` is the config the next save goes on (the saver's base), which is what the rules
 * fold judges "composes nothing" by, as its save will be; what a fold opens with and saves onto is the saver's base,
 * which BtFold asks for itself.
 */
export const BtAnswersCard = ({
  brain,
  base = null,
  config = null,
  canEdit,
  flash,
  saver,
}: Shared & { brain: Brain; base?: Config | null; config?: Config | null }) => {
  const shared = { canEdit, flash, saver };
  const a = btaFacts(brain, base, config);
  return (
    <section className="rec-card" data-testid="rec-card-answers" aria-labelledby="bt-answers-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-answers-title">
          How it answers
        </h2>
        <span className="rec-card-sub">The voice, the limits, and what fits no field</span>
      </div>

      {toneFold(shared, a.tone)}

      <BtLanguagesRow brain={brain} {...shared} />

      <BtRulesRow brain={brain} base={base} config={config} {...shared} />

      {handoffFold(shared, a)}

      {notesFold(shared, a.notes)}

      {ownWordsFold(shared, a.ownOpening)}

      {fallbacksFold(shared, a)}
    </section>
  );
};
