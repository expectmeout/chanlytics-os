/* global React, Icon */
// Chanlytics record kit: the row.
//
// One grammar for a record a person reads: a label, the value, where the value came from, and one act. Four classes
// drew this row before, each its own way (.cl-prof-attr, .set-row, .set-team-row, .set-int-row). The kit knows
// nothing about any page: every word it draws is the page's, or contracts' through StatePill.
//
//   <RecordRow id="website" label="Website" value="melanys.com" source="typed"
//              act={{ label: "Change", onClick, gate: window.gate("settings", "change the website") }} />
//
// - A `value` of null, "" or false is an empty row: it says `empty` in the dim ink and carries data-empty="true",
//   and record.css never lets its act go latent, because there is no value to point at.
// - `source` is a FactSource, drawn as the one pill in the `fact` kind (contracts tone.ts): its tone and its words
//   are contracts', never this file's. `sourceLabel` overrides the words where the page has better ones.
// - `disputed` { value, source, severity?, onUse, onKeep?, useLabel?, keepLabel?, sentence?, gate? } is a second
//   answer that disagrees with this one. The row's chip becomes the kind's `disputed` (warn: a person settles it), and
//   a line under the value carries the other answer, with its own source's pill and a press to take it instead.
//   `severity` is "serious" or "minor", passed straight from contracts' FactConflict.
// - `act` { label, onClick, gate?, testid? } is the row's one act. `gate` is window.gate(...)'s props, spread AFTER
//   the handler as on every committing control here, so a refusal replaces the press. With an `id` the act is named
//   by its words and the row's label together ("Change Website"), and the two carry data-testid rec-row-act-<id>
//   and rec-row-<id>. The act's data-rec-act is where a fold that closes (record-fold.jsx) gives focus back.
// - `hint` is a sentence under the value; `children` draw under it too (a ribbon, a row of chips).
// - Something wrong is on the row at full strength, hover or not: data-state="warn", which record.css draws as the warn
//   wash with the key in the warn ink and the act always drawn. A serious disagreement is one (facts.ts: "Severity is
//   about the CUSTOMER", so the published number that never reaches the receptionist); `wrong` is any other, a sentence
//   the page writes (a fact that is missing and needed), drawn under the value and describing the act that fixes it. A
//   minor disagreement keeps its warn pill and its line at full strength and leaves the row as it is, its act waiting
//   to be approached like any other: Group-Who washes only the phone conflict, not the address written two ways.

// Taking the other answer, by where it came from. A source's words (contracts SOURCE_WORDS: "from Google") are a
// pill's, not a verb's object, and contracts keeps no possessive form of them; `useLabel` wins wherever these read
// wrong for a page.
const REC_USE_WORDS = { verified: "Use Google's", provisioned: "Use your line", workspace: "Use the workspace's" };

const recEmpty = (v) => v == null || v === "" || v === false;
// The stub React the tests draw on hands a component `children: []` when it was given none; React hands undefined.
const recHasKids = (kids) => (Array.isArray(kids) ? kids.some((k) => k != null && k !== false) : kids != null && kids !== false);

// Where a fact came from, as the one pill (data-bits StatePill), in the `fact` kind's tone and words.
const RecordSourceChip = ({ source, label = null, tip = null }) => (
  <window.StatePill kind="fact" value={source} label={label} tip={tip} className="rec-src" />
);

// The other answer, under the value it disagrees with, and the press that takes it.
const RecordDispute = ({ id = null, disputed }) => {
  const otherId = id ? `rec-row-${id}-other` : undefined;
  const gated = disputed.gate || {};
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
      <span className="rec-row-dispute-acts">
        <button type="button" className="btn btn-sm" onClick={disputed.onUse} aria-describedby={otherId} {...gated}>
          {disputed.useLabel || REC_USE_WORDS[disputed.source] || "Use this one"}
        </button>
        {typeof disputed.onKeep === "function" && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={disputed.onKeep} {...gated}>
            {disputed.keepLabel || "Keep mine"}
          </button>
        )}
      </span>
    </div>
  );
};

const RecordRow = ({
  id = null, label, value = null, empty = null, hint = null, source = null, sourceLabel = null,
  disputed = null, wrong = null, act = null, top = false, testid = null, children = null,
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
      data-testid={testid || (id ? `rec-row-${id}` : undefined)}
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
          aria-labelledby={id ? `${wordsId} ${keyId}` : undefined}
          aria-describedby={wrongId}
          data-rec-act={id || undefined}
          data-testid={act.testid || (id ? `rec-row-act-${id}` : undefined)}
          {...(act.gate || {})}
        >
          <span className="rec-row-act-words" id={wordsId}>{act.label}</span>
          <span className="rec-row-chev" aria-hidden="true"><Icon name="chevron" size={11} /></span>
        </button>
      ) : null}
    </div>
  );
};

Object.assign(window, { RecordRow, RecordSourceChip });
