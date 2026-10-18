// Chanlytics — Settings › Business: How it answers, the first four folds' fields.
//
// The voice, the languages, the rules it always keeps and how it hands you a customer: what each fold of
// answers.tsx draws when it is opened. The card is answers.tsx, and the notes, the owner's own words and the three
// messages sent when it cannot answer are there with it; these four are here so that neither module passes the
// file-length ratchet (800 lines). Hookless, as the card is: the folds hold the hooks.

import type { GuardrailKey } from "@chanlytics/contracts";
import type { ComponentProps, ReactNode } from "react";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { Icon } from "../../kit/icon/icon";
import { FailedRead } from "../../kit/empty/empty";
import { FieldError } from "../../kit/field-error/field-error";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { Panel } from "../../kit/panel/panel";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { RecordField, RecordSwitch, RecordTip } from "../../kit/record/field";
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
              <button
                type="button"
                className="bt-token-x"
                aria-label={`Remove ${l}`}
                {...press(() => remove(i))}
                data-testid={`rec-language-remove-${l}`}
              >
                <Icon name="x" size={10} />
              </button>
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

// The four rules, in the schema's order (contracts GUARDRAIL_KEYS), each with its switch's label and the short name the
// row says it by at rest (the canvas's Record board). How far each goes is the rule's own strength (contracts
// ruleStrength(key)): its word quiet under the name, and its sentence under "How these rules work" (Ruben, 10 Oct 2026:
// the sheets "too wordy, too explanatory"; 14 Oct, the fitted sheets: one signal a row, where a dot, a word, an ⓘ and a
// switch stood for one fact).
// Prices are their own row beside this one since 18 Oct 2026 (choices/rows.tsx BtPriceChoiceRow, contracts
// PRICE_CHOICE_WORDS), and the booking rule is always on (ALWAYS_ON), as nothing in the product books.
const BTA_RULES: [GuardrailKey, string, string][] = [
  ["never_confirm_booking", "Never confirm a booking", "Never confirms a booking"],
  ["disclose_ai", "Says it's an automated assistant", "Says it's an assistant"],
  ["no_health_advice", "No health advice", "No health advice"],
];

/** The guardrails draft: the four rules, each a switch. */
type RulesDraft = Partial<Record<GuardrailKey, unknown>>;

/**
 * One of the four rules: its label with how far it goes as one quiet word under it, and the switch, which carries the
 * rule's sentence as its description (the sentence is read under "How these rules work", BtaRuleHow). A rule that is
 * not a switch (contracts ALWAYS_ON: saying it is an automated assistant, decision 0051, and the booking rule) says
 * "Always on" with a lock where the switch would be: one signal at the row's end, never a dot, a word, a tip and a
 * switch.
 */
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
  // How far this rule goes, in contracts' words: one word and one sentence, never typed here.
  const r = BUSINESS_TAB.ruleStrength(ruleKey);
  return (
    <div className="bt-line" data-testid={`rec-rule-${ruleKey}`}>
      <span className="bt-line-words">
        <span className="bt-line-name" id={`bt-rule-${ruleKey}-label`}>
          {label}
        </span>
        {/* The word says how far the rule goes, quiet under its name: four switches over three different guarantees
            would be the quietest dishonesty this page had. */}
        <span className="bt-line-sub" data-testid={`rec-rule-strength-${ruleKey}`}>
          {r.chip}
        </span>
      </span>
      <span className="bt-line-end">
        {BUSINESS_TAB.ALWAYS_ON.has(ruleKey) ? (
          <span className="bt-line-sub bt-line-lock" data-testid={`rec-rule-always-${ruleKey}`}>
            <Icon name="lock" size={11} />
            Always on
          </span>
        ) : (
          <RecordSwitch
            on={on}
            onChange={(v) => update((d) => ({ ...(d as RulesDraft), [ruleKey]: v }))}
            labelledBy={`bt-rule-${ruleKey}-label`}
            describedBy={`bt-rule-${ruleKey}-says`}
            readOnly={readOnly}
            testid={`rec-rule-switch-${ruleKey}`}
          />
        )}
      </span>
      <span className="rec-sr" id={`bt-rule-${ruleKey}-says`}>
        {r.sentence}
      </span>
    </div>
  );
};

/**
 * How far each rule goes, in its sentence, and how the checked rule lands on each channel (contracts' checkedOn), folded
 * behind one line under them: what stood behind four tips and a fold of its own.
 */
const BtaRuleHow = () => (
  <RecordDisclosure id="bt-rules-how" label="How these rules work" testid="rec-rules-checked">
    {BTA_RULES.map(([key, label]) => (
      <p key={key} className="bt-rule-how" data-testid={`rec-rule-how-${key}`}>
        <b className="bt-fold-lead">{label}.</b> {BUSINESS_TAB.ruleStrength(key).sentence}
      </p>
    ))}
  </RecordDisclosure>
);

/**
 * The rules it keeps that are not a row of their own, in one group, and how they work folded under them. Each rule is
 * ONE element holding its label, its word, its tip and its switch (rec-rule-<key>); the two that are always on say so
 * in place of a switch. The draft is the fold's guardrails draft, and a press writes one key of it, spread over the
 * rest: the fold writes the health rule alone (folds.ts btWriteGuardrails), since prices are their own row and the
 * other two are always on (the Settings wiring review, 18 Oct 2026).
 *
 * On a record whose details compose nothing, no rule here changes a word the receptionist is told, and the sheet says so
 * once, first, in contracts' words (`unread`), in the warn tone of a fact the owner may want to change.
 */
export const BtaRules = ({
  draft,
  update,
  readOnly,
  unread,
}: Pick<Fields, "draft" | "update" | "readOnly"> & { unread: string | null }) => {
  const rules = draft as RulesDraft;
  return (
    <div className="bt-stack" data-testid="rec-rules-switches">
      {unread ? (
        <p className="bt-held" data-testid="rec-rules-unread">
          {unread}
        </p>
      ) : null}
      <Panel variant="inset" size="flush" className="bt-lines" role="group" aria-label="The rules">
        {BTA_RULES.map(([key, label]) => (
          <BtaRule key={key} ruleKey={key} label={label} on={rules[key] === true} update={update} readOnly={readOnly} />
        ))}
      </Panel>
      <BtaRuleHow />
    </div>
  );
};

/* ------------------------------------ how it hands you a customer ------------------------------------ */

/** What the hand-off row says at rest. */
export type HandoffWords = ReturnType<typeof BUSINESS_TAB.handoffWords>;

/** The Autonomy reply row's pause, as it is stored: usually nothing, which contracts reads as a day, as the pane does. */
const btaPauseHours = (policies: ReturnType<typeof policiesNow>): unknown => {
  const reply = policies && Array.isArray(policies.rows) ? policies.rows.find((r) => r && r.class === "reply") : null;
  return reply && reply.limits ? reply.limits.pause_hours : undefined;
};

/** A channel's glyph at the head of one of the hand-off's rows, named for a screen reader, since the row's words are not. */
const BtaChannel = ({ icon, name }: { icon: "chat" | "phone"; name: string }) => (
  <span className="bt-line-glyph" role="img" aria-label={name}>
    <Icon name={icon} size={14} />
  </span>
);

/** What a WhatsApp hand-off does, as one row (contracts handoffChatRow), or that the Autonomy tab could not be read. */
const BtaHandoffChat = ({ policies }: { policies: ReturnType<typeof policiesNow> }) => {
  if (policies === null)
    return (
      <div className="bt-line" data-testid="rec-handoff-chat-part">
        <BtaChannel icon="chat" name="On WhatsApp" />
        <FailedRead kind="line" what="the Autonomy tab" surface="settings" testid="rec-handoff-unread" />
      </div>
    );
  const row = BUSINESS_TAB.handoffChatRow(btaPauseHours(policies));
  return (
    <div className="bt-line" data-testid="rec-handoff-chat-part">
      <BtaChannel icon="chat" name="On WhatsApp" />
      <span className="bt-line-words">
        <span className="bt-line-name">{row.name}</span>
        <span className="bt-line-sub" data-testid="rec-handoff-chat-says">
          {row.sub}
        </span>
      </span>
    </div>
  );
};

/** What a call does, as one row (contracts handoffCallRow), and the door to the row that sets the number. */
const BtaHandoffCall = ({ transfer, press }: { transfer: string | null | undefined; press: Fields["press"] }) => {
  const row = BUSINESS_TAB.handoffCallRow(transfer);
  return (
    <div className="bt-line" data-testid="rec-handoff-call-part">
      <BtaChannel icon="phone" name="On a call" />
      <span className="bt-line-words">
        <span className="bt-line-name" data-testid="rec-handoff-number">
          {row.name}
        </span>
        <span className="bt-line-sub" data-testid="rec-handoff-call-says">
          {row.sub}
        </span>
      </span>
      <span className="bt-line-end">
        <button
          type="button"
          className="bt-link"
          aria-label={row.actName}
          {...press(() => {
            recFolds.request("handoff_number");
          })}
          data-testid="rec-handoff-door"
        >
          {row.act}
        </button>
      </span>
    </div>
  );
};

/**
 * The hand-off (spec §4.5): the owner's reasons, one to a line, then what each channel does with a customer handed over,
 * as two rows (Ruben, 10 Oct 2026: a paragraph for each channel became an outcome each). The sentences are contracts',
 * checked against the edge (handoffChatRow says what the chat hand-off does and how long it holds off, which is the
 * Autonomy tab's; handoffCallRow what a call does, which the reasons reach too). Who is handed over without a reason
 * (asked for a person, or past what it can help with) is the tip by the box.
 *
 * The transfer number is only shown here, never edited: Who you are's "Transfer number" is its one editor (the plan's
 * decision in Task 3.2's review), and the call's row opens that row, by its id, as the gap line's door opens a row. With
 * the Autonomy tab's read failed, how long it holds off cannot be said, and a failed read says so where the row would
 * be. On a workspace with no line to call (`calls` false) no receptionist of it takes a call, so the call's row is not
 * drawn.
 */
export const BtaHandoff = ({
  draft,
  update,
  press,
  problems,
  readOnly,
  transfer,
  calls,
  policies,
}: Pick<Fields, "draft" | "update" | "press" | "problems" | "readOnly"> & {
  transfer: string | null | undefined;
  calls: boolean;
  policies: ReturnType<typeof policiesNow>;
}) => (
  <div className="bt-stack">
    <div className="bt-ask">
      <span className="bt-ask-head">
        <span className="bt-ask-name" id="bt-escalate-when-label">
          Hand over when…
        </span>
        <RecordTip text={BUSINESS_TAB.HANDOFF_ANYWAY} label="Who else it hands over" testid="rec-handoff-tip" />
      </span>
      <RecordField
        id="bt-escalate-when"
        label={null}
        aria-labelledby="bt-escalate-when-label"
        rows={4}
        value={draft as string}
        onChange={(v) => update(() => v, ["escalate_when"])}
        problem={problems.escalate_when || null}
        placeholder={"They ask for the owner by name\nThey're unhappy with how it went"}
        readOnly={readOnly || undefined}
        testid="rec-handoff-reasons"
      />
    </div>
    <p className="bt-list-head" id="bt-handoff-what">
      What happens
    </p>
    <Panel variant="inset" size="flush" className="bt-lines" role="group" aria-labelledby="bt-handoff-what">
      <BtaHandoffChat policies={policies} />
      {calls ? <BtaHandoffCall transfer={transfer} press={press} /> : null}
    </Panel>
  </div>
);
