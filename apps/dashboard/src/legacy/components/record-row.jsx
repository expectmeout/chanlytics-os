/* global React, Icon */
// Chanlytics record kit: the row.
//
// One grammar for a record a person reads: a label, the value, where the value came from, and one act. Four classes
// drew this row before, each its own way (.cl-prof-attr, .set-row, .set-team-row, .set-int-row). The kit knows
// nothing about any page. The words it draws are the page's, or contracts' through StatePill, but for a disagreement's
// two presses, which have defaults ("Use Google's" and the like, "Keep mine") that the page replaces with useLabel and
// keepLabel.
//
//   <RecordRow id="website" label="Website" value="melanys.com" source="typed"
//              act={{ label: "Change", onClick, gate: window.gate("settings", "change the website") }} />
//
// - A `value` of null, "" or false is an empty row: it says `empty` in the dim ink and carries data-empty="true",
//   and record.css never lets its act go latent, because there is no value to point at.
// - `source` is a FactSource, said quietly beside the value in the `fact` kind's words and tone (contracts tone.ts),
//   and NOT said at all when it is `typed` (RecordSourceChip says why). `sourceLabel` overrides the words where the
//   page has better ones -- except on `typed`, which draws nothing at all, so there are no words to override.
// - `disputed` { value, source, severity?, onUse?, onKeep?, useLabel?, keepLabel?, sentence?, gate? } is a second
//   answer that disagrees with this one. The row's source becomes the kind's `disputed` (warn: a person settles it), and
//   a line under the value carries the other answer, with its own source said the same way and, given `onUse`, a press to take
//   it instead. Without `onUse` the line is there to read and offers nothing: a role that may not settle it, or an
//   answer that is information rather than a fill, is drawn no dead press. `severity` is "serious" or "minor",
//   passed straight from contracts' FactConflict.
// - `act` { label, onClick, gate?, testid?, name?, icon? } is the row's one act. `icon` names an Icon drawn after its words
//   (an act that goes to another page: arrow-right), beside them and not in them, since a phone clips the words. `gate` is window.gate(...)'s props, spread
//   AFTER the handler as on every committing control here, so a refusal replaces the press. With an `id` the act is
//   named by its words and the row's label together ("Change Website"), and the two carry data-testid
//   rec-row-act-<id> and rec-row-<id>. Where the two make no sense together (a label that is a phrase, "Change Tells
//   customers to call"; an act that goes somewhere, "Connections Answers on") the page names the act itself, `name`,
//   a sentence that holds the act's own words so a person who says them still reaches it. The act's data-rec-act is
//   where a fold that closes (record-fold.jsx) gives focus back.
//   The act is drawn at rest, quietly (record.css: the dim ink, darker as the row is approached), and the whole row is
//   its press: a click anywhere on a row with an act that is not on something pressable of its own -- a link, a
//   dispute's press, a box -- and did not select words is a press on the act, gate and all (recRowPress). The act stays
//   the row's one tab stop; the row itself takes no focus. It was latent, opacity 0 until the row was hovered, and 17px
//   tall: an owner looking for how to change a value saw nothing to press.
// - `hint` is a sentence under the value; `children` draw under it too (a ribbon, a row of chips: RecordChips, below).
// - Something wrong is on the row at full strength, hover or not: data-state="warn", which record.css draws as the warn
//   wash with the key in the warn ink and the act always drawn. A serious disagreement is one (facts.ts: "Severity is
//   about the CUSTOMER", so the published number that never reaches the receptionist); `wrong` is any other, a sentence
//   the page writes (a fact that is missing and needed), drawn under the value and describing the act that fixes it. A
//   minor disagreement keeps its warn pill and its line at full strength and leaves the row as it is, its act waiting
//   to be approached like any other: Group-Who washes only the phone conflict, not the address written two ways.
// - `settled` is the page's word that this row has just been drawn again by its editor's save (spec §9, item 4, the
//   save settle): data-settled="true", and record.css lets the value arrive on the house's rise-in, once, as the row
//   appears. A row drawn with its page, or after a Cancel, says nothing, and is simply there.

// A fallback for the press that takes the other answer, by where the answer came from. The page passes `useLabel`,
// since it knows what the answer is; these stand in when it does not. A source's words (contracts SOURCE_WORDS:
// "from Google") are a pill's, not a verb's object, and contracts keeps no possessive form of them yet.
const REC_USE_WORDS = { verified: "Use Google's", provisioned: "Use your line", workspace: "Use the workspace's" };

const recEmpty = (v) => v == null || v === "" || v === false;
// The stub React the tests draw on hands a component `children: []` when it was given none; React hands undefined.
const recHasKids = (kids) => (Array.isArray(kids) ? kids.some((k) => k != null && k !== false) : kids != null && kids !== false);

// What a press on the row leaves alone: the act itself (its own handler has run by now), and anything else in the row
// that is pressed or typed into for itself.
const REC_ROW_OWN_PRESS = 'button, a[href], input, select, textarea, [role="button"], [tabindex]';
// A press anywhere else on a row with an act is a press on the act, so a whole row is the target and not 17px of
// words at its edge; gated, the act's own refusal answers, as it would to a press on the act. Words dragged over in
// the value are a selection, not a press. The row is hookless, as it has always been: its act is found as the press
// lands.
const recRowPress = (e) => {
  const row = e && e.currentTarget;
  const t = e && e.target;
  if (!row || !t || !t.closest || !row.querySelector) return;
  const own = t.closest(REC_ROW_OWN_PRESS);
  if (own && own !== row && row.contains(own)) return;
  const picked = typeof window.getSelection === "function" ? window.getSelection() : null;
  if (picked && String(picked)) return;
  const act = row.querySelector(".rec-row-act");
  if (act && typeof act.click === "function") act.click();
};

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
const RecordSourceChip = ({ source, label = null, tip = null }) => {
  if (source === "typed") return null;
  const said = window.__chrome && window.__chrome.state
    ? window.__chrome.state("fact", source)
    : { tone: "plain", label: String(source == null ? "" : source) };
  return (
    <span className="rec-src" data-state={source} data-tone={said.tone} data-tip={tip || undefined}>
      {label == null ? said.label : label}
    </span>
  );
};

// The other answer, under the value it disagrees with, and the press that takes it when there is one to offer.
const RecordDispute = ({ id = null, disputed }) => {
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
              {disputed.useLabel || REC_USE_WORDS[disputed.source] || "Use this one"}
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
};

const RecordRow = ({
  id = null, label, value = null, empty = null, hint = null, source = null, sourceLabel = null,
  disputed = null, wrong = null, act = null, top = false, testid = null, settled = false, children = null,
}) => {
  const isEmpty = recEmpty(value);
  const kids = recHasKids(children);
  const keyId = id ? `rec-row-${id}-key` : undefined;
  const wordsId = id ? `rec-row-${id}-act` : undefined;
  const wrongId = id && wrong ? `rec-row-${id}-wrong` : undefined;
  const tall = top || !!hint || !!disputed || !!wrong || kids;
  return (
    <div
      className={`rec-row${tall ? " rec-row-top" : ""}`}
      data-empty={isEmpty ? "true" : "false"}
      data-state={wrong || (disputed && disputed.severity === "serious") ? "warn" : undefined}
      data-act={act ? "true" : undefined}
      data-testid={testid || (id ? `rec-row-${id}` : undefined)}
      data-settled={settled ? "true" : undefined}
      onClick={act ? recRowPress : undefined}
    >
      <span className="rec-row-key" id={keyId}>{label}</span>
      <div className="rec-row-val">
        {isEmpty ? <span className="rec-row-empty">{empty}</span> : <span className="rec-row-value">{value}</span>}
        {disputed ? <RecordSourceChip source="disputed" /> : source ? <RecordSourceChip source={source} label={sourceLabel} /> : null}
        {wrong ? <span className="rec-row-wrong" id={wrongId}>{wrong}</span> : null}
        {hint ? <span className="rec-row-hint">{hint}</span> : null}
        {kids ? children : null}
        {disputed ? <RecordDispute id={id} disputed={disputed} /> : null}
      </div>
      {act ? (
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
          <span className="rec-row-act-words" id={wordsId}>{act.label}</span>
          {/* Beside the words, never inside them: on a phone the words' box is clipped to 1px for a screen reader, and
              an arrow drawn inside it was laid out 40px past the screen's edge. The chevron is a phone's sign. */}
          {act.icon ? <span className="rec-row-act-icon" aria-hidden="true"><Icon name={act.icon} size={10} /></span> : null}
          <span className="rec-row-chev" aria-hidden="true"><Icon name="chevron" size={11} /></span>
        </button>
      ) : null}
    </div>
  );
};

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
const RecordChips = ({ chips = [], more = null, max = null, testid = null }) => {
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
      {said ? <span className="chip rec-chip" data-more="true">{said}</span> : null}
    </span>
  );
};

// RecordDispute on its own is the inline editor's (record-fold.jsx): a row being edited keeps its disagreement on
// screen, to read, while its press waits at rest on the row.
Object.assign(window, { RecordRow, RecordSourceChip, RecordDispute, RecordChips, recRowPress });
