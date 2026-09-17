/* global React */
// Which message a campaign sends, picked once.
//
// Templates are stored one row per (name, language), and both composers drew
// one chip per ROW titled with `templateTitle(name)`, which takes no language.
// So a workspace that installed the starter set in English and Spanish -- which
// Messages advertises as the default -- saw seven PAIRS of identical chips,
// adjacent, with nothing on either to tell them apart. `defaultTemplate` opened
// on whichever of the pair the query returned first.
//
// The Inbox composer had already answered this: `inboxTemplates` labels every
// row "<title> · <language>". Here there is room to do better than a label --
// one chip per message, with its languages as a toggle inside it, the way a
// message's card on Campaigns › Messages already draws them.
//
// The "starter" / category word gives up its place to the toggle when a message
// has more than one language: which language leaves is load-bearing, and where
// a template came from is not. A message with one language keeps the word.

const TC_GROUPS = (list) => (window.__starters && window.__starters.group
  ? window.__starters.group(list)
  // No library read: one group per row, so the picker still works and still
  // says the language it would send in.
  : (list || []).map((t) => ({ name: t.name, title: t.name, rows: [t], labels: { [t.language]: t.language } })));

const tcKind = (t) => (window.__starters && window.__starters.byName(t.name) ? "starter" : (t.category || ""));

/**
 * templates  the approved rows, in any order
 * value      the id of the row picked, or ""
 * onPick     called with a row's id
 * testid     the page's own name for a chip ("bc-template", "pb-template")
 */
const TemplateChips = ({ templates, value, onPick, testid }) => {
  const groups = TC_GROUPS(templates);
  return (
    <>
      {groups.map((g) => {
        // The row in view for this message: the one picked, else the first --
        // which is a language order now, not the order a query happened to give.
        const picked = g.rows.find((r) => r.id === value) || null;
        const row = picked || g.rows[0];
        const many = g.rows.length > 1;
        return (
          <span key={g.name} className={"bc-chip tpl-chip" + (picked ? " active" : "")}>
            <button
              type="button"
              className="tpl-chip-name"
              aria-pressed={!!picked}
              onClick={() => onPick(row.id)}
              title={row.body_preview || ""}
              data-testid={testid}
            >
              {g.title}
            </button>
            {many ? (
              <span className="tpl-chip-langs" role="group" aria-label={`Language for ${g.title}`}>
                {g.rows.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    className={"tpl-chip-lang" + (r.id === value ? " on" : "")}
                    aria-pressed={r.id === value}
                    onClick={() => onPick(r.id)}
                    title={r.body_preview || ""}
                    data-testid={`${testid}-lang`}
                  >
                    {g.labels[r.language] || r.language}
                  </button>
                ))}
              </span>
            ) : (
              tcKind(row) ? <span className="bc-chip-count">{tcKind(row)}</span> : null
            )}
          </span>
        );
      })}
    </>
  );
};

window.TemplateChips = TemplateChips;
