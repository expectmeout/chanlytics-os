/* global React */
// Chanlytics — Settings › Business, as a record.
//
// The Business tab's own file (docs/superpowers/specs/2026-09-20-business-tab-design.md). It starts with the two
// things the tab and the old card in settings.jsx share: how a number is written for people, and the one-key save.
// Shared through window, since in the app every file is its own module and a top-level const of one is nothing to
// another; settings.jsx reads both as it draws.

/**
 * A number as people write it, "+1 (305) 555-0100", the way Setup and Connections show one (contracts
 * formatPhoneDisplay, published by the bridge). Business showed the line it answers and the transfer number in the
 * E.164 they are stored as (the wiring audit's L7). Only E.164 is rewritten: anything else is shown as it was written,
 * which for the number it gives out is what the receptionist says.
 *
 * Here, and on window, since this page and the old card in settings.jsx both show numbers: one rule for writing them.
 */
const phoneShown = (v) => (v && window.__phoneDisplay && /^\+[1-9][0-9]{6,14}$/.test(v) ? window.__phoneDisplay(v) : v);

/**
 * One brain field, saved from the row it is shown in.
 *
 * The two numbers below used to be sections nine and thirteen of a fourteen-
 * section form -- "Tell customers to call" near the top of one step, "How
 * callers reach a person" most of a page later in another, both of them read
 * from the Business card five rows apart. Editing one meant opening a form,
 * finding it among twelve fields that had nothing to do with it, and pressing
 * a Save that wrote the entire configuration.
 *
 * It still writes the entire configuration -- PUT /settings is a versioned
 * compare-and-swap, and sending a fragment would delete the rest -- but it
 * starts from what is stored and changes ONE key, which is the same discipline
 * the big form's `save` learned after a rebuild lost a workspace its prompt.
 *
 * Moved here from settings.jsx unchanged when the Business tab became a record (Task 3.2): every row of this page
 * saves through it, and the old card's two number rows take it from window until Task 3.7 retires them.
 */
function useFieldSave(flash) {
  const [busy, setBusy] = React.useState(false);
  const settings = window.__SETTINGS || null;
  const save = (change, said, done) => {
    if (busy || !window.__saveSettings || !settings || !settings.config) return;
    const cfg = settings.config;
    const brain = cfg.brain || {};
    setBusy(true);
    const next = { ...cfg, brain: change({ ...brain }, { ...(brain.profile || {}) }) };
    window.__saveSettings(next, settings.version, () => {
      setBusy(false);
      done();
      flash({ msg: said });
    }).then((r) => {
      if (r.ok) return;
      setBusy(false);
      flash({ tone: "danger", msg: <>{r.message}</> });
    });
  };
  return [busy, save];
}

Object.assign(window, { useFieldSave, phoneShown });
