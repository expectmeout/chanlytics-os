/**
 * What the bridge publishes, for the harness that has no bridge.
 *
 * `Chanlytics.html` opens these files off a static server with no Next bundle
 * behind them, so everything `legacy-bridge/seed-globals.ts` and
 * `legacy-bridge/identity.ts` install from @chanlytics/contracts is simply
 * absent — and the pages that read those globals do not all ask first.
 * `components/sidebar.jsx` calls `window.__identity.words(me)` outright, and
 * `pages/settings.jsx` calls `.member()` and `.initials()` the same way.
 *
 * Every global here is written ONLY when it is missing. This file sits in the
 * same tree the bundle imports; a stub that overwrote the real implementation
 * would be a mockup's arithmetic running in production. The bundle always
 * wins, and this file is what is left when there is no bundle.
 *
 * The behaviour is ported from contracts, not faked, because these answers are
 * read on screen: initials in an avatar, a timezone's local time, why a typed
 * number is not one anyone can be reached on. An empty stub would put a design
 * review in front of an interface that says "?" where the app says "SC".
 *
 * Wrapped in an IIFE on purpose: a top-level `const` in a classic script is a
 * GLOBAL lexical binding shared with the other files, and a second declaration
 * of one name is a SyntaxError that kills the script that made it.
 */
(function bridgeStubs() {
  const has = (k) => typeof window[k] !== "undefined";

  // ---- The demo switch -----------------------------------------------------
  // Around fifty gates across the mockup ask this whether they are looking at
  // theater or at a real workspace: Today's whole rail, the sidebar's persona,
  // agents and credits, the Leads and Live tabs, the scripted lead that
  // arrives eighteen seconds in. The bridge defaults it to FALSE, because
  // invented customers and fabricated revenue have no business on a real
  // workspace's screen. Here the whole artifact is the demo — unset, this
  // harness renders the production half of every one of those gates, which is
  // a UI review of a mockup with most of the mockup missing.
  if (!has("__DEMO_MODE")) window.__DEMO_MODE = true;

  // ---- Identity (contracts/identity.ts) ------------------------------------
  // A name is what the person gave, never something invented from an email:
  // "hi@chanlytics.agency" is not "Hi". With no name the account is "Your
  // account" and a member is their email.
  const initialsOf = (name) => {
    const digits = String(name).replace(/[^\d]/g, "");
    if (digits.length >= 7 && /^[+\d\s()-]+$/.test(name)) return digits.slice(-2);
    const parts = String(name).replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0] || "?").slice(0, 2).toUpperCase();
  };
  const personInitials = (name, email) => {
    const n = (name ?? "").trim();
    if (n) return initialsOf(n);
    const e = (email ?? "").trim();
    return e ? e[0].toUpperCase() : "?";
  };
  const ROLE_WORDS = { owner: "Owner", operator: "Operator", viewer: "Viewer" };
  const identityWords = (me) => {
    if (!me) return { name: "Your account", email: "", initials: "?", role: "", named: false };
    const name = (me.display_name ?? "").trim();
    return {
      name: name || "Your account",
      email: me.email ?? "",
      initials: personInitials(name, me.email),
      role: ROLE_WORDS[me.role ?? ""] ?? "",
      named: name.length > 0,
    };
  };
  const memberWords = (m) => {
    const name = ((m && m.display_name) ?? "").trim();
    if (name) return { name, sub: m.email };
    return { name: (m && m.email) ?? "Someone", sub: null };
  };
  if (!has("__identity")) window.__identity = { words: identityWords, member: memberWords, initials: personInitials };

  // ---- Workspace time (contracts/workspace.ts) -----------------------------
  // Intl is the only authority on what a zone is; a list checked into the repo
  // goes stale every time IANA moves a city.
  const DEFAULT_TZ = "America/New_York";
  const isTimezone = (raw) => {
    if (typeof raw !== "string" || !raw.trim()) return false;
    try { new Intl.DateTimeFormat("en-US", { timeZone: raw }); return true; } catch (e) { return false; }
  };
  const timezoneCity = (tz) => (String(tz).split("/").pop() || tz).replace(/_/g, " ");
  const timezoneWords = (tz, nowMs) => {
    const zone = tz && isTimezone(tz) ? tz : DEFAULT_TZ;
    const city = timezoneCity(zone);
    let timeThere = null;
    try {
      timeThere = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" })
        .format(new Date(nowMs === undefined ? Date.now() : nowMs));
    } catch (e) { timeThere = null; }
    return { city, zone, timeThere, line: timeThere ? `${city} · ${timeThere} there now` : city };
  };
  const knownTimezones = () => {
    try {
      const all = Intl.supportedValuesOf && Intl.supportedValuesOf("timeZone");
      if (all && all.length) return all;
    } catch (e) { /* falls through to the pair below */ }
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return [...new Set([here, DEFAULT_TZ].filter(isTimezone))];
  };
  const deviceTimezone = () => {
    let tz = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { tz = null; }
    return tz && isTimezone(tz) ? tz : null;
  };
  if (!has("DEFAULT_TIMEZONE")) window.DEFAULT_TIMEZONE = DEFAULT_TZ;
  if (!has("__tz")) window.__tz = { words: timezoneWords, city: timezoneCity, known: knownTimezones, device: deviceTimezone };

  // ---- How a fact's source is said (contracts/facts.ts SOURCE_WORDS) -------
  if (!has("__FACT_WORDS")) {
    window.__FACT_WORDS = {
      provisioned: "your line",
      verified: "from Google",
      workspace: "this workspace",
      typed: "you set this",
      absent: "not set",
    };
  }

  // ---- Phone numbers (contracts/phone.ts, contracts/facts.ts) --------------
  // "(646) 932-5775" and "+16469325775" are one number: the editor compares
  // what is being typed against the provisioned line on every keystroke, and a
  // page rolling its own comparison accuses a workspace of a conflict for
  // writing its own number in a friendly format.
  const normalizePhone = (raw) => {
    if (raw === null || raw === undefined) return null;
    const digits = String(raw).replace(/[^\d]/g, "");
    if (!digits) return null;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
    return null;
  };
  // Three to six digits is a sender, never a person — nothing can be sent back
  // to one. Seven is deliberately NOT one: that is a local number missing its
  // area code, and saying "short code" there is a confident wrong answer where
  // an accurate one costs nothing.
  const shortCode = (raw) => {
    const digits = String(raw ?? "").replace(/[^\d]/g, "");
    return digits.length >= 3 && digits.length <= 6;
  };
  // One CSV cell as contracts spell it (csvCell): People's export of a selection reads it.
  if (!has("__csvCell")) {
    window.__csvCell = (v) => {
      let s = v == null ? "" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
  }
  if (!has("__samePhone")) {
    window.__samePhone = (a, b) => {
      const x = normalizePhone(a);
      const y = normalizePhone(b);
      return !!x && !!y && x === y;
    };
  }
  if (!has("__whyNotAPhone")) {
    window.__whyNotAPhone = (raw) => {
      if (normalizePhone(raw)) return null;
      const digits = String(raw ?? "").replace(/[^\d]/g, "");
      if (!digits) return "A phone number is needed to add a person.";
      if (shortCode(digits)) return "That is a short code, not a phone number — nobody can be reached on one.";
      if (digits.length === 7) return "That looks like a local number. Add the area code.";
      return "That is not a phone number anyone can be reached on.";
    };
  }
  // Stricter than the above on purpose: a handoff is DIALLED mid-call, so a
  // bare ten-digit number is a guess about the country, and a transfer tool
  // dialling a guess rings a stranger.
  if (!has("__whyNotAHandoff")) {
    window.__whyNotAHandoff = (raw, ownLine) => {
      const typed = String(raw ?? "").trim();
      if (!typed) return null; // Empty is a choice: take a message instead.
      const norm = "+" + typed.replace(/[^0-9]/g, "");
      if (!(/^\+/.test(typed) && /^\+[1-9][0-9]{6,14}$/.test(norm))) {
        return "The transfer number needs the country code, like +1 646 932 5775.";
      }
      if (ownLine && normalizePhone(norm) && normalizePhone(norm) === normalizePhone(ownLine)) {
        return "That is the receptionist's own line — it would ring itself. Use a line a person answers.";
      }
      return null;
    };
  }
  if (!has("__handoffE164")) {
    window.__handoffE164 = (raw) => {
      const typed = String(raw ?? "").trim();
      return typed ? "+" + typed.replace(/[^0-9]/g, "") : null;
    };
  }
})();
