/**
 * The record kit: the row (moved whole from legacy/components/record-row.jsx, decision 0015: the kit's one
 * implementation, which seed-globals publishes under the names the pages that have not moved read).
 *
 * One grammar for a record a person reads: a label, the value, where the value came from, and one act. Four classes
 * drew this row before, each its own way (.cl-prof-attr, .set-row, .set-team-row, .set-int-row). The kit knows
 * nothing about any page. The words it draws are the page's, or contracts' through the chrome's fact words, but for a
 * disagreement's two presses, which have defaults ("Use Google's" and the like, "Keep mine") that the page replaces with
 * useLabel and keepLabel.
 *
 *   <RecordRow id="website" label="Website" value="marisas.example.com" source="typed"
 *              act={{ label: "Change", onClick, gate: gate("settings", "change the website") }} />
 *
 * - A `value` of null, "" or false is an empty row: it says `empty` in the dim ink and carries data-empty="true",
 *   and record.css never lets its act go latent, because there is no value to point at.
 * - `source` is a FactSource, said quietly beside the value in the `fact` kind's words and tone (contracts tone.ts),
 *   and NOT said at all when it is `typed` (RecordSourceChip says why). `sourceLabel` overrides the words where the
 *   page has better ones -- except on `typed`, which draws nothing at all, so there are no words to override.
 * - `disputed` { value, source, severity?, onUse?, onKeep?, useLabel?, keepLabel?, sentence?, gate? } is a second
 *   answer that disagrees with this one. The row's source becomes the kind's `disputed` (warn: a person settles it), and
 *   a line under the value carries the other answer, with its own source said the same way and, given `onUse`, a press
 *   to take it instead. Without `onUse` the line is there to read and offers nothing: a role that may not settle it, or
 *   an answer that is information rather than a fill, is drawn no dead press. `severity` is "serious" or "minor",
 *   passed straight from contracts' FactConflict. On a row with no value there is nothing for it to disagree with: it
 *   is an answer offered to fill the row (the first run's booking page found on the website), and the row is not
 *   marked disputed.
 * - `act` { label, onClick, gate?, testid?, name?, icon? } is the row's one act. `icon` names an Icon drawn after its
 *   words (an act that goes to another page: arrow-right), beside them and not in them, since a phone clips the words.
 *   `gate` is the role gate's props, spread AFTER the handler as on every committing control here, so a refusal
 *   replaces the press. With an `id` the act is named by its words and the row's label together ("Change Website"), and
 *   the two carry data-testid rec-row-act-<id> and rec-row-<id>. Where the two make no sense together (a label that is a
 *   phrase, "Change Tells customers to call"; an act that goes somewhere, "Connections Answers on") the page names the
 *   act itself, `name`, a sentence that holds the act's own words so a person who says them still reaches it. The act's
 *   data-rec-act is where a fold that closes (fold.tsx) gives focus back.
 *   The act is drawn at rest, quietly (record.css: the dim ink, darker as the row is approached), and the whole row is
 *   its press: a click anywhere on a row with an act that is not on something pressable of its own -- a link, a
 *   dispute's press, a box -- and did not select words is a press on the act, gate and all (recRowPress). The act stays
 *   the row's one tab stop; the row itself takes no focus.
 * - `hint` is a sentence under the value; `children` draw under it too (a ribbon, a row of chips: RecordChips, below).
 * - Something wrong is on the row at full strength, hover or not: data-state="warn", which record.css draws as the warn
 *   wash with the key in the warn ink and the act always drawn. A serious disagreement is one; `wrong` is any other, a
 *   sentence the page writes (a fact that is missing and needed), drawn under the value and describing the act that
 *   fixes it. A minor disagreement keeps its warn pill and its line at full strength and leaves the row as it is.
 * - `settled` is the page's word that this row has just been drawn again by its editor's save (spec §9, item 4, the
 *   save settle): data-settled="true", and record.css lets the value arrive on the house's rise-in, once.
 *
 * A row is HOOKLESS, as it has always been: its children come and go, its act is found as the press lands.
 */
import type { MouseEvent, MouseEventHandler, ReactNode } from "react";
import { Icon } from "../icon/icon";
import { can, pick } from "./dom";
import { factWords, pageSelection } from "./shell-verbs";

/** The role gate's props, spread onto a committing control after its handlers. */
type Gate = Record<string, unknown>;

/** A row's one act. */
interface RecordAct {
  label: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  gate?: Gate | null;
  testid?: string | null;
  name?: string | null;
  icon?: string | null;
}

/** A second answer that disagrees with the row's own. */
interface RecordDisputed {
  value?: ReactNode;
  source?: string | null;
  severity?: string;
  onUse?: MouseEventHandler<HTMLButtonElement>;
  onKeep?: MouseEventHandler<HTMLButtonElement>;
  useLabel?: ReactNode;
  keepLabel?: ReactNode;
  sentence?: ReactNode;
  gate?: Gate;
}

interface RecordRowProps {
  id?: string | null;
  label: ReactNode;
  value?: ReactNode;
  empty?: ReactNode;
  hint?: ReactNode;
  source?: string | null;
  sourceLabel?: ReactNode;
  disputed?: RecordDisputed | null;
  wrong?: ReactNode;
  act?: RecordAct | null;
  top?: boolean;
  testid?: string | null;
  settled?: boolean;
  children?: ReactNode;
}

// A fallback for the press that takes the other answer, by where the answer came from. The page passes `useLabel`,
// since it knows what the answer is; these stand in when it does not. A source's words (contracts SOURCE_WORDS:
// "from Google") are a pill's, not a verb's object, and contracts keeps no possessive form of them yet.
const REC_USE_WORDS: Record<string, string> = {
  verified: "Use Google's",
  provisioned: "Use your line",
  workspace: "Use the workspace's",
};

const recEmpty = (v: ReactNode) => v == null || v === "" || v === false;
// The stub React the tests draw on hands a component `children: []` when it was given none; React hands undefined.
const recHasKids = (kids: ReactNode) =>
  Array.isArray(kids) ? kids.some((k) => k != null && k !== false) : kids != null && kids !== false;

// What a press on the row leaves alone: the act itself (its own handler has run by now), and anything else in the row
// that is pressed or typed into for itself.
const REC_ROW_OWN_PRESS = 'button, a[href], input, select, textarea, [role="button"], [tabindex]';
// A press anywhere else on a row with an act is a press on the act, so a whole row is the target and not 17px of
// words at its edge; gated, the act's own refusal answers, as it would to a press on the act. Words dragged over in
// the value are a selection, not a press. The row is hookless, as it has always been: its act is found as the press
// lands.
export function recRowPress(e: MouseEvent<HTMLElement> | null | undefined): void {
  const row = e && e.currentTarget;
  const t = e && (e.target as Element | null);
  if (!row || !t || !t.closest || !can(row, "querySelector")) return;
  const own = t.closest(REC_ROW_OWN_PRESS);
  if (own && own !== row && row.contains(own)) return;
  const picked = pageSelection();
  if (picked && String(picked)) return;
  const act = pick(row, ".rec-row-act");
  if (act && typeof act.click === "function") act.click();
}

/**
 * Where a fact came from, where that is worth an owner's attention: a muted word beside the value, in the `fact` kind's
 * words and tone (contracts SOURCE_WORDS through the chrome bridge, the same call StatePill makes, so the words are
 * still written once).
 *
 * `typed` draws NOTHING. It is the default on nearly every row of a record -- the name, the address, the website, the
 * booking link, the transfer number -- and "you set this" tells an owner nothing they could act on. What is worth
 * saying is that a value is NOT theirs: from Google, the line we gave you, the workspace's, not set, or the two
 * answers of a disagreement.
 *
 * A word rather than the bordered pill it was: on a phone the pill wrapped onto a line of its own under every value,
 * which is a row and a half of a record spent saying "you set this" seven times.
 */
export function RecordSourceChip({
  source,
  label = null,
  tip = null,
}: {
  source: string | null | undefined;
  label?: ReactNode;
  tip?: string | null;
}) {
  if (source === "typed") return null;
  const said = factWords(source) ?? { tone: "plain", label: String(source == null ? "" : source) };
  return (
    <span className="rec-src" data-state={source} data-tone={said.tone} data-tip={tip || undefined}>
      {label == null ? said.label : label}
    </span>
  );
}

// The other answer, under the value it disagrees with, and the press that takes it when there is one to offer.
export function RecordDispute({ id = null, disputed }: { id?: string | null; disputed: RecordDisputed }) {
  const otherId = id ? `rec-row-${id}-other` : undefined;
  const gated = disputed.gate || {};
  const uses = typeof disputed.onUse === "function";
  const keeps = typeof disputed.onKeep === "function";
  return (
    <div className="rec-row-dispute">
      <span className="rec-row-dispute-other" id={otherId}>
        {disputed.sentence || (
          <>
            <span className="rec-row-dispute-value">{disputed.value}</span>
            <RecordSourceChip source={disputed.source} />
          </>
        )}
      </span>
      {uses || keeps ? (
        <span className="rec-row-dispute-acts">
          {uses && (
            <button type="button" className="btn btn-sm" onClick={disputed.onUse} aria-describedby={otherId} {...gated}>
              {disputed.useLabel || REC_USE_WORDS[disputed.source ?? ""] || "Use this one"}
            </button>
          )}
          {keeps && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={disputed.onKeep} {...gated}>
              {disputed.keepLabel || "Keep mine"}
            </button>
          )}
        </span>
      ) : null}
    </div>
  );
}

/** What a row says under its label: the value (or the empty words), where it came from, what is wrong, the hint, the kids. */
function rowValue(p: RecordRowProps, isEmpty: boolean, kids: boolean, wrongId: string | undefined) {
  const { id = null, value = null, empty = null, hint = null, source = null, sourceLabel = null } = p;
  const { disputed = null, wrong = null, children = null } = p;
  return (
    <div className="rec-row-val">
      {isEmpty ? <span className="rec-row-empty">{empty}</span> : <span className="rec-row-value">{value}</span>}
      {disputed && !isEmpty ? (
        <RecordSourceChip source="disputed" />
      ) : source ? (
        <RecordSourceChip source={source} label={sourceLabel} />
      ) : null}
      {wrong ? (
        <span className="rec-row-wrong" id={wrongId}>
          {wrong}
        </span>
      ) : null}
      {hint ? <span className="rec-row-hint">{hint}</span> : null}
      {kids ? children : null}
      {disputed ? <RecordDispute id={id} disputed={disputed} /> : null}
    </div>
  );
}

/** The ids a row makes for the words its act is named by. */
interface RowIds {
  id: string | null;
  keyId: string | undefined;
  wordsId: string | undefined;
  wrongId: string | undefined;
}

/** The row's one act: its words, an arrow for an act that goes elsewhere, and the phone's chevron. */
function rowAct(act: RecordAct, ids: RowIds) {
  const { id, keyId, wordsId, wrongId } = ids;
  return (
    <button
      type="button"
      className="rec-row-act"
      onClick={act.onClick}
      aria-label={act.name || undefined}
      aria-labelledby={id && !act.name ? `${wordsId} ${keyId}` : undefined}
      aria-describedby={wrongId}
      data-rec-act={id || undefined}
      data-testid={act.testid || (id ? `rec-row-act-${id}` : undefined)}
      {...(act.gate || {})}
    >
      <span className="rec-row-act-words" id={wordsId}>
        {act.label}
      </span>
      {/* Beside the words, never inside them: on a phone the words' box is clipped to 1px for a screen reader, and
          an arrow drawn inside it was laid out 40px past the screen's edge. The chevron is a phone's sign. */}
      {act.icon ? (
        <span className="rec-row-act-icon" aria-hidden="true">
          <Icon name={act.icon} size={10} />
        </span>
      ) : null}
      <span className="rec-row-chev" aria-hidden="true">
        <Icon name="chevron" size={11} />
      </span>
    </button>
  );
}

/** A record's row: a label, its value, where the value came from, and one act. */
export function RecordRow(props: RecordRowProps) {
  const { id = null, label, disputed = null, wrong = null, act = null, top = false } = props;
  const { testid = null, settled = false, hint = null, value = null, children = null } = props;
  const isEmpty = recEmpty(value);
  const kids = recHasKids(children);
  const keyId = id ? `rec-row-${id}-key` : undefined;
  const wordsId = id ? `rec-row-${id}-act` : undefined;
  const wrongId = id && wrong ? `rec-row-${id}-wrong` : undefined;
  const tall = top || !!hint || !!disputed || !!wrong || kids;
  return (
    <div
      className={`rec-row${tall ? " rec-row-top" : ""}`}
      role="presentation"
      data-empty={isEmpty ? "true" : "false"}
      data-state={wrong || (disputed && disputed.severity === "serious") ? "warn" : undefined}
      data-act={act ? "true" : undefined}
      data-testid={testid || (id ? `rec-row-${id}` : undefined)}
      data-settled={settled ? "true" : undefined}
      onClick={act ? recRowPress : undefined}
    >
      <span className="rec-row-key" id={keyId}>
        {label}
      </span>
      {rowValue(props, isEmpty, kids, wrongId)}
      {act ? rowAct(act, { id, keyId, wordsId, wrongId }) : null}
    </div>
  );
}

/**
 * A row of chips, drawn under a row's value as its children: each names one thing the value counts, with its measure
 * beside it where it has one ({ label, meta }: "Balayage" and "180m"), and `more` ("+29 more") after them, drawn with no
 * edge. The words are the page's. Hookless, as everything drawn inside a row is: a row's children come and go.
 *
 * `max` is how many are drawn before the rest become `more`. The kit keeps the cap, so every record page has it: a row
 * of chips that wraps three deep at a phone's width is a paragraph of nouns where the row states one fact. A page whose
 * own view model already cut the list (the services, the notes) passes no `max` and its own `more` as words.
 * With `max`, `more` is called with how many were cut, so the words for them are still the page's.
 */
export function RecordChips({
  chips = [],
  more = null,
  max = null,
  testid = null,
}: {
  chips?: Array<{ label: ReactNode; meta?: ReactNode }>;
  more?: ReactNode | ((cut: number) => ReactNode);
  max?: number | null;
  testid?: string | null;
}) {
  const capped = typeof max === "number" && chips.length > max ? chips.slice(0, max) : chips;
  const cut = chips.length - capped.length;
  const said = typeof more === "function" ? (cut > 0 ? more(cut) : null) : more;
  return (
    <span className="rec-chips" data-testid={testid || undefined}>
      {capped.map((c, i) => (
        <span key={i} className="chip rec-chip">
          {c.label}
          {c.meta ? <span className="rec-chip-meta">{c.meta}</span> : null}
        </span>
      ))}
      {said ? (
        <span className="chip rec-chip" data-more="true">
          {said}
        </span>
      ) : null}
    </span>
  );
}
