/* global React, Icon */
// Chanlytics — Settings › Business: What it can do.
//
// The fifth card of the record (docs/superpowers/specs/2026-09-20-business-tab-design.md §4.7; the plan's Tasks 4.1
// and 4.1b): six abilities, each with the channels that have it and the row it runs on, and under them the three
// things the receptionist cannot do at all. Nothing here is typed. Every ability, every sentence and every limit is
// contracts' (abilityRows, cannotRows, through window.__businessTab), computed from what the records show -- the tab
// had never said a tool exists, and an owner could not know their phone agent sends the booking link to a caller's
// own WhatsApp.
//
// Built to the owner's 22 September rule from the start (the plan's Task 4.0): a row states ONE fact and at most one
// quiet signal. So an ability is its title and two small glyphs, chat and phone, lit for a channel that has it and
// dim for one that does not -- ink, never a colour, never a pill, never a badge. The sentence under the title is
// drawn ONLY where it carries a decision: an input this page supplies is missing (contracts' `missing`), and then the
// row says what happens instead and offers the row that fixes it. Everywhere else the sentence is still in the row --
// a screen reader reads it, a mouse gets it as the row's tip -- and is not a second and third line under six rows of
// a phone. What holds the whole card back is said ONCE, above the rows: the Autonomy tab's Replies row is one cause
// with one fix on another tab, and six rows repeating it is the page shouting (Task 4.1b's decision).
//
// The card holds NO hook, as the four cards before it do not: the tests' stub React keeps every hook on the page as a
// cell in one order (business-tab.jsx's header), and the services sheet stays the page's last hook-holding child.
// Its top-level names are btc-prefixed, and no pattern in it holds an object rest, for the reasons
// business-tab-save.jsx gives. Loaded after business-tab-answers.jsx and before business-tab-services.jsx in both
// load lists, and read by the page as window.BtCanCard.
//
// Three surfaces beside the settings read reach it, each published by the bridge: __SETUP (the connections, read
// through contracts' capabilityStatus, the same answer Setup's own rows are drawn from), __POLICIES (the Autonomy
// matrix) and __TEMPLATES_ALL (the approved message a call sends the booking link as). A surface that could not be
// read is its own state: the rows that need it are a FailedRead, never a guessed false, which would draw a live line
// dark and a hold as none.

/* ------------------------------------ the two glyphs ------------------------------------ */

/**
 * One channel of one ability: the app's own icon, lit in the page's ink where the channel has it and dim where it
 * does not. Dim is a colour, and a colour says nothing to a screen reader or to anyone reading a phone in daylight,
 * so the glyph carries its name -- contracts' (ABILITY_CHANNEL_WORDS), so the four states are spelled once.
 *
 * Drawn dim rather than left out: an absent glyph reads as "we did not say", and the whole point of this card is that
 * it says.
 */
const BtcGlyph = ({ channel, has, words }) => (
  <span
    className="rec-can-chip"
    data-on={has ? "true" : "false"}
    role="img"
    aria-label={has ? words.has : words.not}
  >
    <Icon name={channel === "voice" ? "phone" : "chat"} size={12} />
  </span>
);

/* ------------------------------------ an ability ------------------------------------ */

/**
 * One ability: its title, its two channels, and its sentence -- kept out of the way unless it carries a decision.
 *
 * `door` opens the row that supplies the missing input, by its id, the way the standing line's door opens one (the
 * fold registry asks about changes first). A role that may not change the business is passed none: the row behind it
 * would not open, so the sentence stands alone rather than offering a press that refuses.
 */
const BtcRow = ({ ability, words, door }) => {
  const a = ability;
  const saysId = `rec-can-${a.id}-says`;
  const open = a.missing && a.runsOn && door;
  return (
    <div
      className="rec-row bt-can-row"
      data-testid={`rec-can-${a.id}`}
      data-ready={a.ready ? "true" : "false"}
      // The tip only where the sentence is not on screen: drawn, it IS the row's description.
      title={a.missing ? undefined : a.detail}
    >
      <span className="rec-row-key">{a.title}</span>
      <span className="bt-can-chips">
        <BtcGlyph channel="whatsapp" has={a.channels.whatsapp} words={words.whatsapp} />
        <BtcGlyph channel="voice" has={a.channels.voice} words={words.voice} />
      </span>
      {a.missing ? (
        <p className="bt-can-why">
          <span id={saysId}>{a.detail}</span>
          {open ? (
            <button
              type="button"
              className="bt-link"
              onClick={() => door(a.runsOn.row)}
              aria-describedby={saysId}
              data-testid={`rec-can-door-${a.id}`}
            >
              {a.runsOn.label}
            </button>
          ) : null}
        </p>
      ) : (
        <span className="bt-can-says" id={saysId}>
          {a.detail}
        </span>
      )}
    </div>
  );
};

/** One thing the receptionist cannot do: a line, and what it is instead, kept where the abilities keep theirs. */
const BtcCannotRow = ({ limit }) => (
  <div className="rec-row bt-cannot-row" data-testid={`rec-cannot-${limit.id}`} title={limit.detail}>
    <span className="rec-row-key">{limit.title}</span>
    <span className="bt-can-says" id={`rec-cannot-${limit.id}-says`}>
      {limit.detail}
    </span>
  </div>
);

/* ------------------------------------ the card ------------------------------------ */

/** A door opens a row by its id, as the standing line's does (business-tab.jsx says how the registry asks first). */
const btcOpenRow = (id) => {
  if (window.__recordFolds) window.__recordFolds.request(id);
};

/** Whether a stored reply mode is one the Autonomy pane keeps. An unknown one holds at the edge, and holds here. */
const btcReplyMode = (stored, modes) => (modes && modes.indexOf(stored) >= 0 ? stored : "ask");

/**
 * What it can do (spec §4.7), after *How it answers* and before the services sheet.
 *
 * Every input comes from its own source and none is a number or a sentence the page works out for itself (the plan's
 * table under Task 4.1 step 3). abilityRows and cannotRows throw on an input left out, so a wiring slip is an error
 * here rather than a card that quietly says a live line is dark.
 */
const BtCanCard = ({ brain, config, canEdit }) => {
  const tab = window.__businessTab || {};
  if (!tab.abilityRows || !tab.cannotRows) return null;
  const profile = brain.profile || {};
  // Undefined until the surface is read, null when the read FAILED, and the two are not one answer
  // (pages/setup.jsx, pages/settings.jsx take the same stance). On a cold boot the settings surface
  // lands well before Setup -- the boot queue puts the tab's own surface first and setupOverride is
  // fourteenth of sixteen -- so a healthy workspace read "Couldn't read the connections", with a
  // Retry, for as long as that took. A surface still on its way is waited for.
  const setup = window.__SETUP;
  const policies = window.__POLICIES;
  const templates = window.__TEMPLATES_ALL;
  if (setup === undefined || policies === undefined || templates === undefined) {
    return (
      <section className="rec-card" data-testid="rec-card-can" aria-labelledby="bt-can-title">
        <div className="rec-card-head">
          <h2 className="rec-card-title" id="bt-can-title">
            What it can do
          </h2>
        </div>
        <p className="bt-can-reading" data-testid="rec-can-reading">
          Reading your connections{"…"}
        </p>
      </section>
    );
  }
  const dto = setup && setup.dto ? setup.dto : null;
  const rows = policies && Array.isArray(policies.rows) ? policies.rows : null;
  // The connections, decided where Setup decides them: ready, tested and switched on by the owner.
  const live = (kind) => !!(dto && tab.capabilityStatus(kind, dto).live);
  const reply = rows ? rows.filter((r) => r && r.class === "reply")[0] || null : null;
  const abilities =
    dto && rows && Array.isArray(templates)
      ? tab.abilityRows({
          voiceLive: live("voice"),
          whatsappLive: live("whatsapp"),
          hasCalendarFeed: !!(config && config.calendar && config.calendar.ical_url),
          hasBookingLink: !!brain.booking_link,
          // The template retell-fn picks the call's message with, asked of contracts, never matched by name here.
          // The list is known to be one by now: a failed read is said above, not read as "no approved message".
          hasBookingTemplate: !!tab.bookingTemplate(templates),
          hasHandoffNumber: !!profile.handoff_number,
          hasEscalateWhen:
            Array.isArray(profile.escalate_when) &&
            profile.escalate_when.some((r) => typeof r === "string" && r.trim() !== ""),
          // Exactly as stored: usually nothing, which contracts reads as a day, as the Autonomy pane does.
          pauseHours: reply && reply.limits ? reply.limits.pause_hours : undefined,
          visionOn: !!(config && config.features && config.features.vision === true),
          // The edge's own question about the BOOKING row (retell-fn.ts), never a copy of the rule.
          bookingHeld: tab.bookingHeld(
            Object.fromEntries(rows.filter((r) => r && r.class).map((r) => [r.class, { mode: r.mode }])),
          ),
          // And the REPLIES row, with the edge's own default for a row that is not there (reply-posture.ts: "ask").
          replyMode: btcReplyMode(reply ? reply.mode : "ask", tab.POLICY_MODES),
        })
      : null;
  // Texting reads `ready`, not `live`: `live` needs a tested that texting never records (capabilities.ts), so it can
  // never be true, and the row would say texting is not sold on a line where it is on.
  const limits = dto ? tab.cannotRows({ smsLive: tab.capabilityStatus("sms", dto).ready }) : [];
  const words = tab.ABILITY_CHANNEL_WORDS;
  const door = canEdit ? btcOpenRow : null;
  // What could not be read, named: the card says which surface rather than "something". The
  // connections are the whole card's -- every row of it, the limits included, turns on the lines that
  // answer -- so that one is said ONCE, in place of everything, with one Retry. What the settings
  // surface lost is the abilities' alone, and the three limits stand under it.
  const lost = [rows ? null : "the Autonomy tab", Array.isArray(templates) ? null : "your approved messages"].filter(
    Boolean,
  );

  if (!dto) {
    return (
      <section className="rec-card" data-testid="rec-card-can" aria-labelledby="bt-can-title">
        <div className="rec-card-head">
          <h2 className="rec-card-title" id="bt-can-title">
            What it can do
          </h2>
        </div>
        <window.FailedRead kind="line" what="the connections" surface="setup" testid="rec-can-unread" />
      </section>
    );
  }

  return (
    <section className="rec-card" data-testid="rec-card-can" aria-labelledby="bt-can-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-can-title">
          What it can do
        </h2>
        <span className="rec-card-sub">On the lines that answer, from what is filled in here</span>
      </div>

      {abilities && abilities.held ? (
        <p className="bt-can-held" data-testid="rec-can-held">
          <span id="bt-can-held-words">{abilities.held.sentence}</span>
          <button
            type="button"
            className="bt-link"
            onClick={() => window.CHANLY.nav(abilities.held.to)}
            aria-describedby="bt-can-held-words"
            data-testid="rec-can-held-door"
          >
            {abilities.held.door}
          </button>
        </p>
      ) : null}

      {abilities ? (
        abilities.rows.map((a) => <BtcRow key={a.id} ability={a} words={words} door={door} />)
      ) : (
        <window.FailedRead kind="line" what={lost.join(" and ")} surface="settings" testid="rec-can-unread" />
      )}

      <div className="bt-can-group" role="group" aria-labelledby="bt-cannot-title" data-testid="rec-card-cannot">
        <h3 className="bt-can-group-head" id="bt-cannot-title">
          And what it cannot
        </h3>
        {limits.map((c) => (
          <BtcCannotRow key={c.id} limit={c} />
        ))}
      </div>
    </section>
  );
};

Object.assign(window, { BtCanCard });
