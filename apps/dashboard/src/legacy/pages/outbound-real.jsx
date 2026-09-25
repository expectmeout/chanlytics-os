
// playbook-bits.jsx, which loads before this file.
const { PB_NONE, pbReach, pbSpell } = window;
// playbook-card.jsx, which loads before this file.
const { PlaybookTile, PlaybookSlot } = window;
// playbook-composer.jsx, which loads before this file.
const { PlaybookComposer } = window;/* global React, Icon, PolicyChip, Confirm, EmptyState, FailedRead */
// Campaigns › Playbooks, real: a standing rule that sends one approved
// template to newly eligible people who said yes, under the workspace's
// autonomy mode. Same chrome as the seeded Outbound page (outbound.jsx);
// every number is a run's. Nothing here scores, estimates or invents.
//
// Its moments: People lists that keep themselves current -- win-back (quiet
// 30 days), welcome (new this week), save our number (phoned only), lapsed --
// the month's offer (everyone who said yes, on a cadence), a visit tomorrow or
// yesterday, and one of the workspace's own lists (00155). Each runs under
// one of the two Autonomy rows — auto sends, veto sends after a stop window,
// ask leaves the run waiting here and on Today, never does nothing. Every
// verb goes through window.__playbooks and the surface is re-fetched, so the
// cards are the server's.

const usePlaybooks = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:playbooks", bump);
    return () => window.removeEventListener("surface:playbooks", bump);
  }, []);
  return window.__PLAYBOOKS;
};

const PlaybooksReal = ({ initialPlaybook = null }) => {
  const data = usePlaybooks();
  const [toastNode, flash] = window.usePPToast();
  // Who may start, change or run a playbook: the role store's answer, View-as included.
  const canAct = !!(window.canDo && window.canDo("approve"));
  // A playbook half-written when the page was left opens again as the page does: the tab kept its words
  // (useUnsavedWork), a new one under "new" and a change under the playbook's id.
  const draftOf = (key) => !!(window.tabDraft && window.tabDraft("playbook", key));
  const [composing, setComposing] = React.useState(() => draftOf("new"));
  const [editing, setEditing] = React.useState(() => (data.rows || PB_NONE).find((p) => draftOf(p.id)) || null);
  // The moment an empty slot was pressed for, so the composer opens on it rather
  // than on whichever trigger happens to be first.
  const [slot, setSlot] = React.useState(null);
  // The one playbook open in place across the grid: the link's, when a link named
  // one (Templates' "Win-back playbook", Today's run), else none.
  const [openId, setOpenId] = React.useState(initialPlaybook);
  const followed = React.useRef(initialPlaybook);
  React.useEffect(() => {
    if (followed.current === initialPlaybook) return;
    followed.current = initialPlaybook;
    setOpenId(initialPlaybook);
  }, [initialPlaybook]);
  React.useEffect(() => {
    const open = () => { setEditing(null); setSlot(null); setComposing(true); };
    window.addEventListener("playbooks:new", open);
    return () => window.removeEventListener("playbooks:new", open);
  }, []);
  // A link to one playbook lands on its card: marked, and brought into view when it is out of it.
  React.useEffect(() => {
    const el = initialPlaybook && typeof document !== "undefined" && document.getElementById ? document.getElementById(`pb-${initialPlaybook}`) : null;
    if (!el || !el.getBoundingClientRect || !el.scrollIntoView) return;
    const at = el.getBoundingClientRect();
    if (at.top < 0 || at.top > window.innerHeight - 80) el.scrollIntoView({ block: "start" });
  }, [initialPlaybook]);

  const rows = data.rows || PB_NONE;
  // Every moment, in its own order: the playbooks doing one, as rows, and under
  // them the moments nothing is doing yet, as a compact group -- so a first day
  // still names every moment it could act on, and a busy one shows which is idle
  // without an idle moment taking a working playbook's room.
  const triggers = data.triggers || PB_NONE;
  const known = new Set(triggers.map((t) => t.id));
  const usedTriggers = new Set(rows.map((p) => p.trigger));
  const unused = triggers.filter((t) => !usedTriggers.has(t.id));
  const cards = [];
  for (const t of triggers) rows.filter((p) => p.trigger === t.id).forEach((p) => cards.push(p));
  rows.filter((p) => !known.has(p.trigger)).forEach((p) => cards.push(p));
  const runningN = rows.filter((p) => p.state === "running" && !p.totals.waiting).length;
  const waitingN = rows.filter((p) => p.totals.waiting).length;
  const pausedN = rows.filter((p) => p.state === "paused").length;
  const nobody = rows.filter((p) => pbReach({ state: p.state, candidates: p.candidates, held: p.held, waiting: p.totals.waiting }) === "nobody");
  const reachesNobody = nobody.length;
  const closeComposer = () => { setComposing(false); setEditing(null); setSlot(null); };
  const startAt = (id) => { setEditing(null); setSlot(id); setComposing(true); };
  const startNew = () => { setEditing(null); setSlot(null); setComposing(true); };
  // How the moments stand, as the head's one line: the numbers the rows below add up to.
  const tally = [
    { n: runningN, k: "running", tone: "plain" },
    waitingN > 0 && { n: waitingN, k: "waiting on you", tone: "warn" },
    pausedN > 0 && { n: pausedN, k: "paused", tone: "plain" },
    unused.length > 0 && { n: unused.length, k: "not set up", tone: "dim" },
  ].filter(Boolean);
  // What the three rules that shape every run are, said once under the cards: the
  // sending hours, the weekly breath across playbooks, and the gap before the same
  // playbook reaches the same person again -- the one number a playbook sets itself.
  const hours = window.__clock && window.__clock.hours;
  const gaps = [...new Set(rows.map((p) => p.gap_days))];

  return (
    <div className="reports pb-page" data-testid="playbooks-real">
      <div className="rp-body cm-page pb-body">
        {/* One line, the way every Campaigns tab opens: the tab says "Playbooks", so
            the name is a screen reader's alone (CmHead quiet). The line is how the
            moments stand -- running, waiting on you, paused, not set up -- in the
            numbers the rows below add up to; it was a headline, a two-line sentence
            and a tally of big figures saying them twice. A running playbook with
            nobody to send to is the one thing the rows alone would not say at a
            glance, and on a workspace whose list has emptied it is true of every one
            of them: it rides the line, in the tone of something to look at. The act
            is at the right, where Broadcasts and Templates keep theirs; it was the
            top bar's. */}
        <window.CmHead
          title="Playbooks"
          quiet
          testid="pb-standing"
          sub={(
            <span className="pb-standing" data-tip="Standing rules your receptionist runs — one approved template to newly eligible people who said yes, on your clock, under Settings › Autonomy. Replies land in the Inbox.">
              {rows.length === 0
                ? <span>{triggers.length > 0 ? `${pbSpell(triggers.length, true)} moments, none set up yet` : "No playbook yet"}</span>
                : tally.map((t, i) => (
                    <React.Fragment key={t.k}>
                      {i > 0 && <window.CmDot />}
                      <span className="pb-tally-cell" data-tone={t.tone}>
                        <span className="pb-tally-n tabular">{t.n}</span>
                        <span className="pb-tally-k">{t.k}</span>
                      </span>
                    </React.Fragment>
                  ))}
              {reachesNobody > 0 && (
                <>
                  {/* In its tone and a step apart, with no dot before it: where the line wraps, a dot was left at
                      the end of the numbers pointing at nothing. One is named -- "Welcome has nobody to send to"
                      says which row to open, where "One running with nobody to send to" left the owner to find it. */}
                  <span className="pb-standing-warn" data-testid="pb-reaches-nobody">{reachesNobody === 1 ? `${nobody[0].name} has nobody to send to` : reachesNobody === runningN + waitingN ? "None of them has anyone to send to" : `${pbSpell(reachesNobody, true)} have nobody to send to`}</span>
                </>
              )}
            </span>
          )}
          right={<button className="btn btn-primary" onClick={startNew} data-testid="pb-new" {...window.gate("approve", "start a playbook")}><Icon name="plus" size={12} /> <span>New<span className="cm-act-noun"> playbook</span></span></button>}
        />
        {initialPlaybook && !rows.some((p) => p.id === initialPlaybook) && (
          <EmptyState kind="line" title="That playbook isn't here any more." body="Its runs stay in Broadcasts, with their numbers." testid="pb-gone" />
        )}
        {rows.length > 0 && data.templates === null && (
          <FailedRead kind="line" what="your templates" body="The cards show what they send once they read. Everything else here is current." surface="playbooks" testid="pb-cards-templates-failed" />
        )}
        {/* The server could not count who a moment reaches: said once, here, and no card draws a zero it never
            counted -- it drew "0 of 0", "nobody to send to" and the QR over a People read that failed. */}
        {(cards.length > 0 || unused.length > 0) && data.countsRead === false && (
          <FailedRead kind="line" what="who each moment reaches" body="The cards show who they reach once it reads. Everything else here is current." surface="playbooks" testid="pb-counts-failed" />
        )}
        {/* The playbooks, as People's table: the columns named once above the rows. */}
        {cards.length > 0 && (
          <div className="pb-list">
            <div className="pb-list-head" aria-hidden="true">
              <span>Playbook</span>
              <span>State</span>
              <span>Reaches</span>
              <span>Next run</span>
              <span className="pb-list-head-runs">Runs</span>
            </div>
            {cards.map((p) => (
              <PlaybookTile key={p.id} p={p} canAct={canAct} flash={flash} open={openId === p.id} onOpen={() => setOpenId((o) => (o === p.id ? null : p.id))} focus={p.id === initialPlaybook} onEdit={(e) => { setComposing(false); setEditing(e); }} />
            ))}
          </div>
        )}
        {/* The moments nothing is doing yet, in their own order. They stay where they
            are while the composer is open: it opens beside the page, and the page
            does not move under it. */}
        {unused.length > 0 && (
          <section className="pb-more" aria-label="Not set up">
            <div className="pb-more-head" aria-hidden="true">
              <span className="pb-more-k">Not set up</span>
              <span className="tally">{unused.length}</span>
            </div>
            <div className="pb-more-list">
              {unused.map((t) => <PlaybookSlot key={`slot:${t.id}`} t={t} onStart={startAt} />)}
            </div>
          </section>
        )}
        {rows.length === 0 && unused.length === 0 && !composing && (
          <EmptyState
            kind="card"
            glyph="bolt"
            title="No playbook yet"
            body="Win-back for anyone quiet 30 days, welcome for anyone new this week, save our number for anyone who only ever phoned, or the month's offer for everyone who said yes."
            action={{ label: "New playbook", onClick: () => window.dispatchEvent(new CustomEvent("playbooks:new")), gate: window.gate ? window.gate("approve", "start a playbook") : null }}
            testid="pb-empty"
          />
        )}
        {/* The three rules that quietly shape every run, under the rows they shape: one
            quiet line, each rule's longer words its hover. They were a 78px card of
            three headed columns. */}
        {(cards.length > 0 || unused.length > 0) && (
          <p className="pb-rules" data-testid="pb-always">
            <span className="pb-rules-k">Always on</span>
            {/* Each rule's longer words are its hover, and a focus's: reachable from a keyboard and read to a screen
                reader (aria-description), as the composer's Guardrails are. */}
            {[
              { icon: "clock", words: `Sends ${hours ? hours.range : "9:00–20:59"}`, more: "A run that would land outside them waits for the morning" },
              { icon: "wave", words: "One a week, per person", more: "Across every playbook, not per playbook" },
              {
                icon: "refresh",
                words: gaps.length === 1 ? `${gaps[0]} days between repeats` : "Days between repeats",
                more: gaps.length === 1 ? "The same playbook will not reach the same person sooner" : "Each playbook keeps its own gap before reaching the same person again",
              },
            ].map((r) => (
              <span key={r.icon} className="pb-rule" tabIndex={0} data-tip={r.more} aria-description={r.more}>
                <Icon name={r.icon} size={12} />
                {r.words}
              </span>
            ))}
          </p>
        )}
        {!canAct && rows.length > 0 && <div className="bc-excl-hint" data-testid="pb-role">{window.gateTitle("approve", "pause, run, change or delete a playbook")}</div>}
      </div>

      {/* The composer, in a sheet beside the page: last, so the page's own
          parts keep their place whether it is open or not. */}
      {(composing || editing) && (
        <PlaybookComposer
          key={editing ? editing.id : slot || "new"}
          data={data}
          editing={editing}
          initialTrigger={slot}
          onCancel={closeComposer}
          onDone={(d, changed) => {
            closeComposer();
            flash({ msg: changed ? <><b>{d.name}</b> changed</> : <><b>{d.name}</b> is running — its next run is on the card, by your clock</> });
          }}
        />
      )}

      {toastNode}
    </div>
  );
};
window.OutboundPage = (props) => {
  const Seed = window.OutboundSeed;
  if (window.__PLAYBOOKS) return <PlaybooksReal {...props} />;
  return Seed ? <Seed {...props} /> : null;
};
