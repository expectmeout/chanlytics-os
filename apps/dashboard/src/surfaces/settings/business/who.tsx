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

import type { Fact, FactConflict, FactSource, ResolvedFacts } from "@chanlytics/contracts";
import type { ReactNode } from "react";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { gate, navigate } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { RecordField, RecordToggleGroup } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import { BT_SAVED } from "./gestures/common";
import { BtRow } from "./gestures/row";
import type { BtDisputed } from "./gestures/row";
import { phoneShown } from "./save";
import type { Brain, Config, Saver } from "./save";
import { businessTabSave } from "./saver";
import { factsNow, samePhone } from "./shell";

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
      // What empty means, and only what is exact: the prompt names a website only when one is typed here. Not that it
      // has none to give, since the owner's own words may name one. Nor what the canvas said, that empty sent
      // customers and the carriers to the page we publish, /b/<slug>: no receptionist is told that page, and the
      // carriers are filed the business record's own website (Connections), or that page when the record has none.
      hint={website.value ? null : "Optional"}
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
        // The row says "Optional" while empty, and its editor says it too, so the row keeps its height as it becomes
        // its editor (record.css measures both).
        hint: "Optional",
      })}
    />
  );
};

/**
 * Where a customer books. Whether this workspace is asked for one at all is how its customers buy (0008, the first
 * run's decision 2): the row's check, its empty state and its hint all follow the one answer. `other` is an answer to
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
  const sellsNow = S.answer();
  const linkWords = BUSINESS_TAB.bookingLinkRowWords(sellsNow);
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
      // What an empty one means, while it is empty (BtRow): a row that has its link states it and stops.
      hint={linkWords.hint}
      source={btSourceOf(link)}
      disputed={btDispute(link, btConflictOn("booking_link"), BT_TAKE_THEIRS) || other}
      gate={btChangeGate("booking link")}
      initial={brain.booking_link || ""}
      check={(d: string) => S.CHECK_OF.booking_link(d, sellsNow)}
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
      commit={btWordsSaved("name")}
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
        hint: "A number a person answers, with the country code. Empty, it takes a message.",
      })}
    />
  );
};

/**
 * Who you are (spec §4.2): the seven facts a customer asks for by name, each with where it came from, and the
 * disagreements factConflicts finds drawn on the row each is about, where the banner above the card used to hold them.
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

      <BtAddressRow {...shared} />

      <BtWebsiteRow {...shared} />

      <BtBookingLinkRow {...shared} />

      {/* THREE numbers, named for what each one does. They were one row called "Phone line" showing a typed string,
          which is how a salon came to publish the number it transfers to as the number to call. The line it answers
          is provisioned and belongs to Connections, so it is shown here and never offered as a box; the other two are
          the receptionist's behaviour, edited in the row that states them. */}
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

      <BtTransferRow shared={shared} brain={brain} numbers={numbers} />

      {/* Nothing is asked twice (spec §3): the carrier record is Connections', and this card only says where it is. */}
      <p className="bt-card-foot" data-testid="rec-who-foot">
        Your legal name and registered address are asked once on{" "}
        <button
          type="button"
          className="bt-link"
          onClick={() => navigate("admin/integrations")}
          data-testid="rec-who-carriers"
        >
          Connections
        </button>
        , for the carriers. Nothing here repeats them.
      </p>
    </section>
  );
};
