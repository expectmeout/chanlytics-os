// Chanlytics — Settings › Business: How it answers, the first four folds' fields.
//
// The voice, the languages, the rules it always keeps and how it hands you a customer: what each fold of
// answers.tsx draws when it is opened. The card is answers.tsx, and the notes, the owner's own words and the three
// messages sent when it cannot answer are there with it; these four are here so that neither module passes the
// file-length ratchet (800 lines). Hookless, as the card is: the folds hold the hooks.

import type { GuardrailKey } from "@chanlytics/contracts";
import type { ComponentProps, ReactNode } from "react";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { FailedRead } from "../../kit/empty/empty";
import { FieldError } from "../../kit/field-error/field-error";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { RecordField, RecordSwitch } from "../../kit/record/field";
import { RecordCombobox } from "../../kit/record/combobox";
import { recFolds } from "../../kit/record/registry";
import type { BtFold } from "./gestures/fold";
import { businessTabSave } from "./saver";
import type { policiesNow } from "./shell";

/** What a fold hands its body (BtFold's contract says each). */
export type Fields = Parameters<ComponentProps<typeof BtFold>["body"]>[0];

/* ------------------------------------ the voice ------------------------------------ */

/**
 * The voice: one short box, and three sentences to start from. A press on one puts its sentence in the box, which the
 * owner makes their own from there; the sentences are contracts' (TONE_PRESETS), so the vm tests hold each to what the
 * profile keeps. The box is named by the fold's own label, the words on screen above it (RecordFold's
 * rec-fold-<id>-label), as consult-first's is.
 */
export const BtaVoice = ({
  draft,
  update,
  problems,
  readOnly,
}: Pick<Fields, "draft" | "update" | "problems" | "readOnly">) => {
  const presets = BUSINESS_TAB.TONE_PRESETS;
  return (
    <>
      <RecordField
        id="bt-tone"
        label={null}
        aria-labelledby="rec-fold-tone-label"
        rows={2}
        value={draft as string}
        onChange={(v) => update(() => v, ["tone"])}
        problem={problems.tone || null}
        placeholder="Friendly and to the point."
        readOnly={readOnly || undefined}
        testid="rec-tone-box"
      />
      {/* The starting points as one small menu, where three boxes stood under the one box that matters (23 Sep). A
          pick fills the box through the fold's own update; while the save is out the menu says it waits, as Save does
          (MoreMenu's gated: aria-disabled, never disabled, so it keeps focus). */}
      {presets.length ? (
        <div className="bt-presets">
          <MoreMenu
            items={presets.map((p) => ({ label: p.label, onClick: () => update(() => p.tone, ["tone"]) }))}
            label="Start from…"
            title="Fill the box with a starting point"
            btnClass="bt-link"
            align="left"
            escape
            gated={readOnly ? "Saving — nothing can be changed until this is saved." : null}
            testid="rec-tone-presets"
          />
        </div>
      ) : null}
    </>
  );
};

/* ------------------------------------ the languages ------------------------------------ */

// Offered rather than typed (contracts COMMON_LANGUAGES says why), read as the box draws.
const btaLanguagesOffered = () => BUSINESS_TAB.COMMON_LANGUAGES;

// What the languages' box says where Add would be, once the list holds as many as the profile keeps (LIMITS.languages).
const BTA_LANGUAGES_FULL = "That is the most languages it keeps. Remove one to add another.";
// Whether two languages are one, however written: contracts' one rule (sameListed), which the first run's chips ask
// too, so "Haitian Créole" chosen is "Haitian Creole" offered.
const btaSameWord = (a: string, b: string) => BUSINESS_TAB.sameListed(a, b);

/**
 * The languages as tokens, each with its remove, and one box to add another: the kit's combobox over the common ones,
 * which takes a name it does not list as it was typed (the old form's "Anything not listed can still be added by
 * hand"). ONE control, as the old form's was: a grid of every language shouting beside the two chosen, and a second
 * control under it to add a fifteenth, were two widgets for one job.
 *
 * The list is the draft's, with every rule a list has (BtFold's rows: the cap through Add and through an Undo, the
 * removal said only when it happened, the language back at its own place). Backspace on the empty box takes the last
 * one back, which is what every token field does and what a hand expects, and says so with its Undo; words typed and
 * left there are added as focus leaves the box, as the old form's were. Nothing past the profile's eight is offered:
 * the box is hidden then, and a sentence stands where it was. The box is drawn on every render, hidden or not: it holds
 * hooks.
 */
export const BtaLanguages = ({
  draft,
  rows,
  press,
  problems,
  readOnly,
}: Pick<Fields, "draft" | "rows" | "press" | "problems" | "readOnly">) => {
  const chosen = Array.isArray(draft) ? (draft as string[]) : [];
  // `blank` is the language an add appends: rows() is a builder over the live draft, so it is built for each add.
  const list = (adding: string | null) =>
    rows({
      id: "languages",
      max: businessTabSave.LIMITS.languages,
      blank: () => adding,
      keysOf: () => ["languages"],
      key: "languages",
      full: BTA_LANGUAGES_FULL,
    });
  const langs = list(null);
  const remove = (i: number) =>
    langs.removeAt(i, (gone) => (
      <>
        Removed <b>{gone as ReactNode}</b>
      </>
    ));
  // A name already chosen, however it is written, is not added twice: "spanish" and "Spanish" are one language.
  const add = (name: string | null | undefined) => {
    const v = String(name == null ? "" : name).trim();
    if (!v || chosen.some((l) => btaSameWord(l, v))) return;
    list(v).add();
  };
  const common = btaLanguagesOffered();
  const offered = common.filter((l) => !chosen.some((c) => btaSameWord(c, l))).map((l) => ({ value: l, label: l }));
  return (
    <div className="bt-languages" data-testid="rec-languages">
      {chosen.length ? (
        <ul className="bt-tokens" aria-labelledby="rec-fold-languages-label" data-testid="rec-languages-tokens">
          {chosen.map((l, i) => (
            <li key={`${l}-${i}`} className="bt-token">
              {l}
              <Button
                variant="quiet"
                size="sm"
                iconOnly
                className="bt-token-x"
                aria-label={`Remove ${l}`}
                {...press(() => remove(i))}
                data-testid={`rec-language-remove-${l}`}
              >
                <Icon name="x" size={10} />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="bt-languages-add" hidden={langs.canAdd ? undefined : true}>
        <RecordCombobox
          id="bt-languages-add"
          label="Add a language"
          value={null}
          options={offered}
          onChange={add}
          typed={(words) =>
            common.concat(chosen).some((l) => btaSameWord(l, words)) ? null : { value: words, label: `Add “${words}”` }
          }
          onKeyDown={(e) => {
            if (e.key === "Backspace" && "value" in e.target && e.target.value === "" && chosen.length) {
              e.preventDefault();
              remove(chosen.length - 1);
            }
          }}
          // Words typed and left in the box are added as focus leaves it, as the old form's box did: a listed one as the
          // list spells it, anything else as typed (add refuses one already chosen). Closed over them, the box lost the
          // language, and the fold saved without it.
          onLeave={(words) => add(common.find((l) => btaSameWord(l, words)) || words)}
          // The words the box is named by, on screen in it: a placeholder of other words left the name unseen.
          placeholder="Add a language"
          readOnly={readOnly}
          testid="rec-languages-add"
        />
      </div>
      {langs.canAdd ? null : (
        <p className="bt-fold-note" data-testid="rec-languages-cap">
          {BTA_LANGUAGES_FULL}
        </p>
      )}
      <FieldError id="bt-languages-problem" message={problems.languages || null} testid="rec-languages-problem" />
    </div>
  );
};

/* ------------------------------------ the rules it always keeps ------------------------------------ */

// The four rules, in the schema's order (contracts GUARDRAIL_KEYS), each with the old form's label and the short name
// the row says it by at rest (the canvas's Record board). The sentence under the label is NOT here: it is the rule's
// own strength (contracts ruleStrength(key).sentence, Task 4.2), because the form's hint said what the rule asks for
// and the strength says how far it actually goes -- and two sentences on one switch is the clutter the owner asked us
// to stop. The health rule's hint WAS its strength's sentence, word for word; contracts has it now.
const BTA_RULES: [GuardrailKey, string, string][] = [
  ["never_quote_prices", "Never quote or confirm a price", "Never quotes a price"],
  ["never_confirm_booking", "Never confirm an appointment itself", "Never confirms a booking"],
  ["disclose_ai", "Say it is an assistant if asked", "Says it's an assistant"],
  ["no_health_advice", "Never give health advice", "No health advice"],
];

/** The guardrails draft: the four rules and the photos switch, each a switch. */
type RulesDraft = Partial<Record<GuardrailKey | "vision", unknown>>;

/** One of the four switches: its label, how far the rule goes in contracts' words, and the switch itself. */
const BtaRule = ({
  ruleKey,
  label,
  on,
  update,
  readOnly,
}: {
  ruleKey: GuardrailKey;
  label: string;
  on: boolean;
  update: Fields["update"];
  readOnly: boolean;
}) => {
  // How far this rule goes, in contracts' words: one badge and one sentence, never typed here.
  const r = BUSINESS_TAB.ruleStrength(ruleKey);
  return (
    <div className="bt-rule" data-testid={`rec-rule-${ruleKey}`}>
      <span className="bt-rule-words">
        <span className="bt-rule-head">
          <span className="bt-rule-label" id={`bt-rule-${ruleKey}-label`}>
            {label}
          </span>
          {/* A muted word, never a filled pill: the strength is the one quiet signal this row carries. */}
          <span className="bt-rule-chip">{r.chip}</span>
        </span>
        {/* Not drawn under 761px (settings.css), where four sentences are most of a phone's screen -- so the switch
            carries it as its description at every width, and a screen reader hears the guarantee either way. */}
        <span className="bt-rule-says" id={`bt-rule-${ruleKey}-says`}>
          {r.sentence}
        </span>
        {/* Only the checked rule has two channels to tell apart: in chat the words are swapped before anyone reads
            them, on a call the figure has already been heard. Both are contracts', channel name and all. */}
        {r.checkedOn ? (
          <span className="bt-rule-checked">
            {r.checkedOn.map((c) => (
              <span key={c.channel} className="bt-rule-checked-line">
                <span className="bt-rule-checked-who">{c.label}</span> {c.words}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      <RecordSwitch
        on={on}
        onChange={(v) => update((d) => ({ ...(d as RulesDraft), [ruleKey]: v }))}
        labelledBy={`bt-rule-${ruleKey}-label`}
        describedBy={`bt-rule-${ruleKey}-says`}
        readOnly={readOnly}
        testid={`rec-rule-switch-${ruleKey}`}
      />
    </div>
  );
};

/**
 * The photos switch, apart from the four. Opt-in, unlike the rules above: this gives the receptionist an ability rather
 * than a limit, so it starts off. Apart from them, under a dashed rule (rec-rule-sep is the name Phase 4's test knows
 * it by). It changes no word of the prompt (a photo's words go in the customer's own turn), so it draws no "It will be
 * told" of its own.
 */
const BtaVisionRule = ({ on, update, readOnly }: { on: boolean; update: Fields["update"]; readOnly: boolean }) => {
  // The fifth strength, from contracts like the four above it (VISION_STRENGTH): a badge typed here and typed again in
  // the page's test agreed with each other and with nothing else.
  const vision = BUSINESS_TAB.VISION_STRENGTH;
  return (
    <div className="bt-rule bt-rule-power" data-testid="rec-rule-vision">
      <span className="bt-rule-sep rec-rule-sep" aria-hidden="true" />
      <span className="bt-rule-words">
        <span className="bt-rule-head">
          <span className="bt-rule-label" id="bt-rule-vision-label">
            Look at photos customers send
          </span>
          <span className="bt-rule-chip">{vision.chip}</span>
        </span>
        {/* Drawn at every width, unlike the four: it is the one switch whose sentence says what each POSITION does,
            which is a decision an owner makes here. Not the canvas's "The four above are limits and start on":
            health advice starts off too. */}
        <span className="bt-rule-hint">{vision.sentence}</span>
      </span>
      <RecordSwitch
        on={on}
        onChange={(v) => update((d) => ({ ...(d as RulesDraft), vision: v }))}
        labelledBy="bt-rule-vision-label"
        readOnly={readOnly}
        testid="rec-rule-switch-vision"
      />
    </div>
  );
};

/**
 * The four switches, and the photos switch apart from them. Each rule is ONE element holding its label, its hint and
 * its switch (rec-rule-<key>), so Phase 4 draws its strength into it rather than rebuilding it. The draft is the fold's
 * whole guardrails draft, and a press writes one key of it, spread over the rest: saveFold refuses a draft with any of
 * the five missing (folds.ts btWhole), because a missing switch written as it stood was stored as off, the opposite of
 * the schema's "absent means on".
 *
 * Absent means ON for the first three and OFF for health advice, as draftOf opens them: a record that stores no rules
 * opens with three on, and a Save that changes nothing sends nothing. On a record whose details compose nothing, none
 * of the four changes a word the receptionist is told (the price detector still reads every reply), and the fold says
 * so once, in contracts' words, where the rules' block would be (`unread`); it draws no empty "It will be told".
 */
export const BtaRules = ({
  draft,
  update,
  readOnly,
  unread,
}: Pick<Fields, "draft" | "update" | "readOnly"> & { unread: string | null }) => {
  const rules = draft as RulesDraft;
  return (
    <div className="bt-rules-list" data-testid="rec-rules-switches">
      {BTA_RULES.map(([key, label]) => (
        <BtaRule key={key} ruleKey={key} label={label} on={rules[key] === true} update={update} readOnly={readOnly} />
      ))}
      {unread ? (
        <p className="bt-fold-note" data-testid="rec-rules-unread">
          {unread}
        </p>
      ) : null}
      {/* Opt-in, unlike the rules above: this gives the receptionist an ability rather than a limit, so it starts off. */}
      <BtaVisionRule on={rules.vision === true} update={update} readOnly={readOnly} />
    </div>
  );
};

/* ------------------------------------ how it hands you a customer ------------------------------------ */

/** What the hand-off row says at rest, and the Phone half of it. */
export type HandoffWords = ReturnType<typeof BUSINESS_TAB.handoffWords>;

/** The Autonomy reply row's pause, as it is stored: usually nothing, which contracts reads as a day, as the pane does. */
const btaPauseHours = (policies: ReturnType<typeof policiesNow>): unknown => {
  const reply = policies && Array.isArray(policies.rows) ? policies.rows.find((r) => r && r.class === "reply") : null;
  return reply && reply.limits ? reply.limits.pause_hours : undefined;
};

/** The WhatsApp half of a hand-off: what the chat hand-off does, or that the Autonomy tab could not be read. */
const BtaHandoffChat = ({ reasons, policies }: { reasons: boolean; policies: ReturnType<typeof policiesNow> }) => (
  <div className="bt-handoff-part" data-testid="rec-handoff-chat-part">
    <span className="bt-channel">WhatsApp</span>
    {policies === null ? (
      <FailedRead kind="line" what="the Autonomy tab" surface="settings" testid="rec-handoff-unread" />
    ) : (
      <p className="bt-fold-note" data-testid="rec-handoff-chat-says">
        {BUSINESS_TAB.handoffChatWords({ hasEscalateWhen: reasons, pauseHours: btaPauseHours(policies) })}
      </p>
    )}
  </div>
);

/** The Phone half of a hand-off: the number as it stands, what a call does with it, and the door to the row that sets it. */
const BtaHandoffCall = ({
  reasons,
  words,
  transfer,
  calls,
  press,
}: {
  reasons: boolean;
  words: HandoffWords | null;
  transfer: string | null | undefined;
  calls: boolean;
  press: Fields["press"];
}) => (
  <div className="bt-handoff-part" data-testid="rec-handoff-call-part">
    <span className="bt-channel">Phone</span>
    <span className="bt-handoff-number" data-testid="rec-handoff-number">
      {words ? words.phone : null}
    </span>
    {calls ? (
      <p className="bt-fold-note" data-testid="rec-handoff-call-says">
        {BUSINESS_TAB.handoffCallWords({ hasHandoffNumber: !!transfer, hasEscalateWhen: reasons })}
      </p>
    ) : null}
    {calls ? (
      <LinkButton
        {...press(() => {
          recFolds.request("handoff_number");
        })}
        data-testid="rec-handoff-door"
      >
        {transfer ? "Change the transfer number" : "Add a transfer number"}
      </LinkButton>
    ) : null}
  </div>
);

/**
 * Both halves of a hand-off, in one row naming both channels (spec §4.5): the owner's reasons, one to a line, and what
 * each channel does with them. The sentences are contracts', checked against the edge (handoffChatWords says what the
 * chat hand-off does, and how long it holds off, which is the Autonomy tab's; handoffCallWords says what a transfer
 * does, and that the reasons reach a call too).
 *
 * The transfer number is only shown here, never edited: Who you are's "Transfer number" is its one editor (the
 * plan's decision in Task 3.2's review), and a door opens that row, by its id, as the gap line's door opens a
 * row. With the Autonomy tab's read failed, how long it holds off cannot be said, and a failed read says so where the
 * sentence would be. On a workspace with no line to call (`calls` false) no receptionist of it takes a call, so what a
 * call does is not said, nor is the door offered: Who you are's transfer row says nothing it will say there either.
 * What a call would do with the number stays at rest, as that row keeps its value.
 */
export const BtaHandoff = ({
  draft,
  update,
  press,
  problems,
  readOnly,
  words,
  transfer,
  calls,
  policies,
}: Pick<Fields, "draft" | "update" | "press" | "problems" | "readOnly"> & {
  words: HandoffWords | null;
  transfer: string | null | undefined;
  calls: boolean;
  policies: ReturnType<typeof policiesNow>;
}) => {
  // Whether the draft holds a reason, by the rule its save writes the lines by.
  const reasons = businessTabSave.linesOf(draft).length > 0;
  return (
    <>
      <RecordField
        id="bt-escalate-when"
        label="Your reasons"
        hint="One per line."
        rows={4}
        value={draft as string}
        onChange={(v) => update(() => v, ["escalate_when"])}
        problem={problems.escalate_when || null}
        placeholder={"They ask for the owner by name\nThey are unhappy about a previous visit"}
        readOnly={readOnly || undefined}
        testid="rec-handoff-reasons"
      />
      <BtaHandoffChat reasons={reasons} policies={policies} />
      <BtaHandoffCall reasons={reasons} words={words} transfer={transfer} calls={calls} press={press} />
    </>
  );
};
