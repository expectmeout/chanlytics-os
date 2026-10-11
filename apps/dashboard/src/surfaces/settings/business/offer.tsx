// Chanlytics — Settings › Business: What you offer.
//
// The third card of the record (docs/superpowers/specs/2026-09-20-business-tab-design.md §4.4; the canvas's Record,
// Edit-Sheet and Edit-Fold boards): how customers buy, the services, the booking rules, and what needs a consult first,
// each edited where it is stated. How customers buy is the workspace's answer, not a key of the settings, and saves
// through the workspace's own door (docs/decisions/0008, "One switch"; BtSellsBy, below). The services are a list:
// thirty-three rows of three boxes on the live record, the "99 inputs in a 720px column" the redesign exists to remove,
// so they open a sheet beside the page (BtSheet). The booking rules are five numbers and a box of notes, a fold
// (BtFold). And consult-first, one of the two unlabelled textareas the old form had, is a fold of its own with its own
// name. It replaces the form's "What you offer" and "Booking rules" sections (BusinessEditor, settings.jsx), and what
// those learned came with them, comments and all.
//
// The page composes and never derives. Every sentence here with a number in it is contracts' (servicesWords,
// servicesToldWords, bookingRulesWords, BOOKING_RULE_HINTS, through BUSINESS_TAB), and so is
// every word of how customers buy (sellsByVM, sellsBySaved); what a fold or the sheet opens with, refuses and writes is
// folds.ts's; the gestures are BtFold and BtSheet (gestures/).
//
// The services sheet is a file of its own (services.tsx), which the PAGE draws after every card: the
// card's services row asks the registry for the sheet by its id, as the gap line's door does, and the sheet is
// open while the registry says so.
//
// It holds no hook of its own (its folds hold theirs).

import type { SellsBy, SellsByVM } from "@chanlytics/contracts";
import type { ComponentProps, ReactNode } from "react";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { Panel } from "../../kit/panel/panel";
import { RecordBox, RecordField, RecordSwitch, RecordTip, RecordToggleGroup } from "../../kit/record/field";
import { RecordRow, RecordChips } from "../../kit/record/row";
import { recFolds } from "../../kit/record/registry";
import { FieldError } from "../../kit/field-error/field-error";
import { gate } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { BtFold, BtSheet } from "./gestures/fold";
import type { Brain, Saver } from "./save";
import { businessTabSave } from "./saver";
import { activeWorkspaceNow, workspaceApi, workspacesNow } from "./shell";

/* ------------------------------------ how customers buy ------------------------------------ */

/** The active workspace's answer to how its customers buy, as the workspace list carries it (0008); null is never said. */
export const btSellsByNow = () => {
  const ws = (workspacesNow() || []).find((t) => t.id === activeWorkspaceNow()) || null;
  // The workspace list is untyped data off the window: its answer is one of the two (isSellsBy), or never said.
  return (ws && (ws.sells_by as SellsBy | undefined)) || null;
};

/** What a fold hands its body (gestures/ BtFold's contract says each), for a draft `D`. */
type FoldFields<D> = Parameters<ComponentProps<typeof BtFold<D>>["body"]>[0];

interface SellsByChoiceProps {
  id: string;
  vm: SellsByVM;
  value: SellsBy | null;
  set: (next: SellsBy) => void;
  problem?: ReactNode;
  readOnly?: boolean;
  label?: boolean;
  labelledBy?: string | null;
  testid: string;
}

/**
 * The two answers as a choice, each with what choosing it means under it (the kit's RecordToggleGroup with its hints),
 * and what stops a Save under them. Every word is the view model's (contracts sellsByVM, through BUSINESS_TAB).
 * Drawn by the fold below and by the create card (create.tsx), so the choice and its words are written
 * once. `id` names the group, and its options' words and its refusal are named from it; `label` draws the question
 * over it, where nothing else on screen says it (the create card), and `labelledBy` points at what does (the fold's own
 * label). Hookless.
 */
export const btSellsByChoice = ({
  id,
  vm,
  value,
  set,
  problem = null,
  readOnly = false,
  label = false,
  labelledBy = null,
  testid,
}: SellsByChoiceProps) => (
  <div className="rec-field" data-testid={testid}>
    {label ? (
      <span className="rec-field-label" id={`${id}-label`}>
        {vm.question}
      </span>
    ) : null}
    <RecordToggleGroup
      id={id}
      label={vm.question}
      labelledBy={label ? `${id}-label` : labelledBy}
      value={value}
      options={vm.choices}
      onChange={set}
      readOnly={readOnly}
      testid={`${testid}-choice`}
    />
    <FieldError id={`${id}-problem`} message={problem} testid={`${testid}-problem`} />
  </div>
);

/**
 * How customers buy (0008): they book an appointment, or some get a proposal first, which is what switches the whole
 * deal layer on (contracts dealsAreOn). The row states the answer, or that it was never said; its fold is the choice.
 *
 * The answer is the workspace's (tenants.sells_by), not a key of the settings, as the zone is: it saves through the
 * workspace's own door (save.tsx `sellsBy`, the workspace api's patch, PATCH workspaces) and never through
 * the settings save, where it could not live (0008: a key inside a section is refused by an older edge, and one beside
 * them dropped by an older page's next save). So the act is offered only where there is a door to save it through and
 * the role may change the business: an owner, the timezone's gate. It writes nothing the receptionist is told (the
 * bridge's FOLD_BLOCK), so its fold says nothing it will be told. Once taken, the toast says what it switched, and
 * People, Reports and Today are read again (refresh-map.ts), so the deals come or go without a reload. A Save with
 * nothing chosen, on a workspace never asked, says why under the choice.
 */
const BtSellsBy = ({
  vm,
  answer,
  canEdit,
  gate: pressable,
  flash,
}: {
  vm: SellsByVM;
  answer: SellsBy | null;
  canEdit: boolean;
  gate: ReturnType<typeof gate>;
  flash: (flash: LegacyFlash) => void;
}) => {
  const door = businessTabSave.sellsBy;
  return (
    <BtFold<SellsBy>
      id="sells_by"
      label={vm.question}
      canEdit={canEdit && !!workspaceApi()}
      gate={pressable}
      flash={flash}
      door={{
        initial: answer,
        save: (next, done) => door.save({ answer: next, said: BUSINESS_TAB.sellsBySaved(answer, next), done, flash }),
        pending: () => door.pending(),
      }}
      check={(d): Record<string, string> => (d ? {} : { sells_by: vm.refusal })}
      row={{ value: vm.value, empty: vm.empty, act: vm.act, name: vm.name }}
      body={(f) =>
        btSellsByChoice({
          id: "bt-sells-by",
          vm,
          value: f.draft,
          set: (v) => f.update(() => v, ["sells_by"]),
          problem: f.problems.sells_by || null,
          readOnly: f.readOnly,
          labelledBy: "rec-fold-sells_by-label",
          testid: "rec-sells-by",
        })
      }
    />
  );
};

/* ------------------------------------ the services ------------------------------------ */

/**
 * The row at rest (the canvas's Record board): how many are on record and the first three by name, contracts'
 * (servicesWords). It said how they were priced too, on a line of its own under the names, which was "None names a
 * price." on nearly every record (24 Sep): the sheet is where a price is written. Its act opens the sheet, by asking
 * the registry for its id: the one door, as the gap line's is, so a fold open elsewhere with changes is asked
 * about first. A role that may not change the business is offered no act, and nor is anyone while the sheet could not
 * open (BtSheet.opens: nothing read to save onto, or a list whose draft cannot be worked out), as a fold offers none then.
 */
export const BtServicesRow = ({ brain, canEdit, saver }: { brain: Brain; canEdit: boolean; saver: Saver | null }) => {
  // Its own gate, wherever it is drawn: the tab's card and the first run's Check say it alike.
  const pressable = gate("settings", "change your services");
  const vm = BUSINESS_TAB.servicesWords((brain.profile || {}).services);
  const has = !!vm.count;
  const opens = !!BtSheet.opens("services", saver);
  return (
    <RecordRow
      id="services"
      label="Services"
      value={has ? vm.line : null}
      empty="None yet"
      act={
        canEdit && opens
          ? {
              label: has ? "Open the list" : "Add one",
              name: has ? "Open the list of services" : "Add one: a service",
              onClick: () => {
                recFolds.request("services");
              },
              gate: pressable,
            }
          : null
      }
    >
      {has ? (
        <RecordChips
          chips={vm.chips.map((c) => ({ label: c.name, meta: c.takes }))}
          more={vm.more}
          testid="rec-services-chips"
        />
      ) : null}
    </RecordRow>
  );
};

/* ------------------------------------ the booking rules ------------------------------------ */

// The five numbers, in the fold's order (the canvas's Edit-Fold), each with its label, its unit, and the number an empty
// box is worked out with, as its placeholder (contracts BOOKING_DEFAULTS; the party size has none, and 4 is an example).
// Each box is named by its label and unit, the words on screen (WCAG 2.5.3). Their ranges are folds.ts's RULES, and the
// one fact a box needs beside it is contracts' (BOOKING_RULE_HINTS), behind a tip.
const BTW_RULE_BOXES = [
  ["lead_hours", "Least notice", "hours", "2"],
  ["slot_min", "Slot length", "min", "30"],
  ["buffer_min", "Gap between", "min", "0"],
  ["max_days_ahead", "Offers times up to", "days", "14"],
  ["party_max", "Largest group", "people", "4"],
] as const;

/** The booking rules' draft: five numbers as they are typed, the switch, and the notes one to a line. */
interface RulesDraft {
  lead_hours: string;
  slot_min: string;
  buffer_min: string;
  max_days_ahead: string;
  party_max: string;
  ask_email: boolean;
  notes: string;
}

/**
 * The five numbers as one list: each its label on the left and its small box with its unit on the right, the number an
 * empty box is worked out with as its placeholder (Ruben, 10 Oct 2026: five boxes the sheet's width, each with a
 * sentence under it, were most of a phone's screen). A number is kept as it is typed: the save's checks refuse a
 * non-digit or a number outside its range (problemsOf, the old form's sentences), said under its row, the whole row's
 * width, where the old grid stripped anything but digits as it was typed and saved "2.5" as 25. A box takes no min or
 * max: a text box ignores both, and the range is said in the refusal (folds.ts RULES).
 */
const BtRuleBoxes = ({ draft, update, problems, readOnly }: FoldFields<RulesDraft>) => {
  const hints = BUSINESS_TAB.BOOKING_RULE_HINTS;
  return (
    <Panel variant="inset" size="flush" className="bt-lines" role="group" aria-label="The booking rules">
      {BTW_RULE_BOXES.map(([key, label, unit, placeholder]) => {
        const wrong = problems[key] || null;
        const problemId = `rec-bt-rule-${key}-problem`;
        const hint = hints[key] || null;
        return (
          <div className="bt-line" key={key} data-testid={`rec-rule-row-${key}`}>
            <span className="bt-line-words">
              <span className="bt-line-name" id={`bt-rule-${key}-label`}>
                {label}
              </span>
            </span>
            <span className="bt-line-end">
              {hint ? <RecordTip text={hint} label={`About ${label.toLowerCase()}`} /> : null}
              <span className="bt-number">
                <RecordBox
                  id={`bt-rule-${key}`}
                  label={`${label} ${unit}`}
                  unit={unit}
                  size="sm"
                  value={draft[key]}
                  onChange={(v) => update((d) => ({ ...d, [key]: v }), [key])}
                  invalid={wrong ? problemId : null}
                  inputMode="numeric"
                  placeholder={placeholder}
                  readOnly={readOnly}
                  testid={`rec-rule-${key}`}
                />
              </span>
            </span>
            <span className="bt-line-wrong">
              <FieldError id={problemId} message={wrong} />
            </span>
          </div>
        );
      })}
    </Panel>
  );
};

/**
 * The booking rules' fields: the five numbers as one list, the email switch on a line of its own, and the notes one to a
 * line. Drawn on every render (BtFold's rule), and none comes or goes. What the sheet once said under its title ("It
 * never books") is the rules' own row's ("Never confirm an appointment"), and what its foot said Save writes went: a
 * Save writes what its sheet holds.
 */
const BtRules = (f: FoldFields<RulesDraft>) => {
  const { draft, update, problems, readOnly } = f;
  return (
    <div className="bt-stack" data-testid="rec-rules-boxes">
      <BtRuleBoxes {...f} />
      {/* Off by default: the receptionist asks for an email only where the owner wants the campaigns that follow (Part 0
          of the campaigns-on-every-channel spec). The words beside the switch name it, so a person saying them can
          press it. */}
      <Panel variant="inset" size="flush" className="bt-lines">
        <div className="bt-line">
          <span className="bt-line-words">
            <span className="bt-line-name" id="bt-rule-ask_email-label">
              Ask for their email
            </span>
            <span className="bt-line-sub" id="bt-rule-ask_email-says">
              When it sends the booking link
            </span>
          </span>
          <span className="bt-line-end">
            <RecordSwitch
              on={!!draft.ask_email}
              onChange={(v) => update((d) => ({ ...d, ask_email: v }), ["ask_email"])}
              labelledBy="bt-rule-ask_email-label"
              describedBy="bt-rule-ask_email-says"
              readOnly={readOnly}
              testid="rec-rule-ask-email"
            />
          </span>
        </div>
      </Panel>
      <RecordField
        id="bt-rule-notes"
        label="Other rules"
        rows={3}
        value={draft.notes}
        onChange={(v) => update((d) => ({ ...d, notes: v }), ["notes"])}
        problem={problems.notes || null}
        placeholder={"One per line, like\nGroups of 6 or more book by phone"}
        readOnly={readOnly || undefined}
        testid="rec-rule-notes"
      />
    </div>
  );
};

/**
 * What needs a consult first: one box, one service to a line, under the old form's sentence for it. The fold's own
 * label names it, the words on screen above it (RecordFold's rec-fold-<id>-label); a second name, as the old form gave
 * it, is one a person saying the words on screen could not reach.
 */
const BtConsult = ({ draft, update, problems, readOnly }: FoldFields<string>) => (
  <RecordField
    id="bt-consult-first"
    label={null}
    aria-labelledby="rec-fold-consult_first-label"
    rows={3}
    value={draft}
    onChange={(v) => update(() => v, ["consult_first"])}
    problem={problems.consult_first || null}
    placeholder={"One service per line, like\nColor correction"}
    readOnly={readOnly || undefined}
    testid="rec-consult-first"
  />
);

/* ------------------------------------ the card ------------------------------------ */

/**
 * The booking rules' row at rest: the sentence the five numbers make, the notes after it on its line in the dim ink
 * (24 Sep: under it they were a second line on a row that states one fact), and, with none of the five set, what the
 * openings are worked out with, which is not "no rule", the notes standing under it.
 */
const btRulesRow = (rules: BookingRulesOf) => {
  const said = BUSINESS_TAB.bookingRulesWords(rules);
  return {
    value: said.line ? (
      <>
        {said.line}
        {said.notes ? " · " : null}
        {said.notes ? (
          <span className="bt-rules-notes" data-testid="rec-rules-notes">
            {said.notes}
          </span>
        ) : null}
      </>
    ) : null,
    empty: said.none,
    children:
      !said.line && said.notes ? (
        <span className="bt-rules-notes" data-testid="rec-rules-notes">
          {said.notes}
        </span>
      ) : null,
    act: "Change",
    name: "Change the booking rules",
  };
};

type BookingRulesOf = NonNullable<NonNullable<Brain["profile"]>["booking_rules"]>;

/**
 * What you offer (spec §4.4): how customers buy (0008), the services, the rules for booking them, and the ones that
 * need a consult first. Consult-first is stored inside the booking rules, and its fold and the rules' fold each write
 * only their own keys of it (folds.ts PATHS_OF), so saving one never puts the other's back as it was.
 * Where deals are on, its row says what a consultation for them starts (sellsByVM's consultHint).
 *
 * `brain` is the settings read's, which the rows state; what a fold opens with and saves onto is the saver's base,
 * which BtFold asks for itself. How customers buy is the workspace list's, which its door keeps current.
 */
export const BtOfferCard = ({
  brain,
  canEdit,
  flash,
  saver,
}: {
  brain: Brain;
  canEdit: boolean;
  flash: (flash: LegacyFlash) => void;
  saver: Saver | null;
}) => {
  const profile = brain.profile || {};
  const rules = profile.booking_rules || {};
  const pressable = (thing: string) => gate("settings", `change ${thing}`);
  const shared = { canEdit, flash, saver };
  // A stored list that is not one (a hand-edited record) is none: joined as it stood, it threw as the card drew.
  const consult = (Array.isArray(rules.consult_first) ? rules.consult_first : []).join(", ");
  const answer = btSellsByNow();
  const buys = BUSINESS_TAB.sellsByVM(answer);

  return (
    <section className="rec-card" data-testid="rec-card-offer" aria-labelledby="bt-offer-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-offer-title">
          What you offer
        </h2>
        <span className="rec-card-sub">And the rules for offering it</span>
      </div>

      <BtSellsBy vm={buys} answer={answer} canEdit={canEdit} gate={pressable("how customers buy")} flash={flash} />

      <BtServicesRow brain={brain} canEdit={canEdit} saver={saver} />

      <BtFold<RulesDraft>
        {...shared}
        id="booking_rules"
        label="Booking rules"
        gate={pressable("the booking rules")}
        row={btRulesRow(rules)}
        body={(f) => <BtRules {...f} />}
      />

      <BtFold<string>
        {...shared}
        id="consult_first"
        label="Needs a consult first"
        gate={pressable("what needs a consult first")}
        row={{
          value: consult || null,
          empty: "None",
          hint: buys.consultHint,
          name: consult ? "Change what needs a consult first" : "Add one: a service that needs a consult first",
        }}
        body={(f) => <BtConsult {...f} />}
      />
    </section>
  );
};
