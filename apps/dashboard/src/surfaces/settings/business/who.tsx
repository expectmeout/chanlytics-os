// Chanlytics — Settings › Business: Who you are.
//
// The first card of the record (docs/superpowers/specs/2026-09-20-business-tab-design.md §4.2; the canvas's Group-Who
// and Edit-Inline boards): the seven facts a customer asks for by name, each with where it came from, edited in the row
// that states it. Every row is the page's BtRow (gestures/); what is this card's is each row's value, source, check,
// patch and box, and the disagreements factConflicts finds drawn on the row each is about.
//
// Three of its rows are components of their own, the address, the website and the booking link, because the first
// run's Check draws them too (first-run.jsx): one row on both screens, so the two never disagree.
//
// It holds no hook of its own (the rows hold theirs).

import { ASK_GOAL_WORDS, RENAME_WORDS, applySettingsChange, askGoalRefusal, askGoalSaved } from "@chanlytics/contracts";
import type { Fact, FactConflict, FactSource, ResolvedFacts } from "@chanlytics/contracts";
import type { ReactNode } from "react";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { gate, navigate } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { RecordField, RecordToggleGroup } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import { BT_SAVED } from "./gestures/common";
import { BtRow } from "./gestures/row";
import { BtLogoRow } from "./logo/row";
import type { BtDisputed } from "./gestures/row";
import { phoneShown } from "./save";
import type { Brain, Config, Saver } from "./save";
import { businessTabSave } from "./saver";
import { factsNow, samePhone, setupApi } from "./shell";

/** What a row's box is handed to draw: the draft, its setter, what stops it, the field's own props, the row's gate. */
interface BoxProps<D> {
  draft: D;
  set: (next: D) => void;
  problem: ReactNode;
  field: { id: string; label: ReactNode; "aria-labelledby"?: string; readOnly?: boolean };
  gate?: Record<string, unknown> | null;
  readOnly?: boolean;
}

/** What a text box says beside the field: only the words it has. */
interface TextWords {
  hint?: string;
  placeholder: string;
  inputMode?: "url" | "tel";
  autoComplete?: string;
}

/**
 * The box for a row whose value is one line of text. Its hint says what the value is for, or what empty means, and
 * is drawn under the box only while the box is empty: that is when it is the one thing to read (the phone's rule for
 * a row's hint, record.css), and a filled row's editor keeps the row's one line, so nothing under it moves as the
 * value becomes its field. A problem is drawn whenever there is one; RecordField gives it the hint's place.
 */
const btTextBox =
  (words: TextWords) =>
  ({ draft, set, problem, field }: BoxProps<string>) => (
    <RecordField
      {...field}
      value={draft}
      onChange={set}
      problem={problem}
      hint={draft ? null : words.hint || null}
      placeholder={words.placeholder}
      inputMode={words.inputMode}
      autoComplete={words.autoComplete}
    />
  );

/** The number the receptionist gives out, as its draft stores it: the line itself, or a number typed. */
interface PublishedDraft {
  own?: boolean;
  typed?: string | null;
}

interface PublishedNumbers {
  line: string;
  handoff: string | null;
  kept: string | null;
  testid: string;
}

/** The sentence under the number's box: what the choice in force costs. Hookless. */
function btPublishedNote({ line, handoff, kept, draft }: PublishedNumbers & { draft: PublishedDraft }): ReactNode {
  const lineShown = phoneShown(line);
  const same = samePhone();
  if (draft.own && line)
    return (
      <>
        <b className="tabular">{lineShown}</b> — the line your receptionist answers. It follows the line, so changing
        your number changes nothing to keep in step.
      </>
    );
  if (same?.(draft.typed, line))
    return (
      <>
        That is your line. Choose <b>Your line</b> and it stays right when the number changes.
      </>
    );
  if (kept && same?.(draft.typed, kept))
    return (
      <>
        Your own number. The calls nobody picks up there go to your receptionist on{" "}
        <b className="tabular">{lineShown}</b>.
      </>
    );
  if (handoff && same?.(draft.typed, handoff))
    return (
      <>
        This is the number the receptionist <b>transfers</b> to, so customers who ring it reach a person directly and
        never the receptionist answering on <b className="tabular">{lineShown}</b>.
      </>
    );
  if (line)
    return (
      <>
        Customers who ring this will not reach your receptionist on <b className="tabular">{lineShown}</b>.
      </>
    );
  return <>The number it gives customers.</>;
}

/**
 * The number the receptionist gives out, as its box: the line it answers, or a different number, and what that choice
 * costs, in one note. The draft is { own, typed } (save.tsx STORED_AS says what each stores). `line` is the
 * line the workspace answers on ("" with none, where the box is the only way to give one), `handoff` the transfer
 * number, and `testid` the prefix of the choice's and the note's test ids. Drawn by the Who you are row and by the
 * create card (create.tsx), so the choice and its words are written once. Hookless but for the box.
 */
// `kept` is the number the business keeps and forwards to that line (contracts kept_line): published, it reaches the
// receptionist whenever nobody picks up, so it is not the number that "will not reach" it.
export const btPublishedBox =
  ({ line, handoff, kept, testid }: PublishedNumbers) =>
  ({ draft, set, problem, field, gate: pressable, readOnly }: BoxProps<PublishedDraft>) => {
    const lineShown = phoneShown(line);
    return (
      <>
        {line ? (
          <RecordToggleGroup
            label="The number to tell customers to call"
            value={draft.own ? "line" : "other"}
            options={[
              { value: "line", label: "Your line" },
              { value: "other", label: "A different number" },
            ]}
            onChange={(v) =>
              set(v === "line" ? { own: true, typed: draft.typed } : { own: false, typed: draft.typed || lineShown })
            }
            readOnly={readOnly}
            gate={pressable}
            testid={`${testid}-choice`}
          />
        ) : null}
        <div className="bt-inline-box" hidden={draft.own && line ? true : undefined}>
          <RecordField
            {...field}
            value={draft.typed}
            onChange={(t) => set({ own: draft.own, typed: t })}
            problem={problem}
            placeholder={lineShown || "+1 212 555 0143"}
            inputMode="tel"
            autoComplete="tel"
          />
        </div>
        <span className="bt-inline-note" data-testid={`${testid}-note`}>
          {btPublishedNote({ line, handoff, kept, testid, draft })}
        </span>
      </>
    );
  };

/** A fact as the settings read resolved it: what it is, where it came from, and the other answer where there is one. */
interface FactOf {
  value: string | null;
  source: FactSource | null;
  disputed?: Fact<string>["disputed"];
}

/** How a disagreement may be taken: the draft the other answer makes, and the sources whose answer may be taken. */
interface Take<D> {
  draft: (theirs: string) => D;
  from?: readonly FactSource[];
  label?: string;
}

/**
 * A disagreement on a row, from what the settings read resolved: the other answer (facts.ts `disputed`) and the
 * resolver's sentence and severity for it (factConflicts). `take` turns the other answer into the draft that takes it,
 * and `take.from`, where it is given, names the sources whose answer may be taken; from any other, the disagreement is
 * information, drawn with no press (`use` is null). Nothing offers "keep mine": nothing stores that choice, and a press
 * that stores nothing would say the disagreement was settled while the database still holds it.
 */
const btDispute = <D,>(f: FactOf, conflict: FactConflict | null, take: Take<D>) => {
  const theirs = f.disputed || (conflict ? { value: conflict.known, source: conflict.knownSource } : null);
  if (!theirs) return null;
  const offered = !take.from || take.from.includes(theirs.source);
  return {
    value: theirs.value,
    source: theirs.source,
    severity: conflict ? conflict.severity : undefined,
    sentence: conflict ? conflict.sentence : null,
    useLabel: take.label || null,
    use: offered ? take.draft(theirs.value) : null,
  };
};
const BT_TAKE_THEIRS: Take<string> = { draft: (v) => v };
// The transfer number's disagreement is a loop (contracts factConflicts): the other answer is the number that forwards
// back to the receptionist, so it is said and never offered in one press -- taking it would make the loop.
const BT_TAKE_NOTHING: Take<string> = { draft: (v) => v, from: [] };
// The name Google lists may be taken in one press. The workspace's own name may not: it is whatever the workspace was
// called when it was made -- a Stripe test's "Billing probe" once went to the carriers as a business's name
// (business-page.ts) -- and a press that renamed the business to it would put that name in front of customers.
const BT_TAKE_GOOGLES: Take<string> = { draft: (v) => v, from: ["verified"] };

/**
 * A fact as the settings read resolved it. A read that carried no facts (an older server) falls back to what is typed
 * in the brain, with no source claimed for it: a fact with no source is not a fact, but a stored value is still what
 * the receptionist says. Beside it, the disagreement factConflicts found on it, where there is one, and the source a
 * filled row shows beside its value.
 */
const btFactOf = (key: keyof ResolvedFacts, typed: string | null | undefined): FactOf => {
  const F = factsNow()?.facts;
  return (F && F[key]) || (typed ? { value: typed, source: null } : { value: null, source: null });
};
const btConflictOn = (key: keyof ResolvedFacts): FactConflict | null =>
  (factsNow()?.conflicts || []).find((k) => k.fact === key) || null;
const btSourceOf = (f: FactOf) => (f.value ? f.source : null);
// A row's act, gated as the role gate says, named for the thing it changes.
const btChangeGate = (thing: string) => gate("settings", `change the ${thing}`);
// A row of words: its draft as the row stores it (STORED_AS: trimmed, and a web address with the https:// an owner left
// off), through the row's patch, and the words every such row says once it is saved.
const btWordsSaved = (id: "name" | "address" | "website" | "booking_link") => (d: string) => {
  const S = businessTabSave;
  return { change: S.PATCH_OF[id](S.STORED_AS[id] ? S.STORED_AS[id](d) : S.trimmed(d)), said: BT_SAVED };
};

/**
 * The name's save, which renames the workspace too (00439; the wiring's second audit, X4-5): its toast says what the
 * sign-up page and the sign say now, and where the carriers hold the name the campaign was filed under, says that with the
 * way to ask for it to change. An answer that renamed nothing says what every row says.
 */
const btNameSaved = (flash: (f: LegacyFlash) => void) => (d: string) => ({
  ...btWordsSaved("name")(d),
  said: (answer: unknown): LegacyFlash => {
    const r = (answer as { renamed?: { to?: unknown; carriers_hold?: unknown; refused?: unknown } } | null)?.renamed;
    if (!r) return { msg: BT_SAVED };
    if (r.refused) return { tone: "warn", msg: RENAME_WORDS.kept };
    const pages = RENAME_WORDS.pages(typeof r.to === "string" ? r.to : "");
    const held = typeof r.carriers_hold === "string" ? r.carriers_hold : null;
    if (!held) return { msg: pages };
    return {
      msg: `${pages} ${RENAME_WORDS.held(held)}`,
      action: { label: RENAME_WORDS.ask, onClick: () => btAskNameChange(flash) },
    };
  },
});

/**
 * Ask a person at Chanlytics to change the name the carriers hold (setup_request 'name'), through Setup's verb as the
 * Workspace pane asks for a repair, and say what was asked.
 */
const btAskNameChange = async (flash: (f: LegacyFlash) => void) => {
  const setup = setupApi();
  if (!setup) return;
  const r = await setup.request("name");
  if (!r.ok) return flash({ tone: "danger", msg: r.message || "That didn't go through." });
  flash({ msg: r.already ? RENAME_WORDS.already : RENAME_WORDS.requested });
};

/** What every card's row is handed by the card. */
interface RowShared {
  brain: Brain;
  base?: Config | null;
  canEdit: boolean;
  flash: (flash: LegacyFlash) => void;
  saver: Saver | null;
}

/** Where the business is, as the settings read resolved it: Google's, until one is typed. */
export const BtAddressRow = ({ brain, base = null, canEdit, flash, saver }: RowShared) => {
  const typed = (brain.profile || {}).address;
  const address = btFactOf("address", typed);
  return (
    <BtRow
      brain={brain}
      base={base}
      canEdit={canEdit}
      flash={flash}
      saver={saver}
      id="address"
      label="Address"
      value={address.value}
      empty="Not set"
      source={btSourceOf(address)}
      disputed={btDispute(address, btConflictOn("address"), BT_TAKE_THEIRS)}
      gate={btChangeGate("address")}
      initial={typed || ""}
      commit={btWordsSaved("address")}
      body={btTextBox({
        placeholder: "123 Example St, Brooklyn, NY 11208",
        autoComplete: "street-address",
      })}
    />
  );
};

/** The website, given when someone asks. */
export const BtWebsiteRow = ({ brain, base = null, canEdit, flash, saver }: RowShared) => {
  const typed = (brain.profile || {}).website;
  const website = btFactOf("website", typed);
  return (
    <BtRow
      brain={brain}
      base={base}
      canEdit={canEdit}
      flash={flash}
      saver={saver}
      id="website"
      label="Website"
      value={website.value ? <span className="bt-one-line">{website.value}</span> : null}
      empty="Not set"
      // No line under it (Ruben, 10 Oct 2026: a row says its value and stops): "Not set" is the whole of it. The prompt
      // names a website only when one is typed here; empty never sends customers or the carriers anywhere of ours.
      source={btSourceOf(website)}
      disputed={btDispute(website, btConflictOn("website"), BT_TAKE_THEIRS)}
      gate={btChangeGate("website")}
      initial={typed || ""}
      check={businessTabSave.CHECK_OF.website}
      commit={btWordsSaved("website")}
      body={btTextBox({
        placeholder: "https://example.com",
        inputMode: "url",
        autoComplete: "url",
      })}
    />
  );
};

/**
 * Where a customer books, optional for every business (0008, amended 18 Oct 2026; the first run's decision 2): with
 * none, the receptionist takes their details, which the row's empty state and hint say. `other` is an answer to
 * offer where the kit draws a disagreement, while there is none: the first run's booking page found on the website
 * ({ value, sentence, use, useLabel }), taken in one press through this row's own check and save, and offered only to
 * a role that may change the business, as any disagreement's press is.
 */
export const BtBookingLinkRow = ({
  brain,
  base = null,
  canEdit,
  flash,
  saver,
  other = null,
}: RowShared & { other?: BtDisputed<string> | null }) => {
  const S = businessTabSave;
  const link = btFactOf("booking_link", brain.booking_link);
  // Optional for every business: with none, its receptionist takes their details (0008, amended 18 Oct 2026).
  const linkWords = BUSINESS_TAB.BOOKING_LINK_ROW_WORDS;
  return (
    <BtRow
      brain={brain}
      base={base}
      canEdit={canEdit}
      flash={flash}
      saver={saver}
      id="booking_link"
      label="Booking link"
      value={brain.booking_link ? <span className="bt-one-line">{brain.booking_link}</span> : null}
      empty={linkWords.empty}
      // What it is for is its editor's line, not the row's (Ruben, 10 Oct 2026: a row says its value and stops).
      source={btSourceOf(link)}
      disputed={btDispute(link, btConflictOn("booking_link"), BT_TAKE_THEIRS) || other}
      gate={btChangeGate("booking link")}
      initial={brain.booking_link || ""}
      check={(d: string) => S.CHECK_OF.booking_link(d)}
      commit={btWordsSaved("booking_link")}
      body={btTextBox({
        placeholder: "https://your-booking-page.com",
        inputMode: "url",
        autoComplete: "url",
        hint: linkWords.hint,
      })}
    />
  );
};

/** The numbers Who you are states, as the settings read resolved them. */
interface WhoNumbers {
  /** The line it answers ("" with none). */
  voiceLine: string;
  /** The source the line came from. */
  lineSource: FactSource | null;
  /** The number the business keeps and forwards to the receptionist, which a transfer must never ring. */
  keptLine: string | null;
}

const btWhoNumbers = (): WhoNumbers => {
  const F = factsNow()?.facts;
  const line = F?.voice_line || null;
  return {
    voiceLine: (line && line.value) || "",
    lineSource: line ? line.source : null,
    keptLine: (F?.kept_line && F.kept_line.value) || null,
  };
};

/** The name's row: the line the prompt opens with, and what a rename writes again. */
const BtNameRow = ({ shared, brain, goesOn }: { shared: RowShared; brain: Brain; goesOn: Brain }) => {
  const S = businessTabSave;
  const name = btFactOf("business_name", brain.business_name);
  return (
    <BtRow
      {...shared}
      id="name"
      // The line the prompt opens with, and the product's own lines where a rename writes them again (the name's patch),
      // decided on the brain the rename goes on, as the patch decides it.
      section={S.isBaseline(goesOn) ? ["business_name", "system_prompt"] : "business_name"}
      label="Name"
      value={name.value}
      empty="Not set"
      source={btSourceOf(name)}
      disputed={btDispute(name, btConflictOn("business_name"), BT_TAKE_GOOGLES)}
      gate={btChangeGate("name")}
      initial={brain.business_name || ""}
      check={S.CHECK_OF.name}
      commit={btNameSaved(shared.flash)}
      body={btTextBox({ placeholder: "The name customers know you by", autoComplete: "organization" })}
    />
  );
};

/**
 * What the receptionist tells customers to call.
 *
 * Absent means "the line it answers", which is the answer for nearly every workspace and the one that stays
 * right when the number changes. Publishing anything else is a deliberate act, and the note says what it costs
 * -- because the live salon published its transfer number here and every customer who rang it reached a
 * person's mobile instead of the receptionist standing by.
 */
const BtPublishedRow = ({ shared, brain, numbers }: { shared: RowShared; brain: Brain; numbers: WhoNumbers }) => {
  const S = businessTabSave;
  const pub = btFactOf("phone_display", brain.phone_display);
  const handoff = btFactOf("handoff_number", (brain.profile || {}).handoff_number).value || null;
  const { voiceLine, keptLine } = numbers;
  // The number it gives out stores what its own rule makes of a draft, beside the line it answers.
  const published = (d: PublishedDraft) => S.STORED_AS.phone_display(d, voiceLine);
  return (
    <BtRow
      {...shared}
      id="phone_display"
      label="Tells customers to call"
      named="number customers are told to call"
      value={pub.value}
      empty="No number to give out"
      source={btSourceOf(pub)}
      disputed={btDispute(pub, btConflictOn("phone_display"), {
        label: "Publish the line instead",
        draft: (): PublishedDraft => ({ own: true, typed: "" }),
      })}
      gate={btChangeGate("number customers are told to call")}
      initial={{ own: !brain.phone_display, typed: brain.phone_display || "" }}
      storedAs={published}
      check={(d: PublishedDraft) => S.CHECK_OF.phone_display(d, voiceLine)}
      commit={(d: PublishedDraft) => {
        const v = published(d);
        return {
          change: S.PATCH_OF.phone_display(v),
          said: v ? (
            <>
              Customers are told to call <b className="tabular">{v}</b> now.
            </>
          ) : (
            <>Customers are told to call your line.</>
          ),
        };
      }}
      body={btPublishedBox({ line: voiceLine, handoff, kept: keptLine, testid: "rec-inline-phone_display" })}
    />
  );
};

/**
 * Where a caller who insists on a person is transferred. Empty is a choice. Shown, and changed from, the way the
 * row writes it: the check and the stored form both read "+1 (786) 555-0182". Its words are a call's, so what
 * it will say is read on the phone: on WhatsApp the number changes nothing. And only where there is a line to
 * call: a workspace that answers on WhatsApp alone is shown no sentence that no receptionist of its receives.
 */
const BtTransferRow = ({ shared, brain, numbers }: { shared: RowShared; brain: Brain; numbers: WhoNumbers }) => {
  const S = businessTabSave;
  const profile = brain.profile || {};
  const transfer = btFactOf("handoff_number", profile.handoff_number);
  const { voiceLine, keptLine } = numbers;
  const transferOf = S.STORED_AS.handoff_number;
  return (
    <BtRow
      {...shared}
      id="handoff_number"
      label="Transfer number"
      named="transfer number"
      channel={voiceLine ? "voice" : null}
      value={transfer.value ? phoneShown(transfer.value) : null}
      empty="Takes a message instead"
      source={btSourceOf(transfer)}
      disputed={btDispute(transfer, btConflictOn("handoff_number"), BT_TAKE_NOTHING)}
      gate={btChangeGate("transfer number")}
      initial={phoneShown(profile.handoff_number) || ""}
      storedAs={transferOf}
      check={(d: string) => S.CHECK_OF.handoff_number(d, voiceLine, keptLine)}
      commit={(d: string) => {
        const v = transferOf(d);
        return {
          change: S.PATCH_OF.handoff_number(v),
          said: v ? (
            <>
              Callers who insist on a person reach <b className="tabular">{phoneShown(v)}</b>.
            </>
          ) : (
            <>The receptionist takes a message instead of transferring.</>
          ),
        };
      }}
      body={btTextBox({
        placeholder: "+1 212 555 0143",
        inputMode: "tel",
        autoComplete: "tel",
        hint: "Empty, it takes a message.",
      })}
    />
  );
};

/**
 * The transfer number on How it answers' On calls card (the Settings wiring review, items 6-7, 18 Oct 2026), with the
 * greeting: a call's settings in one place, where it was a fact on Who you are and shown again in the hand-off.
 */
export const BtTransferNumberRow = (shared: RowShared) => (
  <BtTransferRow shared={shared} brain={shared.brain} numbers={btWhoNumbers()} />
);

/**
 * Who you are (spec §4.2): the facts a customer asks for by name, each with where it came from, and the
 * disagreements factConflicts finds drawn on the row each is about, where the banner above the card used to hold them.
 * The booking link is Hours & booking's (offer.tsx BtBookingCard), with what the business books with, since 17 Oct 2026.
 *
 * The Workspace row is gone. It printed the business's name a second time whenever the workspace's name differed: two
 * names for one business, on the one card that exists to say which name customers hear.
 */
export const BtWhoCard = ({ brain, base = null, canEdit, flash, saver }: RowShared) => {
  // The brain the rows' saves go on (the saver's base), which is what they will say is worked out on.
  const goesOn = (base && base.brain) || brain;
  const shared = { brain, base, canEdit, flash, saver };
  const numbers = btWhoNumbers();
  const lineShown = phoneShown(numbers.voiceLine);

  return (
    <section className="rec-card" data-testid="rec-card-who" aria-labelledby="bt-who-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-who-title">
          Who you are
        </h2>
        <span className="rec-card-sub">The facts a customer asks for by name</span>
      </div>

      <BtNameRow shared={shared} brain={brain} goesOn={goesOn} />

      <BtLogoRow canEdit={canEdit} flash={flash} />

      <BtAddressRow {...shared} />

      <BtWebsiteRow {...shared} />

      {/* The numbers, named for what each one does. They were one row called "Phone line" showing a typed string,
          which is how a salon came to publish the number it transfers to as the number to call. The line it answers
          is provisioned and belongs to Connections, so it is shown here and never offered as a box; the number it
          gives out is edited in the row that states it, and the one it transfers to is On calls' (How it answers). */}
      {/* The door is the row's act, with its own test id: it opens Connections, never a box, so it is not the row's
          Change. Named for where it goes and why, beginning with its own word, since its word and the row's label
          together ("Connections Answers on") say nothing. */}
      <RecordRow
        id="voice_line"
        label="Answers on"
        value={numbers.voiceLine ? lineShown : null}
        empty="No phone line yet"
        source={numbers.voiceLine ? numbers.lineSource : null}
        act={{
          label: "Connections",
          icon: "arrow-right",
          name: "Connections, where the line it answers on is set up",
          onClick: () => navigate("admin/integrations"),
          testid: "rec-row-door-voice_line",
        }}
      />

      <BtPublishedRow shared={shared} brain={brain} numbers={numbers} />

      {/* Nothing is asked twice (spec §3): the carrier record is Connections', and this card only says where it is. */}
      <p className="bt-card-foot" data-testid="rec-who-foot">
        Your legal name and address are on{" "}
        <button
          type="button"
          className="bt-link"
          onClick={() => navigate("admin/integrations")}
          data-testid="rec-who-carriers"
        >
          Connections
        </button>
        .
      </p>
    </section>
  );
};

/**
 * Your goal (the Settings wiring review, item 9, 18 Oct 2026): what Ask weighs every signal and plan against (config
 * `ask.goal`, Ask's own section; the receptionist never reads it). Ask's card was the only way to set it, and no page
 * said what it was. One row, saved through the tab's saver as that card writes it (contracts applySettingsChange's
 * set_goal) and said in the card's own line (askGoalSaved), so a goal kept either way reads the same here and in Ask.
 * It changes no word the receptionist is told, so its editor says nothing it will be told.
 */
export const BtGoalCard = ({ brain, config, canEdit, flash, saver }: RowShared & { config: Config | null }) => {
  const W = ASK_GOAL_WORDS;
  const goal = config?.ask?.goal || "";
  const door = saver
    ? {
        save: (draft: string, done: () => void) =>
          saver.save({
            row: "ask_goal",
            patch: (c) => applySettingsChange(c, { op: "set_goal", goal: draft }),
            said: askGoalSaved(draft),
            done,
            flash,
          }),
        pending: () => saver.pending("ask_goal"),
      }
    : null;
  return (
    <section className="rec-card" data-testid="rec-card-goal" aria-labelledby="bt-goal-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-goal-title">
          {W.title}
        </h2>
        <span className="rec-card-sub">{W.sub}</span>
      </div>
      <BtRow
        brain={brain}
        canEdit={canEdit && !!door}
        flash={flash}
        id="ask_goal"
        label={W.label}
        value={goal ? <span className="bt-one-line">{goal}</span> : null}
        empty={W.empty}
        hint={goal ? null : W.hint}
        gate={gate("settings", W.gate)}
        initial={goal}
        storedAs={(d: string) => d.trim()}
        check={askGoalRefusal}
        door={door}
        body={btTextBox({ placeholder: W.placeholder, hint: W.hint })}
      />
    </section>
  );
};
