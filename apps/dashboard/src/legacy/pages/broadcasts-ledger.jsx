/* global React, Icon */
// Chanlytics -- Broadcasts: the ledger of runs, by playbook and by week, and a run's card. Moved whole from broadcasts-real.jsx
// (Reach out Part 2.5), which reads it from window.
// broadcasts-run.jsx, which loads before this file.
const { BC_LIVE, BcRunVerbs } = window;

// The history in ONE LINE above the work, the way Today, Reports and People say
// their numbers (#556, #557, #558). It was a three-cell stat strip under a page
// title the top bar already showed and a two-line sub-headline: 384px of a phone
// before the composer, and every number in it is also in Reports > Campaigns,
// which is where a number that wants a chart belongs.
// Past fifty broadcasts the route says older ones exist (more), and the line
// says its numbers are the latest fifty rather than reading as everything.
// A run a playbook made, rather than one a person sent. The column is on every
// row (broadcasts.playbook_id) and nothing drew it, so a playbook's automatic
// Tuesday run sat in this list beside Saturday's hand-sent blast with no way to
// tell them apart -- while Playbooks summed the same runs again on its own tab.
const bcByPlaybook = (r) => !!r.playbook_id;

const BC_ORIGINS = [["playbook", "by a playbook"], ["hand", "by hand"]];

const bcOrigin = (r) => (bcByPlaybook(r) ? "playbook" : "hand");

// `counted`: the head's filters already say how many went ("4 sent"), so the line leaves its own count out and opens on
// the split -- the two said the same number side by side.
const BcHistoryStats = ({ rows, more, replyWindow = null, origin = null, onOrigin = null, counted = false }) => {
  const history = (rows || []).filter((r) => !r.open);
  const messages = history.reduce((a, r) => a + r.counts.sent, 0);
  const delivered = history.reduce((a, r) => a + r.counts.delivered, 0);
  const replied = history.reduce((a, r) => a + r.counts.replied, 0);
  const sent = history.filter((r) => r.state === "sent").length;
  const dot = <span className="cm-standing-dot" aria-hidden="true">·</span>;
  // The split, and each count its own filter -- the way the Playbooks line's are.
  const byOrigin = BC_ORIGINS.map(([id, words]) => [id, words, history.filter((r) => bcOrigin(r) === id).length]).filter(([, , n]) => n > 0);
  const split = onOrigin && byOrigin.length > 1;
  // Whether anything stands before the numbers, so a dot never opens the line.
  const opened = !counted || split;
  return (
    <div className="cm-standing" data-testid="bc-standing">
      {!counted && (
        <span className="cm-standing-lead" data-tip="One approved template to the people who said yes. Replies land in the Inbox, where the receptionist answers them.">
          {sent === 0 ? "Nothing sent yet" : `${sent} ${sent === 1 ? "broadcast" : "broadcasts"} sent`}
        </span>
      )}
      {split && byOrigin.map(([id, words, n], i) => (
        <span className="cm-standing-part" key={id}>
          {i === 0 ? (counted ? null : <span className="cm-standing-dash" aria-hidden="true">&mdash;</span>) : <span className="cm-standing-comma" aria-hidden="true">,</span>}
          <button
            type="button"
            className={`cm-standing-tap ${origin === id ? "on" : ""}`}
            aria-pressed={origin === id}
            onClick={() => onOrigin(origin === id ? null : id)}
            data-testid={`bc-origin-${id}`}
          >
            <span className="tabular">{n}</span> {words}
          </button>
        </span>
      ))}
      {messages > 0 && (
        <span className="cm-standing-part">
          {opened && dot}
          <span className="tabular" data-tip="Delivered or read, over sent — WhatsApp's own receipts">{messages.toLocaleString()} {messages === 1 ? "message" : "messages"}, {Math.round((delivered / messages) * 100)}% delivered</span>
        </span>
      )}
      {/* Where a reply lands is the hover's, with what counts as one (the reply window). */}
      {messages > 0 && (
        <span className="cm-standing-part">
          {dot}
          <span className="tabular" data-tip={replyWindow ? `Threads in the Inbox that heard from the customer ${replyWindow} of a broadcast` : "Threads in the Inbox that heard from the customer after a broadcast"}>{replied} {replied === 1 ? "reply" : "replies"}</span>
        </span>
      )}
      {more && <span className="cm-standing-part bc-latest">{(opened || messages > 0) && dot}<span>the latest 50 broadcasts</span></span>}
    </div>
  );
};

/* ------------------------- the ledger, as the canvas draws it ------------------------- */

// Every run's state in the order that matters to the owner: what waits on them,
// what is to come, what is going out, what went and what did not. The tones are
// the vocabulary's (tone.ts) for each state; the words are this page's.
const BC_BANDS = [
  { id: "pending_approval", words: "waiting on you", tone: "warn" },
  { id: "scheduled", words: "scheduled", tone: "info" },
  { id: "sending", words: "sending", tone: "accent" },
  { id: "sent", words: "sent", tone: "ok" },
  { id: "failed", words: "failed", tone: "danger" },
];

/**
 * The runs by state, as the list's filter: press "3 scheduled" and the runs under it
 * are the three; press it again and they are all back. The head's first words, as
 * the Inbox's buckets are its list's. It was a card of its own -- a bar of every run
 * in its state's colour over this legend, 68px -- and the bar said again, in colour,
 * the numbers the legend says in words.
 */
const BcBand = ({ rows, band, onBand }) => {
  const parts = BC_BANDS.map((b) => ({ ...b, n: rows.filter((r) => r.state === b.id).length })).filter((b) => b.n > 0);
  if (!parts.length) return null;
  return (
    <div className="bc-band" role="group" aria-label="The runs by state" data-testid="bc-band">
      {parts.map((b) => (
        <button key={b.id} type="button" className={`bc-band-part${band === b.id ? " on" : ""}`} data-tone={b.tone} aria-pressed={band === b.id} onClick={() => onBand(band === b.id ? null : b.id)} data-testid={`bc-band-${b.id}`}>
          <span className="bc-band-n tabular">{b.n}</span> {b.words}
        </button>
      ))}
    </div>
  );
};

// Where an instant falls on the week's grid, by the business's clock: its day, and
// how far across the sending hours (9:00 to 21:00) it is.
const bcAt = (ms) => {
  const c = window.__clock;
  const v = c && c.inputValue ? c.inputValue(ms) : new Date(ms).toISOString().slice(0, 16);
  const [day, hm] = v.split("T");
  const [h, m] = (hm || "0:0").split(":").map(Number);
  const min = c && c.hours ? c.hours.min : 9;
  return { day, x: Math.max(0, Math.min(100, ((h + m / 60 - min) / 12) * 100)) };
};

const bcWeekday = (day, i) => (i === 0 ? "Today" : new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }));

const BC_WEEK_TONE = { pending_approval: "warn", scheduled: "info", sending: "accent", sent: "ok", failed: "danger" };

/**
 * The week ahead, as one strip: seven days side by side, a mark per run in its
 * state's tone -- a ring for a running playbook's run to come -- and the day's runs
 * by the hour they go on the day's hover or focus. Runs already on the ledger are
 * the ones to come, going out, and today's that went; a running playbook's runs to
 * come are counted at its hour when the Playbooks surface has been read. It was a
 * row per day on a 9:00-21:00 track, 209px on a desk, where most tracks held the
 * same two dashed marks every day.
 */
const BcWeek = ({ rows, now }) => {
  const c = window.__clock;
  const today = c && c.dayKey ? c.dayKey(now) : new Date(now).toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => (c && c.dayKey ? c.dayKey(now + i * 86_400_000) : new Date(now + i * 86_400_000).toISOString().slice(0, 10)));
  const blocks = Object.fromEntries(days.map((d) => [d, []]));
  // The hour a run goes, by the business's clock: "10:00".
  const hm = (ms) => { const v = c && c.inputValue ? c.inputValue(ms) : new Date(ms).toISOString().slice(0, 16); return (v.split("T")[1] || "").slice(0, 5); };
  // Runs on the ledger: to come, going out, and today's that went.
  for (const r of rows) {
    const at = r.scheduled_for ? Date.parse(r.scheduled_for) : NaN;
    if (!Number.isFinite(at)) continue;
    const { day, x } = bcAt(at);
    if (!blocks[day] || (r.state === "sent" && day !== today) || r.state === "canceled") continue;
    blocks[day].push({ id: r.id, name: r.name, x, at: hm(at), tone: BC_WEEK_TONE[r.state] || "info", playbook: r.playbook_id || null });
  }
  // A running playbook's runs to come, at its hour, every day it runs -- where the
  // ledger does not already hold that day's run.
  const pbs = window.__PLAYBOOKS && Array.isArray(window.__PLAYBOOKS.rows) ? window.__PLAYBOOKS.rows : [];
  for (const p of pbs) {
    if (p.state !== "running" || p.trigger === "everyone_monthly") continue;
    days.forEach((d, i) => {
      if (i === 0 && p.last_run_for === today) return;
      if (blocks[d].some((b) => b.playbook === p.id)) return;
      const x = Math.max(0, Math.min(100, ((p.run_hour - ((c && c.hours && c.hours.min) || 9)) / 12) * 100));
      blocks[d].push({ id: `${p.id}:${d}`, name: p.name, x, at: `${String(p.run_hour).padStart(2, "0")}:00`, tone: "plain", playbook: p.id, projected: true });
    });
  }
  const range = c && c.hours ? c.hours.range : "9:00–20:59";
  const hours = `Nothing sends outside ${range} — a run that would waits for the next morning`;
  // What the hover says is in the words too, unseen, so a screen reader hears it where the tip is drawn.
  return (
    <div className="bc-week" data-testid="bc-week">
      <span className="bc-week-k" tabIndex={0} data-tip={hours}>Week ahead<span className="cm-sr">. {hours}</span></span>
      <div className="bc-week-days">
        {days.map((d, i) => {
          const bs = blocks[d].slice().sort((a, b) => a.x - b.x);
          const say = i === 0 && bs.some((b) => b.tone === "accent") ? "sending now"
            : bs.length === 0 ? "—"
            : bs.length === 1 ? bs[0].name
            : `${bs.length} runs`;
          // The day's runs by the hour they go, a playbook's still to come said so.
          const tip = bs.map((b) => `${b.at} ${b.name}${b.projected ? " (to come)" : ""}`).join(" · ");
          return (
            <div key={d} className={`bc-week-cell${i === 0 ? " is-today" : ""}`} tabIndex={bs.length ? 0 : undefined} data-tip={tip || undefined} data-testid="bc-week-day">
              <span className="bc-week-dname">{bcWeekday(d, i)}</span>
              <span className="bc-week-marks" aria-hidden="true">
                {bs.map((b) => <span key={b.id} className={`bc-week-run${b.projected ? " is-projected" : ""}`} data-tone={b.tone} />)}
              </span>
              <span className="bc-week-say">{say}</span>
              {tip && <span className="cm-sr">: {tip}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// The minutes until a run goes, while it is under an hour away: the one thing on a
// card that changes as you look at it, in the accent, because it is happening.
const bcSoon = (row, now) => {
  if (row.state !== "scheduled" || !row.scheduled_for) return null;
  const ms = Date.parse(row.scheduled_for) - now;
  if (!(ms > 0 && ms < 3_600_000)) return null;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
};

/**
 * One run on the ledger, as a row of People's table: what it is and its state; what
 * sent it and to whom; when it goes or went; who it reaches, out of how many, with
 * who it held back; and -- only on a run waiting on the owner -- Approve and Skip. A
 * run to come or going out is cancelled or stopped from its report, which a press
 * anywhere on the row opens on a screen of its own: a red Cancel on every run to come
 * was a third line on a phone. A run waiting on the owner has the urgency edge
 * (legacy/CLAUDE.md: urgency is the accent left edge). It was a card, and every card
 * said the template's name and its language letters, a policy chip and an Open
 * button: 66-76px on a desk and 203-231px on a phone.
 */
// `renderDetail` draws the detail when the card is open -- a function, not an element, so a closed card
// never mounts a detail that would read the run's recipients for nothing.
const BcRunCard = ({ row, canSend, onOpen, armed, onArm, stopping, approving = false, approve, cancel, now }) => {
  const byPb = bcByPlaybook(row);
  const pb = byPb && window.__PLAYBOOKS && Array.isArray(window.__PLAYBOOKS.rows) ? window.__PLAYBOOKS.rows.find((p) => p.id === row.playbook_id) : null;
  const waiting = row.state === "pending_approval";
  const sending = row.state === "sending";
  // Skip asked, on this row: the question is the acts' cell until it is answered.
  const asking = waiting && armed && canSend;
  const soon = bcSoon(row, now);
  const done = row.counts.sent + row.counts.skipped + row.counts.failed;
  const held = row.counts.skipped + row.counts.failed;
  // Open is the run's state, not a flag the row may not carry: to come, waiting, or going out.
  const live = BC_LIVE.has(row.state);
  const finished = !live;
  // Who it reaches: to come, the people it holds; going out, how far it has got;
  // gone, how many it sent out of those it was for, with the rest named.
  const will = finished || sending ? row.counts.sent : row.recipient_count;
  const pool = Math.max(row.recipient_count, will + held);
  const reasons = sending ? [{ t: `${done} of ${row.recipient_count} done`, tone: "plain" }]
    : finished ? [
      row.counts.skipped > 0 && { t: `${row.counts.skipped} held back`, tone: "warn" },
      row.counts.failed > 0 && { t: `${row.counts.failed} never went through`, tone: "warn" },
      row.state === "failed" && row.failureLabel && { t: row.failureLabel, tone: "warn" },
      !held && row.state !== "failed" && { t: `${row.counts.delivered || 0} delivered · ${row.counts.replied || 0} ${row.counts.replied === 1 ? "reply" : "replies"}`, tone: "plain" },
    ].filter(Boolean)
    : [];
  const inner = (
    <>
      {/* A press anywhere on the line that is not one of its controls opens the run (cmRowPress), as a person's row does. */}
      <div className="bc-run-line" role="presentation" onClick={window.cmRowPress}>
        <span className="mark bc-run-mark" aria-hidden="true"><Icon name={byPb ? "repeat" : "send"} size={13} /></span>
        <div className="bc-run-what">
          <div className="bc-run-titles">
            <button type="button" className="bc-run-name" onClick={onOpen} data-row-open data-testid="bc-open-who">{row.name}</button>
            <StatePill kind="broadcast" value={row.state} label={row.stateLabel} />
            {/* The class's words say why a run waits on you ("Re-engage · asks you"); on a run that went they said
                nothing anyone acts on. The template's name and language are the run's report's. */}
            {waiting && pb && <PolicyChip cls={pb.policy_class} />}
          </div>
          {/* What sent it, and to whom. A playbook's run is named for its playbook, and so is its list, so the list is
              said only where it is something else: "Win-back · quiet 30 days" under "Win-back · quiet 30 days" was the
              row saying its name twice. The word Playbook opens the playbook, and says which to a screen reader. */}
          <div className="bc-run-sub">
            {byPb
              ? <>
                  <button type="button" className="bc-run-link" onClick={() => window.CHANLY.nav(`outbound/${row.playbook_id}`)} aria-label={`Playbook ${pb ? pb.name : row.name}`} data-testid="bc-history-playbook">Playbook</button>
                  {row.audience.label && row.audience.label !== row.name ? <span className="bc-run-aud"> · {row.audience.label}</span> : null}
                </>
              : <span className="bc-run-aud">Broadcast · {row.audience.label}</span>}
          </div>
        </div>
        {/* When it goes or went; under an hour away, the minutes left, ticking, in the accent: it is happening. */}
        <div className="bc-run-when">
          {soon ? <span className="bc-run-soon tabular" data-testid="bc-soon" title="Until it goes">{soon}</span> : row.when}
        </div>
        <div className="bc-run-reach">
          <window.CmReach will={will} pool={pool} held={finished ? held : 0} reasons={reasons} size="sm" progress={sending ? row.progress || 0 : null} label={`${row.name}, sent so far`} />
        </div>
        {/* A question asked here is answered here: a press on its words, or just beside its Yes, is not the row's. */}
        <div className="bc-run-acts" role="presentation" onClick={asking ? (e) => e.stopPropagation() : undefined}>
          {waiting && <BcRunVerbs row={row} canSend={canSend} armed={armed} onArm={onArm} stopping={stopping} approving={approving} approve={approve} cancel={cancel} />}
          {/* Where the row goes: its report, a screen of its own. The whole row presses it; this is its mark, and its
              name for a keyboard and a screen reader. */}
          {!asking && (
            <button type="button" className="bc-run-go" onClick={onOpen} aria-label={`Open ${row.name}`}>
              <Icon name="chevron" size={14} />
            </button>
          )}
        </div>
      </div>
    </>
  );
  const cls = `bc-run${waiting ? " is-urgent" : ""}`;
  // Gone or not, by its state: a run to come or going out is "open", one gone is history.
  return finished
    ? <div className={cls} id={`bc-run-${row.id}`} data-testid="bc-history" data-state={row.state}>{inner}</div>
    : <div className={cls} id={`bc-run-${row.id}`} data-testid="bc-open" data-state={row.state}>{inner}</div>;
};

Object.assign(window, { bcOrigin, BcRunCard, BcBand, BcHistoryStats, BcWeek });
