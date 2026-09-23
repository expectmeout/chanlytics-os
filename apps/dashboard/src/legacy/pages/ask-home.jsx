/* global React, Icon */
// The rows under the Line (ask-real.jsx): at rest, Right now, three questions about the page and three earlier
// conversations; while typing, the words as a question, the jumps and the questions that match; Earlier (⌘J), every
// conversation. Pure of state: buildLineRows turns what the bridge holds into rows, AskRows draws them as one listbox.
// No key symbol is drawn (the Line, D17). Published as window.AskHome.

const ahAgo = (ms) => {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
};

// Every row carries what activating it does: a route, words to ask, words to finish on the line, or a thread to open.
const buildLineRows = ({ A, t, lang, query, surface, scope, threads, view }) => {
  const q = query.trim();
  const thread = (th) => ({ type: "thread", label: th.title, sub: ahAgo(th.lastAtMs), th });
  // Earlier: every conversation, or the ones whose question has the words typed.
  if (view === "earlier") {
    const list = q ? threads.filter((th) => th.title.toLowerCase().includes(q.toLowerCase())) : threads;
    return [{ key: "earlier", label: t.earlier, items: list.map(thread) }];
  }
  if (q) {
    const sections = [{ key: "ask", items: [{ type: "ask", label: q, q }] }];
    const jumps = A.jump(q);
    if (jumps.length)
      sections.push({ key: "jump", label: t.jump, items: jumps.map((j) => ({ type: "jump", label: j.label, sub: j.sub, meta: t.kind[j.kind] || "", to: j.to })) });
    const hits = A.suggestions(surface, scope, lang).filter((s) => (s.label || s.q).toLowerCase().includes(q.toLowerCase()) && s.q !== q);
    if (hits.length)
      sections.push({
        key: "match",
        items: hits.map((s) => ({ type: s.kind === "act" ? "act" : "sug", label: s.label || s.q, q: s.q, compose: s.compose, meta: s.kind === "act" ? t.tagCard : undefined })),
      });
    return sections;
  }
  // At rest: Right now is the first row, and ↵ on the empty line asks who needs you (the quick answer).
  const sections = [{ key: "now", items: [{ type: "now", label: A.rightNow(lang), q: t.needsQ }] }];
  const asks = A.suggestions(surface, scope, lang).filter((s) => s.kind !== "act" && s.q !== t.needsQ).slice(0, 3);
  if (asks.length) sections.push({ key: "about", label: t.askAbout(surface), items: asks.map((s) => ({ type: "sug", label: s.q, q: s.q })) });
  if (threads.length) {
    const items = threads.slice(0, 3).map(thread);
    if (threads.length > 3) items.push({ type: "all", label: t.allEarlier });
    sections.push({ key: "earlier", label: t.earlier, items });
  }
  return sections;
};

// The flat list the keys walk, in the order the rows are drawn.
const flatRows = (sections) => sections.flatMap((sec) => sec.items);

const AskRows = ({ sections, sel, setSel, onActivate, onDelete, t, empty }) => {
  const flat = flatRows(sections);
  if (!flat.length) return <div className="ask-rows-empty">{empty || t.nothing}</div>;
  let at = 0;
  return (
    <div className="ask-rows" role="listbox" id="ask-rows" aria-label={t.rowsLabel}>
      {sections.map((sec) => (
        <React.Fragment key={sec.key}>
          {sec.label ? <div className="ask-rows-label" role="presentation">{sec.label}</div> : null}
          {sec.items.map((it) => {
            const i = at++;
            return (
              <div
                key={i}
                id={`ask-row-${i}`}
                role="option"
                aria-selected={i === sel}
                className={`ask-row ${it.type}${i === sel ? " sel" : ""}`}
                onMouseMove={() => setSel(i)}
                onClick={() => onActivate(it)}
                data-testid={`ask-row-${it.type}`}
              >
                <span className="ask-row-main">
                  <span className="ask-row-label">{it.label}</span>
                  {it.sub ? <span className="ask-row-sub">{it.sub}</span> : null}
                </span>
                {it.meta ? <span className="ask-row-meta">{it.meta}</span> : null}
                {it.type === "thread" ? (
                  <button
                    type="button"
                    className="ask-row-del"
                    tabIndex={-1}
                    aria-label={t.deleteThread}
                    title={t.deleteThread}
                    onClick={(e) => { e.stopPropagation(); onDelete(it.th); }}
                    data-testid="ask-row-del"
                  >
                    <Icon name="x" size={10} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};

window.AskHome = { buildLineRows, AskRows, flatRows, ahAgo };
